/**
 * Projections — lib/ai/projections.ts
 *
 * Two of the ontology namespaces the shipped artefact templates declare
 * (`conflict.*`, `gap.*`) are not filled by any Fact producer. Slot
 * resolution only ever matches a `Fact` against a slot's `ontology_match`,
 * so the fix is to project these other entities — Conflict, Gap — into
 * contract-valid Facts that slot resolution can pick up unmodified.
 *
 * `source.inventory` and `person.identity` used to be projected here too,
 * but neither can ever back a slot through the ordinary evidence path: both
 * are metadata about the pack (which documents it draws on; who it is
 * about), not a claim about the person, so the fact each projection produced
 * carried no supporting claims — correctly, per the DB constraint
 * (`status = 'unknown' or supporting_claim_ids non-empty`) — and
 * `isVerifiedBacked` (`lib/ai/artifacts.ts`) correctly never lets a fact with
 * no supporting claims fill a slot. `person.identity`'s one matching slot
 * (`cover.subject`) is additionally unreachable for a second, independent
 * reason: it is a structural-copy slot (`citation_required: false`,
 * `gap_prompt: null`), so `buildArtifact` fills it from
 * `STRUCTURAL_COPY_SOURCES` and `continue`s before the ordinary evidence path
 * — the fact it carries in `facts` — is ever consulted. Both projections were
 * dead code producing facts no slot could ever resolve to; they have been
 * deleted (see `lib/ai/artifacts.ts`'s `isSourceInventorySlot` /
 * `STRUCTURAL_COPY_SOURCES['cover.subject']` for the real fix: route the
 * pack's own metadata down the structural/metadata path instead of
 * pretending it is evidence).
 *
 * INVARIANT: everything a user sees traces to a verbatim quote from a
 * source. Every `canonical_value` here is copied verbatim from the entity it
 * came from, or is a fixed structural join of such values — never
 * summarised, reworded, or invented. Provenance and status are chosen per
 * kind so that unciteable content can never present itself as confirmed:
 * the DB constraint `status = 'unknown' or array_length(supporting_claim_ids,
 * 1) >= 1` is honoured exactly — any fact with no supporting claims carries
 * `status: 'unknown'`.
 *
 * This module deliberately does NOT call `detectGaps` itself. Gap detection
 * needs a `now: Date` to reason about elapsed deadlines, and threading that
 * through here would make this module's output depend on wall-clock time.
 * The caller runs `detectGaps` and passes the result in, keeping every
 * function below pure and deterministic in its inputs alone.
 */

import type { Conflict, Fact, Gap } from '@/lib/contracts';

export interface ProjectionInput {
  readonly personId: string;
  readonly conflicts: readonly Conflict[];
  readonly gaps: readonly Gap[];
}

/* ============================ helpers ============================ */

/**
 * Normalises free text into a single ontology-key segment: lowercase,
 * non-alphanumeric runs collapsed to a single underscore, no leading or
 * trailing underscore, and — critically — no dot. A dotted segment would
 * still match a trailing wildcard like `conflict.*`, but keeping the shape
 * predictable (`conflict.<one-token>`) is what the tests assert and what a
 * future reader expects.
 */
function normalizeSegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'unspecified';
}

/** Plain, non-locale string comparison — no `localeCompare`. */
function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function baseFact(personId: string): Pick<
  Fact,
  'id' | 'person_id' | 'valid_from' | 'valid_to' | 'conflict_id' | 'superseded_by'
> {
  return {
    id: crypto.randomUUID(),
    person_id: personId,
    valid_from: null,
    valid_to: null,
    conflict_id: null,
    superseded_by: null,
  };
}

/* ============================ conflicts ============================ */

/**
 * One Fact per UNRESOLVED Conflict, keyed `conflict.<segment>` where
 * `<segment>` is the conflict's own `subject`, normalised. The conflict is
 * derived entirely from verified claims, so the projected fact carries every
 * one of those claim ids as its support and is fully citable —
 * `status: 'disputed'` reflects exactly what a conflict is: multiple sources
 * giving different answers, unresolved. `canonical_value` is
 * `generated_question` passed through unchanged — it is already the product's
 * screened output, not something to re-word here.
 *
 * A conflict with `resolution: 'user_resolved'` is SKIPPED. Two independent
 * resurrection paths exist for a settled disagreement and both must be shut:
 *
 *  - Supersession is handled upstream — `detectConflicts` is given the
 *    superseded claim ids (`lib/ai/reconcile.ts`) and never emits a conflict
 *    whose claims belong to a closed validity period, so a superseded
 *    disagreement never reaches this function in the first place.
 *  - USER RESOLUTION was not handled anywhere. `Conflict.resolution` is a
 *    frozen contract field with exactly two values, and nothing between the
 *    person clicking "resolved" and this projection consulted it. The
 *    projected fact is unconditionally live (`valid_to: null`,
 *    `superseded_by: null`) and `status: 'disputed'`, so it would fill
 *    `gp_brief_v1.questions` with a question the person has already answered,
 *    every time the brief is rebuilt, with no way to make it stop. A pack that
 *    keeps asking a settled question is the pack a GP stops reading.
 *
 * `status: 'disputed'` is only ever emitted for a disagreement that is still
 * open, which is the only reading of that word this product can defend.
 */
export function projectConflicts(input: ProjectionInput): Fact[] {
  const open = input.conflicts.filter((conflict) => conflict.resolution === 'unresolved');
  const facts = open.map((conflict) => {
    const fact: Fact = {
      ...baseFact(input.personId),
      ontology_key: `conflict.${normalizeSegment(conflict.subject)}`,
      subject: conflict.subject,
      canonical_value: conflict.generated_question,
      provenance: 'document_extracted',
      status: 'disputed',
      supporting_claim_ids: [...conflict.claim_ids],
      conflict_id: conflict.id,
    };
    return { fact, sortKey: conflict.id };
  });

  return facts
    .sort((a, b) => compareStrings(a.fact.ontology_key, b.fact.ontology_key) || compareStrings(a.sortKey, b.sortKey))
    .map((f) => f.fact);
}

/* ============================== gaps ============================== */

/**
 * One Fact per Gap, keyed `gap.<detector>`. `GapDetector` enum values are
 * already single dot-free tokens (`instruction_without_result`, etc.), so
 * they are used as the segment as-is.
 *
 * A gap may legitimately carry no supporting claims — e.g.
 * `referenced_document_absent`, which reports that a source mentions a
 * document nobody holds, not a claim within one — and the DB constraint
 * requires `status: 'unknown'` whenever that happens. Where a gap DOES carry
 * supporting claims, the statement is a fact about the record that those
 * claims establish, so it is `document_extracted` and `confirmed`. Where it
 * carries none, the statement was derived by the pipeline scanning source
 * text rather than backed by an extracted claim, so it is `system_inferred`
 * as well as `unknown`.
 */
export function projectGaps(input: ProjectionInput): Fact[] {
  const facts = input.gaps.map((gap) => {
    const hasSupport = gap.supporting_claim_ids.length > 0;
    const fact: Fact = {
      ...baseFact(input.personId),
      ontology_key: `gap.${gap.detector}`,
      subject: gap.detector,
      canonical_value: gap.statement,
      provenance: hasSupport ? 'document_extracted' : 'system_inferred',
      status: hasSupport ? 'confirmed' : 'unknown',
      supporting_claim_ids: [...gap.supporting_claim_ids],
    };
    return { fact, sortKey: gap.id };
  });

  return facts
    .sort((a, b) => compareStrings(a.fact.ontology_key, b.fact.ontology_key) || compareStrings(a.sortKey, b.sortKey))
    .map((f) => f.fact);
}

/* =============================== all =============================== */

/**
 * All projections, in a single deterministic order: by `ontology_key`, then
 * by a stable value derived from the source entity (never a freshly
 * generated, random `Fact.id`).
 */
export function projectAll(input: ProjectionInput): Fact[] {
  const all = [...projectConflicts(input), ...projectGaps(input)];

  return [...all].sort((a, b) => compareStrings(a.ontology_key, b.ontology_key));
}
