/**
 * Conflict detection: turn groups of live claims about the same subject into
 * `Conflict` rows with a generated question a clinician can answer.
 *
 * The demo beat this lane owns: three sources disagreeing about furosemide
 * must produce ONE conflict with a generated question. If nothing else in
 * this file works, that must.
 *
 * `ConflictGroupView` is the minimal input this file needs, so a caller can
 * detect conflicts over any group-shaped value without constructing a full
 * `ClaimGroup`. `_claimGroupSatisfiesView` below makes the relationship
 * load-bearing at typecheck time rather than a claim in a comment.
 */

import { randomUUID } from 'crypto';
import { Conflict, type Claim } from '@/lib/contracts';
import { compareClaimsByDate, type ClaimGroup } from '@/lib/ai/group';

/* ============================ input shape ============================ */

/** The minimal shape `detectConflicts` needs from a claim group. */
export interface ConflictGroupView {
  readonly ontology_key: string;
  readonly subject: string;
  readonly claims: readonly Claim[];
}

/**
 * Load-bearing, typecheck-time: the real `ClaimGroup` must remain assignable to
 * `ConflictGroupView`. If `lib/ai/group.ts` renames `ontology_key` or narrows
 * `claims`, this line fails to compile instead of the two shapes silently
 * drifting apart until a runtime `undefined` shows up in a rendered conflict.
 */
type _ClaimGroupSatisfiesView = ClaimGroup extends ConflictGroupView ? true : never;
const _claimGroupSatisfiesView: _ClaimGroupSatisfiesView = true;
void _claimGroupSatisfiesView;

/* ========================= banned question terms ========================= */

/**
 * Terms a generated question must never contain.
 *
 * TODO(lane-c): Lane C owns `lib/copy/**` and the canonical banned-term list
 * belongs there. That directory does not exist yet (concurrent build), so
 * this local list is a temporary stand-in and the SOLE source of truth until
 * Lane C's list lands — at which point this file should import theirs and
 * this array should be deleted, not merged.
 */
export const BANNED_QUESTION_TERMS: readonly string[] = [
  'urgent',
  'urgently',
  'immediately',
  'emergency',
  'severe',
  'severity',
  'risk',
  'risky',
  'score',
  'priority',
  'triage',
  'likely',
  'probably',
  'suggests',
  'consistent with',
  'should be',
  'must be',
  'dangerous',
  'serious',
  'critical',
  'worrying',
  'concerning',
  'mild',
  'moderate',
  // First-person-directive phrasings: telling someone what to do, not asking
  // a clinician a question they can answer.
  'she should',
  'he should',
  'they should',
  'you should',
  'needs to',
];

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * First banned term found in `text` (word-boundary matched, case-insensitive),
 * or null. Reusable by tests and by anything else in the pipeline that emits
 * clinician-facing prose.
 *
 * Multi-word terms match across any run of whitespace, so a term that straddles
 * a line break in the text being checked (`consistent\nwith`) is still caught.
 * A single-space pattern would have missed it, and the whole point of this
 * function is that it cannot be slipped past.
 */
export function containsBannedTerm(text: string): string | null {
  for (const term of BANNED_QUESTION_TERMS) {
    const pattern = new RegExp(
      `\\b${escapeRegExp(term).replace(/ +/g, '\\s+')}\\b`,
      'i',
    );
    if (pattern.test(text)) return term;
  }
  return null;
}

/* ============================ valuesConflict ============================ */

/**
 * Stems that assert a medication/instruction has been stopped, versus stems
 * that assert it is continuing. Deliberately narrow and literal — this is the
 * ONLY opposition this function knows how to detect. Anything outside this
 * vocabulary is treated as "not a detected conflict", never guessed at.
 *
 * These are STEMS matched as `\b<stem>\w*\b`, not substrings. Two things
 * depend on that:
 *
 *  - Suffix tolerance is free: `continu` covers continue / continues /
 *    continued / continuing. Plain-string matching on 'continue' silently
 *    missed "continued 40mg" — no signal at all, so no conflict detected.
 *  - The leading `\b` keeps opposites apart. Substring matching had 'continue'
 *    firing inside "discontinued" and 'active' firing inside "inactive", so two
 *    documents that AGREED a drug had stopped were flagged as disagreeing.
 *    `\b` refuses to match mid-word.
 */
const STOPPED_STEMS: readonly string[] = [
  'stop',
  'discontinu',
  'ceas',
  'withheld',
  'withhold',
  'held',
  'hold',
  'omit',
  'suspend',
  'paus',
  'deprescrib',
  'withdraw',
  'cancel',
  'inactive',
];

const CONTINUING_STEMS: readonly string[] = [
  'continu',
  'active',
  'ongoing',
  'tak', // take / taken / takes / taking
  'repeat',
  'resum',
  'restart',
  'reinstat',
  'unchanged',
  'maintain',
];

/**
 * Negators. A continuing stem sitting immediately behind one of these is a
 * STOPPED assertion, not a continuing one: "not currently taking", "no longer
 * taking", "do not restart", "never resumed".
 *
 * Without this, "not currently taking" matched the continuing vocabulary via
 * "taking" and a genuine disagreement with "continue 40mg daily" was silently
 * dropped. That is the expensive failure mode — a family holds two documents
 * that contradict each other and nothing is ever surfaced — so negation is
 * handled rather than left to chance.
 */
const NEGATOR = '(?:not|no longer|never|no)';

/** Up to two filler words are allowed between the negator and the stem, so
 *  "not currently taking" and "no longer being taken" both read as negated. */
function negatedStemSource(stem: string): string {
  return `\\b${NEGATOR}\\b(?:\\s+\\w+){0,2}?\\s*\\b${escapeRegExp(stem)}\\w*\\b`;
}

function stemPresent(value: string, stem: string): boolean {
  return new RegExp(`\\b${escapeRegExp(stem)}\\w*\\b`, 'i').test(value);
}

function normaliseValue(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * What a single claim value asserts, as far as the narrow vocabulary above can
 * tell.
 *
 *  - `stopped`    — carries a stopped signal and no un-negated continuing one
 *  - `continuing` — the reverse
 *  - `ambiguous`  — carries both ("stopped, restart if weight rises")
 *  - `unknown`    — carries neither; we have no signal at all
 */
export type ValueState = 'stopped' | 'continuing' | 'ambiguous' | 'unknown';

export function valueState(raw: string): ValueState {
  const value = normaliseValue(raw);

  let stopped = STOPPED_STEMS.some((stem) => stemPresent(value, stem));
  let continuing = false;

  for (const stem of CONTINUING_STEMS) {
    if (!stemPresent(value, stem)) continue;

    if (new RegExp(negatedStemSource(stem), 'i').test(value)) {
      // "no longer taking" asserts a stop.
      stopped = true;
      // ...but "no longer taking the morning dose, continues at night" also
      // asserts a continuation. Strip the negated occurrences and see whether
      // an un-negated one survives.
      const stripped = value.replace(new RegExp(negatedStemSource(stem), 'gi'), ' ');
      if (stemPresent(stripped, stem)) continuing = true;
    } else {
      continuing = true;
    }
  }

  if (stopped && continuing) return 'ambiguous';
  if (stopped) return 'stopped';
  if (continuing) return 'continuing';
  return 'unknown';
}

/**
 * True when two claim values are incompatible assertions about the same
 * thing.
 *
 * The two failure modes are asymmetric: a FALSE conflict costs a clinician a
 * few minutes reading a question that turns out to have an obvious answer. A
 * MISSED conflict silently drops evidence a family actually holds — three
 * documents genuinely disagreeing, with nothing ever surfaced. Given that
 * asymmetry we err toward flagging when a claim's wording is ambiguous, rather
 * than toward silence. What keeps this from being reckless is that the
 * vocabulary itself stays narrow and literal (STOPPED_STEMS / CONTINUING_STEMS
 * above): we do not interpret free text semantically, only match a short,
 * deliberate stem list.
 *
 * The rule, stated exactly — because the previous comment described behaviour
 * the code did not have:
 *
 *  - clear `stopped` vs clear `continuing` -> conflict
 *  - `ambiguous` vs clear `continuing`     -> conflict. The ambiguous value
 *    carries a stopped signal the other one does not, which is worth asking
 *    about. This is the erring-toward-flagging case.
 *  - `ambiguous` vs clear `stopped`        -> NO conflict. They agree it
 *    stopped; the ambiguous one adds nothing contradicting that. Flagging this
 *    is what made "discontinued" vs "stopped prior to discharge" — two
 *    documents AGREEING — look like a disagreement.
 *  - anything vs `unknown`                 -> NO conflict. Silence here is the
 *    safe default because we have no signal at all, not because we assume
 *    agreement.
 */
export function valuesConflict(a: string, b: string): boolean {
  if (normaliseValue(a) === normaliseValue(b)) return false;

  const stateA = valueState(a);
  const stateB = valueState(b);

  const assertsStop = (state: ValueState): boolean =>
    state === 'stopped' || state === 'ambiguous';

  if (assertsStop(stateA) && stateB === 'continuing') return true;
  if (assertsStop(stateB) && stateA === 'continuing') return true;

  return false;
}

/* ============================ generateQuestion ============================ */

/** Known lay synonyms for clinical subjects. Deliberately tiny: inventing a
 *  lay term we are not confident about is worse than falling back to the
 *  clinical name alone. Add to this list only with real confidence, never as
 *  a guess. */
const LAY_SYNONYMS: Readonly<Record<string, string>> = {
  furosemide: 'water tablet',
};

const COUNT_WORDS: readonly string[] = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function countInWords(n: number): string {
  const word = COUNT_WORDS[n];
  return word ?? String(n);
}

function capitalize(s: string): string {
  const first = s.charAt(0);
  if (first === '') return s;
  return first.toUpperCase() + s.slice(1);
}

/**
 * The only untrusted text in the generated question is the subject, which is
 * model-authored from a document. If it carries a banned term the question
 * inherits it: a subject of "furosemide — stop immediately" would render as
 * "Three sources disagree about the furosemide — stop immediately.", which
 * smuggles an urgency judgement into the one sentence a GP reads. It would also
 * pass every test that only checks the closing sentence.
 *
 * So the subject is admitted only if it is short and clean; otherwise the
 * question falls back to a fixed, subject-free referent. Losing the drug name
 * makes the question weaker. Letting a document dictate urgency language makes
 * it non-compliant, and only one of those is recoverable.
 */
const SAFE_SUBJECT_FALLBACK = 'one entry in these records';

/** A subject longer than this is a sentence, not a subject — refuse it rather
 *  than paste a paragraph of document text into the question. */
const MAX_SUBJECT_LENGTH = 60;

function subjectPhraseFor(subject: string): string {
  const trimmed = subject.replace(/\s+/g, ' ').trim();
  if (trimmed === '' || trimmed.length > MAX_SUBJECT_LENGTH) {
    return SAFE_SUBJECT_FALLBACK;
  }

  const lay = LAY_SYNONYMS[trimmed.toLowerCase()];
  const phrase = lay !== undefined ? `the ${lay} (${trimmed})` : `the ${trimmed}`;

  return containsBannedTerm(phrase) === null ? phrase : SAFE_SUBJECT_FALLBACK;
}

/**
 * Phrase the disagreement as something a clinician can answer.
 *
 * This function must NEVER tell anyone what to do, never assert what is
 * true, and never imply urgency or a clinical judgement. It states what the
 * documents say (how many sources, disagreeing about what) and asks an
 * open, answerable question. It never says what the answer should be.
 */
export function generateQuestion(subject: string, claims: readonly Claim[]): string {
  const sourceCount = new Set(claims.map((c) => c.source_id)).size;
  const subjectPhrase = subjectPhraseFor(subject);

  // Two claims can come from ONE source — a single discharge summary listing a
  // drug twice with contradictory values. "One sources disagree" is both
  // ungrammatical and a false statement about the evidence, so say what is
  // actually true instead.
  const opening =
    sourceCount < 2
      ? `One source gives conflicting entries about ${subjectPhrase}.`
      : `${capitalize(countInWords(sourceCount))} sources disagree about ${subjectPhrase}.`;

  return `${opening} ${closingFor(claims)}`;
}

/**
 * The question a clinician is actually being asked.
 *
 * A single generic closing sentence would be a wasted opportunity: we already
 * know *what kind* of disagreement was detected, because `valuesConflict` only
 * fires on a vocabulary it recognises. Naming the dispute is what makes the
 * question answerable — "ask whether it should have been restarted" tells a GP
 * exactly what decision is outstanding, where "ask which is correct" makes them
 * re-read all three documents to work out what the question even is.
 *
 * It still only ever ASKS. It never says what the answer is, never implies one
 * reading is better evidenced, and never attaches a timeframe.
 */
function closingFor(claims: readonly Claim[]): string {
  const states = claims.map((claim) => valueState(claim.value));
  const anyStopped = states.some(
    (state) => state === 'stopped' || state === 'ambiguous',
  );
  const anyContinuing = states.some(
    (state) => state === 'continuing' || state === 'ambiguous',
  );

  // One source records it as stopped while another records it as ongoing. The
  // outstanding decision is whether it was meant to resume — which is exactly
  // what a prescriber can answer and nobody else should.
  if (anyStopped && anyContinuing) {
    return 'Ask whether it should have been restarted.';
  }

  // Some other opposition inside the detected vocabulary. Stay open rather than
  // guessing at a shape we have not actually established.
  return 'Ask which of these records is current.';
}

/* ============================ detectConflicts ============================ */

export interface DetectConflictsOptions {
  /**
   * Claim ids known to be superseded, supplied by the supersession pass
   * (stretch S6). Superseded claims are not live and take no part in a
   * conflict. Defaults to empty: with no supersession information every
   * verified claim is treated as live.
   */
  readonly supersededClaimIds?: readonly string[];
}

/** True when at least one pair of claims in `claims` has incompatible
 *  values. Written with explicit undefined checks (rather than trusting
 *  index access) to stay clean under --noUncheckedIndexedAccess. */
function anyPairConflicts(claims: readonly Claim[]): boolean {
  for (let i = 0; i < claims.length; i++) {
    const a = claims[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < claims.length; j++) {
      const b = claims[j];
      if (b === undefined) continue;
      if (valuesConflict(a.value, b.value)) return true;
    }
  }
  return false;
}

/**
 * Detect conflicts across claim groups.
 *
 * Only LIVE, VERIFIED claims take part: unverified claims (verified_substring
 * !== true) and superseded claims (id in options.supersededClaimIds) are
 * dropped before anything else runs. A conflict needs two or more remaining
 * claims with incompatible values — the database enforces
 * array_length(claim_ids, 1) >= 2 via claim_needs_two, so this never emits a
 * one-claim conflict.
 *
 * Conflicts are NEVER auto-resolved here. There is no confidence ranking, no
 * "most recent wins", no ordering by significance — resolution is always
 * 'unresolved'. Deciding which account is right is a clinical judgement, and
 * this pipeline has nowhere to put one; only a human resolves a conflict.
 */
export function detectConflicts(
  groups: readonly ConflictGroupView[],
  personId: string,
  options?: DetectConflictsOptions,
): Conflict[] {
  const superseded = new Set(options?.supersededClaimIds ?? []);
  const conflicts: Conflict[] = [];

  for (const group of groups) {
    const live = group.claims.filter(
      (claim) => claim.verified_substring === true && !superseded.has(claim.id),
    );

    if (live.length < 2) continue;
    if (!anyPairConflicts(live)) continue;

    const sorted = [...live].sort(compareClaimsByDate);

    const conflict: Conflict = {
      id: randomUUID(),
      person_id: personId,
      ontology_key: group.ontology_key,
      subject: group.subject,
      claim_ids: sorted.map((c) => c.id),
      generated_question: generateQuestion(group.subject, sorted),
      resolution: 'unresolved',
    };
    conflicts.push(conflict);
  }

  return conflicts;
}
