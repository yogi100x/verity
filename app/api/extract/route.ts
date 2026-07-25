/**
 * POST /api/extract — accept one uploaded document, return its extraction
 * report as JSON.
 *
 * Routes never call `@anthropic-ai/sdk` directly — every model call goes
 * through `callModel` (`@/lib/modes`), the mode seam Lane D owns.
 * In `fixtures`/`replay` mode this makes no network call at all — it returns
 * the fixtures report for illustration, with an explicit `mode` field so the
 * caller knows nothing was sent over the wire. Only `live` mode extracts the
 * uploaded document for real, via `extractSourceLive`.
 *
 * Every report leaves through `toWireReport`, which is what keeps a dropped
 * claim's fabricated quote out of the response body entirely. Both modes return
 * the same shape (`reports[]` + `drops`) so a caller never branches on mode to
 * read the result.
 *
 * LIVE PERSISTENCE. After a successful live extraction this route also
 * writes the original bytes, a `sources` row, the kept claims, any
 * `claim_conflicts` `reconcile` detects among them, and the facts `reconcile`
 * derives — same service-role pattern as `app/api/voice/upload/route.ts`
 * (createClient with `persistSession: false`, storage upload, then table
 * inserts, best-effort cleanup on failure, never a fake success). Insert
 * order is claims -> claim_conflicts -> facts, since a fact's `conflict_id`
 * points at a conflict row.
 *
 * Response shape stays byte-for-byte identical in fixtures/replay mode — the
 * branch below is untouched. Live mode gains exactly two ADDITIVE top-level
 * fields:
 *   - `persisted`: `{ source_id, claims, facts, conflicts }` on a successful
 *     write, or `null` when nothing was stored.
 *   - `persist_notice`: present ONLY when `persisted` is `null`, explaining
 *     why in the same honest-degrade style as the rest of this route. Never
 *     present on success, never present outside live mode.
 * A caller that only ever ran fixtures/replay sees no new keys at all.
 *
 * `person_id` is a new, additive multipart field. It is ignored entirely in
 * fixtures/replay mode (byte-for-byte unchanged behaviour). In live mode it
 * is required — validated before the model is ever called, mirroring the
 * voice upload route's validation-first order, so a request that cannot be
 * persisted never burns an Anthropic call. Once syntactically valid, it is
 * also authorization-checked via `checkCareAccess` (`@/components/data/careAccess`)
 * BEFORE extraction runs, so an unauthorized caller never burns a model call
 * either — an IDOR otherwise let any caller write into any person's record by
 * supplying that person's id. Every access-denial response is a fixed string;
 * none ever echoes person_id or a user id back to the caller.
 */

import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { resolveMode } from '@/lib/modes';
import { extractFromFixtures, extractSourceLive, toWireReport, type ExtractionReport } from '@/lib/ai/extract';
import {
  assertWithinUploadLimit,
  classifyUpload,
  MAX_UPLOAD_BYTES,
  SourceTooLargeError,
  UnsupportedSourceError,
  type SourceInput,
} from '@/lib/ai/documents';
import { reconcile } from '@/lib/ai/reconcile';
import { DOCUMENTS_BUCKET } from '@/lib/ai/storage';
import { Source, type Claim, type Conflict, type Fact, type SourceKind } from '@/lib/contracts';
import { checkCareAccess } from '@/components/data/careAccess';

export const dynamic = 'force-dynamic';

/* ============================ persistence ============================ */

/** Row shapes this route writes. Kept local (not imported from
 *  `app/demo/_lib/dal.ts`, which Lane D owns) so this file's one Lane-A
 *  territory exception stays self-contained. */
type SourceRow = Source;
type ClaimRow = Claim & { readonly person_id: string };
type FactRow = Fact;
type ConflictRow = Conflict;

const PersonId = z.string().uuid();

/** Upper bound on the persisted source title, mirroring
 *  `app/api/voice/upload/route.ts`'s `MAX_TITLE_CHARS`. The title is a display
 *  string bound as an insert parameter, never interpolated, so there is no
 *  injection surface — this is a length cap so an over-long caller value (or
 *  file name) cannot bloat the row. */
const MAX_TITLE_CHARS = 200;

/** `sources/<id>.<ext>` extension and the content type to upload with, per
 *  `SourceInput` kind. `text` is unreachable via `classifyUpload` today (it
 *  only ever classifies PDF/image bytes) but is handled anyway for
 *  exhaustiveness — and, per the design note, deliberately NOT special-cased
 *  around the bucket's mime allowlist (migration 0004): the bucket rejects
 *  it, and that rejection is handled by the same generic storage-failure
 *  path as any other upload error. */
function extensionAndContentType(input: SourceInput): { readonly ext: string; readonly contentType: string } {
  switch (input.kind) {
    case 'pdf':
      return { ext: 'pdf', contentType: 'application/pdf' };
    case 'image': {
      const ext = input.mediaType === 'image/jpeg' ? 'jpg' : input.mediaType.slice('image/'.length);
      return { ext, contentType: input.mediaType };
    }
    case 'text':
      return { ext: 'txt', contentType: 'text/plain' };
  }
}

type PersistOutcome =
  | { readonly stored: true; readonly claims: number; readonly facts: number; readonly conflicts: number }
  | { readonly stored: false; readonly notice: string };

/** Best-effort delete of a `sources` row (cascades to its `claims`), used
 *  when a later persistence step fails and the source row must not be left
 *  half-linked. Never throws — a cleanup failure is logged, not surfaced,
 *  because the caller already has a real failure to report. */
async function deleteSourceBestEffort(client: SupabaseClient, sourceId: string): Promise<void> {
  try {
    const { error } = await client.from('sources').delete().eq('id', sourceId);
    if (error) console.error('POST /api/extract: source cleanup delete failed', error);
  } catch (err) {
    console.error('POST /api/extract: source cleanup delete threw', err);
  }
}

/** Best-effort removal of the storage blob a later persistence step orphaned.
 *  Never throws, same rationale as `deleteSourceBestEffort`. */
async function removeBlobBestEffort(client: SupabaseClient, storagePath: string): Promise<void> {
  try {
    const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    if (error) console.error('POST /api/extract: orphan blob cleanup failed', error);
  } catch (err) {
    console.error('POST /api/extract: orphan blob cleanup threw', err);
  }
}

/** Best-effort delete of the `claim_conflicts` rows just written, used when a
 *  later step (the `facts` insert, which references these ids) fails.
 *  `claim_conflicts` references `people`, not `sources` — deleting the
 *  source row does NOT cascade to these, so they need their own cleanup.
 *  Never throws, same rationale as `deleteSourceBestEffort`. */
async function deleteConflictsBestEffort(client: SupabaseClient, conflictIds: readonly string[]): Promise<void> {
  try {
    const { error } = await client.from('claim_conflicts').delete().in('id', conflictIds);
    if (error) console.error('POST /api/extract: claim_conflicts cleanup delete failed', error);
  } catch (err) {
    console.error('POST /api/extract: claim_conflicts cleanup delete threw', err);
  }
}

/**
 * Persist a successful live extraction: storage upload -> sources insert ->
 * claims insert -> facts insert, in that order. Any failure best-effort
 * cleans up what was already written (the blob, if the sources insert
 * itself failed; the source row — which cascades to its claims — if a later
 * step failed) and returns `{ stored: false, notice }` rather than throwing.
 * The caller always gets its 200 extraction report either way; this
 * function only decides what `persisted` says.
 */
async function persistLiveExtraction(params: {
  readonly sourceId: string;
  readonly personId: string;
  readonly title: string;
  readonly kind: SourceKind;
  readonly input: SourceInput;
  readonly bytes: Uint8Array;
  readonly report: ExtractionReport;
}): Promise<PersistOutcome> {
  const { sourceId, personId, title, kind, input, bytes, report } = params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('POST /api/extract: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return { stored: false, notice: 'Extraction succeeded but was not stored: storage is not configured.' };
  }

  // Service-role client, same pattern as app/api/voice/upload/route.ts and
  // app/demo/_lib/dal.ts's getServiceClient: a server route writing on the
  // caller's behalf, not a browser doing an anonymous-sign-in read.
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { ext, contentType } = extensionAndContentType(input);
  const storagePath = `sources/${sourceId}.${ext}`;

  const { error: uploadError } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error('POST /api/extract: storage upload failed', uploadError);
    return { stored: false, notice: 'Extraction succeeded but the document was not stored: the file could not be uploaded.' };
  }

  // Insertable columns of `sources` (created_at and the row's own future id
  // read-back are left to the DB / the .select().single() below).
  const sourceInsert: Omit<SourceRow, 'created_at'> = {
    id: sourceId,
    person_id: personId,
    kind,
    title,
    storage_path: storagePath,
    transcript: report.transcript,
    // No per-document confidence signal exists in ExtractionReport (unlike
    // the voice route's literal 0 for "never transcribed") — every kept
    // claim's quote is individually verified, so 1 is the honest default
    // rather than a guessed number.
    transcript_confidence: 1,
    author_member_id: null,
  };

  const { data: sourceData, error: sourceError } = await client
    .from('sources')
    .insert(sourceInsert)
    .select()
    .single();

  if (sourceError || sourceData === null || sourceData === undefined) {
    console.error('POST /api/extract: sources insert failed', sourceError);
    await removeBlobBestEffort(client, storagePath);
    return { stored: false, notice: 'Extraction succeeded but was not stored: the source record could not be saved.' };
  }

  try {
    Source.parse(sourceData);
  } catch (err) {
    // The row exists and the blob is in place; only our own contract check
    // failed. Mirrors app/api/voice/upload/route.ts: nothing is torn down on
    // a validation-only failure, since the row is not necessarily wrong.
    console.error('POST /api/extract: inserted sources row failed contract validation', err);
    return { stored: false, notice: 'Extraction succeeded but the saved source record was invalid.' };
  }

  if (report.kept.length > 0) {
    // `ClaimRow` (Claim & person_id) already matches the `claims` table's
    // insertable columns exactly (created_at is a DB default) — dropped
    // claims are simply absent from `report.kept` and never reach this array.
    const claimsPayload: ClaimRow[] = report.kept.map((claim) => ({
      ...claim,
      person_id: personId,
    }));

    const { error: claimsError } = await client.from('claims').insert(claimsPayload);

    if (claimsError) {
      console.error('POST /api/extract: claims insert failed', claimsError);
      await deleteSourceBestEffort(client, sourceId);
      return { stored: false, notice: 'Extraction succeeded but was not stored: the claims could not be saved.' };
    }
  }

  // Derive facts AND conflicts from exactly the claims just persisted, for
  // this one source, from the SAME `reconcile` call — `Conflict.id` and every
  // `Fact.conflict_id` pointing at it are minted fresh per call, so calling
  // `reconcile` twice would produce facts that cite conflict ids that were
  // never inserted. `sourcesById` needs only this source's own kind/title —
  // `classifySource` (via `buildFacts`) reads them to decide instruction vs
  // observation.
  const { facts, conflicts } = reconcile(report.kept, personId, {
    sourcesById: new Map([[sourceId, { kind, title }]]),
  });

  // Conflict rows must exist before the facts that reference them via
  // `conflict_id` — that FK is unenforced in the DB (see the module doc
  // comment) but the insert order still matters for a caller that reads facts
  // and conflicts together expecting the conflict to already be there.
  const conflictsPayload: ConflictRow[] = conflicts.map((conflict) => ({ ...conflict }));
  if (conflictsPayload.length > 0) {
    const { error: conflictsError } = await client
      .from('claim_conflicts')
      .upsert(conflictsPayload, { onConflict: 'id' });

    if (conflictsError) {
      console.error('POST /api/extract: claim_conflicts upsert failed', conflictsError);
      await deleteSourceBestEffort(client, sourceId);
      await removeBlobBestEffort(client, storagePath);
      return { stored: false, notice: 'Extraction succeeded but was not stored: the detected conflicts could not be saved.' };
    }
  }

  // `fact_needs_support` (migration 0001): a fact may only lack supporting
  // claims when status is 'unknown'. `buildFacts` never emits 'unknown', so
  // this should never filter anything out — checked and skipped rather than
  // trusted, so a future change to that invariant degrades honestly instead
  // of crashing the insert.
  const validFacts: FactRow[] = facts.filter(
    (fact) => fact.status === 'unknown' || fact.supporting_claim_ids.length > 0,
  );
  if (validFacts.length !== facts.length) {
    console.error(
      `POST /api/extract: dropped ${facts.length - validFacts.length} fact(s) that would violate fact_needs_support`,
    );
  }

  if (validFacts.length > 0) {
    // `FactRow` is `Fact` itself — already matches the `facts` table's
    // insertable columns exactly (created_at is a DB default). `id` is
    // preserved from `reconcile`'s output rather than left to the DB
    // default, because a fact's own `superseded_by` may point at another
    // fact's id from this same batch (self-referencing FK, checked at
    // end-of-statement so a single multi-row insert resolves it correctly).
    const { error: factsError } = await client.from('facts').insert(validFacts);

    if (factsError) {
      console.error('POST /api/extract: facts insert failed', factsError);
      // `claim_conflicts` does not cascade off `sources` (it references
      // `people`), so the rows just upserted above would otherwise survive
      // this source's deletion as orphans referenced by nothing.
      if (conflictsPayload.length > 0) {
        await deleteConflictsBestEffort(client, conflictsPayload.map((c) => c.id));
      }
      await deleteSourceBestEffort(client, sourceId);
      await removeBlobBestEffort(client, storagePath);
      return { stored: false, notice: 'Extraction succeeded but was not stored: the derived facts could not be saved.' };
    }
  }

  return {
    stored: true,
    claims: report.kept.length,
    facts: validFacts.length,
    conflicts: conflictsPayload.length,
  };
}

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

  const file = form.get('file');
  if (file === null || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return errorResponse(400, 'Missing "file" field: upload one document under the field name "file".');
  }

  const titleField = form.get('title');
  // Trim before the emptiness test, then persist the trimmed value (the
  // voice route's discipline — it tested trimmed but stored the raw string
  // here). Fall back to the file name, and cap either at MAX_TITLE_CHARS.
  // `title` is only ever read in the live branch below; fixtures/replay never
  // touches it, so this leaves that response byte-for-byte unchanged.
  const rawTitle =
    typeof titleField === 'string' && titleField.trim() !== '' ? titleField.trim() : file.name;
  const title = rawTitle.slice(0, MAX_TITLE_CHARS);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return errorResponse(400, 'Could not read the uploaded file\'s contents.');
  }

  try {
    assertWithinUploadLimit(bytes.byteLength, file.name);
  } catch (err) {
    if (err instanceof SourceTooLargeError) {
      return errorResponse(
        413,
        `${file.name} is over the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit. ` +
          'Downscale the image (or re-export a smaller PDF) on the client before uploading again.',
      );
    }
    throw err;
  }

  let input;
  try {
    input = classifyUpload(bytes);
  } catch (err) {
    if (err instanceof UnsupportedSourceError) {
      return errorResponse(
        415,
        'Unsupported file type. Supported types are: PDF, JPEG, PNG, GIF, WebP.',
      );
    }
    throw err;
  }

  // Never throws (see lib/modes/resolve-mode.ts): an invalid or missing
  // value falls back to 'fixtures', the safest default.
  const mode = resolveMode({ searchParam: new URL(request.url).searchParams.get('mode') });

  // `person_id` is additive and, outside live mode, ignored entirely — the
  // fixtures/replay branch below never reads it, so that response stays
  // byte-for-byte what it was before this field existed.
  if (mode === 'live') {
    const personIdField = form.get('person_id');
    const personIdCheck =
      typeof personIdField === 'string' ? PersonId.safeParse(personIdField) : null;
    if (personIdCheck === null || !personIdCheck.success) {
      // Validated before extraction runs — mirrors the voice upload route's
      // validation-first order, so a request that cannot be persisted never
      // burns an Anthropic call.
      return errorResponse(
        400,
        'Missing or invalid "person_id": provide the UUID of the person this document belongs to. ' +
          'Required in live mode so the extraction can be persisted.',
      );
    }
  }

  try {
    if (mode !== 'live') {
      const reports = extractFromFixtures();
      return json({
        mode,
        note:
          'fixtures/replay mode: no network call was made and your upload was not read. ' +
          'These are the fixture reports, shown for illustration.',
        reports: reports.map(toWireReport),
        drops: reports.reduce((sum, r) => sum + r.stats.claims_dropped, 0),
      });
    }

    // Re-parsed rather than threaded through as a variable from the check
    // above: TypeScript cannot see across the `if (mode === 'live')` block
    // that this branch (also gated on live mode) always follows a successful
    // check, and re-parsing a UUID is not worth a non-null assertion.
    const personId = PersonId.parse(form.get('person_id'));

    // Authorization, before any model spend: a caller who supplied a
    // syntactically-valid person_id they have no access to must be stopped
    // here, not after an Anthropic call has already been billed. Fixed
    // strings only in every branch below — never echo person_id or a user id
    // back to the caller.
    const access = await checkCareAccess(personId);
    switch (access.kind) {
      case 'granted':
        break;
      case 'unconfigured':
        return errorResponse(500, 'Access checks are not configured. Nothing was saved.');
      case 'no_session':
        return errorResponse(401, 'Sign-in required. Nothing was saved.');
      case 'no_access':
        return errorResponse(403, 'This account does not have access to this care record. Nothing was saved.');
      default: {
        // Fail closed. Every deny verdict is handled above and 'granted' is the
        // ONLY branch that falls through to extraction + the write; a kind
        // outside the frozen union — a future addition, or a malformed runtime
        // value — must deny, never proceed. The `never` binding also turns an
        // unhandled future kind into a compile error, so this guard cannot
        // silently drift out of date. Mirrors app/api/voice/upload/route.ts.
        const _exhaustive: never = access;
        void _exhaustive;
        return errorResponse(403, 'This account does not have access to this care record. Nothing was saved.');
      }
    }

    const sourceId = randomUUID();

    // `callModel` (via `extractSourceLive` -> `callForcedTool`) handles a
    // missing ANTHROPIC_API_KEY itself by degrading to a fixture lookup —
    // there is no credentials error to catch here any more. A `degraded`
    // live report is a normal, successful result, not an error.
    const report = await extractSourceLive(
      { id: sourceId, title, kind: input.kind },
      input,
      { mode },
    );

    const persisted = await persistLiveExtraction({
      sourceId,
      personId,
      title,
      kind: input.kind,
      input,
      bytes,
      report,
    });

    if (persisted.stored) {
      return json({
        mode,
        reports: [toWireReport(report)],
        drops: report.stats.claims_dropped,
        persisted: {
          source_id: sourceId,
          claims: persisted.claims,
          facts: persisted.facts,
          conflicts: persisted.conflicts,
        },
      });
    }

    return json({
      mode,
      reports: [toWireReport(report)],
      drops: report.stats.claims_dropped,
      persisted: null,
      persist_notice: persisted.notice,
    });
  } catch (err) {
    // Log the detail, return a fixed string. An upstream error message can
    // carry a request body, a Zod dump, or a provider payload — none of which
    // belongs in a client response.
    console.error('POST /api/extract failed', err);
    return errorResponse(
      500,
      'Extraction failed. Nothing was saved. Try again, or use ?mode=fixtures to check the endpoint itself.',
    );
  }
}
