/**
 * Rendering a `Fact` set through an `ArtifactTemplate` into an `Artifact`.
 *
 * THE CENTRAL RULE: a slot resolves only to facts backed by at least one
 * claim with `verified_substring === true`. Otherwise it falls through to
 * `gap_prompt`. NEVER to generated prose. An honest "we don't have this,
 * here's who to ask" beats invented text every time — `continence.evidence`
 * in `fixtures/margaret.json` has zero facts and empty text on purpose to
 * prove the path exists.
 *
 * This file is pure and synchronous. No model call, no network, no
 * randomness beyond id generation — the deterministic skeleton must stand
 * alone, with no API key, before a single word of model prose is ever
 * layered on top of it.
 */

import { randomUUID } from 'crypto';
import type {
  Artifact,
  ArtifactTemplate,
  Assertion,
  ChcDomain,
  Claim,
  Fact,
  Slot,
  Source,
} from '@/lib/contracts';
import { ChcLevel, isValidLevel } from '@/lib/contracts';
import { liveFacts } from '@/lib/ai/facts';
import {
  isFrameworkCitationSlot,
  isStructuralCopySlot,
  levelSlotDomain,
  ontologyMatches,
  slotsOf,
} from '@/lib/ai/templates';
import { filterOutput } from '@/lib/safety/output_filter';
import { PERSISTENT_BANNER, footer } from '@/lib/copy/safety';
import { FRAMEWORK_CITATIONS, type CitationId } from '@/lib/detectors/well_managed';

/**
 * WHY a slot was left out of the artefact. Omitting silently was a defect:
 * the CHC pack's cover page and method section (`cover.subject`,
 * `cover.scope`, `method.provenance`) simply vanished behind a bare
 * "3 omitted" count, and a reader could not tell a missing structural page
 * from three empty clinical domains. An evidence pack that reaches an ICB
 * panel with no statement of who it concerns, no scope statement and no
 * provenance section is a serious defect; hiding that fact is a worse one.
 *
 * The distinction is read from the frozen template, not from a slot-key list:
 *
 *  - `awaiting_fixed_copy` — `citation_required === false`, so the slot is not
 *    evidence-driven at all. Its words are fixed copy that must come from
 *    somewhere other than the record. `Slot` has no field to carry that copy
 *    and `fixtures/templates.json` is frozen, so Lane A cannot supply it —
 *    inventing it would be the exact failure this pipeline exists to prevent
 *    (`cover.scope` is the disclaimer distinguishing organised evidence from a
 *    clinical assessment; `prd.md` §8.5 specifies that wording verbatim and it
 *    belongs to Lane C's `lib/copy/**`). So the slot is still omitted — but
 *    NAMED, with this reason, in the build result and on the page.
 *  - `no_evidence` — `citation_required === true` and no gap_prompt to fall
 *    back on: a genuinely evidence-driven slot with nothing behind it.
 */
export type SlotOmissionReason = 'awaiting_fixed_copy' | 'no_evidence';

export interface SlotResolution {
  readonly slot_key: string;
  readonly fact_ids: readonly string[];
  /** null when the slot resolved to facts; the gap_prompt when it did not. */
  readonly gap_prompt: string | null;
  /** True when the slot is unfillable AND has no gap_prompt — omit it entirely. */
  readonly omitted: boolean;
  /** Non-null exactly when `omitted` is true. Never omit without a reason. */
  readonly omission_reason: SlotOmissionReason | null;
}

/** One omitted slot, named and attributed to its section, so a reviewer can
 *  see WHICH slots are absent and WHY rather than only how many. */
export interface SlotOmission {
  readonly slot_key: string;
  readonly label: string;
  readonly section_key: string;
  readonly section_title: string;
  readonly reason: SlotOmissionReason;
}

/**
 * A fact counts as backing only when at least one of its supporting claims
 * resolves, via `claimsById`, to a claim with `verified_substring === true`.
 * A claim id that is missing from the map, or present but unverified, does
 * not count — a fact whose supporting claims are ALL unverified or unknown
 * does not back a slot.
 */
function isVerifiedBacked(
  fact: Fact,
  claimsById: ReadonlyMap<string, BackingClaim>,
): boolean {
  for (const claimId of fact.supporting_claim_ids) {
    const claim = claimsById.get(claimId);
    if (claim !== undefined && claim.verified_substring === true) return true;
  }
  return false;
}

/**
 * Facts eligible to fill a slot: live (not superseded — S6's requirement
 * that a superseded fact never populates a current-state slot), matching
 * one of the slot's ontology_match patterns, and verified-backed. Order
 * follows the input `facts` array, so callers control determinism by
 * controlling their own input order.
 */
function factsForSlot(
  slot: Slot,
  facts: readonly Fact[],
  claimsById: ReadonlyMap<string, BackingClaim>,
): Fact[] {
  const live = liveFacts(facts);
  return live.filter(
    (fact) =>
      slot.ontology_match.some((pattern) => ontologyMatches(pattern, fact.ontology_key)) &&
      isVerifiedBacked(fact, claimsById),
  );
}

/**
 * Plain, factual, deterministic text built only from the facts' own
 * values — one "<subject>: <canonical value>" line per fact, in the order
 * supplied. No model call, nothing invented, no judgement language: the
 * words come verbatim from data already in the contract.
 */
function composeText(facts: readonly Fact[]): string {
  return facts.map((fact) => `${fact.subject}: ${fact.canonical_value}`).join('\n');
}

/**
 * The verbatim quotes standing behind these facts.
 *
 * `filterOutput` rejects a generated string that names a clinical condition
 * UNLESS that condition appears verbatim in one of the cited spans it is
 * given. So the spans are load-bearing in both directions, and passing an
 * empty list is not the safe default it looks like:
 *
 *   - Pass the real quotes, and a diagnosis that a source document actually
 *     states survives, cited.
 *   - Pass nothing, and every condition name reads as uncited. Margaret's
 *     heart failure diagnosis — quoted word for word from her discharge
 *     summary — is then suppressed, and the GP brief silently loses the
 *     reason she was in hospital. That is evidence loss dressed up as
 *     caution, which is the failure this product exists to prevent.
 *
 * Only verified claims contribute, so an unverified quote can never launder
 * a condition name into an artefact.
 */
function citedSpansFor(
  facts: readonly Fact[],
  claimsById: ReadonlyMap<string, BackingClaim>,
): string[] {
  const spans: string[] = [];
  for (const fact of facts) {
    for (const claimId of fact.supporting_claim_ids) {
      const claim = claimsById.get(claimId);
      if (claim !== undefined && claim.verified_substring === true) {
        spans.push(claim.quote);
      }
    }
  }
  return spans;
}

/**
 * A level word among these values that IS a valid `ChcLevel` for `domain`,
 * per the frozen `CHC_DOMAIN_LEVELS` (never a ceiling — see
 * `lib/ai/templates.ts`). Trimmed and lowercased before parsing, matching
 * `levelsNotAvailableInDomain`'s own normalisation, so the two never disagree
 * about the same value.
 */
function isValidChcLevelValue(domain: ChcDomain, value: string): boolean {
  const parsed = ChcLevel.safeParse(value.trim().toLowerCase());
  return parsed.success && isValidLevel(domain, parsed.data);
}

export function resolveSlot(
  slot: Slot,
  facts: readonly Fact[],
  claimsById: ReadonlyMap<string, BackingClaim>,
): SlotResolution {
  const matched = factsForSlot(slot, facts, claimsById);

  // A `<domain>.suggested_level` slot may only ever be filled with a value
  // that IS a valid CHC level for that exact domain (never a judgement this
  // pipeline invents — only ever a level word already present in the
  // record). A domain slot with narrative evidence ("unsteady on stairs") or
  // a level the domain does not offer ("severe" under continence) is treated
  // exactly as if nothing had matched, and falls through below.
  const levelDomain = levelSlotDomain(slot);
  const levelOk =
    levelDomain === null || matched.every((fact) => isValidChcLevelValue(levelDomain, fact.canonical_value));

  // Composed evidence text is GENERATED output (this module joins subject +
  // value), never verbatim copy or a source quote, so it must clear the same
  // filter every other generated string in this product clears. A slot whose
  // composed text trips the filter is treated exactly as if nothing had
  // matched — over-blocking is the documented, deliberate design of
  // `filterOutput` itself.
  const filterOk =
    matched.length === 0 ||
    filterOutput(composeText(matched), citedSpansFor(matched, claimsById)).ok;

  if (matched.length > 0 && levelOk && filterOk) {
    return {
      slot_key: slot.key,
      fact_ids: matched.map((fact) => fact.id),
      gap_prompt: null,
      omitted: false,
      omission_reason: null,
    };
  }

  if (slot.gap_prompt !== null) {
    return {
      slot_key: slot.key,
      fact_ids: [],
      gap_prompt: slot.gap_prompt,
      omitted: false,
      omission_reason: null,
    };
  }

  // No qualifying facts and no gap_prompt: omit the assertion rather than
  // emit empty or invented text — but record WHY, so the omission is legible
  // downstream instead of disappearing into a count.
  return {
    slot_key: slot.key,
    fact_ids: [],
    gap_prompt: null,
    omitted: true,
    omission_reason: slot.citation_required ? 'no_evidence' : 'awaiting_fixed_copy',
  };
}

/**
 * What slot resolution needs to know about a claim: whether it survived the
 * substring check, and the quote itself — the quote is what tells
 * `filterOutput` that a condition named in composed text is genuinely cited.
 */
export type BackingClaim = Pick<Claim, 'verified_substring' | 'quote'>;

export interface BuildArtifactInput {
  readonly template: ArtifactTemplate;
  readonly facts: readonly Fact[];
  readonly claimsById: ReadonlyMap<string, BackingClaim>;
  readonly personId: string;
  /**
   * When this artefact was assembled, as an ISO string supplied by the caller.
   *
   * Required, and deliberately not read from the wall clock here: this module
   * is pure, and `new Date()` inside it would mean two builds of identical
   * evidence were not comparable — which is exactly what the determinism
   * tests assert. The caller owns the clock.
   */
  readonly createdAt: string;
  /** The person this pack is about — required to fill `cover.subject` (and,
   *  as the opt-in signal for the whole structural front matter, `cover.scope`
   *  too). Absent by default: a caller that does not supply it gets the prior
   *  behaviour exactly — those slots stay omitted, named, as
   *  `awaiting_fixed_copy`. Never invented when absent. */
  readonly person?: { readonly display_name: string };
  /** The assembly date for `method.provenance` (`footer()`'s `[date]` slot).
   *  Deliberately a caller-supplied STRING, never `new Date()` here — this
   *  file is pure and synchronous, and a wall-clock read would make its
   *  output non-deterministic and untestable. Absent by default: the slot
   *  stays omitted, named, rather than dated with an invented value. */
  readonly assembledOn?: string;
  /**
   * The sources this pack draws on — required to fill a `source.inventory`
   * slot (`cover.sources`, `documents`; see `isSourceInventorySlot`). Titles
   * only (`Pick<Source, 'title'>`, reusing the frozen contract rather than
   * inventing a new shape): a document list needs nothing else to be
   * useful, and a fabricated "kind"/"date" beyond what a `Source` itself
   * carries would be exactly the invented content this module exists to
   * refuse. Absent by default, or an empty array: the slot stays honestly
   * omitted/gap-prompted, exactly as if no source list had ever existed —
   * this pipeline never invents a document list.
   */
  readonly sources?: readonly Pick<Source, 'title'>[];
}

/**
 * A slot filled from something OTHER than a resolved `Fact` — verbatim Lane C
 * copy, or a verbatim framework citation. Its `Assertion.citation_verified`
 * is `false` (no `fact_ids`, per the DB's own constraint), which is
 * indistinguishable, on the `Assertion` alone, from a slot with no evidence
 * yet. THIS is the third state: a slot_key appearing here is neither
 * "evidence-backed" (citation_verified true) nor "no evidence" (empty text,
 * citation_verified false) — it is verbatim copy this pipeline is allowed to
 * assert without a fact behind it, named as such so a reader can never
 * mistake it for either of the other two. `Assertion` itself cannot carry
 * this — it is a frozen contract with no field for it.
 */
export interface StructuralAssertion {
  readonly slot_key: string;
  readonly source: 'lane_c_copy' | 'framework_citation' | 'source_inventory';
  /** The citation's `ref`, for a `framework_citation` slot; `null` otherwise. */
  readonly attribution: string | null;
}

/** The artefact plus the slots it deliberately left out, and why. Omissions
 *  travel WITH the artefact, in one return value, so a caller cannot render
 *  the pack while forgetting that three of its pages are missing. */
export interface BuildArtifactResult {
  readonly artifact: Artifact;
  /** Every slot the template defines that produced no assertion, named.
   *  `artifact.assertions.length + omissions.length === slotsOf(template).length`
   *  always — every slot is either asserted or accounted for here. */
  readonly omissions: readonly SlotOmission[];
  /** Every assertion filled from verbatim copy rather than a fact — see
   *  `StructuralAssertion`. A subset of `artifact.assertions` by `slot_key`. */
  readonly structuralAssertions: readonly StructuralAssertion[];
}

/**
 * Build a contract-valid `Artifact`: one `Assertion` per non-omitted slot,
 * in template order. `citation_verified` is true only when `fact_ids` is
 * non-empty — the DB's
 * `check (citation_verified = false or array_length(fact_ids, 1) >= 1)`
 * constraint, mirrored here so a gap-prompt assertion can never violate it.
 *
 * `Assertion.text` for a gap-prompt slot is the EMPTY STRING, not the gap
 * prompt copy. That is the shape `fixtures/margaret.json` commits to (the
 * continence assertion has no facts and no text) and the one Lane B renders
 * against: the gap prompt is read live from the frozen template at render
 * time, so it cannot go stale inside a stored artefact, and a reader can
 * never mistake template copy for something the record said.
 */
/**
 * Where a structural (`cover.*` / `method.*`, `citation_required === false`)
 * slot's fixed copy comes from. Keyed on `slot_key` because different
 * structural slots need semantically DIFFERENT copy — a person's name is not
 * a scope statement — and there is no way to derive WHICH copy a slot needs
 * from template data alone. The SET of slots eligible for this table is
 * never hardcoded, though: it is `isStructuralCopySlot` (`lib/ai/templates.ts`)
 * filtering the live template, and a structural slot with no entry here (or
 * whose resolver returns `null`) stays omitted, honestly, exactly as before.
 *
 * `cover.scope` is NOT gated behind anything. It needs no input —
 * `PERSISTENT_BANNER` is a fixed constant — and it is the statement that this
 * pack organises evidence rather than assessing anyone. A pack missing the
 * subject's name is incomplete; a pack missing its scope statement is
 * misleading about what it is, which is worse. So the disclaimer renders
 * whenever the template asks for it, even when nothing else on the cover can
 * be filled. (An earlier version gated it alongside `cover.subject` so that a
 * caller supplying neither stayed byte-identical — that traded a safety
 * statement for test convenience.)
 */
const STRUCTURAL_COPY_SOURCES: Readonly<Record<string, (input: BuildArtifactInput) => string | null>> = {
  'cover.subject': (input) => input.person?.display_name ?? null,
  'cover.scope': () => PERSISTENT_BANNER,
  'method.provenance': (input) =>
    input.person === undefined || input.assembledOn === undefined
      ? null
      : footer(input.person.display_name, input.assembledOn),
};

/** Which `FRAMEWORK_CITATIONS` entry fills a given framework-citation slot
 *  (see `isFrameworkCitationSlot`). A slot matching the predicate with no
 *  entry here stays on the ordinary evidence path, unfilled if nothing
 *  qualifies — never approximated. */
const FRAMEWORK_CITATION_SOURCES: Readonly<Record<string, CitationId>> = {
  'drug_therapies.framework_note': 'pg_23_2',
};

/**
 * A slot whose sole `ontology_match` namespace is `source.inventory` — the
 * pack's own attachment list (`cover.sources`, `documents`). Derived from
 * template data, never a hardcoded key list: any slot whose `ontology_match`
 * includes the exact key `'source.inventory'` qualifies.
 *
 * These slots look almost like `isStructuralCopySlot` — they need fixed
 * metadata about the pack, not evidence about the person — but they do NOT
 * match it: `cover.sources` / `documents` both declare `citation_required:
 * false` **and** a real `gap_prompt` ("No documents have been added yet."),
 * so `isStructuralCopySlot` (which requires `gap_prompt === null`)
 * deliberately excludes them. They need their own predicate rather than a
 * widened reuse of that one, because the two things it protects — "this slot
 * has literally nowhere else to get its words from" (structural copy) and
 * "this slot has a document-list input that will not always be supplied"
 * (source inventory, with its own honest fall-back prompt) — are different
 * guarantees.
 *
 * THE DEFECT THIS FIXES: a source-inventory fact has no supporting claims
 * (correctly — it is metadata about the pack, not a claim about the person),
 * so the DB constraint forces `status: 'unknown'`, and `isVerifiedBacked`
 * (correctly) never lets such a fact back an ordinary evidence slot. Two
 * individually-correct rules jointly excluded `cover.sources` /
 * `documents` from ever filling. The fix is not to weaken
 * `isVerifiedBacked` — it is to route these slots down the same
 * fixed-metadata path as `cover.subject` / `method.provenance`, sourced from
 * `BuildArtifactInput.sources` instead of a resolved `Fact`.
 */
function isSourceInventorySlot(slot: Pick<Slot, 'ontology_match'>): boolean {
  return slot.ontology_match.includes('source.inventory');
}

/**
 * Plain, deterministic list of document titles, one per line, in the order
 * `BuildArtifactInput.sources` supplied them — nothing generated, nothing
 * summarised, nothing sorted or reworded. Titles only: a `Source` carries a
 * `kind` and a `created_at`, but `created_at` is when the document was
 * UPLOADED, not a date the document itself asserts, and rendering it next to
 * "Documents this pack draws on" would silently imply the opposite. `kind` is
 * an internal storage classification (`pdf`, `image`, ...), not something a
 * reader of an evidence pack needs to know to identify a document by its
 * title. Both are real fields on the frozen `Source` contract and both are
 * deliberately left out here — this list stays exactly what the label says
 * it is: which documents, nothing else.
 *
 * `null` when no sources were supplied, or the list is empty: the caller
 * (`buildArtifact`) falls through to the ordinary evidence path in that case,
 * which lands on the slot's own `gap_prompt` — never an invented list.
 */
function sourceInventoryText(sources: readonly Pick<Source, 'title'>[] | undefined): string | null {
  if (sources === undefined || sources.length === 0) return null;
  return sources.map((source) => source.title).join('\n');
}

function structuralAssertion(artifactId: string, slotKey: string, text: string): Assertion {
  return {
    id: randomUUID(),
    artifact_id: artifactId,
    slot_key: slotKey,
    text,
    fact_ids: [],
    // Never true: this text carries no fact_ids to back it, and the DB
    // constraint (`citation_verified = false or fact_ids non-empty`) forbids
    // it. `StructuralAssertion` is the honest, separate record of WHY this
    // false is different from a plain no-evidence gap.
    citation_verified: false,
  };
}

export function buildArtifact(input: BuildArtifactInput): BuildArtifactResult {
  const { template, facts, claimsById, personId } = input;
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const artifactId = randomUUID();

  const assertions: Assertion[] = [];
  const omissions: SlotOmission[] = [];
  const structuralAssertions: StructuralAssertion[] = [];

  for (const { section, slot } of slotsOf(template)) {
    if (isStructuralCopySlot(slot)) {
      const text = STRUCTURAL_COPY_SOURCES[slot.key]?.(input) ?? null;
      if (text !== null) {
        assertions.push(structuralAssertion(artifactId, slot.key, text));
        structuralAssertions.push({ slot_key: slot.key, source: 'lane_c_copy', attribution: null });
        continue;
      }
      // No mapped copy source, or a required input (person / assembledOn) is
      // missing: fall through to the ordinary path below, which omits this
      // slot as 'awaiting_fixed_copy' — unchanged from before Lane C shipped
      // copy.
    } else if (isFrameworkCitationSlot(slot)) {
      const citationId = FRAMEWORK_CITATION_SOURCES[slot.key];
      if (citationId !== undefined) {
        const citation = FRAMEWORK_CITATIONS[citationId];
        assertions.push(structuralAssertion(artifactId, slot.key, citation.text));
        structuralAssertions.push({
          slot_key: slot.key,
          source: 'framework_citation',
          attribution: citation.ref,
        });
        continue;
      }
      // No mapped citation: fall through to the ordinary evidence path.
    } else if (isSourceInventorySlot(slot)) {
      const text = sourceInventoryText(input.sources);
      if (text !== null) {
        assertions.push(structuralAssertion(artifactId, slot.key, text));
        structuralAssertions.push({ slot_key: slot.key, source: 'source_inventory', attribution: null });
        continue;
      }
      // No sources supplied (or an empty list): fall through to the ordinary
      // evidence path below. It cannot resolve there either — a
      // source-inventory fact, if one existed, would carry no supporting
      // claims and `isVerifiedBacked` never lets that back a slot — so this
      // lands on the slot's own `gap_prompt`, honestly, exactly as if no
      // document list had ever existed.
    }

    const resolution = resolveSlot(slot, facts, claimsById);
    if (resolution.omitted) {
      if (resolution.omission_reason === null) {
        throw new Error(`omitted slot "${slot.key}" carries no omission reason`);
      }
      omissions.push({
        slot_key: slot.key,
        label: slot.label,
        section_key: section.key,
        section_title: section.title,
        reason: resolution.omission_reason,
      });
      continue;
    }

    const resolvedFacts = resolution.fact_ids
      .map((id) => factsById.get(id))
      .filter((fact): fact is Fact => fact !== undefined);

    const text = resolvedFacts.length > 0 ? composeText(resolvedFacts) : '';

    assertions.push({
      id: randomUUID(),
      artifact_id: artifactId,
      slot_key: resolution.slot_key,
      text,
      fact_ids: [...resolution.fact_ids],
      citation_verified: resolution.fact_ids.length > 0,
    });
  }

  return {
    artifact: {
      id: artifactId,
      person_id: personId,
      template_key: template.key,
      assertions,
      user_verified: false,
      created_at: input.createdAt,
    },
    omissions,
    structuralAssertions,
  };
}
