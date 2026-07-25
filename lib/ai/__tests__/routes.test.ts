import { describe, expect, it, vi } from 'vitest';
import { GET as inspectGET } from '@/app/api/debug/inspect/route';
import { POST as extractPOST } from '@/app/api/extract/route';
import { z } from 'zod';
import { CaseSnapshot, Claim } from '@/lib/contracts';
import { verifyClaim } from '@/lib/ai/verify';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

/** The contract /api/extract owes its callers. Parsed, not trusted. */
const ExtractResponse = z.object({
  mode: z.string(),
  drops: z.number().int(),
  reports: z.array(
    z.object({
      transcript: z.string(),
      claims: z.array(Claim),
      dropped: z.array(z.object({ reason: z.string(), count: z.number().int() })),
      stats: z.object({
        claims_extracted: z.number().int(),
        claims_dropped: z.number().int(),
      }),
      notice: z.string().nullable(),
    }),
  ),
});

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
 * Build a binary-safe multipart/form-data body. jsdom's `File`/`FormData`
 * implementation (the vitest test environment here is jsdom, for Testing
 * Library elsewhere in the suite) hangs forever when a `File` is attached to
 * a `FormData` and sent through a real `Request`/`request.formData()` round
 * trip. A hand-built body sidesteps that entirely, and — being a Uint8Array
 * rather than a string — never risks UTF-8 mangling non-ASCII bytes like a
 * PNG's 0x89 magic byte.
 */
function multipartBody(
  boundary: string,
  fields: { readonly name: string; readonly filename?: string; readonly contentType?: string; readonly data: string | Uint8Array<ArrayBuffer> }[],
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
  fields: { readonly name: string; readonly filename?: string; readonly contentType?: string; readonly data: string | Uint8Array<ArrayBuffer> }[],
): Request {
  const boundary = 'verity-test-boundary-0000000000';
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody(boundary, fields),
  });
}

/** POST a small PNG to /api/extract in the default (no-key, no-network) mode. */
function fixturesModeExtract(): Promise<Response> {
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  return extractPOST(
    multipartRequest('http://localhost/api/extract?mode=fixtures', [
      { name: 'file', filename: 'scan.png', contentType: 'image/png', data: pngHeader },
    ]),
  );
}

describe('GET /api/debug/inspect', () => {
  it('renders successfully with no query params and no API key', async () => {
    const res = await inspectGET(new Request('http://localhost/api/debug/inspect'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body.toLowerCase()).toContain('<!doctype html');
  });

  it('reports the fixture\'s real drop count in the drop counter', async () => {
    const res = await inspectGET(new Request('http://localhost/api/debug/inspect'));
    const body = await res.text();
    const expectedDropped = fixture.claims.filter((c) => !c.verified_substring).length;
    expect(expectedDropped).toBeGreaterThan(0);

    // Not `body.toContain("1")` — the page is full of 1s (ids, page numbers,
    // character counts). Read the number out of the drop counter itself.
    const counter = body.match(/>(\d+)<\/span>\s*<span class="summary-label">dropped/);
    expect(counter?.[1]).toBe(String(expectedDropped));

    const kept = body.match(/>(\d+)<\/span>\s*<span class="summary-label">verified/);
    expect(kept?.[1]).toBe(
      String(fixture.claims.filter((c) => c.verified_substring).length),
    );
  });

  it('never surfaces the fabricated quote as verified content', async () => {
    const fabricated = fixture.claims.find((c) => c.verified_substring === false);
    expect(fabricated).toBeDefined();
    if (fabricated === undefined) return;

    const res = await inspectGET(new Request('http://localhost/api/debug/inspect'));
    const body = await res.text();

    // The fabricated quote must not appear inside the "kept" (verified)
    // table at all — only, at most, inside the dropped section.
    const keptSectionMatch = body.match(
      /<h3 class="subheading">Kept[\s\S]*?(?=<div class="dropped-section">)/,
    );
    expect(keptSectionMatch).not.toBeNull();
    if (keptSectionMatch !== null) {
      expect(keptSectionMatch[0]).not.toContain(fabricated.quote);
    }
  });

  it('mode=live with no ANTHROPIC_API_KEY returns a readable HTML page mentioning the env var, not a throw', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    try {
      const res = await inspectGET(new Request('http://localhost/api/debug/inspect?mode=live'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const body = await res.text();
      expect(body).toContain('ANTHROPIC_API_KEY');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('POST /api/extract', () => {
  it('returns 400 with a JSON error when the file field is missing', async () => {
    const res = await extractPOST(
      multipartRequest('http://localhost/api/extract', [{ name: 'title', data: 'no file here' }]),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  it('returns 415 for an unsupported file type', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const res = await extractPOST(
      multipartRequest('http://localhost/api/extract', [
        { name: 'file', filename: 'note.bin', contentType: 'application/octet-stream', data: bytes },
      ]),
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('PDF');
  });

  it('MAX_UPLOAD_BYTES stays under Vercel’s 4.5MB request-body ceiling — a bigger limit means the platform 413s before our route runs', async () => {
    const { MAX_UPLOAD_BYTES } = await import('@/lib/ai/documents');
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('returns 413 for a payload over the byte limit', async () => {
    const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
    // PNG magic bytes so it would otherwise classify fine — the size check
    // must fire before classification.
    oversized[0] = 0x89;
    oversized[1] = 0x50;
    oversized[2] = 0x4e;
    oversized[3] = 0x47;
    const res = await extractPOST(
      multipartRequest('http://localhost/api/extract', [
        { name: 'file', filename: 'big.png', contentType: 'image/png', data: oversized },
      ]),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('4MB');
  });

  it('never contains a banned judgement key in fixtures-mode JSON output', async () => {
    const res = await fixturesModeExtract();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('fixtures');

    const keys = collectKeys(body);
    for (const key of keys) {
      expect(key).not.toMatch(BANNED_KEY);
    }
  });

  it('NEVER puts a fabricated quote in the response body — asserted on the endpoint', async () => {
    // The invariant, checked where it actually matters: not in the helper, but
    // in the bytes a client receives. The fixture's one unverified claim is a
    // quote that does not exist in its source; it must not appear anywhere in
    // this payload, in any field, at any depth.
    const fabricated = fixture.claims.find((c) => !c.verified_substring);
    expect(fabricated).toBeDefined();
    if (fabricated === undefined) return;

    const res = await fixturesModeExtract();
    const raw = await res.text();

    expect(raw).not.toContain(fabricated.quote);
    // Not even a fragment of it.
    expect(raw).not.toContain(fabricated.quote.slice(0, 24));

    const body: unknown = JSON.parse(raw);
    const parsed = ExtractResponse.parse(body);

    // Every quote that DID come back is verified and really is in its source.
    const bySource = new Map(fixture.sources.map((s) => [s.id, s]));
    let quotes = 0;
    for (const report of parsed.reports) {
      for (const claim of report.claims) {
        quotes += 1;
        expect(claim.verified_substring).toBe(true);
        const source = bySource.get(claim.source_id) ?? { transcript: report.transcript };
        expect(verifyClaim(claim, source)).toBe(true);
      }
    }
    expect(quotes).toBeGreaterThan(0);

    // The drop is counted, so the UI has a real number — it just isn't quoted.
    expect(parsed.drops).toBe(
      fixture.claims.filter((c) => !c.verified_substring).length,
    );
    const reasons = parsed.reports.flatMap((r) => r.dropped);
    expect(reasons).toEqual([{ reason: 'quote_not_in_source', count: 1 }]);
  });

  it('returns the same shape whether or not a network call happened', async () => {
    const res = await fixturesModeExtract();
    const parsed = ExtractResponse.parse(await res.json());
    expect(parsed.reports).toHaveLength(fixture.sources.length);
    for (const report of parsed.reports) {
      expect(report.stats.claims_extracted).toBe(
        report.claims.length + report.dropped.reduce((n, d) => n + d.count, 0),
      );
    }
  });
});

describe('no banned judgement keys in inspect output', () => {
  it('the inspect HTML never renders a banned key as a table header', async () => {
    const res = await inspectGET(new Request('http://localhost/api/debug/inspect'));
    const body = await res.text();
    // The rendered table headers are literal strings in inspect-html.ts;
    // assert none of them match the banned pattern.
    const headerMatches = [...body.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
    for (const header of headerMatches) {
      expect(header).not.toMatch(BANNED_KEY);
    }
  });
});
