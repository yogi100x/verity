import { describe, expect, it } from 'vitest';
import { checkEnv, isDemoRoutesAllowed } from '../dal';

describe('checkEnv', () => {
  it('reports every missing SUPABASE var by name when both are absent', () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.missing).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']),
    );
  });

  it('reports only the one missing var when the other is present', () => {
    const result = checkEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
  });

  it('is ok when both vars are present', () => {
    const result = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(result).toEqual({
      ok: true,
      url: 'https://example.supabase.co',
      serviceRoleKey: 'secret',
    });
  });

  it('reads the service role key from a server-only var, never a NEXT_PUBLIC_ one', () => {
    const result = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'leaked-to-every-browser',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.missing).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('accepts an absent DEMO_CARER_MEMBER_ID — the carer id is derived by default', () => {
    const result = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.carerMemberId).toBeUndefined();
  });

  it('passes a valid DEMO_CARER_MEMBER_ID through', () => {
    const result = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      DEMO_CARER_MEMBER_ID: '11111111-2222-4333-8444-555555555555',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.carerMemberId).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('rejects a malformed DEMO_CARER_MEMBER_ID by NAME, never echoing the value', () => {
    const result = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      DEMO_CARER_MEMBER_ID: 'not-a-uuid',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.invalid).toEqual(['DEMO_CARER_MEMBER_ID']);
    expect(JSON.stringify(result)).not.toContain('not-a-uuid');
  });
});

describe('isDemoRoutesAllowed', () => {
  it('allows demo routes outside production', () => {
    expect(isDemoRoutesAllowed({ NODE_ENV: 'test' })).toBe(true);
    expect(isDemoRoutesAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(isDemoRoutesAllowed({})).toBe(true);
  });

  it('refuses in production without the explicit flag', () => {
    expect(isDemoRoutesAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(isDemoRoutesAllowed({ NODE_ENV: 'production', DEMO_ROUTES_ENABLED: 'true' })).toBe(
      false,
    );
  });

  it('allows in production only with DEMO_ROUTES_ENABLED=1', () => {
    expect(isDemoRoutesAllowed({ NODE_ENV: 'production', DEMO_ROUTES_ENABLED: '1' })).toBe(true);
  });
});
