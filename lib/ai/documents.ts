/**
 * Turns an uploaded source into the Anthropic content blocks that extraction
 * sends: native PDF and image blocks, plus a plain-text path for transcripts
 * that arrive as text already (e.g. a Juno conversation export).
 *
 * The hard rule: we do NOT crop, deskew, or otherwise transform page
 * geometry. A citation resolves to a page number and a character offset into
 * the model's own transcript of that page; re-rendering the page — cropping
 * margins, straightening a skewed scan, anything that moves content relative
 * to where the page originally put it — destroys the coordinates the
 * citation depends on. The document goes to the model exactly as it arrived.
 *
 * EXIF auto-rotation and downscaling to under `MAX_UPLOAD_BYTES` happen
 * client-side, before the bytes ever reach this module. This module only
 * classifies and wraps what it is given — it does not touch pixels.
 *
 * There is deliberately no OCR path here. Native PDF and image content
 * blocks go straight to the model; a separate OCR step would be a second,
 * divergent transcript with its own coordinate system, and reconciling two
 * transcripts against one set of citations is exactly the kind of hole the
 * substring kill switch (`lib/ai/verify.ts`) exists to avoid.
 */

import type Anthropic from '@anthropic-ai/sdk';

/** 4MB — deliberately under Vercel's 4.5MB request-body ceiling, so our own
 *  413 (with its human-readable message) always fires before the platform's
 *  opaque edge rejection can. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type SourceInput =
  // base64, no newlines
  | { readonly kind: 'pdf'; readonly data: string }
  // base64, no newlines
  | { readonly kind: 'image'; readonly data: string; readonly mediaType: ImageMediaType }
  | { readonly kind: 'text'; readonly text: string };

export class UnsupportedSourceError extends Error {}
export class SourceTooLargeError extends Error {}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38]; // "GIF8"
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/** Sniff an image media type from magic bytes. Returns null if not a known image. */
export function detectImageMediaType(bytes: Uint8Array): ImageMediaType | null {
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png';
  if (startsWith(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(bytes, GIF_MAGIC)) return 'image/gif';
  if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WEBP_MAGIC, 8)) return 'image/webp';
  return null;
}

/** True when the bytes start with the %PDF- signature. */
export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, PDF_MAGIC);
}

/**
 * Base64 with no newlines — the API rejects a wrapped payload.
 *
 * `Buffer` rather than a `String.fromCharCode` loop plus `btoa`: the loop
 * builds a 5MB intermediate string one character at a time, and reads each
 * byte through an index expression that is `number | undefined` the moment
 * `noUncheckedIndexedAccess` is enabled — at which point a silent `NaN` turns
 * into a corrupt document rather than a compile error. This module only ever
 * runs server-side (route handlers), where `Buffer` is always present.
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Classify raw uploaded bytes into a SourceInput, or throw UnsupportedSourceError. */
export function classifyUpload(bytes: Uint8Array): SourceInput {
  if (isPdf(bytes)) {
    return { kind: 'pdf', data: toBase64(bytes) };
  }

  const mediaType = detectImageMediaType(bytes);
  if (mediaType !== null) {
    return { kind: 'image', data: toBase64(bytes), mediaType };
  }

  throw new UnsupportedSourceError(
    'Could not classify upload: not a PDF and not a recognised image ' +
      '(PNG, JPEG, GIF, WebP). Plain text sources are not sniffed from bytes ' +
      '— construct { kind: "text" } directly from the transcript.',
  );
}

/** Throw SourceTooLargeError if the byte length exceeds MAX_UPLOAD_BYTES. */
export function assertWithinUploadLimit(byteLength: number, label: string): void {
  if (byteLength > MAX_UPLOAD_BYTES) {
    throw new SourceTooLargeError(
      `${label} is ${byteLength} bytes, over the ${MAX_UPLOAD_BYTES}-byte limit. ` +
        'Downscaling happens client-side, before upload — this module does not resize.',
    );
  }
}

/** Build the content blocks for one source: the media block first, then the instruction text. */
export function contentBlocksFor(
  input: SourceInput,
  instruction: string,
): Anthropic.ContentBlockParam[] {
  const instructionBlock: Anthropic.ContentBlockParam = {
    type: 'text',
    text: instruction,
  };

  switch (input.kind) {
    case 'pdf':
      return [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: input.data },
        },
        instructionBlock,
      ];
    case 'image':
      return [
        {
          type: 'image',
          source: { type: 'base64', media_type: input.mediaType, data: input.data },
        },
        instructionBlock,
      ];
    case 'text':
      return [
        { type: 'text', text: input.text },
        instructionBlock,
      ];
  }
}
