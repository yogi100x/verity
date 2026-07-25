import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { CaseSnapshot, Source } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import {
  detectAudioMediaType,
  classifyAudioUpload,
  extensionFor,
  MAX_AUDIO_BYTES,
  MIN_SNIFF_BYTES,
  UnsupportedAudioError,
  type AudioMediaType,
} from '@/lib/ai/audio';

const fixture = CaseSnapshot.parse(fixtureRaw);

/** Recursively collect every object key in a parsed JSON value. */
function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      out.add(key);
      collectKeys(val, out);
    }
  }
  return out;
}

const BANNED_KEY = /severity|urgency|priority|rank|risk|score/i;

/**
 * Build a binary-safe multipart/form-data body — same pattern as
 * `lib/ai/__tests__/routes.test.ts`. jsdom's `File`/`FormData` hangs when a
 * `File` is attached to `FormData` and sent through a real
 * `request.formData()` round trip, and a hand-built body avoids ever
 * risking UTF-8 mangling of binary magic bytes.
 */
function multipartBody(
  boundary: string,
  fields: {
    readonly name: string;
    readonly filename?: string;
    readonly contentType?: string;
    readonly data: string | Uint8Array<ArrayBuffer>;
  }[],
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (const field of fields) {
    const disposition =
      field.filename === undefined
        ? `Content-Disposition: form-data; name="${field.name}"\r\n\r\n`
        : `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
          `Content-Type: ${field.contentType ?? 'application/octet-stream'}\r\n\r\n`;
    parts.push(enc.encode(`--${boundary}\r\n${disposition}`));
    parts.push(typeof field.data === 'string' ? enc.encode(field.data) : field.data);
    parts.push(enc.encode('\r\n'));
  }
  parts.push(enc.encode(`--${boundary}--\r\n`));

  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function multipartRequest(
  url: string,
  fields: {
    readonly name: string;
    readonly filename?: string;
    readonly contentType?: string;
    readonly data: string | Uint8Array<ArrayBuffer>;
  }[],
): Request {
  const boundary = 'verity-voice-test-boundary-00000';
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody(boundary, fields),
  });
}

// ---- fixture byte sequences for each supported container ----

/** Pad a magic-byte prefix out to a plausible recording length. Every fixture
 *  is at least `MIN_SNIFF_BYTES` long on purpose: the sniffer refuses to
 *  classify anything shorter, and a fixture that skated under that limit would
 *  be testing a path no real `MediaRecorder` clip takes. */
function padded(prefix: readonly number[], length = 32): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  out.set(prefix.slice(0, length), 0);
  return out;
}

const WEBM_BYTES = padded([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x10]);
const OGG_BYTES = padded([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
// "....ftyp" + brand "M4A " — ftyp box at offset 4 with a credible box length,
// which is what Safari's MediaRecorder emits.
const MP4_BYTES = padded([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
const MP3_ID3_BYTES = padded([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
const MP3_FRAMESYNC_BYTES = padded([0xff, 0xfb, 0x90, 0x00]);

// ---- non-audio look-alikes that share a prefix with a real container ----

// HEIC photo: identical `ftyp` box at identical offset 4, brand "heic". This is
// what an iPhone photo picker hands over, and it must never be stored as audio.
const HEIC_BYTES = padded([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
// AVIF image: same box, brand "avif".
const AVIF_BYTES = padded([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
// An arbitrary binary whose bytes 4–7 happen to spell "ftyp" and whose leading
// four bytes are not a credible box length — an allowlisted brand alone is not
// enough to admit it.
const FAKE_FTYP_BYTES = padded([0xff, 0xff, 0xff, 0xff, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
// `FF E0` passes an 11-bit sync-word check but encodes a RESERVED layer, so it
// is not a decodable MPEG frame and must not classify as audio.
const MP3_RESERVED_LAYER_BYTES = padded([0xff, 0xe0, 0x00, 0x00]);
// "RIFF"...."WAVE"
const WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);
// "RIFF"...."WEBP" — the discriminator case: same container prefix, but an
// IMAGE, never audio.
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('detectAudioMediaType — magic bytes', () => {
  it('classifies WebM (EBML header) as audio/webm', () => {
    expect(detectAudioMediaType(WEBM_BYTES)).toBe('audio/webm');
  });

  it('classifies Ogg ("OggS") as audio/ogg', () => {
    expect(detectAudioMediaType(OGG_BYTES)).toBe('audio/ogg');
  });

  it('classifies MP4/M4A ("ftyp" at offset 4) as audio/mp4', () => {
    expect(detectAudioMediaType(MP4_BYTES)).toBe('audio/mp4');
  });

  it('classifies an ID3-tagged MP3 as audio/mpeg', () => {
    expect(detectAudioMediaType(MP3_ID3_BYTES)).toBe('audio/mpeg');
  });

  it('classifies a bare MP3 frame-sync header (FF FB) as audio/mpeg', () => {
    expect(detectAudioMediaType(MP3_FRAMESYNC_BYTES)).toBe('audio/mpeg');
  });

  it('classifies WAV ("RIFF" + "WAVE" at offset 8) as audio/wav', () => {
    expect(detectAudioMediaType(WAV_BYTES)).toBe('audio/wav');
  });

  it('the RIFF/WEBP discriminator: a WebP image is NOT audio', () => {
    expect(detectAudioMediaType(WEBP_BYTES)).toBeNull();
  });

  it('returns null for unrecognised bytes', () => {
    expect(detectAudioMediaType(padded([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('the ftyp brand discriminator: a HEIC photo and an AVIF image are NOT audio', () => {
    expect(detectAudioMediaType(HEIC_BYTES)).toBeNull();
    expect(detectAudioMediaType(AVIF_BYTES)).toBeNull();
  });

  it('an allowlisted ftyp brand behind an implausible box length is NOT audio', () => {
    expect(detectAudioMediaType(FAKE_FTYP_BYTES)).toBeNull();
  });

  it('every allowlisted MP4 brand classifies, and an unlisted one does not', () => {
    const enc = new TextEncoder();
    const withBrand = (brand: string): Uint8Array => {
      const bytes = padded([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
      bytes.set(enc.encode(brand), 8);
      return bytes;
    };
    for (const brand of ['M4A ', 'M4B ', 'mp41', 'mp42', 'mp4a', 'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'dash']) {
      expect(detectAudioMediaType(withBrand(brand))).toBe('audio/mp4');
    }
    // Video-only and image brands are not on the allowlist — fail closed.
    for (const brand of ['avc1', 'mp4v', 'heix', 'mif1', 'msf1', 'avis', 'jp2 ', 'qt  ', 'zzzz']) {
      expect(detectAudioMediaType(withBrand(brand))).toBeNull();
    }
  });

  it('an 0xFF sync word with a reserved layer field is NOT an MP3', () => {
    expect(detectAudioMediaType(MP3_RESERVED_LAYER_BYTES)).toBeNull();
  });

  it('a "bad" bitrate index or reserved sample rate rejects an otherwise-valid frame', () => {
    expect(detectAudioMediaType(padded([0xff, 0xfb, 0xf0, 0x00]))).toBeNull(); // bitrate 1111
    expect(detectAudioMediaType(padded([0xff, 0xfb, 0x9c, 0x00]))).toBeNull(); // sample rate 11
  });

  it(`refuses to classify ANY buffer shorter than ${MIN_SNIFF_BYTES} bytes, including valid prefixes`, () => {
    for (let length = 0; length < MIN_SNIFF_BYTES; length += 1) {
      expect(detectAudioMediaType(new Uint8Array(length))).toBeNull();
      // A truncated but genuine EBML/OggS/ID3/frame-sync prefix is still not a
      // recording. This is the "4-byte WebM" case.
      for (const prefix of [
        [0x1a, 0x45, 0xdf, 0xa3],
        [0x4f, 0x67, 0x67, 0x53],
        [0x49, 0x44, 0x33, 0x03],
        [0xff, 0xfb, 0x90, 0x00],
        [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
      ]) {
        expect(detectAudioMediaType(padded(prefix, length))).toBeNull();
      }
    }
    // ...and exactly at the limit, a real prefix classifies again.
    expect(detectAudioMediaType(padded([0x1a, 0x45, 0xdf, 0xa3], MIN_SNIFF_BYTES))).toBe('audio/webm');
  });

  it('classifyAudioUpload throws UnsupportedAudioError for unrecognised bytes', () => {
    expect(() => classifyAudioUpload(new Uint8Array([0x00, 0x01, 0x02]))).toThrow(
      UnsupportedAudioError,
    );
  });

  it('MAX_AUDIO_BYTES stays under the 4.5MB serverless request-body ceiling', () => {
    // A limit above the platform's own cap cannot be enforced by this code: the
    // edge would reject the body first and the client would never see our 413.
    expect(MAX_AUDIO_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('extensionFor returns a sensible extension for each media type', () => {
    const table: Record<AudioMediaType, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
    };
    for (const [mediaType, ext] of Object.entries(table)) {
      expect(extensionFor(mediaType as AudioMediaType)).toBe(ext);
    }
  });
});

/** The contract POST /api/voice/upload owes Lane B. Parsed, not trusted. */
const UploadResponse = z.object({
  source: Source,
  stored: z.boolean(),
  media_type: z.string(),
  byte_length: z.number().int(),
  // Non-nullable on purpose: the route's documented contract says `notice` is
  // always a non-empty string on 200, so a null would be a contract break and
  // this parse is what catches it.
  notice: z.string().min(1),
});

describe('POST /api/voice/upload — validation paths', () => {
  it('returns 400 with a JSON error when the audio field is missing', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'title', data: 'no audio here' },
      ]),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 415 for an unrecognised container', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.bin', contentType: 'application/octet-stream', data: new Uint8Array([0x00, 0x01, 0x02, 0x03]) },
      ]),
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('WebM');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 413 for a payload over the audio limit', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const oversized = new Uint8Array(MAX_AUDIO_BYTES + 1);
    // WebM magic bytes so it would otherwise classify fine — the size check
    // must fire before classification.
    oversized[0] = 0x1a;
    oversized[1] = 0x45;
    oversized[2] = 0xdf;
    oversized[3] = 0xa3;
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'big.webm', contentType: 'audio/webm', data: oversized },
      ]),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain(String(MAX_AUDIO_BYTES / (1024 * 1024)));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('an oversized Content-Length is rejected before the body is buffered', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const req = multipartRequest('http://localhost/api/voice/upload', [
      { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
    ]);
    const lying = new Request(req, {
      headers: { ...Object.fromEntries(req.headers), 'Content-Length': String(MAX_AUDIO_BYTES + 1) },
    });
    const res = await POST(lying);
    expect(res.status).toBe(413);
    // The body was never consumed — that is the whole point of the pre-check.
    expect(lying.bodyUsed).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('an understated Content-Length does not get an oversized body past the real check', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const oversized = new Uint8Array(MAX_AUDIO_BYTES + 1);
    oversized.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    const req = multipartRequest('http://localhost/api/voice/upload', [
      { name: 'audio', filename: 'big.webm', contentType: 'audio/webm', data: oversized },
    ]);
    const lying = new Request(req, {
      headers: { ...Object.fromEntries(req.headers), 'Content-Length': '10' },
    });
    const res = await POST(lying);
    expect(res.status).toBe(413);
  });

  it('a .wav-named WebP image (filename and content-type lie) still 415s — bytes only', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'recording.wav', contentType: 'audio/wav', data: WEBP_BYTES },
      ]),
    );
    expect(res.status).toBe(415);
  });

  it('every non-audio look-alike is refused however the client labels it', async () => {
    const { POST } = await import('@/app/api/voice/upload/route');
    const liars: { readonly label: string; readonly data: Uint8Array<ArrayBuffer> }[] = [
      { label: 'HEIC photo', data: HEIC_BYTES },
      { label: 'AVIF image', data: AVIF_BYTES },
      { label: 'WebP image', data: WEBP_BYTES },
      { label: 'fake ftyp box length', data: FAKE_FTYP_BYTES },
      { label: 'reserved-layer sync word', data: MP3_RESERVED_LAYER_BYTES },
      { label: 'four-byte EBML prefix', data: padded([0x1a, 0x45, 0xdf, 0xa3], 4) },
      { label: 'empty file', data: new Uint8Array(0) },
    ];
    for (const liar of liars) {
      const res = await POST(
        multipartRequest('http://localhost/api/voice/upload', [
          { name: 'audio', filename: 'margaret.m4a', contentType: 'audio/mp4', data: liar.data },
        ]),
      );
      expect(res.status, liar.label).toBe(415);
    }
  });
});

describe('POST /api/voice/upload — no Supabase env (honest degrade)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });

  // Stubs must not leak into the next describe — which env this route sees is
  // the whole difference between `stored: true` and `stored: false`, so a test
  // that depends on file ordering to see the right one is not a test.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 200, stored: false, a non-null notice, and a contract-valid Source', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const body: unknown = await res.json();
    const parsed = UploadResponse.parse(body);

    expect(parsed.stored).toBe(false);
    expect(parsed.notice).not.toBeNull();
    expect(parsed.media_type).toBe('audio/webm');
    expect(parsed.byte_length).toBe(WEBM_BYTES.byteLength);

    expect(parsed.source.kind).toBe('audio');
    expect(parsed.source.transcript).toBe('');
    expect(parsed.source.transcript_confidence).toBe(0);
    expect(parsed.source.author_member_id).toBeNull();
    expect(parsed.source.person_id).toBe(fixture.person.id);
  });

  it('storage_path is voice/<source.id>.<sniffed ext> — the uuid IS the source id and the extension ignores the filename', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    // WAV bytes deliberately named ".webm" with a WebM content-type: the stored
    // extension must follow the sniff, not the lie. And the uuid in the path
    // must be the source id, or `app/api/sources/[id]/open` cannot find the
    // object from a source id later.
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WAV_BYTES },
      ]),
    );
    const parsed = UploadResponse.parse(await res.json());
    expect(parsed.media_type).toBe('audio/wav');
    expect(parsed.source.storage_path).toBe(`voice/${parsed.source.id}.wav`);
    expect(parsed.source.storage_path).toMatch(
      /^voice\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/,
    );
  });

  it('the not-stored notice is unmistakable and promises nothing about later storage or transcription', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );
    const parsed = UploadResponse.parse(await res.json());
    expect(parsed.stored).toBe(false);
    const notice = parsed.notice;
    expect(notice.toLowerCase()).toContain('not saved');
    // No future-tense storage promise, and no hint that a transcript exists.
    expect(notice).not.toMatch(/will be (saved|stored|persisted|uploaded|retried)/i);
    expect(notice).not.toMatch(/queued|pending|later|retry|transcribed the|transcription of/i);
    expect(notice).toMatch(/never transcribes/i);
  });

  it('a client-supplied title is bounded and stripped of control characters', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
        { name: 'title', data: `  Margaret [31m, Tuesday  ${'x'.repeat(500)}` },
      ]),
    );
    const parsed = UploadResponse.parse(await res.json());
    expect(parsed.source.title.length).toBeLessThanOrEqual(200);
    expect(parsed.source.title.startsWith('Margaret')).toBe(true);
    expect(parsed.source.title).not.toMatch(/[ -]/);
  });

  it('an implausibly long duration_ms is treated as absent, not rendered into a title', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
        { name: 'duration_ms', data: '999999999999' },
      ]),
    );
    const parsed = UploadResponse.parse(await res.json());
    expect(parsed.source.title).toBe('Voice note');
  });

  it('duration_ms malformed values (abc, -5, 0) are treated as absent; title falls back to the deterministic default', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    for (const bad of ['abc', '-5', '0', '3.5']) {
      const res = await POST(
        multipartRequest('http://localhost/api/voice/upload', [
          { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
          { name: 'duration_ms', data: bad },
        ]),
      );
      const body: unknown = await res.json();
      const parsed = UploadResponse.parse(body);
      expect(parsed.source.title).toBe('Voice note');
    }
  });

  it('a valid duration_ms produces a deterministic title, not a wall-clock one', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
        { name: 'duration_ms', data: '45000' },
      ]),
    );
    const body: unknown = await res.json();
    const parsed = UploadResponse.parse(body);
    expect(parsed.source.title).toBe('Voice note (45s)');
  });

  it('an explicit title is honoured over the default', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
        { name: 'title', data: 'Margaret, Tuesday morning' },
      ]),
    );
    const body: unknown = await res.json();
    const parsed = UploadResponse.parse(body);
    expect(parsed.source.title).toBe('Margaret, Tuesday morning');
  });

  it('response contains no banned judgement key', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );
    const body: unknown = await res.json();
    const keys = collectKeys(body);
    for (const key of keys) {
      expect(key).not.toMatch(BANNED_KEY);
    }
  });
});

describe('POST /api/voice/upload — Supabase env present (mocked client)', () => {
  const SENTINEL_URL = 'https://sentinel-project.supabase.co';
  const SENTINEL_KEY = 'sentinel-service-role-key-do-not-leak';

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SENTINEL_URL);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SENTINEL_KEY);
    vi.resetModules();
  });

  it('invokes upload on the "documents" bucket and returns stored: true on success', async () => {
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'voice/x.webm' }, error: null });
    const fromMock = vi.fn().mockReturnValue({ upload: uploadMock });
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn().mockReturnValue({ storage: { from: fromMock } }),
    }));

    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const parsed = UploadResponse.parse(body);
    expect(parsed.stored).toBe(true);

    expect(fromMock).toHaveBeenCalledWith('documents');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [storagePath] = uploadMock.mock.calls[0] as [string, Uint8Array, unknown];
    expect(storagePath).toBe(parsed.source.storage_path);

    vi.doUnmock('@supabase/supabase-js');
  });

  it('returns 502 with a fixed-string error when the upload itself fails', async () => {
    const uploadMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: `upstream failure at ${SENTINEL_URL} with key ${SENTINEL_KEY}` },
    });
    const fromMock = vi.fn().mockReturnValue({ upload: uploadMock });
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn().mockReturnValue({ storage: { from: fromMock } }),
    }));

    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );

    expect(res.status).toBe(502);
    const raw = await res.text();
    expect(raw).not.toContain(SENTINEL_URL);
    expect(raw).not.toContain(SENTINEL_KEY);
    const body: unknown = JSON.parse(raw);
    expect(body).toEqual({ error: 'Storage upload failed. The recording was not saved.' });

    vi.doUnmock('@supabase/supabase-js');
  });

  it('never leaks the sentinel env values in any response header', async () => {
    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null });
    const fromMock = vi.fn().mockReturnValue({ upload: uploadMock });
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn().mockReturnValue({ storage: { from: fromMock } }),
    }));

    const { POST } = await import('@/app/api/voice/upload/route');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );

    for (const [key, value] of res.headers.entries()) {
      expect(`${key}:${value}`).not.toContain(SENTINEL_KEY);
      expect(`${key}:${value}`).not.toContain(SENTINEL_URL);
    }

    vi.doUnmock('@supabase/supabase-js');
  });
});

describe('POST /api/voice/upload — Cache-Control on every response shape', () => {
  it('carries Cache-Control: no-store on success and on every error path', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { POST } = await import('@/app/api/voice/upload/route');

    const ok = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.webm', contentType: 'audio/webm', data: WEBM_BYTES },
      ]),
    );
    expect(ok.headers.get('cache-control')).toBe('no-store');

    const missing = await POST(
      multipartRequest('http://localhost/api/voice/upload', [{ name: 'title', data: 'x' }]),
    );
    expect(missing.headers.get('cache-control')).toBe('no-store');

    const unsupported = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'audio', filename: 'note.bin', data: new Uint8Array([0x00, 0x01]) },
      ]),
    );
    expect(unsupported.headers.get('cache-control')).toBe('no-store');
    vi.unstubAllEnvs();
  });
});
