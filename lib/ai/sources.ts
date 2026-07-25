/**
 * Source role classification for the supersession pass (stretch S6).
 *
 * `SourceKind` is a FORMAT (pdf | image | audio | text | juno_conversation),
 * not a document type. A photographed discharge summary is `kind: 'image'`
 * and a native-PDF discharge summary is `kind: 'pdf'` — both are the same
 * clinical instruction. So format cannot decide role for documents; only the
 * title can. The one kind that IS a reliable signal on its own is
 * `juno_conversation` (and, by the same reasoning, `audio`): a patient or
 * family member talking is never a clinical instruction, no matter what they
 * are talking about — see rule 2 below.
 *
 * THE DEFAULT IS ALWAYS `observation`. This is the most important line in
 * this file. Misclassifying a source as an `instruction` silently opens a
 * validity period that never existed and rewrites the timeline — a fact gets
 * marked superseded when it never was, with no error, nothing to notice.
 * Misclassifying a source as an `observation` only means a real change is
 * recorded as disagreeing evidence instead of a new period — which surfaces
 * as a visible conflict, not a silent rewrite. The two failure modes are not
 * symmetric, so when no rule matches, we err toward the recoverable one.
 */

import type { Source } from '@/lib/contracts';

export type ClaimRole = 'instruction' | 'observation';

/** Why a source was classified the way it was — surfaced for auditability. */
export interface RoleDecision {
  readonly role: ClaimRole;
  readonly reason: string;
}

type SourceLike = Pick<Source, 'kind' | 'title'>;

/**
 * Title substrings that mark a document as a clinical instruction — a
 * clinician changing the state of care. Matched case-insensitively as plain
 * substrings of the (lowercased) title.
 *
 * Deliberately explicit and short. A wrong entry here silently manufactures
 * a validity period (see the module-level note on the default), so nothing
 * is added on a guess.
 */
const INSTRUCTION_TITLE_SUBSTRINGS: readonly string[] = [
  'discharge summary',
  'discharge letter',
  'clinic letter',
  'outpatient letter',
  'consultant letter',
  // 'medication review outcome' was here too and was dead: every title that
  // matches it also matches 'medication review'. A redundant entry in a list
  // whose wrong entries silently manufacture validity periods is worse than
  // no entry, because it invites the next reader to add more of them.
  'medication review',
  'care plan',
];

/**
 * Title substrings that mark a document as an observation — a report of
 * what is actually happening, not a decision that changed it.
 */
const OBSERVATION_TITLE_SUBSTRINGS: readonly string[] = [
  'repeat prescription',
  'prescription list',
  'medication list',
  'care log',
  'daily log',
  'diary',
  'observation chart',
  'test result',
  'blood result',
];

/**
 * Words that place a 'letter' in a clinical context. A title containing
 * 'letter' AND one of these reads as correspondence from a clinical service —
 * "Diabetes team letter", "Renal department letter", "GP letter".
 *
 * Matched with word boundaries, NOT as substrings. That is load-bearing:
 * 'dr' as a substring fires inside "hydration" and 'gp' inside plenty of
 * filenames, and a false positive here is the silent failure this whole
 * module is arranged to avoid.
 *
 * A bare 'letter' rule used to live here and classified ANY title containing
 * the word as an instruction. That made "letter from my daughter",
 * "covering letter", "letter of complaint" and "solicitor's letter" into
 * clinical instructions — each one inventing a validity period that never
 * existed and superseding a fact that was never superseded, with no error and
 * nothing to notice. It also earned almost nothing: the titles it was
 * justified by ("renal clinic letter") already matched 'clinic letter'
 * above. So the word alone no longer decides anything; it needs company.
 */
const CLINICAL_CONTEXT_WORDS: readonly string[] = [
  'clinic',
  'clinical',
  'consultant',
  'registrar',
  'physician',
  'hospital',
  'ward',
  'department',
  'dept',
  'team',
  'gp',
  'dr',
  'doctor',
  'nhs',
  'trust',
  'outpatient',
  'inpatient',
];

function titleContains(title: string, substring: string): boolean {
  return title.toLowerCase().includes(substring);
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First clinical-context word present in `title` as a whole word, or null. */
function clinicalContextWord(title: string): string | null {
  for (const word of CLINICAL_CONTEXT_WORDS) {
    if (new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(title)) return word;
  }
  return null;
}

export function classifySource(source: SourceLike): RoleDecision {
  // Rule 1 (and 2): the one reliable kind-based rule. A patient's own
  // account of their care, or a recorded voice note from a family member, is
  // never a clinical instruction — regardless of what it says or what title
  // it was given.
  if (source.kind === 'juno_conversation') {
    return {
      role: 'observation',
      reason: 'juno_conversation is always a patient account',
    };
  }
  if (source.kind === 'audio') {
    return {
      role: 'observation',
      reason: 'audio is always a recorded account, not a clinical instruction',
    };
  }

  const title = source.title.toLowerCase();

  for (const substring of INSTRUCTION_TITLE_SUBSTRINGS) {
    if (titleContains(title, substring)) {
      return { role: 'instruction', reason: `title matched '${substring}'` };
    }
  }

  for (const substring of OBSERVATION_TITLE_SUBSTRINGS) {
    if (titleContains(title, substring)) {
      return { role: 'observation', reason: `title matched '${substring}'` };
    }
  }

  // Narrowed fallback for instruction-shaped titles the explicit list above
  // did not name — "Diabetes team letter", "Renal department letter". The
  // word 'letter' on its own is NOT enough (see CLINICAL_CONTEXT_WORDS): it
  // must be accompanied by a department or clinician signal, or this falls
  // through to the observation default like anything else we cannot read.
  if (title.includes('letter')) {
    const context = clinicalContextWord(title);
    if (context !== null) {
      return {
        role: 'instruction',
        reason: `title contains 'letter' alongside clinical context '${context}'`,
      };
    }
    return {
      role: 'observation',
      reason:
        "title contains 'letter' but no clinical context; defaulted to observation",
    };
  }

  // THE DEFAULT. No rule matched, so we do not know what this document is.
  // Defaulting to 'observation' means the worst case is a real change
  // showing up as a visible disagreement rather than a silent, undetectable
  // rewrite of the timeline. See the module-level note above.
  return { role: 'observation', reason: 'no rule matched; defaulted to observation' };
}

export function roleForSource(source: SourceLike): ClaimRole {
  return classifySource(source).role;
}
