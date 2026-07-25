/**
 * Gap detectors — lib/detectors/gaps.ts
 *
 * Pure functions over Fact[] (and Source[] for the one detector that needs
 * it). No model involvement, no I/O, no Date.now() — every date-sensitive
 * detector takes `now: Date` as an explicit parameter so the same inputs
 * always produce the same output.
 *
 * Every Gap.statement is a statement about the RECORD — never advice, never
 * urgency, never a recommendation. See docs/lanes/lane-c-safety.md §3.
 *
 * Statements are built ONLY from (a) fixed framing text written here, (b) a
 * Fact's normalised `subject` or a Source's `title`, and (c) dates this module
 * computed itself. Free text from the record (`canonical_value`, transcript
 * prose) is never interpolated: a document that says "arrange urgently" would
 * otherwise put imperative, urgency-laden language into a generated string and
 * straight through lib/safety/output_filter.ts. The advice-language property of
 * every statement is therefore structural, not a matter of careful wording.
 */

import type { Fact, Gap, Source } from '../contracts';

/* ============================ date helpers ============================ */

const WORD_TO_NUM: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const MONTH_NAMES: readonly string[] = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function parseAmount(token: string): number | null {
  const n = Number(token);
  if (!Number.isNaN(n)) return n;
  const w = WORD_TO_NUM[token.toLowerCase()];
  return w === undefined ? null : w;
}

/** Parses an ISO date as UTC, avoiding local-timezone drift. A bare
 *  YYYY-MM-DD is read as UTC midnight (not local midnight, which would shift
 *  the day either side of the date line). Returns null for unparseable input
 *  so a malformed record can never silently become an epoch date. */
function parseIsoDate(s: string): Date | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00.000Z' : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True once the whole of `deadline`'s UTC day has elapsed.
 *
 *  "within 7 days of 25 June" is satisfied by anything recorded on 2 July, so
 *  the record is not missing anything until 3 July begins. Comparing
 *  `now > deadline` instead would fire at 00:00:00.001 on the deadline day
 *  itself — an off-by-one day. */
function deadlineDayHasPassed(now: Date, deadline: Date): boolean {
  const startOfDayAfter = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate() + 1,
  );
  return now.getTime() >= startOfDayAfter;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
  );
}

function addYears(date: Date, years: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()),
  );
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/* ============================ text parsing ============================ */

const AMOUNT_WORD = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';

/** "within 7 days" / "within two weeks" -> total days. Returns null if absent. */
function parseWithinWindowDays(text: string): number | null {
  const re = new RegExp('\\bwithin\\s+' + AMOUNT_WORD + '\\s+(day|week)s?\\b', 'i');
  const m = re.exec(text);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (amount === null) return null;
  return m[2].toLowerCase() === 'week' ? amount * 7 : amount;
}

const REVIEW_UNITS = ['day', 'week', 'month', 'year'] as const;
type ReviewUnit = (typeof REVIEW_UNITS)[number];

/** Narrows a matched token to a ReviewUnit without a type assertion. */
function toReviewUnit(token: string): ReviewUnit | null {
  const lower = token.toLowerCase();
  return REVIEW_UNITS.find((u) => u === lower) ?? null;
}

/** "review in six months" style phrasing, anchored to a base date. */
function parseReviewInWindow(text: string): { amount: number; unit: ReviewUnit } | null {
  const re = new RegExp('\\breview\\w*\\s+in\\s+' + AMOUNT_WORD + '\\s+(day|week|month|year)s?\\b', 'i');
  const m = re.exec(text);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (amount === null) return null;
  const unit = toReviewUnit(m[2]);
  if (unit === null) return null;
  return { amount, unit };
}

/** "Due September 2026" style phrasing — a due date already resolved to a month/year. */
function parseDueMonthYear(text: string): Date | null {
  const m = /\bdue\s+([a-z]+)\s+(\d{4})\b/i.exec(text);
  if (!m) return null;
  const idx = MONTH_NAMES.indexOf(m[1].toLowerCase());
  if (idx === -1) return null;
  const year = Number(m[2]);
  if (Number.isNaN(year)) return null;
  return lastDayOfMonth(year, idx);
}

function addWindow(base: Date, amount: number, unit: ReviewUnit): Date {
  switch (unit) {
    case 'day':
      return addDays(base, amount);
    case 'week':
      return addDays(base, amount * 7);
    case 'month':
      return addMonths(base, amount);
    case 'year':
      return addYears(base, amount);
  }
}

/* ========================= topic matching ============================= */

const STOPWORDS = new Set([
  'review',
  'reviews',
  'result',
  'results',
  'outcome',
  'outcomes',
  'follow',
  'up',
  'contact',
  'due',
  'recorded',
  'not',
  'check',
  'function',
  'the',
  'and',
  'for',
  'with',
  'after',
  'before',
  'within',
  'days',
  'day',
  'weeks',
  'week',
  'months',
  'month',
  'years',
  'year',
  'instruction',
  'referral',
  'admin',
]);

function topicKeywords(fact: Fact): readonly string[] {
  const suffix = fact.ontology_key.split('.').slice(1).join(' ');
  const raw = (suffix + ' ' + fact.subject).toLowerCase();
  const tokens = raw.split(/[^a-z]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return tokens;
}

function factMatchesTopic(fact: Fact, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false;
  const haystack = `${fact.ontology_key} ${fact.subject} ${fact.canonical_value}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

/** A fact counts as recorded evidence, not just a placeholder for absence.
 *
 *  status 'unknown' means the record does not say — never that something was
 *  done. Such a fact can never close a gap, even when it carries supporting
 *  claims (a source may well cite the words "no result recorded"). */
function isRecordedEvidence(fact: Fact): boolean {
  return fact.status !== 'unknown';
}

/** A fact whose validity has ended (valid_to in the past) or which has been
 *  replaced (superseded_by set) is not a live record entry. */
function isLive(fact: Fact, now: Date): boolean {
  if (fact.superseded_by !== null) return false;
  if (fact.valid_to === null) return true;
  const end = parseIsoDate(fact.valid_to);
  if (end === null) return true;
  return now.getTime() < end.getTime();
}

/** Is there a later fact, sharing a topic keyword with the anchor, that is
 *  itself recorded evidence (not merely a status:'unknown' absence marker)? */
function hasLaterMatchingFact(
  facts: readonly Fact[],
  anchor: Fact,
  keywords: readonly string[],
): boolean {
  const anchorDate = anchor.valid_from ? parseIsoDate(anchor.valid_from) : null;
  return facts.some((f) => {
    if (f.id === anchor.id) return false;
    if (!isRecordedEvidence(f)) return false;
    if (!factMatchesTopic(f, keywords)) return false;
    if (!f.valid_from) return false;
    const factDate = parseIsoDate(f.valid_from);
    if (factDate === null) return false;
    if (!anchorDate) return true;
    return factDate.getTime() > anchorDate.getTime();
  });
}

function makeGap(
  detector: Gap['detector'],
  personId: string,
  statement: string,
  supportingClaimIds: readonly string[],
): Gap {
  return {
    id: crypto.randomUUID(),
    person_id: personId,
    detector,
    statement,
    supporting_claim_ids: [...supportingClaimIds],
    suggested_next_document: null,
  };
}

/* ============================ detectors ================================ */

/** 1. instruction_without_result — a Fact instructing an action within N
 *  days/weeks, with no later Fact of the expected type recorded after the
 *  deadline has passed. */
export function instructionWithoutResult(facts: readonly Fact[], now: Date): Gap[] {
  const gaps: Gap[] = [];
  for (const fact of facts) {
    if (!fact.ontology_key.startsWith('instruction.')) continue;
    if (!fact.valid_from) continue;

    const windowDays = parseWithinWindowDays(fact.canonical_value);
    if (windowDays === null) continue;

    const requestedOn = parseIsoDate(fact.valid_from);
    if (requestedOn === null) continue;
    const deadline = addDays(requestedOn, windowDays);
    if (!deadlineDayHasPassed(now, deadline)) continue;

    const keywords = topicKeywords(fact);
    if (hasLaterMatchingFact(facts, fact, keywords)) continue;

    const statement =
      `The record contains an instruction dated ${formatDateLong(requestedOn)} for ` +
      `${fact.subject} within ${windowDays} day${windowDays === 1 ? '' : 's'}. ` +
      `No fact recording an outcome is dated after ${formatDateLong(deadline)}.`;

    gaps.push(
      makeGap('instruction_without_result', fact.person_id, statement, fact.supporting_claim_ids),
    );
  }
  return gaps;
}

/** 2. referral_without_outcome — a referral Fact recorded, nothing of the
 *  expected type recorded after it (or after its stated window, if any). */
export function referralWithoutOutcome(facts: readonly Fact[], now: Date): Gap[] {
  const gaps: Gap[] = [];
  for (const fact of facts) {
    if (!fact.ontology_key.startsWith('referral.')) continue;
    if (!fact.valid_from) continue;

    const recordedOn = parseIsoDate(fact.valid_from);
    if (recordedOn === null) continue;
    const windowDays = parseWithinWindowDays(fact.canonical_value);
    const deadline = windowDays === null ? recordedOn : addDays(recordedOn, windowDays);
    if (!deadlineDayHasPassed(now, deadline)) continue;

    const keywords = topicKeywords(fact);
    if (hasLaterMatchingFact(facts, fact, keywords)) continue;

    const statement =
      `The record contains a referral dated ${formatDateLong(recordedOn)} for ` +
      `${fact.subject}. No fact recording an outcome is dated after ` +
      `${formatDateLong(deadline)}.`;

    gaps.push(
      makeGap('referral_without_outcome', fact.person_id, statement, fact.supporting_claim_ids),
    );
  }
  return gaps;
}

/** 3. review_date_passed — "review in 6 months" style Fact, the computed due
 *  date has passed relative to `now`, nothing of the expected type recorded. */
export function reviewDatePassed(facts: readonly Fact[], now: Date): Gap[] {
  const gaps: Gap[] = [];
  for (const fact of facts) {
    const dueFromMonthYear = parseDueMonthYear(fact.canonical_value);
    const window = parseReviewInWindow(fact.canonical_value);

    let due: Date | null = dueFromMonthYear;
    if (due === null && window !== null && fact.valid_from) {
      const base = parseIsoDate(fact.valid_from);
      due = base === null ? null : addWindow(base, window.amount, window.unit);
    }
    if (due === null) continue;
    if (!deadlineDayHasPassed(now, due)) continue;

    const keywords = topicKeywords(fact);
    if (hasLaterMatchingFact(facts, fact, keywords)) continue;

    const statement =
      `The record gives a review date of ${formatDateLong(due)} for ${fact.subject}. ` +
      `No later fact recording that review is present.`;

    gaps.push(makeGap('review_date_passed', fact.person_id, statement, fact.supporting_claim_ids));
  }
  return gaps;
}

const DOC_REFERENCE_RE =
  /\b(?:see enclosed|copy of|please see attached|as per)\s+(?:the\s+)?([A-Z][A-Za-z0-9 ,'’()-]{2,80}?)(?=[.,;:\n]|$)/gi;

function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\benclosed\b|\battached\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 4. referenced_document_absent — a Source's transcript references a
 *  document not present among the case's own Sources. */
export function referencedDocumentAbsent(sources: readonly Source[]): Gap[] {
  const gaps: Gap[] = [];
  const knownTitles = sources.map((s) => normaliseTitle(s.title));
  /** One gap per (source, referenced document) pair — a letter that mentions
   *  the same missing document three times is one gap in the record. */
  const seen = new Set<string>();

  for (const source of sources) {
    const re = new RegExp(DOC_REFERENCE_RE);
    let match: RegExpExecArray | null;
    while ((match = re.exec(source.transcript)) !== null) {
      const title = match[1].trim();
      const referenced = normaliseTitle(title);
      if (referenced.length === 0) continue;

      const isKnown = knownTitles.some(
        (t) => t.length > 0 && (t.includes(referenced) || referenced.includes(t)),
      );
      if (isKnown) continue;

      const key = `${source.id}::${referenced}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const statement =
        `"${source.title}" refers to "${title}". No source with that title is ` +
        `held for this record.`;

      gaps.push(makeGap('referenced_document_absent', source.person_id, statement, []));
    }
  }
  return gaps;
}

/** 5. medication_without_review — a live medication Fact with no matching
 *  review-date Fact recorded anywhere. "Live" excludes both superseded facts
 *  (superseded_by set) and facts whose validity has ended (valid_to in the
 *  past): a medication the record has already closed off is not a medication
 *  missing a review. `now` is explicit so this stays deterministic. */
export function medicationWithoutReview(facts: readonly Fact[], now: Date): Gap[] {
  const gaps: Gap[] = [];
  for (const fact of facts) {
    if (!fact.ontology_key.startsWith('medication.')) continue;
    if (!isLive(fact, now)) continue;

    const keywords = topicKeywords(fact);
    const hasReview = facts.some((f) => {
      if (f.id === fact.id) return false;
      if (!isRecordedEvidence(f)) return false;
      const text = `${f.ontology_key} ${f.canonical_value}`.toLowerCase();
      if (!text.includes('review')) return false;
      return factMatchesTopic(f, keywords);
    });
    if (hasReview) continue;

    const statement =
      `The record lists ${fact.subject} as a current medication. ` +
      `No review date is recorded for it.`;

    gaps.push(
      makeGap('medication_without_review', fact.person_id, statement, fact.supporting_claim_ids),
    );
  }
  return gaps;
}

/** Aggregates all five detectors over a case's Facts and Sources. */
export function detectGaps(facts: readonly Fact[], sources: readonly Source[], now: Date): Gap[] {
  return [
    ...instructionWithoutResult(facts, now),
    ...referralWithoutOutcome(facts, now),
    ...reviewDatePassed(facts, now),
    ...referencedDocumentAbsent(sources),
    ...medicationWithoutReview(facts, now),
  ];
}
