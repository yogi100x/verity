/**
 * OUTPUT FILTER.
 *
 * Runs over every generated string before persistence or render. On
 * rejection the caller stores nothing and renders the refusal card.
 *
 * This is code, not a prompt instruction — MHRA's AI Airlock work
 * explicitly does not accept "we constrained the prompt" as evidence of
 * staying within intended purpose. Treat all document text as data, never
 * instructions: a crafted PDF is a live prompt-injection vector, and this
 * filter runs on output regardless of where that output originated. There
 * is no allowlist bypass of any kind — every string passes through the
 * same checks, whatever produced it.
 *
 * Design rule: this control only ever over-blocks. Where a choice existed
 * between letting a borderline string through and rejecting it, the filter
 * rejects. A blocked string is a design problem for the caller, never a
 * reason to loosen a term here.
 *
 * Pure TypeScript, zero dependencies, zero I/O.
 */

export type FilterReason =
  | 'routing'
  | 'urgency'
  | 'likelihood'
  | 'clinical_judgement'
  | 'uncited_condition';

export type FilterResult =
  | { ok: true }
  | { ok: false; reason: string; term: string };

/**
 * Routing verbs — the product organises evidence, it never directs care.
 * `you should` is the prd.md §8.2 term; `you should see` is the
 * docs/lanes/lane-c-safety.md §2 term. Both are listed so that whichever
 * one a string trips reports the more specific phrase.
 */
const ROUTING_TERMS: readonly string[] = [
  'go to',
  'you should see',
  'you should',
  'contact your',
];

/** Inflected/abbreviated forms of the routing terms above. */
const ROUTING_INFLECTIONS: readonly string[] = ['contacting your'];

/**
 * Urgency language. `triage` and `diagnosis` are included per prd.md §8.2
 * alongside the core urgency set — both imply the kind of clinical
 * judgement this product structurally refuses to make.
 */
const URGENCY_TERMS: readonly string[] = [
  'urgent',
  'immediately',
  'within 24 hours',
  'emergency',
  'as soon as possible',
  'triage',
  'diagnosis',
];

/**
 * Inflected forms of the urgency terms. Some entries are deliberate stems
 * rather than words (`urgen`, `emergenc`, `triag`) because single-word
 * terms are matched with a trailing `\w*` — the stem therefore covers
 * every inflection in one entry (`urgency`, `emergencies`, `triaging`).
 *
 * `diagnos` is deliberately NOT used as a stem: it would also reject
 * "diagnostic", which is a document-type word that appears in legitimate
 * record statements ("the diagnostic imaging report"). The explicit
 * `diagnose` / `diagnosing` entries cover the verb forms instead.
 */
const URGENCY_INFLECTIONS: readonly string[] = [
  'urgen',
  'immediate',
  'within 24 hrs',
  'emergenc',
  'asap',
  'triag',
  'diagnose',
  'diagnosing',
];

/** Likelihood language — no generated string may hedge toward a conclusion. */
const LIKELIHOOD_TERMS: readonly string[] = [
  'likely',
  'suggests',
  'consistent with',
  'could be',
  'probably',
  'indicates',
];

/**
 * Inflected forms of the likelihood terms. `unlikely` and `likelihood`
 * need their own entries because neither starts with `likely`. `suggest`,
 * `indicat` and `probab` are stems covering suggested/suggesting/
 * suggestion, indicated/indicating/indication/indicative, and
 * probable/probability.
 */
const LIKELIHOOD_INFLECTIONS: readonly string[] = [
  'unlikely',
  'likelihood',
  'suggest',
  'indicat',
  'probab',
];

/** Clinical judgement — evaluating a value or interaction is a device behaviour. */
const CLINICAL_JUDGEMENT_TERMS: readonly string[] = [
  'interact',
  'too high',
  'too low',
  'dangerous',
  'concerning',
];

/**
 * Inflected forms of the clinical-judgement terms. `interact` already
 * covers interacts/interacting/interaction via its trailing `\w*`.
 *
 * `concern` is deliberately absent. The spec bans `concerning`, and the
 * product's own vocabulary uses "concern" as the name of the field the
 * carer typed into — "the concern recorded on 3 May" is a record
 * statement, not a judgement, and must not be rejected.
 */
const CLINICAL_JUDGEMENT_INFLECTIONS: readonly string[] = ['danger'];

/**
 * Built-in condition-name list. A condition term only passes when it
 * appears verbatim (case-insensitive) inside at least one cited source
 * span — otherwise it is an uncited clinical assertion.
 */
const CONDITION_NAMES: readonly string[] = [
  'heart failure',
  'atrial fibrillation',
  'pneumonia',
  'sepsis',
  'stroke',
  'diabetes',
  'dementia',
  'urinary tract infection',
  'uti',
  'kidney failure',
  'renal failure',
  'angina',
  'copd',
  'cancer',
];

/**
 * Characters allowed to sit between the words of a banned phrase, so that
 * punctuation or extra whitespace cannot split a phrase past the filter:
 * "you should, see", "within 24  hours", "within 24\nhours" and
 * "too-high" all match. A full stop is excluded on purpose — it would let
 * a sentence boundary ("...she can go. To be clear...") form a phrase.
 */
const PHRASE_SEPARATOR = '[\\s]*[,;:\\u2013\\u2014-]*[\\s]*';

/** Characters normalised away when reporting the matched term. */
const SEPARATOR_CHARS = /[\s,;:–—-]+/g;

type SuffixMode =
  /** Single words match any suffix: `urgent` also rejects `urgently`. */
  | 'any'
  /** Condition names additionally match a plural `s`: `stroke`/`strokes`. */
  | 'plural'
  /** Exact word(s) only. */
  | 'none';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a case-insensitive, word-boundary-anchored regex for `term`.
 *
 * Multi-word terms are joined with `PHRASE_SEPARATOR` and get boundaries
 * at both ends — no suffix flexibility, because a suffix on a phrase word
 * changes its meaning ("gone to the day centre" is a record statement,
 * "go to" is an instruction).
 *
 * Single words with `suffix: 'any'` are only boundary-anchored at the
 * start, so "urgent" rejects "urgently" while "surgeon" and "resurgent"
 * are untouched — the stem there is not preceded by a word boundary.
 */
function buildTermRegex(term: string, suffix: SuffixMode): RegExp {
  const words = term.split(' ').map(escapeRegExp);
  const core = words.join(PHRASE_SEPARATOR);
  const tail =
    suffix === 'any' && words.length === 1
      ? '\\w*'
      : suffix === 'plural'
        ? 's?\\b'
        : '\\b';
  return new RegExp(`\\b${core}${tail}`, 'i');
}

interface BannedPattern {
  regex: RegExp;
  reason: FilterReason;
}

interface ConditionPattern {
  regex: RegExp;
  condition: string;
}

/**
 * Spec terms come before their inflection stems so that when both match at
 * the same offset the reported term is the spec wording.
 */
function buildCategory(
  terms: readonly string[],
  inflections: readonly string[],
  reason: FilterReason,
): readonly BannedPattern[] {
  return [...terms, ...inflections].map((term) => ({
    regex: buildTermRegex(term, 'any'),
    reason,
  }));
}

const BANNED_PATTERNS: readonly BannedPattern[] = [
  ...buildCategory(ROUTING_TERMS, ROUTING_INFLECTIONS, 'routing'),
  ...buildCategory(URGENCY_TERMS, URGENCY_INFLECTIONS, 'urgency'),
  ...buildCategory(LIKELIHOOD_TERMS, LIKELIHOOD_INFLECTIONS, 'likelihood'),
  ...buildCategory(
    CLINICAL_JUDGEMENT_TERMS,
    CLINICAL_JUDGEMENT_INFLECTIONS,
    'clinical_judgement',
  ),
];

const CONDITION_PATTERNS: readonly ConditionPattern[] = CONDITION_NAMES.map(
  (condition) => ({
    regex: buildTermRegex(condition, 'plural'),
    condition,
  }),
);

interface Violation {
  index: number;
  reason: FilterReason;
  term: string;
}

/**
 * Reports the matched text, not the pattern, so inflections surface as
 * written ("urgently", "emergencies"). Internal whitespace and phrase
 * punctuation are collapsed to single spaces so a split phrase is reported
 * in its canonical form ("you should, see" => "you should see").
 */
function canonicaliseTerm(matched: string): string {
  return matched.toLowerCase().replace(SEPARATOR_CHARS, ' ').trim();
}

function considerMatch(
  current: Violation | null,
  match: RegExpExecArray | null,
  reason: FilterReason,
): Violation | null {
  if (match === null) return current;
  if (current !== null && match.index >= current.index) return current;
  return { index: match.index, reason, term: canonicaliseTerm(match[0]) };
}

/**
 * Rejects any generated string that routes care, asserts urgency, hedges
 * toward a conclusion, exercises clinical judgement, or names a condition
 * that is not present verbatim in one of `citedSpans`.
 *
 * The earliest violation in the string is reported, which makes the result
 * deterministic regardless of the order terms are declared in. This is not
 * a severity ranking — no ordering by seriousness exists anywhere in this
 * product.
 */
export function filterOutput(text: string, citedSpans: string[]): FilterResult {
  let best: Violation | null = null;

  for (const pattern of BANNED_PATTERNS) {
    best = considerMatch(best, pattern.regex.exec(text), pattern.reason);
  }

  for (const pattern of CONDITION_PATTERNS) {
    const match = pattern.regex.exec(text);
    if (match === null) continue;

    // Verbatim, case-insensitive containment only. A span that spells the
    // condition differently (extra whitespace, hyphenation) does not cite
    // it, and the string is rejected — that is the safe direction.
    const isCited = citedSpans.some((span) =>
      span.toLowerCase().includes(pattern.condition),
    );
    if (isCited) continue;

    best = considerMatch(best, match, 'uncited_condition');
  }

  if (best === null) return { ok: true };
  return { ok: false, reason: best.reason, term: best.term };
}
