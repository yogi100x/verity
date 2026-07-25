/**
 * CHC clock — lib/detectors/chc_clock.ts
 *
 * Pure function over Fact[]. No model involvement, no I/O, no Date.now() —
 * `now` is an explicit parameter so the same inputs always produce the same
 * output (see lib/detectors/gaps.ts for the same pattern this module
 * mirrors).
 *
 * This is NOT a Gap detector: `GapDetector` in lib/contracts.ts is frozen
 * and does not gain a member here. The CHC Checklist-to-decision clock is a
 * separate, narrower feature: research/03-chc-entitlements.md records the
 * National Framework's own figure — Checklist-to-decision target of 28
 * calendar days (`today − checklist_positive_date` vs 28 days). This module
 * reports that day count. It never says the clock has "expired", "elapsed
 * too long", or is "overdue" — it states the checklist date, the framework's
 * stated timescale, and the day count, and lets the reader draw their own
 * conclusion. There is no severity/urgency field in the contract and this
 * module does not simulate one in prose either. In particular there is no
 * branch anywhere below that compares `days_elapsed` against
 * `TIMESCALE_DAYS`: a wording change past day 28 would BE a seriousness
 * judgement, so the prose is identical at day 1 and at day 365 and only the
 * number differs. `TIMESCALE_DAYS` is read for the field and for the
 * sentence, never for a condition.
 *
 * Two record-shape decisions, both deliberately conservative:
 *   - A checklist date carrying a time-of-day is floored to UTC midnight of
 *     its calendar day, so the reported day count is always a whole-calendar
 *     day difference that agrees with the `checklist_date` field.
 *   - A checklist date in the FUTURE is a corrupted record, not a running
 *     clock, and is skipped entirely (see `chcDeadlines`).
 *
 * The chase letter reuses lib/copy/request_letters.ts's `composeLetter` —
 * the same deterministic salutation/body/closing envelope every other
 * generated letter in this lane uses — rather than building its own
 * ad-hoc template. Callers must still run `filterOutput` over the returned
 * strings before sending or persisting, exactly as for every other letter
 * in this lane; this module does not call the filter itself.
 */

import type { Fact } from '../contracts';
import { composeLetter, type RequestLetter } from '../copy/request_letters';

/** The National Framework's own figure. Single source: every place this
 *  number appears in generated prose reads it from here via the
 *  `timescale_days` field — it is never re-typed as a literal a second
 *  time. */
const TIMESCALE_DAYS = 28 as const;

export interface ChcDeadline {
  readonly fact_id: string;
  /** ISO date (YYYY-MM-DD) the checklist was completed, as read from the fact. */
  readonly checklist_date: string;
  /** Whole days elapsed from the checklist date to `now`. */
  readonly days_elapsed: number;
  /** The statutory National Framework figure. */
  readonly timescale_days: 28;
  /** Factual and free of urgency language — what the record shows, the
   *  framework's stated timescale, and the day count. */
  readonly statement: string;
  readonly chase_letter: RequestLetter;
}

/** Parses an ISO date as UTC, avoiding local-timezone drift — mirrors
 *  lib/detectors/gaps.ts's `parseIsoDate`. A bare YYYY-MM-DD is read as UTC
 *  midnight. Returns null for unparseable input so a malformed record can
 *  never silently become an epoch date. */
function parseIsoDate(s: string): Date | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00.000Z' : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Normalises a parsed instant to UTC midnight of its calendar day. Without
 *  this, a fact carrying a time-of-day ('2026-07-03T12:00:00.000Z', or an
 *  offset form like '2026-07-03T23:00:00+01:00') would report
 *  `checklist_date` '2026-07-03' while counting its days from midday — one
 *  fewer day than the calendar shows. Flooring first makes the arithmetic
 *  whole calendar days in UTC and keeps the field and the day count
 *  consistent. UTC throughout means DST never enters the arithmetic. */
function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A fact whose validity has ended (valid_to in the past) or which has been
 *  replaced (superseded_by set) is not a live record entry. Mirrors
 *  lib/detectors/gaps.ts's `isLive`. */
function isLive(fact: Fact, now: Date): boolean {
  if (fact.superseded_by !== null) return false;
  if (fact.valid_to === null) return true;
  const end = parseIsoDate(fact.valid_to);
  if (end === null) return true;
  return now.getTime() < end.getTime();
}

/** The checklist date comes from `canonical_value` when that parses as an
 *  ISO date, falling back to `valid_from`. Never throws: an unparseable
 *  fact is skipped by the caller. */
function checklistDateFor(fact: Fact): Date | null {
  const fromCanonical = parseIsoDate(fact.canonical_value);
  if (fromCanonical !== null) return startOfUtcDay(fromCanonical);
  if (fact.valid_from === null) return null;
  const fromValidFrom = parseIsoDate(fact.valid_from);
  return fromValidFrom === null ? null : startOfUtcDay(fromValidFrom);
}

/** Whole days from `from` to `now`, both compared as UTC instants. Floored,
 *  not rounded: the same day yields 0, and a day only increments once its
 *  full 24 hours have elapsed. */
function wholeDaysElapsed(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

function buildStatement(checklistDate: Date, daysElapsed: number): string {
  return (
    `The CHC Checklist was completed on ${formatDateLong(checklistDate)}. ` +
    `The National Framework's timescale from Checklist to decision is ` +
    `${TIMESCALE_DAYS} days. Day ${daysElapsed} today.`
  );
}

function buildChaseLetter(statement: string): RequestLetter {
  const paragraphs = [
    'The record includes the following.',
    statement,
    "I can't find a recorded decision in the papers I hold. Could you tell me the current status of the decision?",
  ];
  return composeLetter('chc_coordinator', paragraphs);
}

/**
 * Reports the Checklist-to-decision clock for every live
 * `chc.checklist_date` fact. Purely factual: the statement never uses
 * urgency vocabulary, however large `days_elapsed` grows — the number does
 * the work, the product never judges.
 */
export function chcDeadlines(facts: readonly Fact[], now: Date): ChcDeadline[] {
  const results: ChcDeadline[] = [];

  for (const fact of facts) {
    if (fact.ontology_key !== 'chc.checklist_date') continue;
    if (!isLive(fact, now)) continue;

    const checklistDate = checklistDateFor(fact);
    if (checklistDate === null) continue;

    const daysElapsed = wholeDaysElapsed(checklistDate, now);

    // A checklist date in the future is a corrupted record, not a clock that
    // is running: there is no elapsed time to report, and "Day -5 today." is
    // not a statement about anything. Skipping is the safe direction.
    // Clamping to Day 0 was the alternative and is worse — it would present a
    // corrupt date as though the checklist had been completed today, which is
    // an assertion about the record that the record does not support. This is
    // not a comparison against TIMESCALE_DAYS and carries no judgement about
    // how long anything has taken; it is a well-formedness check on the date.
    if (daysElapsed < 0) continue;

    const statement = buildStatement(checklistDate, daysElapsed);

    results.push({
      fact_id: fact.id,
      checklist_date: toIsoDateString(checklistDate),
      days_elapsed: daysElapsed,
      timescale_days: TIMESCALE_DAYS,
      statement,
      chase_letter: buildChaseLetter(statement),
    });
  }

  return results;
}
