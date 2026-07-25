/**
 * Extraction: turn one Source into verified Claims.
 *
 * The model emits a transcript plus a list of raw claims via the forced
 * `emit_claims` tool (`lib/ai/prompts.ts`). Every raw claim's `quote` is then
 * run through `verifyClaim` (`lib/ai/verify.ts`) — the substring kill switch.
 * A claim whose quote is not a literal substring of the source transcript is
 * DROPPED here, permanently: not flagged, not retried, not surfaced. This
 * file is the only place that decision gets made, and it never trusts a
 * caller-supplied `verified_substring` value — it always re-derives one.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  CaseSnapshot,
  DatePrecision,
  type Claim,
  type Source,
} from '@/lib/contracts';
import { callForcedTool, type CallSeamOptions, type CallUsage } from '@/lib/ai/client';
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL } from '@/lib/ai/prompts';
import { MODELS } from '@/lib/ai/models';
import { contentBlocksFor, type SourceInput } from '@/lib/ai/documents';
import { anchorClaim, type AnchorFailure } from '@/lib/ai/verify';
import type { Mode } from '@/lib/modes';
import fixtureRaw from '@/fixtures/margaret.json';

/* ============================= types ============================= */

/** A claim as the model emitted it, before verification. Shape matches EMIT_CLAIMS_TOOL. */
export interface RawClaim {
  readonly ontology_key: string;
  readonly subject: string;
  readonly value: string;
  readonly quote: string;
  readonly page: number | null;
  readonly asserted_at: string | null;
  readonly date_precision: DatePrecision;
}

/**
 * Every way a claim can be rejected. The last three were added after the
 * first real live call, when the model padded its output with a claim whose
 * every field was the letter "x" — and the bare substring check verified it,
 * because "x" appears in nearly any transcript. See `anchorClaim` in
 * `lib/ai/verify.ts` for what each check means and the fixture evidence that
 * none of them drops a genuine claim.
 */
export type DropReason = AnchorFailure;

export interface DroppedClaim {
  readonly claim: RawClaim;
  readonly reason: DropReason;
}

export interface ExtractionReport {
  readonly source: Pick<Source, 'id' | 'title' | 'kind'>;
  readonly transcript: string;
  /** Verified claims only. Every one has verified_substring === true. */
  readonly kept: readonly Claim[];
  readonly dropped: readonly DroppedClaim[];
  readonly stats: { readonly claims_extracted: number; readonly claims_dropped: number };
  readonly usage: CallUsage | null; // null in fixtures/replay mode, and on a miss
  readonly mode: Mode;
  readonly retried: boolean;
  /**
   * True only when a live call failed or timed out and a recorded fixture
   * answered instead (see `callModel` in `@/lib/modes`). Never an error —
   * callers may log it, never render it as a failure.
   */
  readonly degraded: boolean;
  /**
   * Set when the source could not be read reliably even after the retry, OR
   * when no recorded fixture exists for this request in this mode. An honest
   * statement of what could not be read, for display. Never a guess at what
   * the unreadable text said, and never a fabricated claim standing in for a
   * missing response.
   */
  readonly notice: string | null;
}

/* ========================== the wire view ========================== */

/**
 * What a JSON API response is allowed to carry.
 *
 * A dropped claim's `quote` is, by definition, text that is NOT in the source —
 * the model made it up. It is counted, never quoted: no client can render a
 * fabricated quote it was never sent. `/api/debug/inspect` is the single
 * deliberate exception, because a reviewer has to SEE the drop happen, and it
 * shows those quotes in a visually separate section marked as failed.
 */
export interface WireExtractionReport {
  readonly source: Pick<Source, 'id' | 'title' | 'kind'>;
  readonly transcript: string;
  /** Verified claims only — the field name is the guarantee. */
  readonly claims: readonly Claim[];
  /** Counts per reason. No model-authored text. */
  readonly dropped: readonly { readonly reason: DropReason; readonly count: number }[];
  readonly stats: { readonly claims_extracted: number; readonly claims_dropped: number };
  readonly usage: CallUsage | null;
  readonly mode: Mode;
  readonly retried: boolean;
  readonly degraded: boolean;
  readonly notice: string | null;
}

/** Strip everything a client must not receive. The ONLY way a report reaches JSON. */
export function toWireReport(report: ExtractionReport): WireExtractionReport {
  const counts = new Map<DropReason, number>();
  for (const drop of report.dropped) {
    counts.set(drop.reason, (counts.get(drop.reason) ?? 0) + 1);
  }

  return {
    source: report.source,
    transcript: report.transcript,
    claims: report.kept,
    dropped: [...counts].map(([reason, count]) => ({ reason, count })),
    stats: report.stats,
    usage: report.usage,
    mode: report.mode,
    retried: report.retried,
    degraded: report.degraded,
    notice: report.notice,
  };
}

/* ======================= emit_claims validation ======================= */

const RawClaimSchema: z.ZodType<RawClaim> = z.object({
  ontology_key: z.string(),
  subject: z.string(),
  value: z.string(),
  quote: z.string(),
  page: z.number().int().nullable(),
  asserted_at: z.string().nullable(),
  date_precision: DatePrecision,
});

/** Zod schema validating the emit_claims tool output. */
export const EmitClaimsOutput: z.ZodType<{ transcript: string; claims: RawClaim[] }> =
  z.object({
    transcript: z.string(),
    claims: z.array(RawClaimSchema),
  });

/* ============================ retry rule ============================ */

/** Below this claim count, an extraction is treated as "near zero". */
const NEAR_ZERO_CLAIM_COUNT = 1;
/** Above this drop rate, an extraction is treated as suspect. */
const DROP_RATE_RETRY_THRESHOLD = 0.4;

const CONTRAST_BOOST_ADDENDUM =
  '\n\nADDENDUM — this source may be a low-quality scan or photograph. Look ' +
  'especially carefully at faint, low-contrast, or skewed text before giving ' +
  'up on a claim. Re-examine every character of a candidate quote against the ' +
  'image before copying it — a quote that is even one character off from the ' +
  'source will be discarded. If a passage is genuinely illegible, omit the ' +
  'claim rather than guessing at its wording.';

function shouldRetry(rawCount: number, droppedCount: number): boolean {
  if (rawCount <= NEAR_ZERO_CLAIM_COUNT) return true;
  return droppedCount / rawCount > DROP_RATE_RETRY_THRESHOLD;
}

/* ============================ locating a quote ============================ */

/**
 * Best-effort character range of `quote` within `transcript`. Only ever
 * attempted as an exact, unnormalised substring search — normalisation folds
 * away differences (curly quotes, soft hyphens, hyphenation across a line
 * break) that make offsets in the *normalised* string meaningless against the
 * *original* transcript's indices. When the exact string cannot be found,
 * this returns null rather than guessing at an offset.
 */
function locateQuote(
  transcript: string,
  quote: string,
): { char_start: number; char_end: number } | null {
  const index = transcript.indexOf(quote);
  if (index === -1) return null;
  return { char_start: index, char_end: index + quote.length };
}

/* ============================ partitioning ============================ */

/**
 * Split raw claims into verified Claims and dropped ones. Pure; no network.
 *
 * `existingIds` is index-aligned with `raw` and supplies a claim's ALREADY
 * ESTABLISHED id. Live extraction passes nothing — a claim the model has just
 * emitted has no prior identity, so a fresh uuid is correct. Replaying a known
 * case (see `extractFromFixtures`) passes the ids that case's own Facts,
 * Conflicts and Gaps already reference; minting fresh ones there breaks every
 * one of those references silently.
 *
 * Verification is re-derived either way. A preserved id changes a claim's
 * identity, never whether it passed.
 */
export function partitionClaims(
  raw: readonly RawClaim[],
  source: Pick<Source, 'id' | 'transcript'>,
  existingIds?: readonly (string | undefined)[],
): { kept: Claim[]; dropped: DroppedClaim[] } {
  const kept: Claim[] = [];
  const dropped: DroppedClaim[] = [];

  for (const [index, rawClaim] of raw.entries()) {
    const failure = anchorClaim(rawClaim, source);
    if (failure !== null) {
      dropped.push({ claim: rawClaim, reason: failure });
      continue;
    }

    // `anchorClaim` guarantees the normalised quote occurs exactly once, so
    // when the exact raw string is found at all, it is found at the right
    // occurrence — the wrong-occurrence anchoring that plain indexOf allowed
    // is no longer reachable.
    const located = locateQuote(source.transcript, rawClaim.quote);

    const claim: Claim = {
      id: existingIds?.[index] ?? randomUUID(),
      source_id: source.id,
      ontology_key: rawClaim.ontology_key,
      subject: rawClaim.subject,
      value: rawClaim.value,
      quote: rawClaim.quote,
      locator: {
        page: rawClaim.page,
        char_start: located?.char_start ?? null,
        char_end: located?.char_end ?? null,
        ms_start: null,
        ms_end: null,
      },
      asserted_at: rawClaim.asserted_at,
      date_precision: rawClaim.date_precision,
      provenance: 'document_extracted',
      verified_substring: true,
    };
    kept.push(claim);
  }

  return { kept, dropped };
}

/* ============================= live mode ============================= */

/**
 * NOTE ON DETERMINISM: the instruction text below must never embed anything
 * that varies per call and is not semantically part of the extraction task —
 * see the determinism contract in `@/lib/modes/hash.ts`. `source.title` is
 * fine (the same document, uploaded twice, has the same title); a per-run
 * identifier like a freshly minted `source.id` is NOT, and previously leaked
 * in here — a request containing one can never be looked up again by
 * fixtures/replay, and every live call for the same document would record a
 * fixture nothing could ever hit. Deliberately title-only.
 */
async function runExtraction(
  source: Pick<Source, 'id' | 'title' | 'kind'>,
  input: SourceInput,
  opts: CallSeamOptions,
  systemSuffix?: string,
): Promise<
  | { readonly kind: 'ok'; readonly transcript: string; readonly raw: RawClaim[]; readonly usage: CallUsage; readonly degraded: boolean }
  | { readonly kind: 'miss'; readonly degraded: boolean }
> {
  const content = contentBlocksFor(
    input,
    `Extract every claim from "${source.title}".`,
  );

  const outcome = await callForcedTool(
    {
      model: MODELS.sonnet,
      system: EXTRACTION_SYSTEM,
      ...(systemSuffix === undefined ? {} : { systemSuffix }),
      content,
      tool: EXTRACTION_TOOL,
      effort: 'low',
    },
    opts,
  );

  if (outcome.kind === 'miss') {
    return { kind: 'miss', degraded: outcome.degraded };
  }

  const parsed = EmitClaimsOutput.safeParse(outcome.input);
  if (!parsed.success) {
    throw new Error(
      `extractSourceLive: emit_claims output for source ${source.id} failed ` +
        `validation: ${parsed.error.message}`,
    );
  }

  return {
    kind: 'ok',
    transcript: parsed.data.transcript,
    raw: parsed.data.claims,
    usage: outcome.usage,
    degraded: outcome.degraded,
  };
}

type Attempt =
  | {
      readonly kind: 'ok';
      readonly transcript: string;
      readonly raw: readonly RawClaim[];
      readonly usage: CallUsage;
      readonly kept: readonly Claim[];
      readonly dropped: readonly DroppedClaim[];
      readonly degraded: boolean;
    }
  | { readonly kind: 'miss'; readonly degraded: boolean };

async function attempt(
  source: Pick<Source, 'id' | 'title' | 'kind'>,
  input: SourceInput,
  opts: CallSeamOptions,
  systemSuffix?: string,
): Promise<Attempt> {
  const result = await runExtraction(source, input, opts, systemSuffix);
  if (result.kind === 'miss') {
    return { kind: 'miss', degraded: result.degraded };
  }
  const { kept, dropped } = partitionClaims(result.raw, {
    id: source.id,
    transcript: result.transcript,
  });
  return {
    kind: 'ok',
    transcript: result.transcript,
    raw: result.raw,
    usage: result.usage,
    kept,
    dropped,
    degraded: result.degraded,
  };
}

function honestNotice(best: Extract<Attempt, { kind: 'ok' }>, title: string): string {
  if (best.raw.length === 0) {
    return (
      `Nothing could be read from “${title}” — no claim came back with a quote ` +
      'that could be checked against the document. Nothing from this source is ' +
      'shown below. Try a clearer scan or photograph of the same pages.'
    );
  }
  return (
    `Parts of “${title}” could not be read reliably: ${best.kept.length} of ` +
    `${best.raw.length} claims came back with a quote that matches the ` +
    'document word for word. Only those are shown below — the rest were dropped.'
  );
}

/**
 * Extract from one source through the mode seam (`opts.mode` picks live,
 * fixtures, or replay — see `@/lib/modes`).
 *
 * A `miss` (no recorded fixture answers this exact request in this mode) is
 * handled honestly: this never invents claims and never silently returns
 * nothing — it returns a report with zero kept claims and a `notice`
 * explaining that no recorded response exists yet, and that live mode with a
 * key would produce one.
 */
export async function extractSourceLive(
  source: Pick<Source, 'id' | 'title' | 'kind'>,
  input: SourceInput,
  opts: CallSeamOptions,
): Promise<ExtractionReport> {
  let best = await attempt(source, input, opts);
  let retried = false;

  if (best.kind === 'ok' && shouldRetry(best.raw.length, best.dropped.length)) {
    const boosted = await attempt(source, input, opts, CONTRAST_BOOST_ADDENDUM);
    retried = true;
    // Keep whichever attempt VERIFIED more claims. Overwriting unconditionally
    // means a retry that comes back worse silently throws away a good first
    // pass — a missing claim is a bug, and this is the one place we can
    // manufacture one for free. A miss on the retry never displaces a good
    // first attempt.
    if (boosted.kind === 'ok' && boosted.kept.length > best.kept.length) best = boosted;
  }

  if (best.kind === 'miss') {
    return {
      source: { id: source.id, title: source.title, kind: source.kind },
      transcript: '',
      kept: [],
      dropped: [],
      stats: { claims_extracted: 0, claims_dropped: 0 },
      usage: null,
      mode: opts.mode,
      retried,
      degraded: best.degraded,
      notice:
        `No recorded response exists for this request in "${opts.mode}" mode, ` +
        `so nothing could be shown for "${source.title}". Live mode with ` +
        'ANTHROPIC_API_KEY set would produce and record one.',
    };
  }

  const stillBad = shouldRetry(best.raw.length, best.dropped.length);

  return {
    source: { id: source.id, title: source.title, kind: source.kind },
    transcript: best.transcript,
    kept: best.kept,
    dropped: best.dropped,
    stats: { claims_extracted: best.raw.length, claims_dropped: best.dropped.length },
    usage: best.usage,
    mode: opts.mode,
    retried,
    degraded: best.degraded,
    // Never silently return nothing: if it is still bad after the retry, say so
    // in words the reader can act on.
    notice: stillBad ? honestNotice(best, source.title) : null,
  };
}

/* ============================ fixtures mode ============================ */

/**
 * Build reports from fixtures/margaret.json. No network, no API key.
 *
 * This REPLAYS a known case, so claim ids are preserved, not regenerated. The
 * fixture's `facts.supporting_claim_ids`, `conflicts.claim_ids` and
 * `gaps.supporting_claim_ids` all reference the fixture's own claim ids; a
 * fresh uuid per call would leave every one of those references dangling, and
 * anything reading them (supersession, artefact citation) would silently see
 * nothing rather than fail loudly.
 *
 * Fresh ids remain correct for genuine live extraction — see `partitionClaims`.
 */
export function extractFromFixtures(): ExtractionReport[] {
  const fixture = CaseSnapshot.parse(fixtureRaw);

  interface FixtureRaw {
    readonly raw: RawClaim;
    readonly id: string;
  }

  const claimsBySource = new Map<string, FixtureRaw[]>();
  for (const claim of fixture.claims) {
    const list = claimsBySource.get(claim.source_id) ?? [];
    list.push({
      id: claim.id,
      raw: {
        ontology_key: claim.ontology_key,
        subject: claim.subject,
        value: claim.value,
        quote: claim.quote,
        page: claim.locator.page,
        asserted_at: claim.asserted_at,
        date_precision: claim.date_precision,
      },
    });
    claimsBySource.set(claim.source_id, list);
  }

  return fixture.sources.map((source) => {
    const entries = claimsBySource.get(source.id) ?? [];
    const raw = entries.map((entry) => entry.raw);
    // Re-derive verification from the real transcript and verifyClaim rather
    // than trusting the fixture's own `verified_substring` flag, so
    // /api/debug/inspect shows a genuine pass/fail with no API key. Only the
    // id is taken from the fixture.
    const { kept, dropped } = partitionClaims(
      raw,
      { id: source.id, transcript: source.transcript },
      entries.map((entry) => entry.id),
    );

    return {
      source: { id: source.id, title: source.title, kind: source.kind },
      transcript: source.transcript,
      kept,
      dropped,
      stats: { claims_extracted: raw.length, claims_dropped: dropped.length },
      usage: null,
      mode: 'fixtures',
      retried: false,
      degraded: false,
      notice: null,
    };
  });
}

/* ============================== entry point ============================== */

/** The seam options `extractAll` threads through to every live call it makes,
 *  minus `mode` (supplied separately, since it also selects the fixtures
 *  path that never reaches the seam). */
export type ExtractAllSeamOptions = Omit<CallSeamOptions, 'mode'>;

/** Mode-aware entry point. The ONLY function routes should call. */
export async function extractAll(
  mode: Mode,
  seamOpts?: ExtractAllSeamOptions,
  live?: {
    readonly sources: ReadonlyArray<{
      readonly source: Pick<Source, 'id' | 'title' | 'kind'>;
      readonly input: SourceInput;
    }>;
  },
): Promise<ExtractionReport[]> {
  if (mode === 'live') {
    if (live === undefined) {
      throw new Error('extractAll: live mode requires sources');
    }
    const opts: CallSeamOptions = { mode, ...seamOpts };
    return Promise.all(
      live.sources.map(({ source, input }) => extractSourceLive(source, input, opts)),
    );
  }

  // 'fixtures' and 'replay' both derive from fixtures/margaret.json today —
  // replay is reserved for recorded live responses, see @/lib/modes.
  return extractFromFixtures();
}
