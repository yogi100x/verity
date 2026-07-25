/**
 * SAFETY COPY — shipped verbatim from prd.md §8.5 and §8.6.
 *
 * Pure string constants and slot-filling helpers only. No dependencies, no
 * I/O. Other lanes import these rather than retyping safety copy, so a
 * single edit here is the only place these strings can drift.
 *
 * Do not paraphrase, re-word, or "improve" any of the §8.5 strings below —
 * they are shipped verbatim by contract.
 *
 * NEVER ROUTE THESE CONSTANTS THROUGH lib/safety/output_filter.ts.
 * `filterOutput` runs over GENERATED strings; this module is static,
 * human-authored copy shipped verbatim. The banner and halt card contain
 * "urgent", "emergency" and "999" BY DESIGN — they are the meta-disclaimer
 * that tells people this tool does not judge urgency and where to go when
 * something is urgent. The filter would (correctly, for a generated string)
 * reject them; that is not a conflict, it is the boundary: filter = model
 * output, copy = shipped verbatim, quotes = source data. Other lanes import
 * these constants and render them directly.
 */

/** prd.md §8.5 — persistent banner, verbatim. Every screen, unconditional. */
export const PERSISTENT_BANNER =
  'This tool organises evidence you already have. It does not assess ' +
  'symptoms, diagnose, or tell you how urgent something is. If you need to ' +
  "know how urgent something is, use NHS 111 online. If someone's life is " +
  'at risk, call 999.';

/**
 * prd.md §8.5 — artefact footer, verbatim, with [Name] and [date] as the
 * only slots. `footer` performs slot-filling only — no other text is
 * generated or altered.
 */
export function footer(name: string, date: string): string {
  return (
    `Assembled by ${name} using Verity on ${date} from documents they ` +
    'supplied and reviewed. This is not a clinical record, not a clinical ' +
    'summary, and has not been reviewed by a clinician. Every dated item ' +
    'links to the page it came from.'
  );
}

/**
 * RED-FLAG HALT CARD — ADAPTED, not verbatim from prd §8.5 (prd §8.5 does
 * not spell this card out). Structure and wording are carried over from the
 * halt card in research/01-carepath-market-and-build.md §6, with the
 * product name "CarePath" replaced by "Verity" and no other change to the
 * four structural beats: we have not assessed you / we've simply stopped /
 * call 999 now / NHS 111 online can assess this, it is a registered medical
 * device, we are not. Orchestrator should review this exact wording.
 *
 * research/01 §6 also places an explicit slot between the body and the
 * primary action: *[verbatim NHS 999 guidance text + source link,
 * OGL-attributed]*. That slot is `nhsGuidanceQuote` +
 * `nhsGuidanceSourceUrl` + `nhsGuidanceAttribution` below. It is filled
 * with text RETRIEVED VERBATIM from the live NHS.uk page on 25 July 2026
 * (page last reviewed 3 February 2023). The rule is unchanged: this slot
 * may only ever hold text pasted verbatim from NHS.uk with its source URL
 * and OGL attribution. Any paraphrase, re-wording or model-generated
 * string here is a fabricated citation — the single most damaging failure
 * this module can ship. To refresh it, re-retrieve from the URL; never
 * edit the string in place.
 */
export interface RedFlagHaltCard {
  readonly heading: string;
  readonly body: string;
  /** Verbatim from NHS.uk. Never generated, never paraphrased. */
  readonly nhsGuidanceQuote: string;
  /** The NHS.uk page `nhsGuidanceQuote` was retrieved from. */
  readonly nhsGuidanceSourceUrl: string;
  /** OGL attribution for the quote. Filled together with it. */
  readonly nhsGuidanceAttribution: string;
  readonly primaryAction: string;
  readonly fallback: string;
}

export const RED_FLAG_HALT_CARD: RedFlagHaltCard = {
  heading: 'Verity has stopped.',
  body:
    "Some of the words you used appear on the NHS's own list of symptoms " +
    "that need immediate attention. We have not assessed you — we've " +
    "simply stopped, because this isn't something to prepare an " +
    'appointment for.',
  nhsGuidanceQuote:
    '999 is for life-threatening emergencies like serious road traffic ' +
    'accidents, strokes and heart attacks.',
  nhsGuidanceSourceUrl:
    'https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/',
  nhsGuidanceAttribution:
    'NHS website, "When to call 999", page last reviewed 3 February 2023. ' +
    'Contains public sector information licensed under the Open Government ' +
    'Licence v3.0.',
  primaryAction: 'Call 999 now.',
  fallback:
    'Not sure? NHS 111 online can assess this. It is a registered medical ' +
    'device. We are not.',
};

/**
 * prd.md §8.6 — safeguarding is passive only. This footer signposts adult
 * social care and 999. It never claims to detect, identify, or assess
 * abuse or neglect, and it never auto-escalates anything.
 */
export const SAFEGUARDING_FOOTER =
  'This tool cannot identify or assess abuse or neglect. If you are ' +
  'worried about the safety or wellbeing of the person this record is ' +
  'for, contact adult social care in their local authority, or call 999 ' +
  'if there is immediate danger.';

/** Artefacts must never bear these titles. */
export const BANNED_ARTEFACT_TITLES = [
  'clinical summary',
  'handover note',
  'referral',
  'SBAR',
] as const;
