/**
 * DICTATION COPY — browser mic capture (prd.md §4c: "Browser mic capture —
 * Ships phase 1. ~1h, zero provisioning, works offline in replay mode.").
 *
 * Pure string constants only. No dependencies, no I/O. Capture only — no
 * playback, no dialogue, no transcription promise. A recording becomes a
 * Source row; whatever happens to it after that (transcription, extraction)
 * is later pipeline, not something this screen claims has already run.
 *
 * Design rules this file exists to satisfy (docs/design.md):
 *   - "A disabled button that doesn't say why it's disabled is a bug."
 *     → DICTATION_ERRORS.unsupported names the reason.
 *   - "Ship a spinner-only loading state — name what is happening" (banned).
 *     → DICTATION_STATES names every step instead of a bare spinner.
 *
 * No clinical judgement language. Banned words (verified against
 * scripts/verify.sh's UI content check): urgent, immediately, likely,
 * suggests, consistent with, probably, triage. None appear below.
 */

/** Fixed prompt shown beside the mic button, on the upload screen and free-text fields. */
export const DICTATION_PROMPT =
  'Say what happened, in your own words. We keep exactly what you say and ' +
  'add it as a source, alongside the documents you have already given us.';

/** Label on the mic button before recording starts. */
export const MIC_START_LABEL = 'Start recording';

/** Label on the mic button while recording is in progress. */
export const MIC_STOP_LABEL = 'Stop recording';

/**
 * Named processing states — never a bare spinner. Each string says what is
 * happening right now, in plain English.
 *
 * `saved` is deliberately silent on transcription: the recording is stored
 * as a source and will be read along with everything else, but nothing
 * here claims that reading has already happened.
 */
export const DICTATION_STATES: Readonly<
  Record<'requesting' | 'recording' | 'uploading' | 'saved', string>
> = {
  requesting: 'Asking for permission to use the microphone.',
  recording: 'Recording. Speak whenever you are ready.',
  uploading: 'Saving your recording.',
  saved: 'Recording saved as a source. It will be read along with everything else.',
};

/**
 * Named error states. Each one says what went wrong and, where there is
 * one, what to do next. `failed` never implies the recording was kept —
 * it wasn't.
 */
export const DICTATION_ERRORS: Readonly<
  Record<'unsupported' | 'denied' | 'failed', string>
> = {
  unsupported:
    'This browser cannot record audio, so the microphone button is turned off. Try a recent version of Chrome, Safari, or Edge.',
  denied:
    'Microphone permission was refused, so nothing was recorded. To try again, allow microphone access for this site in your browser settings.',
  failed: 'Saving the recording failed. Nothing was stored. Please try recording again.',
};
