/**
 * GET /api/sources/[id]/open — the citation deep link.
 *
 * Lane B's citation chips point here (Journey 1.9): a user clicks a quote and
 * lands on the page of the document it came from. `fixtures`, `replay`, and
 * `live` must be indistinguishable from the outside — same status code, same
 * redirect semantics, same `#page=N` fragment on the target URL — because a
 * `#page=N` fragment only means anything once a browser has navigated to a
 * URL carrying it. Streaming bytes directly here in fixtures while
 * redirecting in live would silently drop the fragment and open the viewer
 * at page 1, which is exactly the failure mode that must not happen on
 * stage.
 *
 * `live` failure (no Supabase credentials, or the signing call itself
 * fails) degrades to the same fixtures redirect rather than erroring — this
 * mirrors how `lib/modes` treats a live failure elsewhere in the pipeline:
 * the citation must still resolve. The degrade is never silent; it is stated
 * in `X-Verity-Mode-Degraded`.
 *
 * Every branch of this handler returns one of exactly three shapes, and which
 * one you get depends on the *situation*, never on the mode:
 *
 *   unknown id                     -> 404 text/plain
 *   unservable storage_path        -> 404 text/plain
 *   asset resolved                 -> 302 + Location (+ fragment if ?page=)
 *   asset genuinely missing        -> 200 text/html explaining why
 *
 * All four carry `Cache-Control: no-store`: a 60-second signed URL must not be
 * cached, and neither must a 404 that will start resolving the moment Lane D
 * lands a render.
 */

import { resolveMode } from '@/lib/modes';
import { CaseSnapshot, type Source } from '@/lib/contracts';
import {
  assertSafeStoragePath,
  resolveLocalAsset,
  supportsPageFragment,
  withPageFragment,
  UnsafeStoragePathError,
  type LocalAsset,
} from '@/lib/ai/storage';
import { mintSignedUrl } from '@/lib/ai/signed-url';
import { escapeHtml } from '@/lib/ai/inspect-html';
import fixtureRaw from '@/fixtures/margaret.json';

export const dynamic = 'force-dynamic';

const fixture = CaseSnapshot.parse(fixtureRaw);

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function findSource(id: string): Source | null {
  return fixture.sources.find((candidate) => candidate.id === id) ?? null;
}

/** Anything other than a positive integer is treated as absent, never an
 *  error — a malformed fragment must not break a citation click. */
function parsePage(raw: string | null): number | null {
  if (raw === null) return null;
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** 404 bodies are fixed strings. They never echo the id, the storage_path, or
 *  a filesystem path — a Node `ENOENT` message carries the absolute path, so
 *  no caught error's message is ever put in a response. */
function notFound(message: string): Response {
  return new Response(message, {
    status: 404,
    headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function redirect(location: string, extraHeaders?: Record<string, string>): Response {
  // 302, not 307/308: this is a GET-only route, every browser follows a 302 on
  // a GET, and the fragment is preserved by the navigation either way.
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: location, ...extraHeaders },
  });
}

function missingAssetPage(source: Source): Response {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verity — document not available</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #FAF7F2; color: #1C1B1A; padding: 3rem 2rem; }
  .box { max-width: 42rem; margin: 0 auto; background: white; border: 1px solid #E7E1D8; border-radius: 12px; padding: 2rem; }
  h1 { color: #14453D; font-size: 1.4rem; margin-top: 0; }
  p { line-height: 1.6; }
  code { background: #E4EFEC; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
</head>
<body>
  <div class="box">
    <h1>Document not rendered yet</h1>
    <p>
      "${escapeHtml(source.title)}" does not have a rendered file in the
      repository yet. Its content is available as markdown under
      <code>demo/documents/</code> in the meantime.
    </p>
  </div>
</body>
</html>`;
  return new Response(body, {
    status: 200,
    headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * The offline redirect target.
 *
 * `?mode=fixtures` is hardcoded rather than echoing the caller's mode, so that
 * `?mode=fixtures`, `?mode=replay` and a degraded `?mode=live` produce a
 * byte-identical `Location`. Serving local demo assets *is* the fixtures
 * behaviour — `replay` differs from `fixtures` only in how model calls are
 * resolved, which this route does not do — so making the three agree exactly
 * is stronger than making the URL echo a mode that changes nothing.
 */
function redirectToRaw(
  id: string,
  page: number | null,
  asset: Extract<LocalAsset, { kind: 'exact' | 'fallback' }>,
  degraded: boolean,
): Response {
  const target = withPageFragment(
    `/api/sources/${encodeURIComponent(id)}/raw?mode=fixtures`,
    page,
  );
  const headers: Record<string, string> = {};
  if (degraded) headers['X-Verity-Mode-Degraded'] = '1';
  // Stated, not hidden: this citation resolved to Lane D's markdown stand-in
  // rather than the render the storage_path actually names.
  if (asset.kind === 'fallback') headers['X-Verity-Asset-Fallback'] = '1';
  // `#page=N` is still emitted — fixtures and live must produce the same URL
  // shape — but on a non-paginated target it does nothing, and pretending
  // otherwise is the dishonesty this header exists to prevent.
  if (page !== null && !supportsPageFragment(asset.relPath)) {
    headers['X-Verity-Page-Fragment'] = 'inert';
  }
  return redirect(target, headers);
}

function offlineResponse(source: Source, id: string, page: number | null, degraded: boolean): Response {
  const asset = resolveLocalAsset(source.storage_path, process.cwd());
  if (asset.kind === 'missing') return missingAssetPage(source);
  return redirectToRaw(id, page, asset, degraded);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const mode = resolveMode({ searchParam: url.searchParams.get('mode') });
  const page = parsePage(url.searchParams.get('page'));

  const source = findSource(id);
  if (source === null) {
    return notFound('No source found for that id.');
  }

  try {
    // Validated in live as in every other mode, before anything is signed or
    // read: a storage_path is data, and whether it is servable is a property
    // of the path, not of the mode. Signing an unvalidated path would also
    // make live the one mode where a malformed row produces a different status.
    assertSafeStoragePath(source.storage_path);

    if (mode === 'live') {
      const signedUrl = await mintSignedUrl(source.storage_path);
      if (signedUrl !== null) {
        return redirect(withPageFragment(signedUrl, page));
      }
      return offlineResponse(source, id, page, true);
    }

    return offlineResponse(source, id, page, false);
  } catch (error) {
    // A storage_path that cannot be served safely is a 404 in every mode, and
    // the error's message never reaches the body. Without this, a bad row from
    // a future database would throw out of the handler and Next would render
    // its own error page — which in development embeds the absolute path and a
    // stack trace, and carries no `Cache-Control: no-store`.
    if (error instanceof UnsafeStoragePathError) {
      return notFound('That document cannot be served.');
    }
    throw error;
  }
}
