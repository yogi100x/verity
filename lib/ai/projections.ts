/**
 * Projections — lib/ai/projections.ts
 *
 * Four of the ontology namespaces the shipped artefact templates declare
 * (`conflict.*`, `gap.*`, `source.inventory`, `person.identity`) are not
 * filled by any Fact producer. Slot resolution only ever matches a `Fact`
 * against a slot's `ontology_match`, so the fix is to project these other
 * entities — Conflict, Gap, Source, the person themselves — into
 * contract-valid Facts that slot resolution can pick up unmodified.
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

import type { Conflict, Fact, Gap, Source } from '@/lib/contracts';

export interface ProjectionInput {
  readonly personId: string;
  readonly person: { readonly display_name: string };
  readonly conflicts: readonly Conflict[];
  readonly gaps: readonly Gap[];
  readonly sources: readonly Pick<Source, 'id' | 'kind' | 'title' | 'created_at'>[];
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
 * One Fact per Conflict, keyed `conflict.<segment>` where `<segment>` is the
 * conflict's own `subject`, normalised. The conflict is derived entirely
 * from verified claims, so the projected fact carries every one of those
 * claim ids as its support and is fully citable — `status: 'disputed'`
 * reflects exactly what a conflict is: multiple sources giving different
 * answers, unresolved. `canonical_value` is `generated_question` passed
 * through unchanged — it is already the product's screened output, not
 * something to re-word here.
 */
export function projectConflicts(input: ProjectionInput): Fact[] {
  const facts = input.conflicts.map((conflict) => {
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

/* ======================== source inventory ========================= */

/**
 * One Fact listing the documents this artefact was assembled from. A
 * document inventory entry describes documents, not a claim about the
 * person — there is nothing to cite, so `supporting_claim_ids` is empty and
 * `status` is `unknown` per the DB constraint. `system_inferred` because the
 * list itself is something the pipeline assembled, not a claim any single
 * document makes about itself. `canonical_value` is a fixed, deterministic
 * join of the sources' own titles — no source is described, only named.
 */
export function projectSourceInventory(input: ProjectionInput): Fact[] {
  if (input.sources.length === 0) return [];

  const titles = [...input.sources.map((s) => s.title)].sort(compareStrings);

  const fact: Fact = {
    ...baseFact(input.personId),
    ontology_key: 'source.inventory',
    subject: 'source inventory',
    canonical_value: titles.join('; '),
    provenance: 'system_inferred',
    status: 'unknown',
    supporting_claim_ids: [],
  };

  return [fact];
}

/* ========================= person identity ========================= */

/**
 * One Fact naming the person this case is about. Who the pack is about is
 * something a user told the system, not something extracted from a
 * document, so `provenance: 'user_stated'`. There is no claim to cite (the
 * person's identity is not itself a document assertion), so
 * `supporting_claim_ids` is empty and `status` is `unknown` per the DB
 * constraint.
 */
export function projectPersonIdentity(input: ProjectionInput): Fact[] {
  const fact: Fact = {
    ...baseFact(input.personId),
    ontology_key: 'person.identity',
    subject: 'identity',
    canonical_value: input.person.display_name,
    provenance: 'user_stated',
    status: 'unknown',
    supporting_claim_ids: [],
  };

  return [fact];
}

/* =============================== all =============================== */

/**
 * All projections, in a single deterministic order: by `ontology_key`, then
 * by a stable value derived from the source entity (never a freshly
 * generated, random `Fact.id`).
 */
export function projectAll(input: ProjectionInput): Fact[] {
  const all = [
    ...projectConflicts(input),
    ...projectGaps(input),
    ...projectSourceInventory(input),
    ...projectPersonIdentity(input),
  ];

  return [...all].sort((a, b) => compareStrings(a.ontology_key, b.ontology_key));
}
