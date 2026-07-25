/**
 * The substring kill switch.
 *
 * Every assertion the product shows a user traces back to a quote that is a
 * literal substring of its source. This file is what makes that true.
 *
 * `normalise` handles exactly four classes of difference between a quote as the
 * model copied it and the same text as it sits in the transcript: smart quotes,
 * soft hyphens, hyphenation across a line break, and whitespace runs. It
 * handles nothing else, on purpose. Every additional normalisation widens the
 * set of strings that pass, and each one is a hole in the guarantee.
 *
 * A failed check means the claim is DROPPED. Not flagged, not retried, not
 * shown with a caveat. A missing claim is a bug; a fabricated one is a
 * catastrophe, and only one of those is recoverable.
 */

import type { Claim, Source } from '@/lib/contracts';

/**
 * Fold away the differences that are artefacts of how text was encoded or
 * wrapped, and nothing more.
 *
 * Order matters: the hyphenation rule needs the newline still present, so it
 * must run before whitespace runs are collapsed.
 */
export function normalise(s: string): string {
  return (
    s
      // Curly single quotes and apostrophes -> ASCII apostrophe.
      .replace(/[‘’]/g, "'")
      // Curly double quotes -> ASCII double quote.
      .replace(/[“”]/g, '"')
      // Soft hyphen (U+00AD): a rendering hint, never part of the word.
      .replace(/­/g, '')
      // Hyphenation across a line break: "furose-\nmide" -> "furosemide".
      .replace(/-\s*\n\s*/g, '')
      // Any run of whitespace (including the newlines PDF text layers leave
      // mid-sentence) -> a single space.
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * True when the claim's quote appears verbatim in its source transcript.
 *
 * Deliberately takes the narrowest shape it needs, so a test can exercise it
 * with a two-field object instead of constructing a whole CaseSnapshot.
 */
export function verifyClaim(
  claim: Pick<Claim, 'quote'>,
  source: Pick<Source, 'transcript'>,
): boolean {
  return normalise(source.transcript).includes(normalise(claim.quote));
}
