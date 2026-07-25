/**
 * Pure, unit-testable helpers for POST /api/voice/upload — the mime
 * allow-list, the extension map, the size ceiling, and the two small
 * request-field validators (UUID shape, default title). No I/O, no
 * Supabase, no Next.js types: kept separate from the route so each rule has
 * exactly one owner and one test file, mirroring lib/ai/documents.ts's split
 * for the sibling upload route.
 *
 * Transcription is NOT this route's job — the existing extraction pipeline
 * transcribes downstream. This module only ever produces an empty
 * transcript / zero confidence pair for the inserted Source row.
 */

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Browser MediaRecorder mime type -> file extension used in the storage
 *  path (`voice/<uuid>.<ext>`). Keys are base mime types (no codec params —
 *  see `baseMimeType`). */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

export const ALLOWED_AUDIO_MIME_TYPES: readonly string[] = Object.keys(EXTENSION_BY_MIME);

/**
 * Strips codec parameters ("audio/webm;codecs=opus" -> "audio/webm") and
 * normalises case/whitespace so the allow-list and extension map only ever
 * have to match on the base type. MediaRecorder always reports codecs this
 * way; the allow-list must not reject a supported container just because a
 * codec parameter is attached.
 */
export function baseMimeType(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

export function isAllowedAudioMime(mime: string): boolean {
  return baseMimeType(mime) in EXTENSION_BY_MIME;
}

/** File extension (no leading dot) for a supported audio mime type, or
 *  null when the mime is not one this route accepts. */
export function audioExtensionForMime(mime: string): string | null {
  const base = baseMimeType(mime);
  return base in EXTENSION_BY_MIME ? EXTENSION_BY_MIME[base] ?? null : null;
}

export function exceedsAudioSizeLimit(byteLength: number): boolean {
  return byteLength > MAX_AUDIO_BYTES;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Default title when the caller doesn't supply one: "Voice note — <ISO
 *  date>". Takes `now` as a parameter (default `new Date()`) so tests can
 *  pin it without stubbing global time. */
export function defaultVoiceTitle(now: Date = new Date()): string {
  return `Voice note — ${now.toISOString()}`;
}

/** Upper bound on a caller-supplied title. The title is a display string
 *  only — it never goes into the storage path (that is uuid-derived), so
 *  there is no injection surface, just a length cap to keep an over-long or
 *  hostile value out of the `sources` row. */
export const MAX_TITLE_CHARS = 200;

/**
 * Resolve the title for a voice-note Source from the raw form field. Falls
 * back to `defaultVoiceTitle` when the caller sends nothing (or a non-string
 * multipart value), and caps a supplied title at `MAX_TITLE_CHARS`. `raw` is
 * typed `unknown` so the route can pass `FormData.get()`'s result straight in
 * without a cast.
 */
export function resolveVoiceTitle(raw: unknown, now: Date = new Date()): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed !== '') return trimmed.slice(0, MAX_TITLE_CHARS);
  }
  return defaultVoiceTitle(now);
}
