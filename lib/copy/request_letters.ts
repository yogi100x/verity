/**
 * REQUEST LETTERS — lib/copy/request_letters.ts
 *
 * Deterministic, template-only drafting of a request letter from a Gap.
 * No model call. Slot-filling only, so fabrication is structurally
 * impossible: every word in the output is either fixed template text
 * written in this file, `gap.statement` (already record-safe — built by
 * lib/detectors/gaps.ts from fixed framing text plus dates it computed
 * itself and a Fact's normalised subject, never free document text), a
 * Fact's `subject`, or `person.display_name`.
 *
 * The letter STATES what the record shows and ASKS a question. It never
 * asserts a need, never implies urgency, never advises. The sanctioned
 * shape for the absence itself is "I can't find a record of this" — not
 * "missing", "outstanding", "overdue" or "still awaited", each of which
 * asserts that something ought to be there. That property is
 * layered, not just written carefully: every generated letter must also
 * pass `lib/safety/output_filter.ts` before a caller sends or stores it.
 * If an interpolated `gap.statement` were ever built from poisoned record
 * text, the resulting letter would (correctly) fail the filter — this
 * module does not try to sanitise that itself, callers are expected to run
 * `filterOutput` and refuse to send on failure. See
 * lib/copy/__tests__/request_letters.test.ts "adversarial" case.
 *
 * Recipient routing is fixed per GapDetector (docs/lanes/lane-c-safety.md
 * §S3): a GP handles anything about a clinical instruction, medication
 * review or a passed review date; a referring provider handles referral
 * outcomes; the records holder handles a missing referenced document; the
 * CHC coordinator handles thin domain evidence.
 */

import type { Fact, Gap, GapDetector } from '../contracts';

export type LetterRecipient = 'gp' | 'provider' | 'records_holder' | 'chc_coordinator';

export interface RequestLetter {
  readonly recipient: LetterRecipient;
  readonly salutation: string;
  readonly body: string;
  readonly closing: string;
}

const SALUTATIONS: Readonly<Record<LetterRecipient, string>> = {
  gp: 'Dear Doctor,',
  provider: 'Dear Colleague,',
  records_holder: 'Dear Records Team,',
  chc_coordinator: 'Dear CHC Coordinator,',
};

const CLOSING = 'Yours faithfully,';

/**
 * Pure helper: assembles a `RequestLetter` envelope (salutation + closing)
 * for `recipient` around a fixed list of paragraphs, joined with blank
 * lines. Exported so other deterministic slot-filling features (the
 * CHC-clock feature builds on this next) can reuse the same envelope
 * without duplicating the recipient/salutation/closing tables here.
 *
 * Pure and total: same `recipient` and `paragraphs` always produce the same
 * `RequestLetter`. Does not itself run the output filter — callers must
 * still call `filterOutput` before sending or persisting, exactly as for
 * `draftRequestLetter`.
 *
 * CALLER CONTRACT (relied on by lib/detectors/chc_clock.ts, which builds its
 * own paragraphs and calls this for the envelope):
 *   - Signature is stable: `(recipient, paragraphs) => RequestLetter`, with
 *     `paragraphs` joined by a blank line in the order given. An empty list
 *     yields an empty body rather than throwing.
 *   - Run `filterOutput` over the CONCATENATED letter — salutation, body and
 *     closing joined as they will be rendered — not over the three fields
 *     separately. A banned phrase can straddle a join boundary, and only the
 *     concatenated string sees it.
 *   - On a filter rejection the caller stores nothing and renders the refusal
 *     card. Never "repair" the paragraphs to get past the filter.
 */
export function composeLetter(
  recipient: LetterRecipient,
  paragraphs: readonly string[],
): RequestLetter {
  return {
    recipient,
    salutation: SALUTATIONS[recipient],
    body: paragraphs.join('\n\n'),
    closing: CLOSING,
  };
}

/**
 * Routes a gap detector to the recipient who can answer it. Written as a
 * switch with no `default` branch and an explicit `LetterRecipient` return
 * type: `GapDetector` has six members, and TypeScript's control-flow
 * analysis (`strictNullChecks`, on under `strict: true`) reports "not all
 * code paths return a value" if a case is missing, because the implicit
 * fall-through would return `undefined`, which is not assignable to
 * `LetterRecipient`. Adding a seventh detector to the contract therefore
 * fails `pnpm typecheck` here until this switch is updated — the compiler
 * enforces the mapping, not a code reviewer.
 */
function recipientForDetector(detector: GapDetector): LetterRecipient {
  switch (detector) {
    case 'instruction_without_result':
      return 'gp';
    case 'medication_without_review':
      return 'gp';
    case 'review_date_passed':
      return 'gp';
    case 'referral_without_outcome':
      return 'provider';
    case 'referenced_document_absent':
      return 'records_holder';
    case 'domain_evidence_thin':
      return 'chc_coordinator';
  }
}

/**
 * The closing question for each detector. Same exhaustiveness guarantee as
 * `recipientForDetector` above — a missing case fails typecheck, not a
 * runtime assertion.
 *
 * Every question here asks the reader to confirm something; none of them
 * asserts that anything is needed, ought to happen, or is urgent. This is
 * fixed template text only, never derived from record content.
 */
function questionForDetector(detector: GapDetector): string {
  switch (detector) {
    case 'instruction_without_result':
      return 'Could you confirm whether this was carried out?';
    case 'medication_without_review':
      return 'Could you confirm whether a review date has been set for this medication?';
    case 'review_date_passed':
      return 'Could you confirm whether this review has taken place?';
    case 'referral_without_outcome':
      return 'Could you confirm the outcome of this referral?';
    case 'referenced_document_absent':
      return 'Could you confirm whether a copy of this document is held, and whether it can be sent to me?';
    case 'domain_evidence_thin':
      return 'Could you confirm what other evidence is held for this area?';
  }
}

/**
 * Finds the Fact (if any) that supports `gap` — the one whose
 * `supporting_claim_ids` overlaps `gap.supporting_claim_ids` — so the
 * opening line can name the subject the letter is about. Returns `null`
 * when no such fact is present (a gap can have empty
 * `supporting_claim_ids`, e.g. `referenced_document_absent`), in which case
 * the opening line omits the "regarding ..." clause rather than fabricate
 * a subject.
 */
function findSubject(gap: Gap, facts: readonly Fact[]): string | null {
  const match = facts.find((fact) =>
    fact.supporting_claim_ids.some((id) => gap.supporting_claim_ids.includes(id)),
  );
  return match === undefined ? null : match.subject;
}

/**
 * Drafts a deterministic request letter for `gap`. No model call: the body
 * is built entirely from fixed template text in this file, `gap.statement`
 * (already record-safe), `person.display_name`, and — when a supporting
 * Fact can be found — that Fact's `subject`. Same inputs always produce an
 * identical `RequestLetter`.
 *
 * Callers must run `filterOutput` over the returned salutation, body and
 * closing CONCATENATED as they will be rendered (a banned phrase can
 * straddle a join boundary) before sending or persisting the letter. On
 * rejection the caller stores nothing. This function does not
 * call the filter itself, by design: a `gap.statement` built (elsewhere,
 * incorrectly) from unfiltered record free text must still be caught, and
 * it is caught downstream, not silently passed here. See
 * lib/copy/__tests__/request_letters.test.ts for the adversarial case that
 * proves this layering.
 */
export function draftRequestLetter(
  gap: Gap,
  facts: readonly Fact[],
  person: { readonly display_name: string },
): RequestLetter {
  const recipient = recipientForDetector(gap.detector);
  const question = questionForDetector(gap.detector);
  const subject = findSubject(gap, facts);

  const opening =
    subject === null
      ? `${person.display_name}'s record includes the following.`
      : `${person.display_name}'s record includes the following, regarding ${subject}.`;

  const paragraphs = [
    opening,
    gap.statement,
    `I can't find a record of this in the papers I hold. ${question}`,
  ];

  return composeLetter(recipient, paragraphs);
}
