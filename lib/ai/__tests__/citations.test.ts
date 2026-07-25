import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET as openGET } from '@/app/api/sources/[id]/open/route';
import { GET as rawGET } from '@/app/api/sources/[id]/raw/route';
import {
  assertSafeStoragePath,
  contentTypeFor,
  resolveLocalAsset,
  supportsPageFragment,
  withPageFragment,
  DOCUMENTS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  UnsafeStoragePathError,
} from '@/lib/ai/storage';
import { CaseSnapshot } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function openRequest(id: string, query = ''): Request {
  return new Request(`http://localhost/api/sources/${id}/open${query}`);
}

function rawRequest(id: string, query = ''): Request {
  return new Request(`http://localhost/api/sources/${id}/raw${query}`);
}

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const firstSourceId = fixture.sources[0]?.id;
if (firstSourceId === undefined) throw new Error('fixture has no sources');
const knownId: string = firstSourceId;

/** The one fixture source whose storage_path names a file that exists today. */
const EXACT_PATH = 'demo/documents/05-care-log.md';
/** A fixture source whose storage_path names one of Lane D's absent renders. */
const FALLBACK_PATH = 'demo/01-discharge-summary.pdf';

describe('assertSafeStoragePath — traversal payloads', () => {
  // Each payload is paired with the reason it must be rejected, so a test
  // cannot pass because the function threw for some unrelated reason. Asserting
  // only `toThrow(UnsafeStoragePathError)` would let a `..` payload pass on the
  // strength of the `demo/` prefix check, and vice versa.
  const payloads: readonly (readonly [string, RegExp])[] = [
    ['../../etc/passwd', /\.\. segment/],
    ['demo/../../secrets', /\.\. segment/],
    ['demo/documents/../../package.json', /\.\. segment/],
    ['demo/./../package.json', /\.\. segment/],
    ['/etc/passwd', /must be relative/],
    ['/etc/hosts', /must be relative/],
    ['demo\\..\\x', /backslash/],
    ['C:\\Windows\\system32', /backslash/],
    ['demo/%2e%2e/secrets', /encoded traversal/],
    ['..%2fpackage.json', /encoded traversal/],
    ['demo/%2e%2e%2fpackage.json', /encoded traversal/],
    ['demo/\0hidden', /NUL byte/],
    ['\0demo/x.pdf', /NUL byte/],
    ['', /is empty/],
    ['demo/', /not a directory/],
    ['demo', /must live under demo\//],
    // A case-insensitive filesystem (macOS) would open the same file for these.
    ['DEMO/01-discharge-summary.pdf', /must live under demo\//],
    ['Demo/x.pdf', /must live under demo\//],
    // A sibling directory sharing the `demo` prefix must not be reachable.
    ['demoted/x.pdf', /must live under demo\//],
    ['demo//../package.json', /\.\. segment/],
    ['demo//x.pdf', /empty segment/],
    ['demo/./x.pdf', /\. segment/],
  ];

  for (const [payload, reason] of payloads) {
    it(`rejects ${JSON.stringify(payload)} for the right reason`, () => {
      expect(() => assertSafeStoragePath(payload)).toThrow(UnsafeStoragePathError);
      expect(() => assertSafeStoragePath(payload)).toThrow(reason);
    });
  }

  it('accepts the two shapes the fixture actually uses', () => {
    expect(() => assertSafeStoragePath(EXACT_PATH)).not.toThrow();
    expect(() => assertSafeStoragePath(FALLBACK_PATH)).not.toThrow();
  });

  it('a path far longer than any filesystem allows is rejected or resolves to nothing', () => {
    const longPath = `demo/${'a'.repeat(5000)}.pdf`;
    // Not required to throw — required not to read anything.
    const asset = resolveLocalAsset(longPath, process.cwd());
    expect(asset.kind).toBe('missing');
  });
});

describe('resolveLocalAsset — filesystem confinement', () => {
  it('never returns a path outside <repoRoot>/demo, even when the traversal target exists on disk', () => {
    // package.json exists at repo root — a naive `resolve()` without a
    // confinement check would happily hand it back.
    expect(() => resolveLocalAsset('demo/../package.json', process.cwd())).toThrow(
      UnsafeStoragePathError,
    );
  });

  it('resolves the one fixture source whose storage_path is exact', () => {
    const source = fixture.sources.find((s) => s.storage_path === EXACT_PATH);
    expect(source).toBeDefined();
    if (source === undefined) return;
    const asset = resolveLocalAsset(source.storage_path, process.cwd());
    expect(asset.kind).toBe('exact');
    if (asset.kind !== 'exact') return;
    // readPath is absolute and inside demo/ — this is the value routes read.
    expect(asset.readPath.endsWith('/demo/documents/05-care-log.md')).toBe(true);
  });

  it('falls back to demo/documents/<slug>.md for storage_paths whose exact file is not yet rendered', () => {
    const source = fixture.sources.find((s) => s.storage_path === FALLBACK_PATH);
    expect(source).toBeDefined();
    if (source === undefined) return;
    const asset = resolveLocalAsset(source.storage_path, process.cwd());
    expect(asset.kind).toBe('fallback');
    if (asset.kind !== 'fallback') return;
    expect(asset.relPath).toBe('demo/documents/01-discharge-summary.md');
    expect(asset.requested).toBe(FALLBACK_PATH);
    expect(asset.readPath.endsWith('/demo/documents/01-discharge-summary.md')).toBe(true);
  });

  it('a storage_path naming the demo directory itself is never servable', () => {
    // `demo/` is rejected by the string check; `demo` fails the prefix check.
    // Neither may ever come back as an asset a route would try to read.
    for (const payload of ['demo', 'demo/']) {
      expect(() => resolveLocalAsset(payload, process.cwd())).toThrow(UnsafeStoragePathError);
    }
  });
});

/**
 * A symlink is the one escape a purely lexical check cannot see: `resolve()`
 * does not follow links, so `demo/leak.md -> /etc/passwd` looks confined and
 * would then be read. Built in a temp root rather than in the repo's own
 * `demo/` (Lane D's territory, and not somewhere to leave artefacts).
 *
 * On macOS the temp root itself sits under a symlink (`/var` -> `/private/var`),
 * so this also proves the confinement realpath's the *root* as well as the
 * candidate — otherwise every legitimate file under a symlinked repo would
 * look like an escape and nothing would resolve at all.
 */
describe('resolveLocalAsset — symlink escapes', () => {
  let root = '';
  let outsideFile = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'verity-citations-'));
    mkdirSync(join(root, 'demo', 'documents'), { recursive: true });
    mkdirSync(join(root, 'outside'), { recursive: true });
    outsideFile = join(root, 'outside', 'secret.md');
    writeFileSync(outsideFile, 'SERVICE_ROLE_KEY=leaked\n');
    writeFileSync(join(root, 'demo', 'documents', '01-real.md'), '# real\n');
    // A file symlink pointing out of demo/.
    symlinkSync(outsideFile, join(root, 'demo', '01-leak.md'));
    // A *directory* symlink pointing out of demo/ — the subtler variant, where
    // every path segment under it looks like it lives inside demo/.
    symlinkSync(join(root, 'outside'), join(root, 'demo', 'escape'));
  });

  afterAll(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true });
  });

  it('refuses a file symlink inside demo/ that points outside it', () => {
    const asset = resolveLocalAsset('demo/01-leak.md', root);
    // Not 'exact' — the link target is outside the real demo root. It must not
    // resolve to the escaping file by any kind.
    if (asset.kind !== 'missing') {
      expect(asset.readPath).not.toContain('outside');
    }
    expect(asset.kind).toBe('missing');
  });

  it('refuses a path traversing a directory symlink that points outside demo/', () => {
    const asset = resolveLocalAsset('demo/escape/secret.md', root);
    expect(asset.kind).toBe('missing');
  });

  it('still resolves a genuine file under a temp root that is itself symlinked', () => {
    const asset = resolveLocalAsset('demo/documents/01-real.md', root);
    expect(asset.kind).toBe('exact');
  });

  it('does not fall back through a symlink either', () => {
    // demo/01-leak.md exists as a link; the fallback for `demo/01-leak.pdf`
    // would be demo/documents/01-leak.md, which does not exist. Neither the
    // exact nor the fallback branch may reach the escaping target.
    const asset = resolveLocalAsset('demo/01-leak.pdf', root);
    expect(asset.kind).toBe('missing');
  });
});

describe('withPageFragment / supportsPageFragment / contentTypeFor', () => {
  it('appends #page=N', () => {
    expect(withPageFragment('https://example.test/doc', 2)).toBe('https://example.test/doc#page=2');
  });

  it('omits the fragment for a null page', () => {
    expect(withPageFragment('https://example.test/doc', null)).toBe('https://example.test/doc');
  });

  it('only a PDF honours #page=N', () => {
    expect(supportsPageFragment('demo/01-discharge-summary.pdf')).toBe(true);
    expect(supportsPageFragment('demo/documents/01-discharge-summary.md')).toBe(false);
    expect(supportsPageFragment('demo/02-repeat-prescription.jpg')).toBe(false);
  });

  it('never names a content type a browser will execute script from', () => {
    // /raw serves bytes from a data-influenced path on our own origin, so a
    // scriptable type here would be a stored-XSS sink on our own domain.
    for (const ext of ['.html', '.htm', '.svg', '.xhtml', '.xml', '.js', '.mjs', '.css', '']) {
      expect(contentTypeFor(`demo/x${ext}`)).toBe('application/octet-stream');
    }
    expect(contentTypeFor('demo/x.pdf')).toBe('application/pdf');
    expect(contentTypeFor('demo/x.md')).toBe('text/markdown; charset=utf-8');
  });

  it('the signed-URL TTL is exactly 60 seconds and the bucket is one named constant', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(60);
    expect(DOCUMENTS_BUCKET).toBe('documents');
  });
});

describe('GET /api/sources/[id]/open — identical behaviour across modes', () => {
  it.each(['fixtures', 'replay'] as const)('mode=%s redirects 302 with #page=2 when ?page=2 is passed', async (mode) => {
    const res = await openGET(openRequest(knownId, `?mode=${mode}&page=2`), params(knownId));
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location).toMatch(/#page=2$/);
  });

  it('the default mode (no ?mode=) also returns 302', async () => {
    const res = await openGET(openRequest(knownId), params(knownId));
    expect(res.status).toBe(302);
  });

  // The load-bearing parity assertion. Not "both are 302" — byte-identical
  // status, Location, and the whole header set, for every source in the
  // fixture, with and without a page. If replay ever diverges from fixtures in
  // any observable way, this fails.
  it('fixtures and replay are byte-identical on every source, with and without ?page=', async () => {
    for (const source of fixture.sources) {
      for (const query of ['', '&page=3']) {
        const [a, b] = await Promise.all([
          openGET(openRequest(source.id, `?mode=fixtures${query}`), params(source.id)),
          openGET(openRequest(source.id, `?mode=replay${query}`), params(source.id)),
        ]);
        expect(a.status).toBe(b.status);
        expect(a.headers.get('location')).toBe(b.headers.get('location'));
        const headersOf = (r: Response): string =>
          JSON.stringify([...r.headers.entries()].sort());
        expect(headersOf(a)).toBe(headersOf(b));
      }
    }
  });

  it('an unknown id returns the same 404 in every mode', async () => {
    const results = await Promise.all(
      (['fixtures', 'replay', 'live'] as const).map((mode) =>
        openGET(openRequest(UNKNOWN_ID, `?mode=${mode}`), params(UNKNOWN_ID)),
      ),
    );
    for (const res of results) {
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('mode=live with no Supabase env degrades to a 302 identical to fixtures, and says so in a header', async () => {
    const fixturesRes = await openGET(openRequest(knownId, '?mode=fixtures&page=2'), params(knownId));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    try {
      const res = await openGET(openRequest(knownId, '?mode=live&page=2'), params(knownId));
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(fixturesRes.headers.get('location'));
      // The degrade must be visible, not silent.
      expect(res.headers.get('X-Verity-Mode-Degraded')).toBe('1');
      expect(fixturesRes.headers.get('X-Verity-Mode-Degraded')).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('mode=live with credentials that cannot sign degrades the same way, never 500s', async () => {
    // A refused connection, not a DNS lookup: no network egress from the suite.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'not-a-real-key');
    try {
      const res = await openGET(openRequest(knownId, '?mode=live'), params(knownId));
      expect(res.status).toBe(302);
      expect(res.headers.get('X-Verity-Mode-Degraded')).toBe('1');
      expect(res.headers.get('cache-control')).toBe('no-store');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('a null page produces a Location with no # fragment at all', async () => {
    const res = await openGET(openRequest(knownId, '?mode=fixtures'), params(knownId));
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location).not.toContain('#');
  });

  it.each(['abc', '-1', '0', '1.5', '2e3', ' 2', '007', '99999999999999999999'])(
    'a malformed ?page=%s is treated as absent, not an error',
    async (page) => {
      const res = await openGET(
        openRequest(knownId, `?mode=fixtures&page=${encodeURIComponent(page)}`),
        params(knownId),
      );
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).not.toBeNull();
      expect(location).not.toContain('#');
    },
  );
});

describe('GET /api/sources/[id]/open — correctness', () => {
  it('every source in the fixture redirects — all five resolve today, none is missing', async () => {
    // Asserted as 302 exactly, not "200 or 302": a source that stopped
    // resolving would fall through to the 200 not-rendered page, and a test
    // accepting either would not notice.
    for (const source of fixture.sources) {
      const res = await openGET(openRequest(source.id, '?mode=fixtures'), params(source.id));
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        `/api/sources/${encodeURIComponent(source.id)}/raw?mode=fixtures`,
      );
    }
  });

  it('an unknown uuid returns 404 and the body names no path', async () => {
    const res = await openGET(openRequest(UNKNOWN_ID), params(UNKNOWN_ID));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('demo/');
    expect(body).not.toContain(process.cwd());
    expect(body).not.toContain(UNKNOWN_ID);
  });

  it('every response carries Cache-Control: no-store', async () => {
    const responses = await Promise.all([
      openGET(openRequest(knownId), params(knownId)),
      openGET(openRequest(knownId, '?mode=replay&page=2'), params(knownId)),
      openGET(openRequest(UNKNOWN_ID), params(UNKNOWN_ID)),
    ]);
    for (const res of responses) {
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('states that #page=N is inert when the resolved asset does not paginate', async () => {
    // Every fixture source resolves to markdown today, so every ?page= is
    // inert. The fragment is still emitted (parity with live), but the header
    // says the deep link cannot land on a page. When Lane D lands the real
    // PDFs this header disappears for those sources and nothing else changes.
    const fallbackSource = fixture.sources.find((s) => s.storage_path === FALLBACK_PATH);
    expect(fallbackSource).toBeDefined();
    if (fallbackSource === undefined) return;
    const withPage = await openGET(
      openRequest(fallbackSource.id, '?mode=fixtures&page=2'),
      params(fallbackSource.id),
    );
    expect(withPage.headers.get('location')).toMatch(/#page=2$/);
    expect(withPage.headers.get('X-Verity-Page-Fragment')).toBe('inert');
    expect(withPage.headers.get('X-Verity-Asset-Fallback')).toBe('1');

    const withoutPage = await openGET(
      openRequest(fallbackSource.id, '?mode=fixtures'),
      params(fallbackSource.id),
    );
    expect(withoutPage.headers.get('X-Verity-Page-Fragment')).toBeNull();
  });

  it('the exact-resolving source is not marked as a fallback', async () => {
    const exactSource = fixture.sources.find((s) => s.storage_path === EXACT_PATH);
    expect(exactSource).toBeDefined();
    if (exactSource === undefined) return;
    const res = await openGET(openRequest(exactSource.id, '?mode=fixtures'), params(exactSource.id));
    expect(res.headers.get('X-Verity-Asset-Fallback')).toBeNull();
  });
});

describe('GET /api/sources/[id]/raw', () => {
  it('refuses in mode=live', async () => {
    const res = await rawGET(rawRequest(knownId, '?mode=live'), params(knownId));
    expect(res.status).toBe(409);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses with no ?mode= when the deployment default is live', async () => {
    // Omitting ?mode= is not a bypass: the refusal is keyed on the resolved
    // mode, so a live deployment refuses a bare request too.
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_MODE', 'live');
    try {
      const res = await rawGET(rawRequest(knownId), params(knownId));
      expect(res.status).toBe(409);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('serves local assets when the deployment default is fixtures or replay', async () => {
    for (const mode of ['fixtures', 'replay'] as const) {
      vi.stubEnv('NEXT_PUBLIC_DEFAULT_MODE', mode);
      try {
        const res = await rawGET(rawRequest(knownId), params(knownId));
        expect(res.status).toBe(200);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it('sets Content-Disposition: inline and refuses to be sniffed or scripted', async () => {
    const res = await rawGET(rawRequest(knownId, '?mode=fixtures'), params(knownId));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('never serves a content type a browser executes script from', async () => {
    for (const source of fixture.sources) {
      const res = await rawGET(rawRequest(source.id, '?mode=fixtures'), params(source.id));
      const type = res.headers.get('content-type') ?? '';
      expect(type).not.toContain('text/html');
      expect(type).not.toContain('svg');
      expect(type).not.toContain('xml');
    }
  });

  it('carries Cache-Control: no-store', async () => {
    const res = await rawGET(rawRequest(knownId, '?mode=fixtures'), params(knownId));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('marks fallback resolutions with X-Verity-Asset-Fallback and serves the markdown', async () => {
    const fallbackSource = fixture.sources.find((s) => s.storage_path === FALLBACK_PATH);
    expect(fallbackSource).toBeDefined();
    if (fallbackSource === undefined) return;
    const res = await rawGET(rawRequest(fallbackSource.id, '?mode=fixtures'), params(fallbackSource.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Verity-Asset-Fallback')).toBe('1');
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it('does not mark the exact-resolving source as a fallback', async () => {
    const exactSource = fixture.sources.find((s) => s.storage_path === EXACT_PATH);
    expect(exactSource).toBeDefined();
    if (exactSource === undefined) return;
    const res = await rawGET(rawRequest(exactSource.id, '?mode=fixtures'), params(exactSource.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Verity-Asset-Fallback')).toBeNull();
  });

  it('returns 404 for an unknown id, leaking no path', async () => {
    const res = await rawGET(rawRequest(UNKNOWN_ID, '?mode=fixtures'), params(UNKNOWN_ID));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('demo/');
    expect(body).not.toContain(process.cwd());
  });

  it.each([
    '../../../../etc/passwd',
    '../package.json',
    'demo/../../../etc/passwd',
    '..%2fpackage.json',
    '/etc/hosts',
  ])('a traversal-shaped id (%s) serves nothing and leaks no path', async (raw) => {
    const trickId = encodeURIComponent(raw);
    const res = await rawGET(rawRequest(trickId, '?mode=fixtures'), params(trickId));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('demo/');
    expect(body).not.toContain('etc/passwd');
    expect(body).not.toContain(process.cwd());
    // Nothing from outside the repo can have been read into the body.
    expect(body).not.toContain('root:');
    expect(body).not.toContain('"devDependencies"');
  });

  // Deliberate drift alarm, seed-plan style: pinned counts force a human
  // decision whenever fixture sources or demo assets change. As of 25 Jul:
  // 2 exact (05 care log, 06 checklist letter — both .md paths exist),
  // 4 fallback (01–04 point at rendered PDFs/JPG not yet produced — the
  // orchestrator's asset task). When those assets land, exact becomes 6
  // and fallback 0: update this pin then, and nothing else.
  it('fixture count: 2 exact, 4 fallback, none missing (pinned — see comment)', () => {
    let exact = 0;
    let fallback = 0;
    let missing = 0;
    for (const source of fixture.sources) {
      const asset = resolveLocalAsset(source.storage_path, process.cwd());
      if (asset.kind === 'exact') exact += 1;
      else if (asset.kind === 'fallback') fallback += 1;
      else missing += 1;
    }
    expect(missing).toBe(0);
    expect(exact).toBe(2);
    expect(fallback).toBe(fixture.sources.length - 2);
  });
});

describe('no credential leakage', () => {
  const sentinelUrl = 'http://127.0.0.1:1/sentinel-project-do-not-leak';
  const sentinelKey = 'sentinel-service-role-key-do-not-leak';

  async function assertClean(res: Response): Promise<void> {
    const body = await res.text();
    const headerBlob = JSON.stringify([...res.headers.entries()]);
    for (const haystack of [body, headerBlob]) {
      expect(haystack).not.toContain(sentinelKey);
      expect(haystack).not.toContain('sentinel-project-do-not-leak');
      // No absolute filesystem path in any response, ever.
      expect(haystack).not.toContain(process.cwd());
    }
  }

  it('no offline response body or header contains a Supabase key or URL sentinel', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', sentinelUrl);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', sentinelKey);
    try {
      const responses = await Promise.all([
        openGET(openRequest(knownId, '?mode=fixtures'), params(knownId)),
        openGET(openRequest(knownId, '?mode=replay'), params(knownId)),
        openGET(openRequest(UNKNOWN_ID, '?mode=fixtures'), params(UNKNOWN_ID)),
        rawGET(rawRequest(knownId, '?mode=fixtures'), params(knownId)),
        rawGET(rawRequest(UNKNOWN_ID, '?mode=fixtures'), params(UNKNOWN_ID)),
        rawGET(rawRequest(knownId, '?mode=live'), params(knownId)),
      ]);
      for (const res of responses) await assertClean(res);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('a failed live signing attempt leaks neither the key, the URL, nor the Supabase error', async () => {
    // The interesting path: the SDK is actually constructed and the signing
    // call actually fails. The thrown/returned Supabase error must not reach
    // the response in any form.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', sentinelUrl);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', sentinelKey);
    try {
      const res = await openGET(openRequest(knownId, '?mode=live&page=2'), params(knownId));
      expect(res.status).toBe(302);
      expect(res.headers.get('X-Verity-Mode-Degraded')).toBe('1');
      await assertClean(res);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('the service-role key is never read from a NEXT_PUBLIC_ variable', async () => {
    // If the key were read from a NEXT_PUBLIC_ name, Next would inline it into
    // the client bundle. Setting only the public-prefixed variant must leave
    // signing unconfigured, so /open degrades instead of signing.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', sentinelUrl);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', sentinelKey);
    try {
      const res = await openGET(openRequest(knownId, '?mode=live'), params(knownId));
      expect(res.status).toBe(302);
      expect(res.headers.get('X-Verity-Mode-Degraded')).toBe('1');
      await assertClean(res);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
