/**
 * GET /api/sources/[id]/raw — serves the local demo asset behind
 * `/api/sources/[id]/open` in `fixtures` and `replay` mode.
 *
 * Independently reachable, so it repeats the source lookup and the
 * `resolveLocalAsset` confinement rather than trusting that `/open` already
 * validated anything — a route that assumes it is only ever reached via a
 * sibling redirect is a route waiting to be hit directly.
 *
 * Refuses in `live` mode: `/open` redirects to a Supabase signed URL there,
 * and this route serving bytes anyway would be a silent bypass of that path
 * (and of the 60-second TTL it exists to enforce). Note the refusal is keyed
 * on the *resolved* mode, so a deployment with `NEXT_PUBLIC_DEFAULT_MODE=live`
 * refuses on a request with no `?mode=` at all.
 */

import { readFile } from 'node:fs/promises';
import { resolveMode } from '@/lib/modes';
import { CaseSnapshot, type Source } from '@/lib/contracts';
import {
  resolveLocalAsset,
  contentTypeFor,
  UnsafeStoragePathError,
  type LocalAsset,
} from '@/lib/ai/storage';
import fixtureRaw from '@/fixtures/margaret.json';

export const dynamic = 'force-dynamic';

const fixture = CaseSnapshot.parse(fixtureRaw);

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function findSource(id: string): Source | null {
  return fixture.sources.find((candidate) => candidate.id === id) ?? null;
}

/** Bodies are fixed strings — never a caught error's message, which for a
 *  Node filesystem error contains the absolute path. */
function plainText(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const mode = resolveMode({ searchParam: url.searchParams.get('mode') });

  if (mode === 'live') {
    return plainText(
      'This route only serves local demo assets. In live mode, use /open, which redirects to a signed URL.',
      409,
    );
  }

  const source = findSource(id);
  if (source === null) {
    return plainText('No source found for that id.', 404);
  }

  let asset: LocalAsset;
  try {
    asset = resolveLocalAsset(source.storage_path, process.cwd());
  } catch (error) {
    if (error instanceof UnsafeStoragePathError) {
      return plainText('That document cannot be served.', 404);
    }
    throw error;
  }

  if (asset.kind === 'missing') {
    return plainText('That document is not available yet.', 404);
  }

  let bytes: Buffer;
  try {
    // `asset.readPath` is the absolute path `resolveLocalAsset` already
    // confined to the real `demo/` directory. Re-joining `relPath` here would
    // be a second resolution outside the confinement.
    bytes = await readFile(asset.readPath);
  } catch {
    return plainText('That document is not available yet.', 404);
  }

  const headers: Record<string, string> = {
    ...NO_STORE,
    'Content-Type': contentTypeFor(asset.relPath),
    'Content-Disposition': 'inline',
    // `contentTypeFor` already refuses to name any scriptable type, but these
    // two close the sniffing route to the same place: this endpoint serves
    // bytes from a data-influenced path on our own origin, so a browser must
    // neither guess a type nor be allowed to run anything if it did.
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox; base-uri 'none'",
  };
  if (asset.kind === 'fallback') {
    headers['X-Verity-Asset-Fallback'] = '1';
  }

  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
