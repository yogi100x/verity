/**
 * Exercises the actual route handlers end to end, but with supabase-js
 * mocked out — these assert the 503/403 JSON shapes and, crucially, that
 * a client is never constructed on the missing-env path. No real network,
 * no real database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({ createClient }));

// vi.mock factories are hoisted above every import in this file, so the
// mock function must come from vi.hoisted() (see
// components/data/__tests__/care-access.test.ts).
const { getSessionUserId } = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock('@/components/data/careAccess', () => ({ getSessionUserId }));

describe('demo routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createClient.mockReset();
    getSessionUserId.mockReset();
    // Default: no current session — every existing test below keeps
    // resolving the carer id from env/derived exactly as before.
    getSessionUserId.mockResolvedValue(null);
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reset: 503 with named missing vars, and never touches a client', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env = { ...process.env, NODE_ENV: 'test' };

    const { GET } = await import('../../reset/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.missing).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']),
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it('seed: 503 with named missing vars, and never touches a client', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env = { ...process.env, NODE_ENV: 'test' };

    const { GET } = await import('../../seed/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('revoke: 503 with named missing vars, and never touches a client', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env = { ...process.env, NODE_ENV: 'test' };

    const { GET } = await import('../../revoke/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('refuses in production without DEMO_ROUTES_ENABLED, before ever checking env', async () => {
    delete process.env.DEMO_ROUTES_ENABLED;
    // Leave SUPABASE vars unset too — if this were mis-ordered we'd see 503, not 403.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env = { ...process.env, NODE_ENV: 'production' };

    const { GET } = await import('../../reset/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('503 names a malformed DEMO_CARER_MEMBER_ID without echoing it', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
      DEMO_CARER_MEMBER_ID: 'sarah',
    };

    const { GET } = await import('../../seed/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.invalid).toEqual(['DEMO_CARER_MEMBER_ID']);
    expect(JSON.stringify(body)).not.toContain('super-secret-service-key');
    expect(JSON.stringify(body)).not.toContain('"sarah"');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('a database failure surfaces the message only — never the failing row or the key', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
    };
    delete process.env.DEMO_CARER_MEMBER_ID;

    createClient.mockReturnValue({
      from: () => ({
        upsert: () =>
          Promise.resolve({
            error: {
              message: 'column "audience" of relation "artifact_templates" does not exist',
              // PostgREST puts the whole offending row in `details`. If the
              // handler ever forwarded it, fixture content would leak.
              details: 'Failing row contains (Margaret Ellis, furosemide 40mg once daily).',
              hint: 'Perhaps you meant to reference the column "audience_key".',
            },
          }),
      }),
    });

    const { GET } = await import('../../seed/route');
    const res = await GET();
    const body = await res.json();
    const serialised = JSON.stringify(body);

    expect(res.status).toBe(502);
    expect(body.error).toContain('does not exist');
    expect(serialised).not.toContain('Failing row contains');
    expect(serialised).not.toContain('Margaret Ellis');
    expect(serialised).not.toContain('furosemide');
    expect(serialised).not.toContain('Perhaps you meant');
    expect(serialised).not.toContain('super-secret-service-key');
  });

  it('allows in production once DEMO_ROUTES_ENABLED=1 is set (then falls through to the env check)', async () => {
    process.env.DEMO_ROUTES_ENABLED = '1';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env = { ...process.env, NODE_ENV: 'production' };

    const { GET } = await import('../../reset/route');
    const res = await GET();

    expect(res.status).toBe(503); // guard passed; env check is what fails now
    expect(createClient).not.toHaveBeenCalled();
  });

  describe('carer member id precedence: session uid > env override > derived default', () => {
    function stubClient(): Array<{ table: string; rows: unknown }> {
      const calls: Array<{ table: string; rows: unknown }> = [];
      // `delete()` returns a thenable query builder — resetPlan/deletePlan
      // issue deletes ahead of the upserts this suite actually asserts on.
      const deleteQuery = {
        eq: () => deleteQuery,
        in: () => deleteQuery,
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      createClient.mockReturnValue({
        from: (table: string) => ({
          upsert: (rows: unknown) => {
            calls.push({ table, rows });
            return Promise.resolve({ error: null });
          },
          delete: () => deleteQuery,
        }),
      });
      return calls;
    }

    it('seed: uses the current session uid as the carer member id when a session is held', async () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
        DEMO_CARER_MEMBER_ID: '77777777-7777-4777-8777-777777777777',
      };
      getSessionUserId.mockResolvedValue('99999999-9999-4999-8999-999999999999');
      const calls = stubClient();

      const { GET } = await import('../../seed/route');
      const res = await GET();
      expect(res.status).toBe(200);

      const careRel = calls.find((c) => c.table === 'care_relationships');
      expect(careRel?.rows).toEqual([
        expect.objectContaining({ member_id: '99999999-9999-4999-8999-999999999999' }),
      ]);
    });

    it('seed: falls back to DEMO_CARER_MEMBER_ID when there is no current session', async () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
        DEMO_CARER_MEMBER_ID: '77777777-7777-4777-8777-777777777777',
      };
      getSessionUserId.mockResolvedValue(null);
      const calls = stubClient();

      const { GET } = await import('../../seed/route');
      const res = await GET();
      expect(res.status).toBe(200);

      const careRel = calls.find((c) => c.table === 'care_relationships');
      expect(careRel?.rows).toEqual([
        expect.objectContaining({ member_id: '77777777-7777-4777-8777-777777777777' }),
      ]);
    });

    it('reset: falls back to the derived default when there is no session and no env override', async () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
      };
      delete process.env.DEMO_CARER_MEMBER_ID;
      getSessionUserId.mockResolvedValue(null);
      const calls = stubClient();

      const { GET } = await import('../../reset/route');
      const res = await GET();
      expect(res.status).toBe(200);

      const careRel = calls.find((c) => c.table === 'care_relationships');
      // Not the session uid and not the (unset) env value — the
      // deterministic uuid demoCarer() derives on its own. Asserted via
      // stringMatching rather than an `as` cast off the `unknown` rows.
      expect(careRel?.rows).toEqual([
        expect.objectContaining({
          member_id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          ),
        }),
      ]);
    });

    it('a getSessionUserId() rejection (no request scope) is treated as no session, not a route failure', async () => {
      process.env = {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key',
        DEMO_CARER_MEMBER_ID: '77777777-7777-4777-8777-777777777777',
      };
      getSessionUserId.mockRejectedValue(
        new Error('`cookies` was called outside a request scope'),
      );
      const calls = stubClient();

      const { GET } = await import('../../seed/route');
      const res = await GET();
      expect(res.status).toBe(200);

      const careRel = calls.find((c) => c.table === 'care_relationships');
      expect(careRel?.rows).toEqual([
        expect.objectContaining({ member_id: '77777777-7777-4777-8777-777777777777' }),
      ]);
    });
  });
});
