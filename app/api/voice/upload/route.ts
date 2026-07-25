/**
 * POST /api/voice/upload — accept a browser MediaRecorder audio blob and
 * store it. Capture only: this route never transcribes. It inserts a
 * `sources` row with kind 'audio', transcript '', transcript_confidence 0 —
 * the existing extraction pipeline transcribes downstream, on its own
 * schedule, from the stored blob.
 *
 * Same mode seam as /api/extract (`resolveMode` from `@/lib/modes`): in
 * `fixtures`/`replay` mode there is no network call and no Supabase client
 * constructed at all — the request is validated in full, then a synthetic
 * Source is returned with a notice explaining nothing was stored. Only
 * `live` mode uploads to Supabase Storage and inserts a real row.
 *
 * Validation order is fixed: field presence -> mime -> size -> mode branch.
 * That order is asserted by the route tests (mime/size checks must fire
 * before any Supabase call, even in live mode).
 */

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveMode } from '@/lib/modes';
import { Source } from '@/lib/contracts';
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  audioExtensionForMime,
  baseMimeType,
  exceedsAudioSizeLimit,
  isAllowedAudioMime,
  isUuid,
  resolveVoiceTitle,
} from '@/lib/voice/audio';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function errorResponse(status: number, error: string): Response {
  return json({ error }, status);
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, 'Request body could not be read as multipart/form-data.');
  }

  const audioField = form.get('audio');
  if (
    audioField === null ||
    typeof audioField === 'string' ||
    typeof audioField.arrayBuffer !== 'function'
  ) {
    return errorResponse(400, 'Missing "audio" field: attach a recording under the field name "audio".');
  }

  const personIdField = form.get('person_id');
  if (typeof personIdField !== 'string' || !isUuid(personIdField)) {
    return errorResponse(
      400,
      'Missing or invalid "person_id": provide the UUID of the person this recording belongs to.',
    );
  }
  const personId = personIdField;

  const title = resolveVoiceTitle(form.get('title'));

  const mime = audioField.type || 'application/octet-stream';
  if (!isAllowedAudioMime(mime)) {
    return errorResponse(
      415,
      `Unsupported audio type "${mime}". Supported types are: ${ALLOWED_AUDIO_MIME_TYPES.join(', ')}.`,
    );
  }
  const ext = audioExtensionForMime(mime);
  if (ext === null) {
    // Unreachable given isAllowedAudioMime above, but keeps the compiler
    // (and a future refactor) honest without a non-null assertion.
    return errorResponse(415, `Unsupported audio type "${mime}".`);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await audioField.arrayBuffer());
  } catch {
    return errorResponse(400, "Could not read the uploaded recording's contents.");
  }

  if (bytes.byteLength === 0) {
    return errorResponse(400, 'The recording is empty — nothing was captured. Record again before uploading.');
  }

  if (exceedsAudioSizeLimit(bytes.byteLength)) {
    return errorResponse(
      413,
      `Recording is over the ${MAX_AUDIO_BYTES / (1024 * 1024)}MB upload limit.`,
    );
  }

  // Never throws (see lib/modes/resolve-mode.ts): an invalid or missing
  // value falls back to 'fixtures', the safest default.
  const mode = resolveMode({ searchParam: new URL(request.url).searchParams.get('mode') });

  if (mode !== 'live') {
    const source = Source.parse({
      id: randomUUID(),
      person_id: personId,
      kind: 'audio',
      title,
      storage_path: 'demo/voice-note.webm',
      transcript: '',
      transcript_confidence: 0,
      author_member_id: null,
      created_at: new Date().toISOString(),
    });
    return json({
      mode,
      source,
      notice: `${mode} mode: the recording was not stored because the app is running from fixtures.`,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('POST /api/voice/upload: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return errorResponse(500, 'Voice storage is not configured. Nothing was saved.');
  }

  // Service-role client, same pattern as app/demo/_lib/dal.ts's
  // getServiceClient: anonymous sign-in is for browser reads, not for a
  // server route writing a blob and a row on the caller's behalf.
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const storagePath = `voice/${randomUUID()}.${ext}`;

  try {
    // Bucket `allowed_mime_types` (migration 0003) lists base mimes and
    // matches them exactly, so send the base type — a blob whose reported
    // type carries a codec parameter ("audio/webm;codecs=opus") would
    // otherwise be rejected by the bucket despite passing route validation.
    const { error: uploadError } = await client.storage
      .from('audio')
      .upload(storagePath, bytes, { contentType: baseMimeType(mime), upsert: false });
    if (uploadError) {
      console.error('POST /api/voice/upload: storage upload failed', uploadError);
      return errorResponse(500, 'Could not store the recording. Nothing was saved.');
    }

    const { data, error: insertError } = await client
      .from('sources')
      .insert({
        person_id: personId,
        kind: 'audio',
        title,
        storage_path: storagePath,
        transcript: '',
        transcript_confidence: 0,
        author_member_id: null,
      })
      .select()
      .single();

    if (insertError || data === null || data === undefined) {
      console.error('POST /api/voice/upload: insert into sources failed', insertError);
      // The blob is already in the bucket but has no row pointing at it.
      // Best-effort cleanup so a failed insert doesn't leave an orphan; if
      // the remove itself fails we still report the insert failure honestly.
      try {
        await client.storage.from('audio').remove([storagePath]);
      } catch (cleanupErr) {
        console.error('POST /api/voice/upload: orphan blob cleanup failed', cleanupErr);
      }
      return errorResponse(500, 'Recording was stored but the record could not be saved.');
    }

    let source: Source;
    try {
      source = Source.parse(data);
    } catch (err) {
      console.error('POST /api/voice/upload: inserted row failed contract validation', err);
      return errorResponse(500, 'Recording was stored but the saved record was invalid.');
    }

    return json({ mode, source });
  } catch (err) {
    console.error('POST /api/voice/upload failed', err);
    return errorResponse(500, 'Storing the recording failed. Nothing was saved.');
  }
}
