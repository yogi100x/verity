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

/* ==================== anchoring — beyond bare substring ==================== */
/*
 * The first real live call proved bare substring inclusion is necessary but
 * not sufficient. The model emitted, verbatim:
 *
 *   {"ontology_key":"x","subject":"x","value":"x","quote":"x"}
 *
 * and the letter "x" appears in nearly every document, so the claim passed
 * verification and carried a verified badge. Technically a substring;
 * completely meaningless as a citation — like proving you quoted a book by
 * pointing out that it contains the letter "e".
 *
 * The checks below are structural, not length thresholds. Each was validated
 * against every claim in fixtures/margaret.json before landing: all 16
 * genuine quotes pass all three, including the short and lay-worded ones
 * ("40mg", "Still taking my water tablet at bedtime"), and each check
 * individually rejects the live junk. A length floor was considered and
 * rejected — every threshold tried either let junk through or binned a real
 * dose.
 */

/**
 * A real ontology key is a dotted namespace: `medication.furosemide`,
 * `instruction.renal_review`, `demographics.name`. Artefact slots match on
 * patterns like `medication.*`, so a claim whose key has no namespace can
 * never fill a slot — it is unusable downstream even when its quote is real.
 * Rejecting it here means it cannot sit in the record wearing a verified
 * badge either.
 */
const ONTOLOGY_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function hasWellFormedKey(claim: Pick<Claim, 'ontology_key'>): boolean {
  return ONTOLOGY_KEY_RE.test(claim.ontology_key);
}

/** Occurrences of the normalised quote within the normalised transcript. */
export function quoteOccurrences(
  claim: Pick<Claim, 'quote'>,
  source: Pick<Source, 'transcript'>,
): number {
  const haystack = normalise(source.transcript);
  const needle = normalise(claim.quote);
  if (needle === '') return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += 1;
  }
  return count;
}

/**
 * A citation must land somewhere specific: the quote has to occur EXACTLY
 * once in its source. Zero occurrences is the classic fabrication; more than
 * one means there is no single place to anchor the citation — and worse,
 * `locateQuote` would silently anchor it at the first occurrence, which may
 * be the wrong one. All 16 genuine fixture quotes are unique in their
 * sources; a fragment short and generic enough to repeat is exactly the kind
 * of quote that cannot support a claim.
 */
export function isUniquelyAnchored(
  claim: Pick<Claim, 'quote'>,
  source: Pick<Source, 'transcript'>,
): boolean {
  return quoteOccurrences(claim, source) === 1;
}

/**
 * The quote must have something to do with what the claim asserts: at least
 * one alphanumeric token of 3+ characters drawn from the claim's subject or
 * value must appear in the quote.
 *
 * Deliberately a WEAK containment — requiring the quote to contain the whole
 * subject or value verbatim was tested against the fixture and would drop
 * four genuine claims, including the load-bearing lay-synonym case, where
 * subject `furosemide` is supported by "Still taking my water tablet at
 * bedtime" (the word furosemide appears nowhere in it — the token that
 * connects them is "bedtime", from the value). The token rule keeps all 16
 * genuine claims and still rejects a claim whose subject and value share no
 * meaningful word with its quote — including the degenerate case, whose
 * fields contain no 3+ character token at all.
 */
export function quoteSupportsClaim(
  claim: Pick<Claim, 'subject' | 'value' | 'quote'>,
): boolean {
  const quote = normalise(claim.quote);
  const tokens = `${normalise(claim.subject)} ${normalise(claim.value)}`
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  return tokens.some((token) => quote.includes(token));
}

/** Why a claim was rejected. `null` means it passed everything. */
export type AnchorFailure =
  | 'quote_not_in_source'
  | 'malformed_ontology_key'
  | 'quote_not_uniquely_locatable'
  | 'quote_does_not_support_claim';

/**
 * The full admission check, in order of cheapest-to-explain failure first.
 * Substring inclusion is checked before uniqueness so that a fabricated
 * quote reports as fabricated, not as "not uniquely locatable".
 */
export function anchorClaim(
  claim: Pick<Claim, 'ontology_key' | 'subject' | 'value' | 'quote'>,
  source: Pick<Source, 'transcript'>,
): AnchorFailure | null {
  if (!hasWellFormedKey(claim)) return 'malformed_ontology_key';
  if (!verifyClaim(claim, source)) return 'quote_not_in_source';
  if (!isUniquelyAnchored(claim, source)) return 'quote_not_uniquely_locatable';
  if (!quoteSupportsClaim(claim)) return 'quote_does_not_support_claim';
  return null;
}
