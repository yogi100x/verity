/**
 * Reconciliation: tie deterministic grouping (`lib/ai/group.ts`) and
 * conflict detection (`lib/ai/conflict.ts`) together into one call.
 *
 * Pure and synchronous — no network, no model calls. This file only
 * sequences two already-deterministic passes; it adds no new judgement of
 * its own.
 */

import type { Claim, Conflict, Fact, Source } from '@/lib/contracts';
import { groupClaims, unmatchedSubjects, type ClaimGroup } from '@/lib/ai/group';
import { detectConflicts, type ConflictGroupView } from '@/lib/ai/conflict';
import { buildFacts, applySupersession, supersededClaimIds } from '@/lib/ai/facts';

export interface ReconcileResult {
  readonly groups: readonly ClaimGroup[];
  readonly conflicts: readonly Conflict[];
  /** Normalised subjects that formed a single-claim group — model-assist candidates. */
  readonly unmatched: readonly string[];
  /**
   * Every fact this call derived, across every group — superseded ones
   * included. A superseded fact is never dropped from this list: it must
   * stay visible and citable (`lib/ai/facts.ts`, `docs/lanes/lane-a-pipeline.md`
   * S6), and this is the only place a caller can get at it.
   */
  readonly facts: readonly Fact[];
}

export interface ReconcileOptions {
  /**
   * Source metadata (kind + title) `buildFacts` (`lib/ai/facts.ts`) needs to
   * classify each claim's source as an `instruction` or an `observation` via
   * `classifySource` (`lib/ai/sources.ts`) — that classification is what
   * decides whether a claim opens a new validity period or merely joins the
   * current one, which is the whole supersession mechanism.
   *
   * SAFE DEFAULT — read this before omitting it: if `sourcesById` is not
   * supplied, `reconcile` treats EVERY claim in EVERY group as an
   * `observation`. No validity period is ever opened beyond the single
   * leading one, so `applySupersession` finds nothing to chain and nothing is
   * ever marked superseded. This mirrors `classifySource`'s own default (when
   * unsure, `observation`, never `instruction`) one level up: a caller that
   * forgets to pass source metadata gets the conservative, previous-generation
   * behaviour — no periods invented, no claim silently excluded from a
   * conflict — rather than a crash or, worse, a wrong classification that
   * silently rewrites the timeline.
   */
  readonly sourcesById?: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>;
  /**
   * Supersession known ahead of time — for example read back from a
   * persisted `facts` table via `supersededClaimIdsFromFacts`, once
   * persistence exists. This is UNIONED with whatever this call derives
   * itself from `claims` + `sourcesById`, never used to override it: letting
   * either source silently win would mean either a caller's stale snapshot
   * suppresses a fresh derivation, or a fresh derivation discards information
   * a caller had for a reason this call cannot see. Both sources of truth are
   * kept.
   */
  readonly supersededClaimIds?: readonly string[];
}

/** The safe-default source map: every claim's source_id present, mapped to
 *  metadata `classifySource` is guaranteed to read as `observation` — an
 *  empty title matches none of its instruction/observation rules and falls
 *  through to the explicit default (see `lib/ai/sources.ts`). This exists
 *  purely so `buildFacts` always finds an entry for every claim (it throws
 *  otherwise) even when the caller supplied no real source metadata at all. */
function observationOnlySourcesById(
  claims: readonly Claim[],
): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const claim of claims) {
    if (!map.has(claim.source_id)) {
      map.set(claim.source_id, { kind: 'text', title: '' });
    }
  }
  return map;
}

/**
 * Group verified claims, derive facts (and, from them, supersession) per
 * group, then detect conflicts among the live claims.
 *
 * `claims` may include unverified claims — `groupClaims`, `buildFacts` and
 * `detectConflicts` all drop anything with `verified_substring !== true`
 * before doing anything else, so an unverified claim can never reach a
 * group, a fact, or a conflict here.
 *
 * Pipeline order, per group: `buildFacts` splits the group's claims into
 * validity periods, `applySupersession` closes earlier periods against later
 * ones, and the resulting facts' superseded claim ids feed `detectConflicts`
 * so a superseded instruction never keeps a resolved disagreement alive.
 */
export function reconcile(
  claims: readonly Claim[],
  personId: string,
  options?: ReconcileOptions,
): ReconcileResult {
  const groups = groupClaims(claims);

  // Annotated, not inferred: this is the seam between grouping and conflict
  // detection, and the annotation is what makes a drift between `ClaimGroup`
  // and `ConflictGroupView` a compile error here rather than a runtime
  // surprise downstream.
  const groupViews: readonly ConflictGroupView[] = groups;

  const sourcesById = options?.sourcesById ?? observationOnlySourcesById(claims);

  const facts: Fact[] = [];
  for (const group of groups) {
    const groupFacts = buildFacts({ group, sourcesById, personId });
    facts.push(...applySupersession(groupFacts));
  }

  // Union, not override — see the doc comment on `ReconcileOptions.supersededClaimIds`.
  const superseded = new Set(supersededClaimIds(facts));
  for (const id of options?.supersededClaimIds ?? []) superseded.add(id);

  const conflicts = detectConflicts(groupViews, personId, {
    supersededClaimIds: [...superseded],
  });

  return {
    groups,
    conflicts,
    unmatched: unmatchedSubjects(groups),
    facts: linkFactsToConflicts(facts, conflicts),
  };
}

/**
 * Back-link each fact to the `Conflict` its own claims are part of.
 *
 * `Fact.conflict_id` was being left null by every path through this module
 * even when the fact's claims had produced a conflict two lines earlier — the
 * contract declares the field and `fixtures/margaret.json` sets it, so every
 * consumer that joins a disputed fact to the question it raises (the artefact
 * `conflict` renderer, Lane B's timeline) silently got nothing. The
 * disagreement was detected and then thrown away at the seam.
 *
 * Membership is by claim id, never by re-deriving the disagreement: a fact
 * belongs to a conflict when one of its supporting claims is one of the
 * conflict's claims. Claims of a superseded fact are excluded from conflict
 * detection upstream, so a superseded fact is not linked — a resolved
 * disagreement does not come back as a current question.
 *
 * Non-destructive, like `applySupersession`: a `conflict_id` already set on an
 * incoming fact is preserved when this pass finds no match for it.
 */
function linkFactsToConflicts(
  facts: readonly Fact[],
  conflicts: readonly Conflict[],
): Fact[] {
  if (conflicts.length === 0) return [...facts];

  const conflictIdByClaimId = new Map<string, string>();
  for (const conflict of conflicts) {
    for (const claimId of conflict.claim_ids) {
      conflictIdByClaimId.set(claimId, conflict.id);
    }
  }

  return facts.map((fact) => {
    for (const claimId of fact.supporting_claim_ids) {
      const conflictId = conflictIdByClaimId.get(claimId);
      if (conflictId === undefined) continue;
      return fact.conflict_id === conflictId ? fact : { ...fact, conflict_id: conflictId };
    }
    return fact;
  });
}

/**
 * Supersession information read from a set of Facts.
 *
 * This is a READ, not a derivation. The supersession pass itself now exists —
 * `buildFacts` + `applySupersession` in `lib/ai/facts.ts`, run by `reconcile`
 * above whenever it is given `sourcesById` — so this function is no longer
 * the only route to supersession information and is NOT how `reconcile` gets
 * it. It remains useful for one thing: reading supersession off a set of
 * Facts that came from somewhere this call cannot see (a persisted `facts`
 * table, or a fixture's own `facts` array), so a caller can hand it to
 * `reconcile` via `ReconcileOptions.supersededClaimIds` and have it UNIONED
 * with what `reconcile` derives for itself.
 *
 * A previous version of this comment claimed the supersession pass was
 * unbuilt. It is built; do not restore that claim.
 */
export function supersededClaimIdsFromFacts(facts: readonly Fact[]): string[] {
  const ids = new Set<string>();
  for (const fact of facts) {
    if (fact.superseded_by !== null || fact.valid_to !== null) {
      for (const claimId of fact.supporting_claim_ids) {
        ids.add(claimId);
      }
    }
  }
  return [...ids].sort();
}
