import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Source } from '@/lib/contracts';
import { MAX_AUDIO_BYTES } from '@/lib/voice/audio';

// vi.mock factories are hoisted above every import in this file, including
// the static `import { POST }` below — so the mocked functions themselves
// must come from vi.hoisted(), which runs before that hoisting, or the
// factory closes over a `const` that hasn't been initialised yet.
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const { resolveMode } = vi.hoisted(() => ({ resolveMode: vi.fn() }));
vi.mock('@/lib/modes', () => ({ resolveMode }));

import { POST } from '@/app/api/voice/upload/route';

const PERSON_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Build a binary-safe multipart/form-data body, replicated locally rather
 * than imported across territories (see lib/ai/__tests__/routes.test.ts,
 * which documents why: jsdom's File/FormData hangs when a File is attached
 * to a FormData and sent through a real Request/request.formData() round
 * trip, so the body is built by hand instead).
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
  const boundary = 'verity-voice-test-boundary-0000';
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody(boundary, fields),
  });
}

function audioField(bytes: Uint8Array<ArrayBuffer>, contentType = 'audio/webm;codecs=opus') {
  return { name: 'audio', filename: 'note.webm', contentType, data: bytes };
}

const OK_ROW = {
  id: '22222222-2222-2222-2222-222222222222',
  person_id: PERSON_ID,
  kind: 'audio',
  title: 'Voice note — 2026-07-25T00:00:00.000Z',
  storage_path: 'voice/22222222-2222-2222-2222-222222222222.webm',
  transcript: '',
  transcript_confidence: 0,
  author_member_id: null,
  created_at: '2026-07-25T00:00:00.000Z',
};

/**
 * Wire `createClient` to a fully-mocked live Supabase client with tunable
 * upload / insert outcomes and a captured `remove` spy, returning every leaf
 * mock so a test can assert on it. Defaults are the happy path.
 */
function installLiveClient(opts?: {
  readonly uploadResult?: { data: unknown; error: unknown };
  readonly insertResult?: { data: unknown; error: unknown };
}) {
  const uploadResult = opts?.uploadResult ?? { data: { path: OK_ROW.storage_path }, error: null };
  const insertResult = opts?.insertResult ?? { data: OK_ROW, error: null };

  const upload = vi.fn().mockResolvedValue(uploadResult);
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove });
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const dbFrom = vi.fn().mockReturnValue({ insert });

  createClient.mockReturnValue({ storage: { from: storageFrom }, from: dbFrom });
  return { upload, remove, storageFrom, single, select, insert, dbFrom };
}

describe('POST /api/voice/upload', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createClient.mockReset();
    resolveMode.mockReset();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fixtures mode: 200 with a kind "audio" source + notice, and createClient is never called', async () => {
    resolveMode.mockReturnValue('fixtures');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([1, 2, 3, 4])),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('fixtures');
    expect(typeof body.notice).toBe('string');
    expect(body.source.kind).toBe('audio');
    expect(body.source.person_id).toBe(PERSON_ID);
    expect(body.source.transcript).toBe('');
    expect(body.source.transcript_confidence).toBe(0);
    expect(body.source.author_member_id).toBeNull();
    expect(typeof body.source.storage_path).toBe('string');
    expect(() => Source.parse(body.source)).not.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('replay mode: also 200, also never calls createClient', async () => {
    resolveMode.mockReturnValue('replay');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([1, 2, 3, 4])),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('replay');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: uploads to storage bucket "audio", inserts into "sources", and returns the row', async () => {
    resolveMode.mockReturnValue('live');

    const insertedRow = {
      id: '22222222-2222-2222-2222-222222222222',
      person_id: PERSON_ID,
      kind: 'audio',
      title: 'Voice note — 2026-07-25T00:00:00.000Z',
      storage_path: 'voice/22222222-2222-2222-2222-222222222222.webm',
      transcript: '',
      transcript_confidence: 0,
      author_member_id: null,
      created_at: '2026-07-25T00:00:00.000Z',
    };

    const upload = vi.fn().mockResolvedValue({ data: { path: insertedRow.storage_path }, error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload });
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const dbFrom = vi.fn().mockReturnValue({ insert });

    createClient.mockReturnValue({
      storage: { from: storageFrom },
      from: dbFrom,
    });

    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([9, 9, 9]), 'audio/webm'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('live');
    expect(body.source).toEqual(insertedRow);
    expect(() => Source.parse(body.source)).not.toThrow();

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-secret',
      expect.any(Object),
    );
    expect(storageFrom).toHaveBeenCalledWith('audio');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^voice\/.+\.webm$/),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'audio/webm' }),
    );
    expect(dbFrom).toHaveBeenCalledWith('sources');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: PERSON_ID,
        kind: 'audio',
        transcript: '',
        transcript_confidence: 0,
        author_member_id: null,
      }),
    );
  });

  it('400 when the audio field is missing', async () => {
    resolveMode.mockReturnValue('fixtures');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('400 when person_id is missing or not a UUID', async () => {
    resolveMode.mockReturnValue('fixtures');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([1, 2, 3])),
        { name: 'person_id', data: 'not-a-uuid' },
      ]),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('MAX_AUDIO_BYTES stays under Vercel’s 4.5MB request-body ceiling — a bigger limit means the platform 413s before our route runs', () => {
    expect(MAX_AUDIO_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('413 for a recording over the byte limit', async () => {
    resolveMode.mockReturnValue('fixtures');
    const oversized = new Uint8Array(MAX_AUDIO_BYTES + 1);
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(oversized),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('4MB');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('415 for an unsupported mime type', async () => {
    resolveMode.mockReturnValue('fixtures');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([1, 2, 3]), 'video/mp4'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('mime and size checks fire before any Supabase call, even in live mode', async () => {
    resolveMode.mockReturnValue('live');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([1, 2, 3]), 'video/mp4'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(415);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('oversize check fires before any Supabase call in live mode too', async () => {
    resolveMode.mockReturnValue('live');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array(MAX_AUDIO_BYTES + 1)),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(413);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('400 for an empty (zero-byte) recording — no source created', async () => {
    resolveMode.mockReturnValue('fixtures');
    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array(0)),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.source).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: passes the BASE mime (codec params stripped) to storage.upload', async () => {
    resolveMode.mockReturnValue('live');
    const { upload } = installLiveClient();

    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        // MediaRecorder reports the codec parameter; the bucket allow-list is
        // exact-match on base mimes, so the route must strip it before upload.
        audioField(new Uint8Array([9, 9, 9]), 'audio/webm;codecs=opus'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^voice\/.+\.webm$/),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'audio/webm' }),
    );
  });

  it('live mode: storage upload error -> 500, and no row is inserted', async () => {
    resolveMode.mockReturnValue('live');
    const { insert } = installLiveClient({
      uploadResult: { data: null, error: { message: 'bucket unavailable' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([9, 9, 9]), 'audio/webm'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(insert).not.toHaveBeenCalled();
  });

  it('live mode: insert failure -> 500 and the orphan blob is cleaned up', async () => {
    resolveMode.mockReturnValue('live');
    const { remove } = installLiveClient({
      insertResult: { data: null, error: { message: 'insert violated a constraint' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([9, 9, 9]), 'audio/webm'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(500);
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^voice\/.+\.webm$/)]);
  });

  it('live mode: a returned row that fails contract validation -> 500', async () => {
    resolveMode.mockReturnValue('live');
    // transcript_confidence out of the [0,1] range fails Source.parse.
    const { remove } = installLiveClient({
      insertResult: {
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          person_id: PERSON_ID,
          kind: 'audio',
          title: 'Voice note',
          storage_path: 'voice/22222222-2222-2222-2222-222222222222.webm',
          transcript: '',
          transcript_confidence: 2,
          author_member_id: null,
          created_at: '2026-07-25T00:00:00.000Z',
        },
        error: null,
      },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/voice/upload', [
        audioField(new Uint8Array([9, 9, 9]), 'audio/webm'),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(500);
    // The row was inserted, so the blob must be LEFT in place (removing it
    // would orphan the row) — cleanup runs only on insert failure.
    expect(remove).not.toHaveBeenCalled();
  });
});
