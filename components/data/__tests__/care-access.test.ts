import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above every import in this file, including
// the static imports below — so the mocked functions must come from
// vi.hoisted(), which runs before that hoisting (see
// lib/voice/__tests__/route.test.ts for the pattern this follows).
const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient }));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies }));

import { checkCareAccess, getSessionUserId } from '@/components/data/careAccess';

const PERSON_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

type QueryResult = { data: { id: string }[] | null; error: { message: string } | null };

function mockQueryChain(result: QueryResult) {
  const limit = vi.fn().mockResolvedValue(result);
  const is = vi.fn().mockReturnValue({ limit });
  const not = vi.fn().mockReturnValue({ is });
  const eq2 = vi.fn().mockReturnValue({ not });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  createClient.mockReturnValue({ from });
  return { from, select, eq1, eq2, not, is, limit };
}

function mockAuthUser(user: { id: string } | null, error: { message: string } | null = null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error });
  createServerClient.mockReturnValue({ auth: { getUser } });
  return { getUser };
}

describe('checkCareAccess / getSessionUserId', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createServerClient.mockReset();
    createClient.mockReset();
    cookies.mockReset();
    cookies.mockResolvedValue({ getAll: () => [] });
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('checkCareAccess: missing anon env -> unconfigured, without touching cookies/clients', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await checkCareAccess(PERSON_ID);
    expect(result).toEqual({ kind: 'unconfigured' });
    expect(cookies).not.toHaveBeenCalled();
  });

  it('checkCareAccess: missing service-role env -> unconfigured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mockAuthUser({ id: MEMBER_ID });
    const result = await checkCareAccess(PERSON_ID);
    expect(result).toEqual({ kind: 'unconfigured' });
  });

  it('checkCareAccess: getUser error -> no_session', async () => {
    mockAuthUser(null, { message: 'invalid token' });
    const result = await checkCareAccess(PERSON_ID);
    expect(result).toEqual({ kind: 'no_session' });
  });

  it('checkCareAccess: no user -> no_session', async () => {
    mockAuthUser(null);
    const result = await checkCareAccess(PERSON_ID);
    expect(result).toEqual({ kind: 'no_session' });
  });

  it('checkCareAccess: relationship row found -> granted with memberId', async () => {
    mockAuthUser({ id: MEMBER_ID });
    const { from, select, eq1 } = mockQueryChain({ data: [{ id: 'rel-1' }], error: null });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'granted', memberId: MEMBER_ID });
    expect(from).toHaveBeenCalledWith('care_relationships');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq1).toHaveBeenCalledWith('person_id', PERSON_ID);
  });

  it('checkCareAccess: no matching row -> no_access', async () => {
    mockAuthUser({ id: MEMBER_ID });
    mockQueryChain({ data: [], error: null });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'no_access' });
  });

  it('checkCareAccess: query error -> no_access (fail closed)', async () => {
    mockAuthUser({ id: MEMBER_ID });
    mockQueryChain({ data: null, error: { message: 'db unreachable' } });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'no_access' });
  });

  it('checkCareAccess: null data with no error -> no_access (fail closed, no throw)', async () => {
    mockAuthUser({ id: MEMBER_ID });
    // A malformed-but-non-error response must deny, not throw on `.length`.
    mockQueryChain({ data: null, error: null });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'no_access' });
  });

  it('checkCareAccess: query throws (rejects) -> no_access (fail closed)', async () => {
    mockAuthUser({ id: MEMBER_ID });
    const limit = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const is = vi.fn().mockReturnValue({ limit });
    const not = vi.fn().mockReturnValue({ is });
    const eq2 = vi.fn().mockReturnValue({ not });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    createClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'no_access' });
  });

  it('checkCareAccess: getUser throws (rejects) -> no_session (fail closed)', async () => {
    createServerClient.mockReturnValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error('network down')) },
    });

    const result = await checkCareAccess(PERSON_ID);

    expect(result).toEqual({ kind: 'no_session' });
  });

  it('getSessionUserId: no session -> null', async () => {
    mockAuthUser(null);
    const result = await getSessionUserId();
    expect(result).toBeNull();
  });

  it('getSessionUserId: with session -> the user id', async () => {
    mockAuthUser({ id: MEMBER_ID });
    const result = await getSessionUserId();
    expect(result).toBe(MEMBER_ID);
  });

  it('getSessionUserId: missing env -> null', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const result = await getSessionUserId();
    expect(result).toBeNull();
    expect(cookies).not.toHaveBeenCalled();
  });
});
