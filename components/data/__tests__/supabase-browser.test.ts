import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the static import below, so the mock
// function must come from vi.hoisted() (see lib/voice/__tests__/route.test.ts).
const { createBrowserClient } = vi.hoisted(() => ({ createBrowserClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient }));

describe('ensureAnonSession', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    createBrowserClient.mockReset();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('missing env -> false, without constructing a client', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    const result = await ensureAnonSession();
    expect(result).toBe(false);
    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it('existing session -> true, and signInAnonymously is never called', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } });
    const signInAnonymously = vi.fn();
    createBrowserClient.mockReturnValue({ auth: { getSession, signInAnonymously } });

    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    const result = await ensureAnonSession();

    expect(result).toBe(true);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('no session, sign-in succeeds -> true', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const signInAnonymously = vi.fn().mockResolvedValue({ error: null });
    createBrowserClient.mockReturnValue({ auth: { getSession, signInAnonymously } });

    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    const result = await ensureAnonSession();

    expect(result).toBe(true);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('no session, sign-in errors -> false', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const signInAnonymously = vi.fn().mockResolvedValue({ error: { message: 'anon sign-in disabled' } });
    createBrowserClient.mockReturnValue({ auth: { getSession, signInAnonymously } });

    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    const result = await ensureAnonSession();

    expect(result).toBe(false);
  });

  it('concurrent callers coalesce onto one sign-in', async () => {
    // Both callers see "no session"; without coalescing each would mint its
    // own anonymous user and clobber the other's cookie.
    let resolveSignIn: (v: { error: null }) => void = () => {};
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const signInAnonymously = vi.fn().mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    createBrowserClient.mockReturnValue({ auth: { getSession, signInAnonymously } });

    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    // Fire both without awaiting between them, so the second observes the
    // first's in-flight promise.
    const both = Promise.all([ensureAnonSession(), ensureAnonSession()]);
    resolveSignIn({ error: null });
    const [a, b] = await both;

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('server guard: typeof window === "undefined" -> false', async () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);

    const { ensureAnonSession } = await import('@/components/data/supabaseBrowser');
    const result = await ensureAnonSession();

    expect(result).toBe(false);
    expect(createBrowserClient).not.toHaveBeenCalled();

    vi.stubGlobal('window', originalWindow);
  });
});
