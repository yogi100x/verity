/**
 * Reconciliation: tie deterministic grouping (`lib/ai/group.ts`) and
 * conflict detection (`lib/ai/conflict.ts`) together into one call.
 *
 * Pure and synchronous — no network, no model calls. This file only
 * sequences two already-deterministic passes; it adds no new judgement of
 * its own.
 */

import type { Claim, Conflict, Fact } from '@/lib/contracts';
import { groupClaims, unmatchedSubjects, type ClaimGroup } from '@/lib/ai/group';
import { detectConflicts, type ConflictGroupView } from '@/lib/ai/conflict';

export interface ReconcileResult {
  readonly groups: readonly ClaimGroup[];
  readonly conflicts: readonly Conflict[];
  /** Normalised subjects that formed a single-claim group — model-assist candidates. */
  readonly unmatched: readonly string[];
}

export interface ReconcileOptions {
  readonly supersededClaimIds?: readonly string[];
}

/**
 * Group verified claims, then detect conflicts among the live ones.
 *
 * `claims` may include unverified claims — both `groupClaims` and
 * `detectConflicts` drop anything with `verified_substring !== true` before
 * doing anything else, so an unverified claim can never reach a group or a
 * conflict here.
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

  const conflicts = detectConflicts(groupViews, personId, {
    ...(options?.supersededClaimIds === undefined
      ? {}
      : { supersededClaimIds: options.supersededClaimIds }),
  });

  return {
    groups,
    conflicts,
    unmatched: unmatchedSubjects(groups),
  };
}

/**
 * Supersession information read from a set of Facts.
 *
 * This is a READ, not a derivation: the supersession PASS — the logic that
 * decides two facts share a subject and non-overlapping validity, and marks
 * the earlier one superseded — is stretch S6 and is NOT implemented anywhere
 * in this codebase yet. This function only collects the ids that a
 * supersession pass, once it exists, will already have written onto Facts.
 *
 * Until S6 runs, live extraction produces Facts with `superseded_by: null`
 * and `valid_to: null` for everything, so this function returns an empty
 * array for real pipeline output, and `reconcile` (and `detectConflicts`
 * underneath it) will treat every verified claim in a group as live. That is
 * why, in fixtures mode, the four-claim furosemide group in
 * `fixtures/margaret.json` yields a conflict with all four claim ids unless
 * the caller supplies supersession information itself (which the fixture's
 * own `facts` array already carries, precisely so the three-claim demo beat
 * can be reproduced today without S6 existing). This limitation is real and
 * is stated here rather than hidden: it is a dependency on unbuilt work, not
 * a bug in this function.
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
