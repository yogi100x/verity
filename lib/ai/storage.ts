/**
 * Citation deep links — path validation and local asset resolution.
 *
 * `app/api/sources/[id]/open` and `app/api/sources/[id]/raw` both need to
 * turn a `Source.storage_path` (untrusted: it comes from a fixture today and
 * from a database, i.e. from whoever wrote a row, tomorrow) into either a
 * signed URL (live) or a local file under `demo/` (fixtures / replay).
 *
 * Everything here is pure except `resolveLocalAsset`'s filesystem checks —
 * there is no network I/O and no write path in this module.
 */

import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

/** Seconds a live signed URL stays valid. Exactly 60 per the lane brief. */
export const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Supabase Storage bucket holding the source documents.
 *
 * **UNVERIFIED.** Nothing in this repo specifies a bucket name — not the
 * migrations, not the lane briefs, not `docs/stack-freeze.md`. This is a
 * guess, deliberately isolated here as a single named constant so that
 * confirming it is a one-line change. A wrong value degrades (Supabase
 * returns an error, `/open` falls back to the local asset) rather than 500s.
 */
export const DOCUMENTS_BUCKET = 'documents';

export class UnsafeStoragePathError extends Error {}

/**
 * Validate a `Source.storage_path` for local resolution. Rejects absolute
 * paths, anything containing a `..` or `.` or empty segment, backslashes, NUL
 * bytes, percent-encoded traversal, a trailing separator, and anything not
 * rooted at `demo/`.
 *
 * This is a check on the raw string — necessary but not sufficient on its
 * own. `resolveLocalAsset` additionally confines the *physically resolved*
 * absolute path (symlinks followed), because a string-only check cannot catch
 * a symlink inside `demo/` that points out of it. Never treat this function
 * alone as proof a path is safe to read.
 */
export function assertSafeStoragePath(storagePath: string): void {
  if (storagePath.length === 0) {
    throw new UnsafeStoragePathError('storage_path is empty');
  }
  if (storagePath.includes('\0')) {
    throw new UnsafeStoragePathError('storage_path contains a NUL byte');
  }
  if (storagePath.includes('\\')) {
    throw new UnsafeStoragePathError('storage_path contains a backslash');
  }
  // Reject percent-encoded traversal (%2e, %2f, %5c — case-insensitive) before
  // any decoding happens: we never decode this string, but a value carrying an
  // encoded separator or dot is not a legitimate storage_path either way, and
  // some storage backend downstream might well decode it.
  if (/%2e|%2f|%5c/i.test(storagePath)) {
    throw new UnsafeStoragePathError('storage_path contains encoded traversal');
  }
  if (isAbsolute(storagePath)) {
    throw new UnsafeStoragePathError('storage_path must be relative');
  }
  if (storagePath.endsWith('/')) {
    throw new UnsafeStoragePathError('storage_path must name a file, not a directory');
  }
  const segments = storagePath.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new UnsafeStoragePathError('storage_path contains a .. segment');
  }
  if (segments.some((segment) => segment === '.')) {
    throw new UnsafeStoragePathError('storage_path contains a . segment');
  }
  if (segments.some((segment) => segment.length === 0)) {
    throw new UnsafeStoragePathError('storage_path contains an empty segment');
  }
  // Case-sensitive on purpose. On a case-insensitive filesystem (macOS)
  // `DEMO/x` names the same file as `demo/x`, so accepting it would mean the
  // string check and the physical check disagree about what the root is.
  // Rejecting is safe: every storage_path we mint is lowercase.
  if (!storagePath.startsWith('demo/')) {
    throw new UnsafeStoragePathError('storage_path must live under demo/');
  }
}

/** Append `#page=N` to a URL. Omits the fragment entirely when page is null. */
export function withPageFragment(url: string, page: number | null): string {
  if (page === null) return url;
  return `${url}#page=${page}`;
}

/**
 * Whether `#page=N` means anything for this file. Only PDFs paginate — a
 * markdown or image target renders the fragment inert. The fragment is still
 * emitted (fixtures and live must produce the same URL shape), but callers
 * declare the inertness in a header rather than implying the deep link landed
 * on a page it cannot land on.
 */
export function supportsPageFragment(relPath: string): boolean {
  return extname(relPath).toLowerCase() === '.pdf';
}

export type LocalAsset =
  | { readonly kind: 'exact'; readonly relPath: string; readonly readPath: string }
  | {
      readonly kind: 'fallback';
      readonly relPath: string;
      readonly readPath: string;
      readonly requested: string;
    }
  | { readonly kind: 'missing'; readonly requested: string };

/**
 * `demo/<NN>-<name>.<ext>` -> `demo/documents/<NN>-<name>.md`.
 *
 * Lane D's real renders (`demo/01-discharge-summary.pdf` etc.) do not exist
 * yet — `demo/documents/README.md` says that directory is Lane D's to fill,
 * and it currently holds markdown source text instead. This maps the
 * fixture's `storage_path` (aimed at the not-yet-rendered file) to the
 * markdown that has the same content, so citations resolve to *something*
 * real today.
 *
 * When Lane D lands the real PDF/image at the exact `storage_path`,
 * `resolveLocalAsset` finds it directly and this fallback is never reached
 * for that source — no code change needed here or in the routes.
 */
function markdownFallbackFor(relPath: string): string | null {
  const match = /^demo\/(\d+-[a-z0-9-]+)\.[a-z0-9]+$/i.exec(relPath);
  const stem = match?.[1];
  if (stem === undefined) return null;
  return `demo/documents/${stem}.md`;
}

/**
 * Confine a repo-relative path to `<repoRoot>/demo/` and return the real
 * absolute path of the regular file it names, or null.
 *
 * Two checks, both needed:
 *
 *  1. **Lexical.** `resolve()` collapses `..` but does not touch the
 *     filesystem. Compared against `demoRoot + sep`, never a bare prefix — a
 *     bare `startsWith('/repo/demo')` also matches `/repo/demoted`.
 *  2. **Physical.** `resolve()` does not follow symlinks, so a symlink at
 *     `demo/x.pdf -> /etc/passwd` (or a symlinked directory `demo/d -> /etc`)
 *     passes check 1 and would then be read by `readFile`. `realpathSync`
 *     collapses the links on both sides — the candidate and the root — and the
 *     result is re-confined. The root is realpath'd too because the repo
 *     itself may sit under a symlink (`/tmp` -> `/private/tmp` on macOS),
 *     which would otherwise make every real path look like an escape.
 *
 * Finally `statSync().isFile()` rejects directories, FIFOs and devices, so a
 * storage_path naming `demo` itself cannot come back as a servable asset.
 */
function confinedRealFile(repoRoot: string, relPath: string): string | null {
  const demoRootLexical = resolve(join(repoRoot, 'demo'));
  const absolute = resolve(join(repoRoot, normalize(relPath)));
  if (absolute !== demoRootLexical && !absolute.startsWith(demoRootLexical + sep)) return null;

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = realpathSync(demoRootLexical);
    realTarget = realpathSync(absolute);
  } catch {
    // Non-existent, a broken symlink, a symlink loop (ELOOP), or a path the
    // filesystem refuses outright (ENAMETOOLONG). All mean "no asset".
    return null;
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;

  try {
    if (!statSync(realTarget).isFile()) return null;
  } catch {
    return null;
  }
  return realTarget;
}

/**
 * Resolve a storage_path to a file that exists in the repo, for fixtures and
 * replay. Returns the exact file when present, otherwise the documented
 * markdown fallback, otherwise 'missing'.
 *
 * `readPath` is the confined absolute path callers must read. Callers must
 * not re-join `relPath` themselves: that repeats the resolution outside the
 * confinement, which is exactly how a second, unchecked read path appears.
 *
 * Throws only `UnsafeStoragePathError`. Every filesystem failure is folded
 * into 'missing' so no route can be pushed into an unhandled 500.
 */
export function resolveLocalAsset(storagePath: string, repoRoot: string): LocalAsset {
  assertSafeStoragePath(storagePath);

  const exact = confinedRealFile(repoRoot, storagePath);
  if (exact !== null) {
    return { kind: 'exact', relPath: storagePath, readPath: exact };
  }

  const fallbackRel = markdownFallbackFor(storagePath);
  if (fallbackRel !== null) {
    const fallback = confinedRealFile(repoRoot, fallbackRel);
    if (fallback !== null) {
      return { kind: 'fallback', relPath: fallbackRel, readPath: fallback, requested: storagePath };
    }
  }

  return { kind: 'missing', requested: storagePath };
}

/**
 * Content types we are willing to name. Deliberately no `text/html`,
 * `image/svg+xml`, `application/xhtml+xml` or `text/xml`: `/raw` serves bytes
 * from a path influenced by data, on our own origin, so a type a browser will
 * execute script from would make it an XSS sink. Anything unlisted becomes
 * `application/octet-stream`, which no browser scripts.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Content type for a resolved asset, by extension. */
export function contentTypeFor(relPath: string): string {
  const ext = extname(relPath).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
