/**
 * Audio byte-sniffing for the voice upload route
 * (`app/api/voice/upload/route.ts`), ported from the closed PR #19 after the
 * orchestrator's ruling: main's route (PR #15) kept its mode seam, DB insert
 * and response shape, and gains ONLY the classification hardening from here.
 * Size caps deliberately do NOT live in this module — `MAX_AUDIO_BYTES` is
 * owned by `lib/voice/audio.ts`.
 *
 * Bytes are sniffed, never trusted from a filename or a client Content-Type
 * header. The route's MIME allowlist checks what the client CLAIMS; this
 * module checks what the bytes ARE. Both run — the claim picks the storage
 * extension, the bytes decide admission.
 *
 * Two container families share a prefix with something that is NOT audio,
 * and both discriminators here are load-bearing rather than decorative:
 *   - `RIFF` at offset 0 is WAV *or* WebP (an image). Offset 8 decides.
 *   - `ftyp` at offset 4 is the ISO base media file format, shared by
 *     MP4/M4A *and* by HEIC/HEIF/AVIF **images** and other non-audio
 *     families. The brand at offset 8 decides, against an allowlist.
 * Because both discriminators live at offsets 8–11, nothing shorter than 12
 * bytes can be classified at all — see `MIN_SNIFF_BYTES`.
 */

export type AudioMediaType =
  | 'audio/webm'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/mpeg'
  | 'audio/wav';

/**
 * Nothing shorter than 12 bytes is classifiable, and nothing shorter is a
 * recording either. Both of the ambiguous-prefix discriminators this module
 * relies on (RIFF's `WAVE`/`WEBP` tag and the ISO-BMFF brand) sit at offsets
 * 8–11, so a buffer that stops before byte 12 cannot be told apart from an
 * image that shares its prefix. Declining to guess is the only safe answer:
 * a 4-byte file whose first four bytes happen to be an EBML header is not a
 * WebM recording and must not be stored as one.
 */
export const MIN_SNIFF_BYTES = 12;

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

// WebM (EBML header) — what Chrome/Firefox `MediaRecorder` emits by default.
const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

// Ogg container ("OggS") — the Firefox `MediaRecorder` alternative
// (audio/ogg;codecs=opus).
const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53];

// MP4/M4A ("ftyp" box) at byte offset 4 — what Safari's `MediaRecorder`
// emits (audio/mp4).
const MP4_FTYP_MAGIC = [0x66, 0x74, 0x79, 0x70];
const MP4_FTYP_OFFSET = 4;

/**
 * ISO-BMFF brands (bytes 8–11, immediately after the `ftyp` tag) that mean
 * "MP4-family media container". The allowlist exists because `ftyp` alone is
 * NOT an audio signal: HEIC/HEIF (`heic`, `heix`, `mif1`, `msf1`) and AVIF
 * (`avif`, `avis`) images, JPEG 2000 (`jp2 `) and QuickTime (`qt  `) all
 * carry the identical box at the identical offset. An allowlist rather than
 * a denylist on purpose — a brand nobody has enumerated must fail closed,
 * and a brand that genuinely needs admitting is a one-line change here plus
 * a test, not a silent hole. Pure-video brands (`avc1`, `mp4v`) are
 * deliberately absent: `MediaRecorder` does not emit them for an audio-only
 * capture.
 *
 * The honest strength of this check: it proves the bytes are an MP4-family
 * container rather than a HEIF image. The `ftyp` box cannot prove a track is
 * audio — that would need the `moov` atom, which a prefix sniff never sees.
 */
const MP4_AUDIO_BRANDS: readonly string[] = [
  'M4A ',
  'M4B ',
  'mp41',
  'mp42',
  'mp4a',
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'dash',
];

/** Largest plausible `ftyp` box: 8 bytes of header plus a long
 *  compatible-brand list. Real ones run 16–32 bytes; 1024 is generous
 *  headroom while still rejecting an arbitrary file whose bytes 4–7 happen
 *  to spell "ftyp" and whose leading four bytes are not a credible box
 *  length. */
const MAX_FTYP_BOX_BYTES = 1024;

/**
 * True only for an ISO-BMFF header whose declared box length is credible and
 * whose brand is on the audio-capable allowlist.
 */
function isMp4AudioContainer(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, MP4_FTYP_MAGIC, MP4_FTYP_OFFSET)) return false;

  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return false;
  const boxLength = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  if (boxLength < MIN_SNIFF_BYTES || boxLength > MAX_FTYP_BOX_BYTES) return false;

  let brand = '';
  for (let i = 8; i < 12; i += 1) {
    const byte = bytes[i];
    if (byte === undefined) return false;
    brand += String.fromCharCode(byte);
  }
  return MP4_AUDIO_BRANDS.includes(brand);
}

// MP3 with an ID3v2 tag ("ID3") prefixed.
const MP3_ID3_MAGIC = [0x49, 0x44, 0x33];

// WAV: "RIFF" at offset 0 AND "WAVE" at offset 8. The offset-8 discriminator
// is load-bearing — RIFF alone is also WebP's container (an IMAGE), so a WAV
// must never be classifiable as anything but audio, and a WebP must never be
// classifiable as audio either.
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WAVE_MAGIC = [0x57, 0x41, 0x56, 0x45]; // "WAVE", at offset 8

/**
 * True for a *valid* MPEG audio frame header, not merely a sync word. A raw
 * MP3 stream with no ID3 tag starts directly with a frame header rather than
 * "ID3", and the sync word alone (`FF` plus three set bits) is only 11 bits
 * — far too weak a signal to store an arbitrary file on. So the reserved
 * encodings in the same three bytes are rejected too:
 *   byte 1: AAAA AAAA   sync, all set
 *   byte 2: AAAB BCCD   A=sync(3) B=version C=layer D=protection
 *   byte 3: EEEE FFGH   E=bitrate index F=sample-rate index
 * `version == 01` is reserved, `layer == 00` is reserved, bitrate index
 * `1111` is "bad" and sample-rate index `11` is reserved — all four are
 * impossible in a real stream, so bytes carrying them are not an MP3. This
 * is what keeps `FF E0 00 …` style near-misses out of storage.
 */
function isMp3FrameHeader(bytes: Uint8Array): boolean {
  const first = bytes[0];
  const second = bytes[1];
  const third = bytes[2];
  if (first === undefined || second === undefined || third === undefined) return false;
  if (first !== 0xff) return false;
  if ((second & 0xe0) !== 0xe0) return false;
  if (((second >> 3) & 0x03) === 0x01) return false; // reserved MPEG version
  if (((second >> 1) & 0x03) === 0x00) return false; // reserved layer
  if (((third >> 4) & 0x0f) === 0x0f) return false; // "bad" bitrate index
  if (((third >> 2) & 0x03) === 0x03) return false; // reserved sample rate
  return true;
}

/**
 * Sniff from magic bytes ONLY — never a filename, never a client-supplied
 * `Content-Type`. Returns null when the bytes are not a recognised audio
 * container, which is also the answer for anything under `MIN_SNIFF_BYTES`.
 */
export function detectAudioMediaType(bytes: Uint8Array): AudioMediaType | null {
  // Fail closed below the discriminator offsets rather than committing to a
  // media type on a prefix an image could share.
  if (bytes.length < MIN_SNIFF_BYTES) return null;

  if (startsWith(bytes, WEBM_MAGIC)) return 'audio/webm';
  if (startsWith(bytes, OGG_MAGIC)) return 'audio/ogg';
  // `ftyp` at offset 4 is necessary but nowhere near sufficient — the brand
  // at offset 8 is what separates an M4A recording from a HEIC photo.
  if (isMp4AudioContainer(bytes)) return 'audio/mp4';
  if (startsWith(bytes, MP3_ID3_MAGIC)) return 'audio/mpeg';
  if (isMp3FrameHeader(bytes)) return 'audio/mpeg';
  // WAV must be checked with its offset-8 discriminator: RIFF+WAVE is audio,
  // RIFF+WEBP is an image and falls through to null.
  if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WAVE_MAGIC, 8)) return 'audio/wav';
  return null;
}
