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
 */

import { randomUUID } from 'crypto';
import { resolveMode } from '@/lib/modes';
import { extractFromFixtures, extractSourceLive, toWireReport } from '@/lib/ai/extract';
import {
  assertWithinUploadLimit,
  classifyUpload,
  MAX_UPLOAD_BYTES,
  SourceTooLargeError,
  UnsupportedSourceError,
} from '@/lib/ai/documents';

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

  const file = form.get('file');
  if (file === null || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return errorResponse(400, 'Missing "file" field: upload one document under the field name "file".');
  }

  const titleField = form.get('title');
  const title = typeof titleField === 'string' && titleField.trim() !== '' ? titleField : file.name;

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

    // `callModel` (via `extractSourceLive` -> `callForcedTool`) handles a
    // missing ANTHROPIC_API_KEY itself by degrading to a fixture lookup —
    // there is no credentials error to catch here any more. A `degraded`
    // live report is a normal, successful result, not an error.
    const report = await extractSourceLive(
      { id: randomUUID(), title, kind: input.kind },
      input,
      { mode },
    );

    return json({
      mode,
      reports: [toWireReport(report)],
      drops: report.stats.claims_dropped,
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
