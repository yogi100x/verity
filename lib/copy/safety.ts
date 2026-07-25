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
 * OGL-attributed]*. That slot is represented below by `nhsGuidanceQuote`
 * and `nhsGuidanceSourceUrl`, and both are deliberately EMPTY. An empty
 * slot is the correct state: the quote may only ever be filled by pasting
 * text retrieved verbatim from NHS.uk together with its source URL and OGL
 * attribution. Writing plausible-sounding NHS guidance here — or any
 * paraphrase, or a model-generated string — is a fabricated citation and
 * the single most damaging failure this module can ship. Renderers must
 * omit the block entirely while the slot is empty.
 */
export interface RedFlagHaltCard {
  readonly heading: string;
  readonly body: string;
  /** Empty until real OGL-attributed NHS.uk text is pasted in. Never generated. */
  readonly nhsGuidanceQuote: string;
  /** Empty until the NHS.uk source URL for `nhsGuidanceQuote` is pasted in. */
  readonly nhsGuidanceSourceUrl: string;
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
  nhsGuidanceQuote: '',
  nhsGuidanceSourceUrl: '',
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
