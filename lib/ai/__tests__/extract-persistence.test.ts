import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Conflict, type Claim, type Source } from '@/lib/contracts';
import { reconcile } from '@/lib/ai/reconcile';
import type { ExtractionReport } from '@/lib/ai/extract';

// vi.mock factories are hoisted above every import in this file, including
// the static `import { POST }` below — so the mocked functions themselves
// must come from vi.hoisted(), which runs before that hoisting, or the
// factory closes over a `const` that hasn't been initialised yet. Same
// pattern as lib/voice/__tests__/route.test.ts.
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const { resolveMode } = vi.hoisted(() => ({ resolveMode: vi.fn() }));
vi.mock('@/lib/modes', () => ({ resolveMode }));

// `checkCareAccess` is a shared helper another lane owns the implementation
// of (`@/components/data/careAccess`) — mocked here against its frozen
// interface so this file never depends on its internals (cookies, RLS,
// `care_relationships`). Defaults to `granted` so every pre-existing test in
// this file keeps passing unmodified.
const { checkCareAccess } = vi.hoisted(() => ({ checkCareAccess: vi.fn() }));
vi.mock('@/components/data/careAccess', () => ({ checkCareAccess }));

// Only `extractSourceLive` is mocked (the model seam) — `extractFromFixtures`
// and `toWireReport` stay the REAL implementations via importOriginal, so
// the fixtures-mode assertions below exercise the same code path
// lib/ai/__tests__/routes.test.ts does, and this file never needs its own
// copy of fixtures/margaret.json's expected shape.
const { extractSourceLive } = vi.hoisted(() => ({ extractSourceLive: vi.fn() }));
vi.mock('@/lib/ai/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/extract')>();
  return { ...actual, extractSourceLive };
});

import { POST } from '@/app/api/extract/route';

const PERSON_ID = '11111111-1111-1111-1111-111111111111';

/** Insert payloads arrive from vi.fn() mock calls as `unknown` — parsed with
 *  Zod rather than cast (`as` is banned repo-wide; unknown + parse is the
 *  prescribed pattern). */
const InsertRows = z.array(z.record(z.string(), z.unknown()));

/** Narrow view of a `facts` insert row, just the field the conflict-linkage
 *  assertions below need — parsed rather than picked off the generic
 *  `InsertRows` shape so `conflict_id` is a typed `string | null`, not
 *  `unknown`. */
const FactConflictLinkRows = z.array(z.object({ conflict_id: z.string().uuid().nullable() }));

/* ============================ multipart helpers ============================
 * jsdom's File/FormData hangs when a File is attached to a FormData and sent
 * through a real Request/request.formData() round trip (documented in
 * lib/ai/__tests__/routes.test.ts and lib/voice/__tests__/route.test.ts) —
 * bodies are hand-built instead. */

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
  const boundary = 'verity-extract-persist-test-0000';
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody(boundary, fields),
  });
}

/** A tiny valid %PDF- header, padded — enough for classifyUpload's magic-byte sniff. */
function pdfBytes(): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');
  const out = new Uint8Array(32);
  out.set(header, 0);
  return out;
}

function fileField(bytes: Uint8Array<ArrayBuffer>) {
  return { name: 'file', filename: 'note.pdf', contentType: 'application/pdf', data: bytes };
}

/* ============================ canned report ============================ */

const TITLE = 'Care log entry';

/**
 * Two verified claims in two different ontology_key/subject groups (so
 * `reconcile` derives exactly two confirmed, undisputed facts — no
 * supersession, no conflict) plus one dropped claim, to prove the dropped
 * one never reaches an insert payload.
 *
 * A factory, not a fixed object: the route mints a fresh `source.id` per
 * request and passes it straight through to `extractSourceLive` — this
 * reproduces the real `partitionClaims` behaviour (every kept claim's
 * `source_id` equals the source it came from) without needing to intercept
 * `crypto.randomUUID`.
 */
function buildCannedReport(sourceId: string): ExtractionReport {
  const kept: Claim[] = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      source_id: sourceId,
      ontology_key: 'medication',
      subject: 'furosemide',
      value: '40mg daily',
      quote: 'Patient takes furosemide 40mg daily.',
      locator: { page: 1, char_start: 0, char_end: 37, ms_start: null, ms_end: null },
      asserted_at: null,
      date_precision: 'unknown',
      provenance: 'document_extracted',
      verified_substring: true,
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      source_id: sourceId,
      ontology_key: 'wellbeing',
      subject: 'mood',
      value: 'feeling better',
      quote: 'Patient reports feeling better today.',
      locator: { page: 1, char_start: 38, char_end: 76, ms_start: null, ms_end: null },
      asserted_at: null,
      date_precision: 'unknown',
      provenance: 'document_extracted',
      verified_substring: true,
    },
  ];

  return {
    source: { id: sourceId, title: TITLE, kind: 'pdf' },
    transcript: 'Patient takes furosemide 40mg daily. Patient reports feeling better today.',
    kept,
    dropped: [
      {
        claim: {
          ontology_key: 'medication',
          subject: 'a fabricated tablet',
          value: 'invented',
          quote: 'THIS QUOTE WAS NEVER IN THE DOCUMENT',
          page: null,
          asserted_at: null,
          date_precision: 'unknown',
        },
        reason: 'quote_not_in_source',
      },
    ],
    stats: { claims_extracted: 3, claims_dropped: 1 },
    usage: null,
    mode: 'live',
    retried: false,
    degraded: false,
    notice: null,
  };
}

/** The one-entry source map the reconcile helpers below need — the Map's
 *  type arguments come from `reconcile`'s own `sourcesById` parameter shape,
 *  so `'pdf'` narrows to `SourceKind` contextually, no cast. */
function sourceMapFor(sourceId: string): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  return new Map<string, Pick<Source, 'kind' | 'title'>>([
    [sourceId, { kind: 'pdf', title: TITLE }],
  ]);
}

/** Facts `reconcile` derives from the canned report's kept claims, for one
 *  source — computed the same way the route computes them, so a count
 *  assertion never hardcodes a number that could drift from the real logic. */
function expectedFactsFor(sourceId: string): number {
  const { kept } = buildCannedReport(sourceId);
  return reconcile(kept, PERSON_ID, { sourcesById: sourceMapFor(sourceId) }).facts.length;
}

/**
 * A report whose two kept claims are engineered to reconcile into exactly
 * one `Conflict`: same ontology_key/subject group ("medication"/"furosemide"),
 * one asserting the drug stopped (`lib/ai/conflict.ts`'s STOPPED_STEMS
 * matches "stopped"), the other asserting it continues (CONTINUING_STEMS
 * matches "Continues"/"taking"). `reconcile` runs for REAL in this file (only
 * `extractSourceLive` is mocked), so this exercises the actual detection
 * vocabulary rather than a stubbed conflict.
 *
 * `asserted_at: null` on both claims is deliberate: `buildFacts`
 * (`lib/ai/facts.ts`) can only open a validity period from a claim with a
 * concrete date, so with no date on either claim no period opens and
 * `applySupersession` has nothing to close — the conflict this test crafts
 * cannot be silently swallowed by supersession before `detectConflicts` ever
 * sees it.
 */
function buildConflictingReport(sourceId: string): ExtractionReport {
  const kept: Claim[] = [
    {
      id: '30000000-0000-0000-0000-000000000001',
      source_id: sourceId,
      ontology_key: 'medication',
      subject: 'furosemide',
      value: 'Furosemide 40mg stopped',
      quote: 'Furosemide 40mg stopped on discharge.',
      locator: { page: 1, char_start: 0, char_end: 38, ms_start: null, ms_end: null },
      asserted_at: null,
      date_precision: 'unknown',
      provenance: 'document_extracted',
      verified_substring: true,
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      source_id: sourceId,
      ontology_key: 'medication',
      subject: 'furosemide',
      value: 'Continues taking furosemide 40mg daily',
      quote: 'Continues taking furosemide 40mg daily per GP.',
      locator: { page: 1, char_start: 39, char_end: 87, ms_start: null, ms_end: null },
      asserted_at: null,
      date_precision: 'unknown',
      provenance: 'document_extracted',
      verified_substring: true,
    },
  ];

  return {
    source: { id: sourceId, title: TITLE, kind: 'pdf' },
    transcript:
      'Furosemide 40mg stopped on discharge. Continues taking furosemide 40mg daily per GP.',
    kept,
    dropped: [],
    stats: { claims_extracted: 2, claims_dropped: 0 },
    usage: null,
    mode: 'live',
    retried: false,
    degraded: false,
    notice: null,
  };
}

/** The real `reconcile` result for `buildConflictingReport`'s claims, for a
 *  given source id — computed rather than hardcoded so the test can assert
 *  against the actual detector's output. */
function reconcileConflictingReport(sourceId: string) {
  const { kept } = buildConflictingReport(sourceId);
  return reconcile(kept, PERSON_ID, { sourcesById: sourceMapFor(sourceId) });
}

/* ============================ live client mock ============================ */

interface LiveClientOpts {
  readonly uploadResult?: { data: unknown; error: unknown };
  readonly sourceInsertResult?: { data: unknown; error: unknown };
  readonly claimsInsertResult?: { error: unknown };
  readonly conflictsUpsertResult?: { error: unknown };
  readonly factsInsertResult?: { error: unknown };
}

/**
 * Wire `createClient` to a fully-mocked live Supabase client. Mirrors
 * lib/voice/__tests__/route.test.ts's installLiveClient, extended for the
 * extra tables this route writes.
 *
 * The `sources` insert defaults to ECHOING the payload back (as `.select()`
 * would from a real insert) rather than a fixed row, because the route mints
 * a fresh source id per call — a fixed canned row would not match it.
 */
function installLiveClient(opts?: LiveClientOpts) {
  const uploadResult = opts?.uploadResult ?? { data: { path: 'ok' }, error: null };

  const upload = vi.fn().mockResolvedValue(uploadResult);
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove });

  const sourcesInsert = vi.fn((payload: Record<string, unknown>) => ({
    select: () => ({
      single: () =>
        Promise.resolve(
          opts?.sourceInsertResult ??
            { data: { ...payload, created_at: '2026-07-25T00:00:00.000Z' }, error: null },
        ),
    }),
  }));

  const claimsInsert = vi.fn().mockResolvedValue(opts?.claimsInsertResult ?? { error: null });
  const factsInsert = vi.fn().mockResolvedValue(opts?.factsInsertResult ?? { error: null });
  const conflictsUpsert = vi.fn().mockResolvedValue(opts?.conflictsUpsertResult ?? { error: null });

  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq });

  const conflictsIn = vi.fn().mockResolvedValue({ error: null });
  const conflictsDel = vi.fn().mockReturnValue({ in: conflictsIn });

  const dbFrom = vi.fn((table: string) => {
    if (table === 'sources') return { insert: sourcesInsert, delete: del };
    if (table === 'claims') return { insert: claimsInsert };
    if (table === 'facts') return { insert: factsInsert };
    if (table === 'claim_conflicts') return { upsert: conflictsUpsert, delete: conflictsDel };
    throw new Error(`installLiveClient: unexpected table "${table}"`);
  });

  createClient.mockReturnValue({ storage: { from: storageFrom }, from: dbFrom });

  return {
    upload,
    remove,
    storageFrom,
    sourcesInsert,
    claimsInsert,
    factsInsert,
    conflictsUpsert,
    conflictsDel,
    conflictsIn,
    del,
    eq,
    dbFrom,
  };
}

/** Pull the minted source id back out of whatever the sources insert was
 *  called with — the one place the route's fresh `randomUUID()` becomes
 *  observable from outside. */
function capturedSourceId(sourcesInsert: ReturnType<typeof vi.fn>): string {
  const parsed = z.object({ id: z.string() }).safeParse(sourcesInsert.mock.calls[0]?.[0]);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error('sources insert payload had no string id');
  return parsed.data.id;
}

describe('POST /api/extract — live persistence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createClient.mockReset();
    resolveMode.mockReset();
    extractSourceLive.mockReset();
    extractSourceLive.mockImplementation(async (source: { id: string }) =>
      buildCannedReport(source.id),
    );
    checkCareAccess.mockReset();
    checkCareAccess.mockResolvedValue({ kind: 'granted', memberId: '99999999-9999-9999-9999-999999999999' });
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fixtures mode: createClient is never called and the response carries no persisted key at all', async () => {
    resolveMode.mockReturnValue('fixtures');

    const res = await POST(
      multipartRequest('http://localhost/api/extract', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('fixtures');
    expect(Object.keys(body).sort()).toEqual(['drops', 'mode', 'note', 'reports'].sort());
    expect(body.persisted).toBeUndefined();
    expect(body.persist_notice).toBeUndefined();

    expect(createClient).not.toHaveBeenCalled();
    expect(extractSourceLive).not.toHaveBeenCalled();
    // Mode parity for the access check too: fixtures/replay demands no
    // session, so the care-access seam must not even be consulted.
    expect(checkCareAccess).not.toHaveBeenCalled();
  });

  it('live happy path: uploads to "documents", inserts sources/claims/facts, and returns the additive persisted field', async () => {
    resolveMode.mockReturnValue('live');
    const { upload, storageFrom, sourcesInsert, claimsInsert, factsInsert, conflictsUpsert } =
      installLiveClient();

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('live');
    expect(body.persist_notice).toBeUndefined();

    const sourceId = capturedSourceId(sourcesInsert);

    expect(storageFrom).toHaveBeenCalledWith('documents');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^sources/${sourceId}\\.pdf$`)),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'application/pdf' }),
    );

    expect(sourcesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sourceId,
        person_id: PERSON_ID,
        kind: 'pdf',
        title: 'note.pdf',
        storage_path: `sources/${sourceId}.pdf`,
        transcript: 'Patient takes furosemide 40mg daily. Patient reports feeling better today.',
        transcript_confidence: 1,
        author_member_id: null,
      }),
    );

    // Order is load-bearing: blob -> sources -> claims -> facts. A swapped
    // insert order (claims before its source row exists, facts before claims)
    // would violate the FKs in production; assert it here where the mock can't.
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(sourcesInsert.mock.invocationCallOrder[0]);
    expect(sourcesInsert.mock.invocationCallOrder[0]).toBeLessThan(claimsInsert.mock.invocationCallOrder[0]);
    expect(claimsInsert.mock.invocationCallOrder[0]).toBeLessThan(factsInsert.mock.invocationCallOrder[0]);

    // Claims are one batched insert (self-referential fact FKs need the same),
    // not one call per claim.
    expect(claimsInsert).toHaveBeenCalledTimes(1);
    expect(factsInsert).toHaveBeenCalledTimes(1);

    const claimsPayload = InsertRows.parse(claimsInsert.mock.calls[0]?.[0]);
    // Exactly the two kept claims — never more (a resurrected dropped claim) or
    // fewer. Length equals report.kept.length, asserted concretely.
    expect(claimsPayload).toHaveLength(2);
    for (const row of claimsPayload) {
      expect(row.person_id).toBe(PERSON_ID);
      expect(row.source_id).toBe(sourceId);
      expect(row.verified_substring).toBe(true);
    }
    // The dropped claim's fabricated quote never reaches the insert payload.
    expect(JSON.stringify(claimsPayload)).not.toContain('THIS QUOTE WAS NEVER IN THE DOCUMENT');

    const expectedFacts = expectedFactsFor(sourceId);
    const factsPayload = InsertRows.parse(factsInsert.mock.calls[0]?.[0]);
    expect(factsPayload).toHaveLength(expectedFacts);

    // The canned report's two kept claims are in different ontology_key/
    // subject groups (medication/furosemide vs wellbeing/mood) — no
    // conflict is possible, so this is also the zero-conflict case.
    expect(conflictsUpsert).not.toHaveBeenCalled();

    expect(body.persisted).toEqual({
      source_id: sourceId,
      claims: 2,
      facts: expectedFacts,
      conflicts: 0,
    });
  });

  it('conflict persistence: detected conflicts are upserted before facts, and facts cite them via conflict_id', async () => {
    resolveMode.mockReturnValue('live');
    extractSourceLive.mockImplementation(async (source: { id: string }) =>
      buildConflictingReport(source.id),
    );
    const { claimsInsert, factsInsert, conflictsUpsert, sourcesInsert } = installLiveClient();

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    const sourceId = capturedSourceId(sourcesInsert);
    const expected = reconcileConflictingReport(sourceId);
    // Sanity on the fixture itself: the crafted claims must actually produce
    // a conflict, or the rest of this test would be vacuously true.
    expect(expected.conflicts.length).toBeGreaterThan(0);

    // Order is load-bearing: claims -> claim_conflicts -> facts, since a
    // fact's conflict_id points at a conflict row.
    expect(claimsInsert.mock.invocationCallOrder[0]).toBeLessThan(
      conflictsUpsert.mock.invocationCallOrder[0],
    );
    expect(conflictsUpsert.mock.invocationCallOrder[0]).toBeLessThan(
      factsInsert.mock.invocationCallOrder[0],
    );

    expect(conflictsUpsert).toHaveBeenCalledTimes(1);
    const conflictsCall = conflictsUpsert.mock.calls[0];
    expect(conflictsCall?.[1]).toEqual({ onConflict: 'id' });

    // Zod-validated against the real Conflict contract, not cast.
    const conflictsPayload = z.array(Conflict).parse(conflictsCall?.[0]);
    expect(conflictsPayload).toHaveLength(expected.conflicts.length);
    // NOTE: `conflict.id` is minted fresh by `randomUUID()` inside
    // `detectConflicts` on every call — `expected` above comes from a SEPARATE
    // `reconcile` call than the one the route itself made, so its ids will
    // never match the route's. What IS deterministic across both calls is
    // which claim ids each conflict names (`buildConflictingReport`'s two
    // claim ids are fixed literals), so that — not the conflict id — is what
    // ties this payload back to the fixture.
    const { kept } = buildConflictingReport(sourceId);
    const expectedClaimIds = kept.map((c) => c.id).sort();
    const upsertedIds = new Set(conflictsPayload.map((c) => c.id));
    for (const row of conflictsPayload) {
      expect(row.person_id).toBe(PERSON_ID);
      expect(row.ontology_key).toBe('medication');
      expect(row.subject).toBe('furosemide');
      expect([...row.claim_ids].sort()).toEqual(expectedClaimIds);
      expect(row.resolution).toBe('unresolved');
    }

    const factsPayload = FactConflictLinkRows.parse(factsInsert.mock.calls[0]?.[0]);
    const factsWithConflict = factsPayload.filter(
      (f): f is { conflict_id: string } => f.conflict_id !== null,
    );
    expect(factsWithConflict.length).toBeGreaterThan(0);
    for (const fact of factsWithConflict) {
      expect(upsertedIds.has(fact.conflict_id)).toBe(true);
    }

    expect(body.persisted).toEqual({
      source_id: sourceId,
      claims: 2,
      facts: expected.facts.length,
      conflicts: expected.conflicts.length,
    });
  });

  it('facts insert failure with a detected conflict: the claim_conflicts rows just written are deleted by id, alongside the existing source/blob cleanup', async () => {
    resolveMode.mockReturnValue('live');
    extractSourceLive.mockImplementation(async (source: { id: string }) =>
      buildConflictingReport(source.id),
    );
    const { sourcesInsert, conflictsUpsert, conflictsIn, del, eq, remove } = installLiveClient({
      factsInsertResult: { error: { message: 'facts insert violated a constraint' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');

    expect(conflictsUpsert).toHaveBeenCalled();
    const insertedIds = z
      .array(Conflict)
      .parse(conflictsUpsert.mock.calls[0]?.[0])
      .map((c) => c.id);
    expect(insertedIds.length).toBeGreaterThan(0);

    // The orphan cleanup this test exists to prove: claim_conflicts does not
    // cascade off sources (it references people), so it needs its own delete.
    expect(conflictsIn).toHaveBeenCalledWith('id', insertedIds);

    // Existing cleanup still happens alongside it.
    const sourceId = capturedSourceId(sourcesInsert);
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', sourceId);
    expect(remove).toHaveBeenCalled();
  });

  it('claim_conflicts upsert failure: source row + orphan blob are cleaned up, no facts are written, and the response is a 200 honest degrade', async () => {
    resolveMode.mockReturnValue('live');
    extractSourceLive.mockImplementation(async (source: { id: string }) =>
      buildConflictingReport(source.id),
    );
    const { sourcesInsert, conflictsUpsert, conflictsIn, factsInsert, del, eq, remove } =
      installLiveClient({
        conflictsUpsertResult: { error: { message: 'claim_conflicts upsert violated a constraint' } },
      });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    // Honest degrade: the caller still gets its extraction report, but nothing
    // was stored and the notice says so.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');
    expect(body.persist_notice).toContain('was not stored');

    expect(conflictsUpsert).toHaveBeenCalled();

    // The upsert failed, so NOTHING was inserted into claim_conflicts — there
    // is nothing to delete by id, and the facts insert must never run.
    expect(conflictsIn).not.toHaveBeenCalled();
    expect(factsInsert).not.toHaveBeenCalled();

    // The source row (cascading to its claims) and the orphan blob ARE torn
    // down — the cleanup this failure path is responsible for.
    const sourceId = capturedSourceId(sourcesInsert);
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', sourceId);
    expect(remove).toHaveBeenCalled();
  });

  it('live mode: no session -> 401 exact body, and no model spend / no storage client at all', async () => {
    resolveMode.mockReturnValue('live');
    checkCareAccess.mockResolvedValue({ kind: 'no_session' });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Sign-in required. Nothing was saved.' });
    expect(extractSourceLive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: no access to this care record -> 403 exact body, and no model spend', async () => {
    resolveMode.mockReturnValue('live');
    checkCareAccess.mockResolvedValue({ kind: 'no_access' });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: 'This account does not have access to this care record. Nothing was saved.',
    });
    expect(extractSourceLive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: access checks unconfigured -> 500 exact body, and no model spend', async () => {
    resolveMode.mockReturnValue('live');
    checkCareAccess.mockResolvedValue({ kind: 'unconfigured' });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Access checks are not configured. Nothing was saved.' });
    expect(extractSourceLive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: missing person_id -> 400, and the model seam is never called', async () => {
    resolveMode.mockReturnValue('live');

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [fileField(pdfBytes())]),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(extractSourceLive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('live mode: an invalid (non-UUID) person_id also -> 400 before the model seam runs', async () => {
    resolveMode.mockReturnValue('live');

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: 'not-a-uuid' },
      ]),
    );

    expect(res.status).toBe(400);
    expect(extractSourceLive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('storage upload failure: 200 with the extraction report, persisted null, an honest notice, and no table inserts', async () => {
    resolveMode.mockReturnValue('live');
    const { sourcesInsert, claimsInsert, factsInsert } = installLiveClient({
      uploadResult: { data: null, error: { message: 'bucket unavailable' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('live');
    expect(body.reports).toHaveLength(1);
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');
    expect(body.persist_notice).toContain('was not stored');

    expect(sourcesInsert).not.toHaveBeenCalled();
    expect(claimsInsert).not.toHaveBeenCalled();
    expect(factsInsert).not.toHaveBeenCalled();
  });

  it('sources insert failure: the orphan blob is removed, no claims/facts are written, and the response is a 200 honest degrade', async () => {
    resolveMode.mockReturnValue('live');
    const { upload, remove, sourcesInsert, claimsInsert, factsInsert } = installLiveClient({
      sourceInsertResult: { data: null, error: { message: 'sources insert violated a constraint' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');
    expect(body.persist_notice).toContain('was not stored');

    // The blob was uploaded before the row insert failed, so it must be
    // removed — the one place orphan-blob cleanup runs. Removed at exactly the
    // path it was uploaded to.
    const uploadedPath = z.string().parse(upload.mock.calls[0]?.[0]);
    expect(sourcesInsert).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([uploadedPath]);
    // Nothing downstream of the failed source row runs.
    expect(claimsInsert).not.toHaveBeenCalled();
    expect(factsInsert).not.toHaveBeenCalled();
  });

  it('claims insert failure: the source row is cleaned up, and the response is a 200 honest degrade', async () => {
    resolveMode.mockReturnValue('live');
    const { sourcesInsert, factsInsert, del, eq } = installLiveClient({
      claimsInsertResult: { error: { message: 'claims insert violated a constraint' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');
    expect(body.persist_notice).toContain('was not stored');

    const sourceId = capturedSourceId(sourcesInsert);
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', sourceId);
    expect(factsInsert).not.toHaveBeenCalled();
  });

  it('facts insert failure: the source row is cleaned up too, and the response is a 200 honest degrade', async () => {
    resolveMode.mockReturnValue('live');
    const { sourcesInsert, del, eq } = installLiveClient({
      factsInsertResult: { error: { message: 'facts insert violated a constraint' } },
    });

    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBeNull();
    expect(typeof body.persist_notice).toBe('string');

    const sourceId = capturedSourceId(sourcesInsert);
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', sourceId);
  });

  it('live mode: an over-long caller title is trimmed and capped before it reaches the sources row', async () => {
    resolveMode.mockReturnValue('live');
    const { sourcesInsert } = installLiveClient();

    const longTitle = `   ${'x'.repeat(500)}   `;
    const res = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'title', data: longTitle },
        { name: 'person_id', data: PERSON_ID },
      ]),
    );

    expect(res.status).toBe(200);
    const payload = z.object({ title: z.string() }).safeParse(sourcesInsert.mock.calls[0]?.[0]);
    expect(payload.success).toBe(true);
    if (!payload.success) throw new Error('sources insert payload had no string title');
    const storedTitle = payload.data.title;
    expect(storedTitle.length).toBe(200);
    expect(storedTitle).toBe('x'.repeat(200)); // trimmed of surrounding whitespace, then capped
  });

  it('mode parity: fixtures/replay response shape is untouched, and live only ever ADDS the two known optional keys', async () => {
    resolveMode.mockReturnValue('fixtures');
    const fixturesRes = await POST(
      multipartRequest('http://localhost/api/extract', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    const fixturesBody = await fixturesRes.json();

    resolveMode.mockReturnValue('live');
    installLiveClient();
    const liveRes = await POST(
      multipartRequest('http://localhost/api/extract?mode=live', [
        fileField(pdfBytes()),
        { name: 'person_id', data: PERSON_ID },
      ]),
    );
    const liveBody = await liveRes.json();

    const fixturesKeys = new Set(Object.keys(fixturesBody));
    const liveKeys = new Set(Object.keys(liveBody));
    const ADDITIVE_LIVE_ONLY_KEYS = new Set(['persisted', 'persist_notice']);

    // Every key live has beyond fixtures must be one of the two documented
    // additive fields — a future mode-dependent rename or new field fails
    // this loudly instead of silently branching client code on mode.
    for (const key of liveKeys) {
      if (!fixturesKeys.has(key)) {
        expect(ADDITIVE_LIVE_ONLY_KEYS.has(key)).toBe(true);
      }
    }
    // Every fixtures key besides its own informational 'note' (which live
    // never had and never gains) must still exist in live.
    for (const key of fixturesKeys) {
      if (key === 'note') continue;
      expect(liveKeys.has(key)).toBe(true);
    }

    expect(fixturesKeys.has('persisted')).toBe(false);
    expect(fixturesKeys.has('persist_notice')).toBe(false);

    // Top-level parity is not enough: a caller reads `reports[]` without
    // branching on mode, so the report ELEMENT shape must match too. Both modes
    // funnel through the real `toWireReport`, so their keys must be identical —
    // a divergence here (a live-only report field) would silently break a
    // consumer that trusted the fixtures shape.
    expect(Object.keys(liveBody.reports[0]).sort()).toEqual(
      Object.keys(fixturesBody.reports[0]).sort(),
    );
  });
});
