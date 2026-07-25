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
  Claim,
  Fact,
  Slot,
} from '@/lib/contracts';
import { liveFacts } from '@/lib/ai/facts';
import { ontologyMatches, slotsOf } from '@/lib/ai/templates';

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
  claimsById: ReadonlyMap<string, Pick<Claim, 'verified_substring'>>,
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
  claimsById: ReadonlyMap<string, Pick<Claim, 'verified_substring'>>,
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

export function resolveSlot(
  slot: Slot,
  facts: readonly Fact[],
  claimsById: ReadonlyMap<string, Pick<Claim, 'verified_substring'>>,
): SlotResolution {
  const matched = factsForSlot(slot, facts, claimsById);

  if (matched.length > 0) {
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

export interface BuildArtifactInput {
  readonly template: ArtifactTemplate;
  readonly facts: readonly Fact[];
  readonly claimsById: ReadonlyMap<string, Pick<Claim, 'verified_substring'>>;
  readonly personId: string;
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
export function buildArtifact(input: BuildArtifactInput): BuildArtifactResult {
  const { template, facts, claimsById, personId } = input;
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const artifactId = randomUUID();

  const assertions: Assertion[] = [];
  const omissions: SlotOmission[] = [];

  for (const { section, slot } of slotsOf(template)) {
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
      created_at: new Date().toISOString(),
    },
    omissions,
  };
}
