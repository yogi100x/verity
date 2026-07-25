/**
 * Date resolution: turn a vague or relative date phrase ("a few months ago",
 * "last winter") that extraction could not anchor into a specific calendar
 * date, using the document's own reference date — never a clock read at
 * request time.
 *
 * Candidates are ONLY claims that are BOTH undated (`asserted_at === null`)
 * and imprecise (`date_precision` of 'unknown' or 'approximate'). Both halves
 * matter: a claim the document already dated is never sent here and never
 * touched, whatever its precision, because extraction dated it while reading
 * the WHOLE document and this pass sees a single quote. This pass may fill a
 * hole; it may never re-date, re-precision, or overwrite an anchor extraction
 * already found. That direction is the only one in which the record could get
 * less honest, so it is closed structurally rather than by prompt. One batched
 * call to `MODELS.haiku` via `callForcedTool`, forced strict tool.
 *
 * A resolution is applied by the candidate's POSITION in the input array, not
 * by claim id: ids are not enforced unique anywhere in this pipeline, and
 * id-keyed application would let one undated claim's resolution overwrite a
 * precisely dated claim that happened to share its id.
 *
 * The tool's schema enum for `date_precision` is `['approximate', 'month',
 * 'year']` — the model has no way to mint 'exact' even if it tried, because
 * the schema does not offer it. Every resolution is Zod-validated again on
 * this side and discarded, not honoured, if it is malformed, names an
 * unlisted index, or (after resolution) falls after the reference date.
 *
 * This function never throws. A miss, a degrade, a refusal, or any other
 * seam failure all resolve the same way: every claim comes back unchanged,
 * `resolved: 0`. So does a reference date that is not a real ISO calendar
 * date — see the guard in `resolveClaimDates`. A missing resolution is
 * invisible; an invented one would not be recoverable, so the asymmetry is
 * deliberate — same principle as `lib/ai/verify.ts`.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Claim } from '@/lib/contracts';
import { callForcedTool, type CallSeamOptions } from '@/lib/ai/client';
import { MODELS } from '@/lib/ai/models';

/* ============================== the prompt ============================== */

/**
 * Module-level constant, not a function — the same reason as
 * `EXTRACTION_SYSTEM` in `lib/ai/prompts.ts`: it is the prompt-cache prefix
 * for every date-resolution call, and it must never carry anything that
 * varies per request (today's date, a source id). The reference date and
 * every candidate go in the user turn instead.
 */
export const DATE_RESOLUTION_SYSTEM: string = `You resolve vague or relative dates found in short quotes from care-record documents into a specific calendar date.

You will be given a reference date and a list of candidates, each with an index, a verbatim quote from a document, and the claim's value. The reference date is when the document ITSELF was written or dated — resolve every relative phrase against that date, never against today's date. You do not know today's date and must not guess at one.

For each candidate whose quoted text can be ANCHORED to the reference date, emit a resolution: the candidate's index, a representative date as an ISO calendar date (YYYY-MM-DD), and a precision that says how much trust the date deserves:
- "month" when the quote names or implies a specific month ("in March", "early May")
- "year" when the quote supports only a year ("back in 2024")
- "approximate" when the quote gives a relative distance or season rather than a named date — "a few months ago", "last winter", "six weeks earlier"

A relative phrase IS anchorable: that is the main job of this task, not an edge case. Convert the phrase's most natural reading into a representative date counted back from the reference date, and let the precision field carry the fuzziness. Worked example — reference date 2026-07-20, quote "I had a fall a few months ago": "a few months" most naturally reads as about three, so resolve index to asserted_at "2026-04-20" with date_precision "approximate". The full YYYY-MM-DD is a representative anchor point; "approximate" is what tells every reader not to trust the day or even the month exactly.

Never emit an exact-day claim of precision. If a quote were precise enough for that, it would not have been sent to you.

Omit an index ONLY when the phrase gives you nothing to count from: "recently", "a while back", or "before the operation" when no date for the operation is stated. Those cannot be anchored even approximately, and guessing a date for them is never correct. But do not confuse vague-with-a-distance ("a few months ago" — resolvable, approximate) with vague-without-one ("recently" — omit).

The resolved date must never fall after the reference date — nothing in a document can be dated after the document itself was written.

Do not comment on how serious, urgent, or important anything is. This is a date-resolution task only, nothing else.`;

/* =============================== the tool =============================== */

export const DATE_RESOLUTION_TOOL: Anthropic.Tool = {
  name: 'resolve_dates',
  description:
    'Resolve vague or relative dates in the given candidate quotes into specific ' +
    'calendar dates, anchored to the given reference date. Emit a resolution ' +
    'only for a candidate whose quoted text itself supports one.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resolutions'],
    properties: {
      resolutions: {
        type: 'array',
        description:
          'Zero or more resolutions. Omit an index entirely rather than guessing.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'asserted_at', 'date_precision'],
          properties: {
            index: {
              type: 'integer',
              description: 'The candidate index this resolution answers.',
            },
            asserted_at: {
              type: 'string',
              description: 'The resolved date, as an ISO calendar date: YYYY-MM-DD.',
            },
            date_precision: {
              type: 'string',
              description: 'How precisely the quote supports this date.',
              enum: ['approximate', 'month', 'year'],
            },
          },
        },
      },
    },
  },
};

/* ============================== validation ============================== */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A syntactically ISO-shaped date that also round-trips through `Date` —
 *  rejects e.g. "2026-02-30", which the regex alone would accept. */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

const ResolvableDatePrecision = z.enum(['approximate', 'month', 'year']);
export type ResolvableDatePrecision = z.infer<typeof ResolvableDatePrecision>;

/**
 * The schema's enum already excludes 'exact' and any other value, but this
 * side re-validates independently: the tool is `strict`, which guarantees
 * the SHAPE of a genuine model response, not the honesty of a test double or
 * a future transport that hands this function something else entirely. A
 * resolution claiming 'exact', an unlisted index, or a malformed date must be
 * discarded here regardless of what produced it.
 */
const ResolutionSchema = z.object({
  index: z.number().int(),
  asserted_at: z.string(),
  date_precision: ResolvableDatePrecision,
});

const ResolveDatesOutputSchema = z.object({
  resolutions: z.array(z.unknown()),
});

interface ParsedResolution {
  readonly index: number;
  readonly asserted_at: string;
  readonly date_precision: ResolvableDatePrecision;
}

/** Parses and filters the raw tool output down to resolutions that are
 *  well-formed AND reference a real candidate index. Individual malformed
 *  entries are dropped, not treated as a reason to discard the whole batch —
 *  emitting fewer resolutions is always acceptable. Duplicate indexes survive
 *  this step and are resolved by the caller, which needs to see that there
 *  were two of them. */
function parseResolutions(raw: unknown, candidateCount: number): ParsedResolution[] {
  const outer = ResolveDatesOutputSchema.safeParse(raw);
  if (!outer.success) return [];

  const parsed: ParsedResolution[] = [];
  for (const item of outer.data.resolutions) {
    const result = ResolutionSchema.safeParse(item);
    if (!result.success) continue;
    const { index, asserted_at, date_precision } = result.data;
    if (index < 0 || index >= candidateCount) continue;
    if (!isValidIsoDate(asserted_at)) continue;
    parsed.push({ index, asserted_at, date_precision });
  }
  return parsed;
}

/* ================================ public ================================ */

export interface DateResolutionInput {
  readonly claims: readonly Claim[];
  /** The document's own anchor (source.created_at or the discharge date) —
   *  caller-supplied, NEVER a wall-clock read: "a few months ago" is relative
   *  to when the document was written, not to when we happen to run. ISO
   *  calendar date, YYYY-MM-DD. */
  readonly referenceDate: string;
}

export interface DateResolutionResult {
  readonly claims: Claim[];
  readonly resolved: number;
  readonly degraded: boolean;
}

/**
 * Resolve the vague/approximate dates among `input.claims` against
 * `input.referenceDate`. See the module docstring for the full contract.
 *
 * Determinism: the request is a pure function of (candidate claims sorted by
 * id then input position, referenceDate) — the system prompt is a module constant, and the user
 * content carries only each candidate's index, quote, value, and the
 * reference date. Nothing per-run (no wall clock, no ids minted this call)
 * enters the request, so the request IS the fixture hash: the same input
 * produces byte-identical request bodies across calls, and a live recording
 * is findable on replay.
 */
export async function resolveClaimDates(
  input: DateResolutionInput,
  opts: CallSeamOptions,
): Promise<DateResolutionResult> {
  const { claims, referenceDate } = input;

  // A reference date we cannot trust is worse than running no pass at all. It
  // would put a nonsense anchor in the prompt, and — the real danger — the
  // future-date guard below is a lexicographic comparison that only coincides
  // with chronology when BOTH sides are a real YYYY-MM-DD. Against a
  // reference of 'abc', every resolved date compares as "not after" and the
  // guard silently stops guarding. Callers derive this from document metadata
  // (`source.created_at`), so a malformed value is entirely possible; refuse
  // the pass rather than trust it.
  if (!isValidIsoDate(referenceDate)) {
    return { claims: [...claims], resolved: 0, degraded: false };
  }

  // Position is carried alongside each candidate so a resolution can be
  // applied back to the exact array slot it came from — see the module
  // docstring on why id-keyed application is unsafe. The sort is by id (the
  // request must not depend on input order) with position as the tie-break,
  // so duplicate ids still produce one deterministic ordering.
  const candidates: readonly { readonly position: number; readonly claim: Claim }[] = claims
    .map((claim, position) => ({ position, claim }))
    .filter(
      ({ claim }) =>
        claim.asserted_at === null &&
        (claim.date_precision === 'unknown' || claim.date_precision === 'approximate'),
    )
    .sort((a, b) =>
      a.claim.id < b.claim.id ? -1 : a.claim.id > b.claim.id ? 1 : a.position - b.position,
    );

  if (candidates.length === 0) {
    return { claims: [...claims], resolved: 0, degraded: false };
  }

  const payload = {
    reference_date: referenceDate,
    candidates: candidates.map(({ claim }, index) => ({
      index,
      quote: claim.quote,
      value: claim.value,
    })),
  };

  const content: readonly Anthropic.ContentBlockParam[] = [
    { type: 'text', text: JSON.stringify(payload) },
  ];

  let outcome;
  try {
    outcome = await callForcedTool(
      {
        model: MODELS.haiku,
        system: DATE_RESOLUTION_SYSTEM,
        content,
        tool: DATE_RESOLUTION_TOOL,
      },
      opts,
    );
  } catch {
    // callForcedTool throws on a refusal or a cut-off response with no
    // tool_use block. Neither is a "miss" in the seam's own vocabulary, but
    // this function's contract is the same either way: never throw, never
    // invent a date. A ToolCallFailedError (refusal, or a stop before any tool_use block)
    // resolves like every other seam failure: unchanged claims, nothing
    // invented. Historical note: the first live Haiku call landed here with a
    // 400 — "Thinking may not be enabled when tool_choice forces tool use" —
    // which is why models.ts now omits `thinking` for the budget family.
    return { claims: [...claims], resolved: 0, degraded: false };
  }

  if (outcome.kind === 'miss') {
    return { claims: [...claims], resolved: 0, degraded: outcome.degraded };
  }

  const resolutions = parseResolutions(outcome.input, candidates.length);

  // Two resolutions naming one candidate contradict each other, and there is
  // no honest way to choose between them: arrival order is not evidence. Drop
  // the candidate entirely — an undated claim is a visible gap, whereas the
  // wrong one of two dates is invisible.
  const timesSeen = new Map<number, number>();
  for (const resolution of resolutions) {
    timesSeen.set(resolution.index, (timesSeen.get(resolution.index) ?? 0) + 1);
  }

  const updates = new Map<number, { asserted_at: string; date_precision: ResolvableDatePrecision }>();
  for (const resolution of resolutions) {
    if ((timesSeen.get(resolution.index) ?? 0) > 1) continue;
    // Both sides are validated YYYY-MM-DD (the reference by the guard at the
    // top, the resolution by `isValidIsoDate`), which is the only condition
    // under which this string comparison IS a date comparison.
    if (resolution.asserted_at > referenceDate) continue; // no future dates
    const candidate = candidates[resolution.index];
    if (candidate === undefined) continue;
    updates.set(candidate.position, {
      asserted_at: resolution.asserted_at,
      date_precision: resolution.date_precision,
    });
  }

  let resolved = 0;
  const result = claims.map((claim, position) => {
    const update = updates.get(position);
    if (update === undefined) return claim;
    resolved += 1;
    return { ...claim, asserted_at: update.asserted_at, date_precision: update.date_precision };
  });

  return { claims: result, resolved, degraded: outcome.degraded };
}
