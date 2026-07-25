/**
 * Fact construction and supersession (stretch S6).
 *
 * A claim group is not one fact — it is a sequence of validity periods.
 * Instructions (a clinician changing the state) open a new period and close
 * the previous one. Observations (a repeat prescription, a care log, a
 * patient's own account) report the state and join whichever period is
 * current, agreeing or disagreeing with it. Collapsing that distinction is
 * how a pharmacy repeat ends up silently overruling a hospital decision.
 *
 * `anyPairConflicts` (and through it `valuesConflict` / `valueState`) is
 * reused from `lib/ai/conflict.ts` rather than duplicated here — same narrow,
 * literal stemmed vocabulary, same reasoning about what counts as
 * disagreement. A second copy of the pairwise loop existed in this file and
 * had to go: "is this period disputed?" and "is this group a conflict?" must
 * be the SAME question, or the page can show a `confirmed` fact sitting under
 * a rendered disagreement.
 *
 * DATES. A period can only START on a date we can actually place on a
 * calendar. A claim with `asserted_at: null`, or with `date_precision` of
 * anything but 'exact', cannot anchor a `valid_from` and therefore may not
 * open a period however clinical its source is — see `periodDecisionFor`.
 * Letting it open one produced facts with `superseded_by` set and `valid_to`
 * still null (incoherent: replaced, but never ended) and let an undated
 * document silently supersede a dated one. The refusal is visible, not
 * silent: the reason travels on the decision and is rendered next to the
 * claim on the inspector page.
 */

import { randomUUID } from 'crypto';
import { type Fact, type Source, type Claim } from '@/lib/contracts';
import { compareClaimsByDate, type ClaimGroup } from '@/lib/ai/group';
import { anyPairConflicts } from '@/lib/ai/conflict';
import { classifySource, type ClaimRole } from '@/lib/ai/sources';

export interface BuildFactsInput {
  readonly group: ClaimGroup;
  readonly sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>;
  readonly personId: string;
}

/** A claim carrying the role its source was classified with. */
interface RoledClaim {
  readonly claim: Claim;
  readonly role: ClaimRole;
}

/** One validity period: a run of claims that share a state. */
interface Period {
  readonly claims: readonly RoledClaim[];
  readonly validFrom: string | null;
}

/* ========================= date anchoring ========================= */

/**
 * A full calendar date, zero-padded. Anything else — '2026', '2026-03',
 * 'March 2026', '' — is not a point in time this pipeline will order a
 * timeline by, let alone close one period against another with.
 */
const ANCHOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when a date string can anchor the boundary of a validity period.
 * Exported so the boundary rule has one definition rather than one per
 * caller.
 */
export function isAnchorDate(date: string | null): boolean {
  return date !== null && ANCHOR_DATE_RE.test(date);
}

/**
 * Whether one claim may open a new validity period, and why.
 *
 * Two independent conditions, both required:
 *  1. its source reads as an `instruction` (`lib/ai/sources.ts`), and
 *  2. its own date can anchor the period's start — present, `exact`, and a
 *     full calendar date.
 *
 * Exported because the inspector page renders this reason verbatim next to
 * each supporting quote. An instruction that was refused a period because of
 * its date must SAY so on the page; a silent downgrade is exactly the failure
 * mode this module is arranged against.
 */
export interface ClaimPeriodDecision {
  readonly role: ClaimRole;
  readonly opens_period: boolean;
  readonly reason: string;
}

export function periodDecisionFor(
  claim: Pick<Claim, 'asserted_at' | 'date_precision'>,
  source: Pick<Source, 'kind' | 'title'>,
): ClaimPeriodDecision {
  const { role, reason } = classifySource(source);

  if (role !== 'instruction') {
    return { role, opens_period: false, reason };
  }

  if (claim.asserted_at === null) {
    return {
      role,
      opens_period: false,
      reason: `${reason}, but it carries no date, so it cannot start a period — read as evidence within the current one`,
    };
  }

  if (claim.date_precision !== 'exact' || !isAnchorDate(claim.asserted_at)) {
    return {
      role,
      opens_period: false,
      reason: `${reason}, but its date is '${claim.asserted_at}' (precision: ${claim.date_precision}), which cannot start a period — read as evidence within the current one`,
    };
  }

  return { role, opens_period: true, reason };
}

function sourceFor(
  sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>,
  claim: Claim,
): Pick<Source, 'kind' | 'title'> {
  const source = sourcesById.get(claim.source_id);
  if (source === undefined) {
    throw new Error(
      `buildFacts: no source in sourcesById for claim ${claim.id} (source_id ${claim.source_id})`,
    );
  }
  return source;
}

/**
 * Split a group's verified, date-ordered claims into validity periods.
 *
 * An instruction claim opens a new period only when `periodDecisionFor` says
 * it may AND its date is strictly later than the open period's start.
 * Everything else — observations, undated or imprecisely dated instructions,
 * and a second instruction bearing the SAME date as the period already open —
 * joins the current period as evidence.
 *
 * The same-date rule matters. Two instructions dated the same day cannot be
 * ordered, and pretending otherwise produced a zero-length period
 * (`valid_from === valid_to`) whose loser was picked by whichever random uuid
 * sorted first. Keeping both in one period instead makes them disagree, which
 * surfaces as a visible conflict — the recoverable failure, per the asymmetry
 * argued in `lib/ai/sources.ts`.
 *
 * Observations before any instruction form a single leading period, starting
 * at the earliest such claim — they are real evidence and are never dropped.
 */
function buildPeriods(
  claims: readonly Claim[],
  sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>,
): Period[] {
  interface OpenPeriod {
    readonly claims: RoledClaim[];
    readonly validFrom: string | null;
  }

  const periods: Period[] = [];
  let current: OpenPeriod | null = null;

  for (const claim of claims) {
    const decision = periodDecisionFor(claim, sourceFor(sourcesById, claim));
    const roled: RoledClaim = { claim, role: decision.role };

    const startsLater =
      current === null ||
      current.validFrom === null ||
      (claim.asserted_at !== null && claim.asserted_at > current.validFrom);

    if (decision.opens_period && startsLater) {
      if (current !== null) periods.push({ claims: current.claims, validFrom: current.validFrom });
      current = { claims: [roled], validFrom: claim.asserted_at };
      continue;
    }

    if (current === null) {
      current = { claims: [roled], validFrom: claim.asserted_at };
    } else {
      current.claims.push(roled);
    }
  }

  if (current !== null) {
    periods.push({ claims: current.claims, validFrom: current.validFrom });
  }

  return periods;
}

/** Neutral, non-committal canonical value for a disputed period — never one
 *  of the competing values, never a ranking of them. */
function disputedCanonicalValue(claims: readonly RoledClaim[]): string {
  const sourceCount = new Set(claims.map((c) => c.claim.source_id)).size;
  const noun = sourceCount === 1 ? 'source gives' : 'sources give';
  return `Disputed — ${sourceCount} ${noun} different answers`;
}

function factForPeriod(
  period: Period,
  group: ClaimGroup,
  personId: string,
): Fact {
  const { claims, validFrom } = period;
  const instruction = claims.find((c) => c.role === 'instruction');

  const disputed = claims.length > 1 && anyPairConflicts(claims.map((c) => c.claim));

  const canonicalValue = disputed
    ? disputedCanonicalValue(claims)
    : (instruction ?? claims[0])?.claim.value ?? '';

  const provenance = (instruction ?? claims[0])?.claim.provenance ?? 'unknown';

  return {
    id: randomUUID(),
    person_id: personId,
    ontology_key: group.ontology_key,
    subject: group.subject,
    canonical_value: canonicalValue,
    provenance,
    status: disputed ? 'disputed' : 'confirmed',
    valid_from: validFrom,
    valid_to: null,
    supporting_claim_ids: claims.map((c) => c.claim.id),
    conflict_id: null,
    superseded_by: null,
  };
}

/**
 * A tiebreak key that does not depend on a fact's own id.
 *
 * `Fact.id` is a fresh `randomUUID()`, so any ordering that falls back to it
 * is not deterministic across runs. Two facts sharing a `valid_from` were
 * therefore ordered at random — and, before the chaining rewrite below, that
 * random order decided which of them got marked superseded. The lowest
 * supporting claim id is derived from the input and is stable.
 */
function tiebreakKey(fact: Fact): string {
  let lowest: string | null = null;
  for (const id of fact.supporting_claim_ids) {
    if (lowest === null || id < lowest) lowest = id;
  }
  return lowest ?? fact.id;
}

/** Stable output order: valid_from ascending, nulls first, then the
 *  id-independent tiebreak, then id as a last resort. */
function compareFactsForOutput(a: Fact, b: Fact): number {
  if (a.valid_from === null && b.valid_from !== null) return -1;
  if (a.valid_from !== null && b.valid_from === null) return 1;
  if (a.valid_from !== null && b.valid_from !== null && a.valid_from !== b.valid_from) {
    return a.valid_from < b.valid_from ? -1 : 1;
  }
  const keyA = tiebreakKey(a);
  const keyB = tiebreakKey(b);
  if (keyA !== keyB) return keyA < keyB ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Split one claim group into validity periods and build a Fact per period.
 * Instruction claims open periods; observation claims join the current one.
 * Only verified claims (`verified_substring === true`) ever contribute.
 */
export function buildFacts(input: BuildFactsInput): Fact[] {
  const { group, sourcesById, personId } = input;

  const verified = group.claims.filter((c) => c.verified_substring === true);
  const ordered = [...verified].sort(compareClaimsByDate);

  const periods = buildPeriods(ordered, sourcesById);
  const facts = periods.map((period) => factForPeriod(period, group, personId));

  return [...facts].sort(compareFactsForOutput);
}

/**
 * The fact that closes `fact`: the EARLIEST fact in the same identity group
 * whose `valid_from` is a real calendar date STRICTLY later than `fact`'s.
 *
 * Deliberately not "the next one in a sorted array". Adjacency in a sorted
 * array put two facts sharing a `valid_from` in an arbitrary order and then
 * superseded one by the other, producing a zero-length period whose loser was
 * chosen by a random uuid. Searching for the earliest strictly-later start
 * instead means facts sharing a start date are both closed by the same later
 * fact and neither closes the other — the same answer whatever order the
 * input arrived in.
 */
function successorFor(fact: Fact, group: readonly Fact[]): Fact | null {
  const from = fact.valid_from;
  if (from === null || !isAnchorDate(from)) return null;

  let best: Fact | null = null;
  let bestFrom: string | null = null;

  for (const other of group) {
    if (other === fact) continue;
    const otherFrom = other.valid_from;
    if (otherFrom === null || !isAnchorDate(otherFrom)) continue;
    if (otherFrom <= from) continue;

    if (
      bestFrom === null ||
      otherFrom < bestFrom ||
      (otherFrom === bestFrom && best !== null && tiebreakKey(other) < tiebreakKey(best))
    ) {
      best = other;
      bestFrom = otherFrom;
    }
  }

  return best;
}

/**
 * Close earlier periods against later ones: set the earlier fact's
 * `valid_to` to the later fact's `valid_from` and record `superseded_by`.
 *
 * Guarantees, all of them load-bearing:
 *
 *  - **Never mutates its input.** Every returned fact is a fresh object; the
 *    argument array and its members are untouched.
 *  - **Never drops a fact.** Output length always equals input length. A
 *    superseded fact keeps its `supporting_claim_ids`, its provenance and its
 *    status, and stays in the returned set — it must remain visible and
 *    citable (S6).
 *  - **Never invents a boundary it cannot date.** A fact whose `valid_from` is
 *    null or not a full calendar date neither supersedes nor is superseded; it
 *    is returned as it came in. `superseded_by` set while `valid_to` is still
 *    null is therefore unreachable, and `valid_to` can never precede
 *    `valid_from` because the successor search demands a strictly later date.
 *  - **Never erases supersession it did not derive.** When no successor is
 *    found, existing `valid_to` / `superseded_by` values are preserved rather
 *    than cleared — which also makes the function idempotent.
 *
 * Facts are chained within groups that share `ontology_key` + `subject` (+
 * `person_id`, so two different people's facts never chain against each
 * other).
 */
export function applySupersession(facts: readonly Fact[]): Fact[] {
  const groups = new Map<string, Fact[]>();

  for (const fact of facts) {
    const key = `${fact.person_id} ${fact.ontology_key} ${fact.subject}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [fact]);
    } else {
      existing.push(fact);
    }
  }

  const result: Fact[] = [];

  for (const group of groups.values()) {
    for (const fact of group) {
      const successor = successorFor(fact, group);
      result.push(
        successor === null
          ? { ...fact }
          : { ...fact, valid_to: successor.valid_from, superseded_by: successor.id },
      );
    }
  }

  return result.sort(compareFactsForOutput);
}

/** Facts that are still current: not superseded, no end to their validity. */
export function liveFacts(facts: readonly Fact[]): Fact[] {
  return facts.filter((f) => f.valid_to === null && f.superseded_by === null);
}

/** Claim ids belonging to superseded facts — what conflict detection needs
 *  to exclude a superseded instruction from a live conflict. */
export function supersededClaimIds(facts: readonly Fact[]): string[] {
  const ids: string[] = [];
  for (const fact of facts) {
    if (fact.superseded_by === null) continue;
    ids.push(...fact.supporting_claim_ids);
  }
  return ids;
}
