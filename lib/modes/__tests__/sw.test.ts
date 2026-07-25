/**
 * Tests for lib/modes/sw_register.ts and for public/sw.js itself.
 *
 * public/sw.js cannot be imported into jsdom (no ServiceWorkerGlobalScope, no
 * CacheStorage, no fetch-event pipeline), so it is instead *executed* inside a
 * hand-built scope: the source is compiled with `self`, `caches` and `fetch`
 * as parameters and its listeners are then driven directly. That makes the
 * caching matrix in docs/lanes/lane-d-integrator.md §4 behaviourally testable
 * rather than grep-testable — a static regex over the source can pass
 * vacuously (matching a comment), and the failure mode this worker guards
 * against — a `?mode=` response served under a mode-free cache key — is
 * exactly the kind of bug a regex cannot see.
 *
 * The fake CacheStorage reproduces the two `cache.put` rejections the real API
 * has (non-GET request, 206 partial response) so that a worker which tried
 * either would fail these tests instead of failing silently in a browser.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../sw_register';

const SW_SOURCE_PATH = resolve(process.cwd(), 'public/sw.js');
const SW_SOURCE = readFileSync(SW_SOURCE_PATH, 'utf8');
const ORIGIN = 'https://verity.example';
const CURRENT_CACHE = 'verity-static-v1';

// --- fakes -----------------------------------------------------------------

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: { has(name: string): boolean };
}

interface FakeResponse {
  status: number;
  type: string;
  url: string;
  redirected: boolean;
  bodyTag: string;
  clone(): FakeResponse;
}

interface RequestInitLike {
  method?: string;
  mode?: string;
  destination?: string;
  range?: boolean;
}

function makeRequest(url: string, init: RequestInitLike = {}): FakeRequest {
  const hasRange = init.range === true;
  return {
    url,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    destination: init.destination ?? '',
    headers: { has: (name: string) => hasRange && name.toLowerCase() === 'range' },
  };
}

function navigationRequest(url: string): FakeRequest {
  return makeRequest(url, { mode: 'navigate', destination: 'document' });
}

interface ResponseInitLike {
  status?: number;
  type?: string;
  url?: string;
  redirected?: boolean;
}

function makeResponse(bodyTag: string, init: ResponseInitLike = {}): FakeResponse {
  const response: FakeResponse = {
    status: init.status ?? 200,
    type: init.type ?? 'basic',
    url: init.url ?? '',
    redirected: init.redirected ?? false,
    bodyTag,
    clone: () => ({ ...response, clone: () => response }),
  };
  return response;
}

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();
  /**
   * Writes the real Cache API would have *rejected*. The worker swallows cache
   * write failures (correctly — they must not fail a request), which means a
   * rejected put is invisible from the cache contents alone. Recording them
   * here is what makes "never attempted an illegal write" assertable.
   */
  readonly rejectedPuts: string[] = [];

  async put(request: FakeRequest, response: FakeResponse): Promise<void> {
    // Mirrors the real Cache API's rejections.
    if (request.method !== 'GET') {
      this.rejectedPuts.push(`${request.method} ${request.url}`);
      throw new TypeError('Cache.put: only GET requests may be cached');
    }
    if (response.status === 206) {
      this.rejectedPuts.push(`206 ${request.url}`);
      throw new TypeError('Cache.put: partial responses may not be cached');
    }
    this.entries.set(request.url, response);
  }

  async match(request: FakeRequest): Promise<FakeResponse | undefined> {
    return this.entries.get(request.url);
  }
}

class FakeCacheStorage {
  readonly opened = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    const existing = this.opened.get(name);
    if (existing) {
      return existing;
    }
    const created = new FakeCache();
    this.opened.set(name, created);
    return created;
  }

  async keys(): Promise<string[]> {
    return [...this.opened.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.opened.delete(name);
  }

  allKeys(): string[] {
    return [...this.opened.values()].flatMap((cache) => [...cache.entries.keys()]);
  }

  allRejectedPuts(): string[] {
    return [...this.opened.values()].flatMap((cache) => cache.rejectedPuts);
  }
}

// --- worker harness --------------------------------------------------------

interface SwEvent {
  waitUntil(promise: Promise<unknown>): void;
  request?: FakeRequest;
  respondWith?(promise: Promise<FakeResponse>): void;
  data?: { type: string };
}

type SwListener = (event: SwEvent) => void;

interface FetchOutcome {
  /** True when the worker called respondWith — i.e. it intercepted. */
  handled: boolean;
  response?: FakeResponse;
  error?: unknown;
}

interface Harness {
  cacheStorage: FakeCacheStorage;
  fetchMock: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  install(): Promise<void>;
  activate(): Promise<void>;
  message(data: { type: string }): Promise<void>;
  fetch(request: FakeRequest): Promise<FetchOutcome>;
  cacheKeys(): string[];
  rejectedPuts(): string[];
}

function loadWorker(): Harness {
  const listeners = new Map<string, SwListener>();
  const cacheStorage = new FakeCacheStorage();
  const fetchMock = vi.fn();
  const unregister = vi.fn().mockResolvedValue(true);
  const claim = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);

  const scope = {
    location: { href: `${ORIGIN}/`, origin: ORIGIN },
    registration: { unregister },
    clients: { claim },
    skipWaiting,
    addEventListener: (type: string, listener: SwListener) => {
      listeners.set(type, listener);
    },
  };

  const compiled: unknown = new Function('self', 'caches', 'fetch', SW_SOURCE);
  if (typeof compiled !== 'function') {
    throw new Error('public/sw.js did not compile to a function');
  }
  compiled(scope, cacheStorage, fetchMock);

  function listener(type: string): SwListener {
    const found = listeners.get(type);
    if (!found) {
      throw new Error(`public/sw.js registered no '${type}' listener`);
    }
    return found;
  }

  async function dispatchExtendable(
    type: string,
    data?: { type: string }
  ): Promise<void> {
    const pending: Promise<unknown>[] = [];
    listener(type)({ waitUntil: (promise) => pending.push(promise), data });
    await Promise.all(pending);
  }

  return {
    cacheStorage,
    fetchMock,
    unregister,
    claim,
    skipWaiting,
    install: () => dispatchExtendable('install'),
    activate: () => dispatchExtendable('activate'),
    message: (data) => dispatchExtendable('message', data),
    async fetch(request) {
      const pending: Promise<unknown>[] = [];
      let responsePromise: Promise<FakeResponse> | undefined;

      listener('fetch')({
        request,
        waitUntil: (promise) => pending.push(promise),
        respondWith: (promise) => {
          responsePromise = promise;
        },
      });

      const outcome: FetchOutcome = { handled: responsePromise !== undefined };
      if (responsePromise) {
        try {
          outcome.response = await responsePromise;
        } catch (error) {
          outcome.error = error;
        }
      }
      // cacheResponse() defers its write via waitUntil from inside the
      // respondWith promise, so drain after awaiting the response.
      await Promise.allSettled(pending);
      return outcome;
    },
    cacheKeys: () => cacheStorage.allKeys(),
    rejectedPuts: () => cacheStorage.allRejectedPuts(),
  };
}

// --- sw.js behaviour -------------------------------------------------------

describe('public/sw.js — lifecycle', () => {
  it('skipWaiting on install and clients.claim on activate (deliberate: updates apply on first visit)', async () => {
    const sw = loadWorker();
    await sw.install();
    await sw.activate();

    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
    expect(sw.claim).toHaveBeenCalledTimes(1);
  });

  it('purges only other verity-static-* caches on activate', async () => {
    const sw = loadWorker();
    await sw.cacheStorage.open('verity-static-v0');
    await sw.cacheStorage.open(CURRENT_CACHE);
    await sw.cacheStorage.open('some-other-app-cache');

    await sw.activate();

    expect(await sw.cacheStorage.keys()).toEqual([
      CURRENT_CACHE,
      'some-other-app-cache',
    ]);
  });
});

describe('public/sw.js — mode bypass', () => {
  it('does not intercept a navigation to /timeline?mode=replay', async () => {
    const sw = loadWorker();
    const outcome = await sw.fetch(
      navigationRequest(`${ORIGIN}/timeline?mode=replay`)
    );

    expect(outcome.handled).toBe(false);
    expect(sw.fetchMock).not.toHaveBeenCalled();
    expect(sw.cacheKeys()).toEqual([]);
  });

  it.each(['live', 'fixtures', 'replay'])(
    'never caches or serves cache for ?mode=%s on any request kind',
    async (mode) => {
      const sw = loadWorker();
      sw.fetchMock.mockResolvedValue(makeResponse('network'));

      const requests = [
        navigationRequest(`${ORIGIN}/timeline?mode=${mode}`),
        makeRequest(`${ORIGIN}/api/gaps?mode=${mode}`),
        makeRequest(`${ORIGIN}/_next/static/chunk.js?mode=${mode}`),
        makeRequest(`${ORIGIN}/icons/icon.png?mode=${mode}`),
      ];

      for (const request of requests) {
        const outcome = await sw.fetch(request);
        expect(outcome.handled).toBe(false);
      }

      expect(sw.fetchMock).not.toHaveBeenCalled();
      expect(sw.cacheKeys()).toEqual([]);
    }
  );

  it('ignores a pre-existing mode-keyed cache entry instead of serving it', async () => {
    const sw = loadWorker();
    const cache = await sw.cacheStorage.open(CURRENT_CACHE);
    const poisoned = makeResponse('poisoned-mode-entry');
    cache.entries.set(`${ORIGIN}/_next/static/chunk.js?mode=live`, poisoned);

    const outcome = await sw.fetch(
      makeRequest(`${ORIGIN}/_next/static/chunk.js?mode=live`)
    );

    expect(outcome.handled).toBe(false);
    expect(outcome.response).toBeUndefined();
  });

  it('does not cache a response whose own URL carries mode=, even unredirected', async () => {
    // Defence in depth at the write boundary: the fetch-handler entry check
    // only sees the request URL, so the mode check is repeated against the
    // response URL before anything is written.
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(
      makeResponse('live-mode-body', {
        url: `${ORIGIN}/timeline?mode=live`,
        redirected: false,
      })
    );

    const outcome = await sw.fetch(navigationRequest(`${ORIGIN}/timeline`));

    expect(outcome.response?.bodyTag).toBe('live-mode-body');
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('does not cache a mode-free navigation that redirected to a ?mode= URL', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(
      makeResponse('live-mode-page', {
        url: `${ORIGIN}/timeline?mode=live`,
        redirected: true,
      })
    );

    const outcome = await sw.fetch(navigationRequest(`${ORIGIN}/timeline`));

    expect(outcome.response?.bodyTag).toBe('live-mode-page');
    // The offline shell must never be able to replay a mode-scoped page.
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('leaves no cache key containing mode= after a mixed traffic run', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('ok'));

    await sw.fetch(navigationRequest(`${ORIGIN}/dashboard`));
    await sw.fetch(navigationRequest(`${ORIGIN}/dashboard?mode=replay`));
    await sw.fetch(makeRequest(`${ORIGIN}/_next/static/a.js`));
    await sw.fetch(makeRequest(`${ORIGIN}/_next/static/a.js?mode=fixtures`));
    await sw.fetch(makeRequest(`${ORIGIN}/api/gaps`));
    await sw.fetch(makeRequest(`${ORIGIN}/api/gaps?mode=live`));

    expect(sw.cacheKeys().length).toBeGreaterThan(0);
    for (const key of sw.cacheKeys()) {
      expect(key).not.toContain('mode=');
    }
  });
});

describe('public/sw.js — network-first', () => {
  it('serves a navigation from the network and caches a clone of it', async () => {
    const sw = loadWorker();
    const network = makeResponse('fresh-html');
    const cloneSpy = vi.spyOn(network, 'clone');
    sw.fetchMock.mockResolvedValue(network);

    const outcome = await sw.fetch(navigationRequest(`${ORIGIN}/dashboard`));

    expect(outcome.response).toBe(network);
    // Body may only be read once: the cached copy must be a clone, not the
    // response handed to the page.
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    const cache = await sw.cacheStorage.open(CURRENT_CACHE);
    expect(cache.entries.get(`${ORIGIN}/dashboard`)).not.toBe(network);
    expect(cache.entries.get(`${ORIGIN}/dashboard`)?.bodyTag).toBe('fresh-html');
  });

  it('does not cache a redirected navigation under the pre-redirect key', async () => {
    // The body belongs to /timeline/, not /timeline. Caching it under the
    // requested URL would make the offline shell serve the wrong document.
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(
      makeResponse('canonical-html', {
        url: `${ORIGIN}/timeline/`,
        redirected: true,
      })
    );

    const outcome = await sw.fetch(navigationRequest(`${ORIGIN}/timeline`));

    expect(outcome.response?.bodyTag).toBe('canonical-html');
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('falls back to the cached offline shell when the network is dead', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('fresh-html'));
    await sw.fetch(navigationRequest(`${ORIGIN}/dashboard`));

    sw.fetchMock.mockRejectedValue(new TypeError('offline'));
    const outcome = await sw.fetch(navigationRequest(`${ORIGIN}/dashboard`));

    expect(outcome.response?.bodyTag).toBe('fresh-html');
    expect(outcome.error).toBeUndefined();
  });

  it('never writes an /api/ response to the cache', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('api-json'));

    const outcome = await sw.fetch(makeRequest(`${ORIGIN}/api/gaps`));

    expect(outcome.handled).toBe(true);
    expect(outcome.response?.bodyTag).toBe('api-json');
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('lets a failed /api/ request fail rather than serving stale data', async () => {
    const sw = loadWorker();
    const cache = await sw.cacheStorage.open(CURRENT_CACHE);
    cache.entries.set(`${ORIGIN}/api/gaps`, makeResponse('stale-api'));
    sw.fetchMock.mockRejectedValue(new TypeError('offline'));

    const outcome = await sw.fetch(makeRequest(`${ORIGIN}/api/gaps`));

    expect(outcome.response).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(TypeError);
  });
});

describe('public/sw.js — cache-first static assets', () => {
  it('caches on first fetch and serves the second hit without the network', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('chunk-js'));

    await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);

    const second = await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(second.response?.bodyTag).toBe('chunk-js');
  });

  it.each([
    '/icons/icon-192.png',
    '/favicon.ico',
    '/fonts/inter.woff2',
    '/_next/static/css/app.css',
  ])('treats %s as cache-first', async (pathname) => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('asset'));

    const outcome = await sw.fetch(makeRequest(`${ORIGIN}${pathname}`));

    expect(outcome.handled).toBe(true);
    expect(sw.cacheKeys()).toEqual([`${ORIGIN}${pathname}`]);
  });

  it.each([404, 500, 302, 304, 206])(
    'does not cache a %i response',
    async (status) => {
      const sw = loadWorker();
      sw.fetchMock.mockResolvedValue(makeResponse('not-cacheable', { status }));

      const outcome = await sw.fetch(makeRequest(`${ORIGIN}/_next/static/x.js`));

      expect(outcome.response?.status).toBe(status);
      expect(sw.cacheKeys()).toEqual([]);
      // 206 in particular: `cache.put` rejects it, and the worker swallows
      // cache errors — so an empty cache alone would not prove it never tried.
      expect(sw.rejectedPuts()).toEqual([]);
    }
  );

  it.each(['opaque', 'opaqueredirect', 'error'])(
    'does not cache a %s response type',
    async (type) => {
      const sw = loadWorker();
      sw.fetchMock.mockResolvedValue(makeResponse('untrusted', { type }));

      await sw.fetch(makeRequest(`${ORIGIN}/_next/static/x.js`));

      expect(sw.cacheKeys()).toEqual([]);
    }
  );

  it('passes through a Range request rather than caching a partial body', async () => {
    const sw = loadWorker();
    const outcome = await sw.fetch(
      makeRequest(`${ORIGIN}/fonts/inter.woff2`, { range: true })
    );

    expect(outcome.handled).toBe(false);
    expect(sw.fetchMock).not.toHaveBeenCalled();
    expect(sw.cacheKeys()).toEqual([]);
    expect(sw.rejectedPuts()).toEqual([]);
  });

  it('passes through a cross-origin asset even when the path looks static', async () => {
    const sw = loadWorker();
    const outcome = await sw.fetch(
      makeRequest('https://cdn.example/fonts/inter.woff2')
    );

    expect(outcome.handled).toBe(false);
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('does not intercept an unrecognised same-origin subresource', async () => {
    const sw = loadWorker();
    const outcome = await sw.fetch(makeRequest(`${ORIGIN}/some/image.png`));

    expect(outcome.handled).toBe(false);
  });
});

describe('public/sw.js — non-GET', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'never intercepts or caches a %s request',
    async (method) => {
      const sw = loadWorker();
      const outcome = await sw.fetch(
        makeRequest(`${ORIGIN}/api/concerns`, { method })
      );

      expect(outcome.handled).toBe(false);
      expect(sw.fetchMock).not.toHaveBeenCalled();
      expect(sw.cacheKeys()).toEqual([]);
      expect(sw.rejectedPuts()).toEqual([]);
    }
  );
});

describe('public/sw.js — kill switch', () => {
  it('unregisters, purges caches and stops intercepting after ?nosw=1', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('chunk-js'));
    await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));
    expect(sw.cacheKeys()).toEqual([`${ORIGIN}/_next/static/chunk.js`]);

    const killed = await sw.fetch(navigationRequest(`${ORIGIN}/dashboard?nosw=1`));
    expect(killed.handled).toBe(false);
    expect(sw.unregister).toHaveBeenCalledTimes(1);
    expect(await sw.cacheStorage.keys()).toEqual([]);

    // unregister() does not stop an active worker controlling loaded clients,
    // so every later request must pass through untouched too.
    sw.fetchMock.mockClear();
    const after = await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));
    expect(after.handled).toBe(false);
    expect(sw.fetchMock).not.toHaveBeenCalled();
    expect(sw.cacheKeys()).toEqual([]);
  });

  it('honours a {type: NOSW} postMessage the same way', async () => {
    const sw = loadWorker();
    sw.fetchMock.mockResolvedValue(makeResponse('chunk-js'));
    await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));

    await sw.message({ type: 'NOSW' });

    expect(sw.unregister).toHaveBeenCalledTimes(1);
    expect(await sw.cacheStorage.keys()).toEqual([]);
    const after = await sw.fetch(makeRequest(`${ORIGIN}/_next/static/chunk.js`));
    expect(after.handled).toBe(false);
  });

  it('ignores unrelated messages', async () => {
    const sw = loadWorker();
    await sw.message({ type: 'SOMETHING_ELSE' });

    expect(sw.unregister).not.toHaveBeenCalled();
  });
});

describe('public/sw.js — source', () => {
  it('names its cache with an explicit version so activate can purge the rest', () => {
    expect(SW_SOURCE).toMatch(/const CACHE_NAME = 'verity-static-v\d+';/);
  });
});

// --- registration helper ---------------------------------------------------

describe('registerServiceWorker', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    // jsdom's navigator has no `serviceWorker` property by default; make
    // sure a prior test's stub doesn't leak into this one.
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.unstubAllGlobals();
  });

  it('no-ops when navigator.serviceWorker is unsupported (jsdom/SSR safe)', async () => {
    expect('serviceWorker' in navigator).toBe(false);
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it('unregisters and reloads exactly once for ?nosw=1, not twice', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi
      .fn()
      .mockResolvedValue([{ unregister }, { unregister }]);
    const register = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations, register, controller: { postMessage } },
      configurable: true,
    });

    const reload = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://verity.example/dashboard?nosw=1',
      reload,
    });

    await registerServiceWorker();

    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    // Latch the still-controlling worker into pass-through immediately.
    expect(postMessage).toHaveBeenCalledWith({ type: 'NOSW' });

    // Calling again in the same session must not reload a second time —
    // otherwise ?nosw=1 plus an eager reload would loop forever.
    await registerServiceWorker();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('works without a controlling worker (nothing to postMessage to)', async () => {
    const getRegistrations = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations, register: vi.fn(), controller: null },
      configurable: true,
    });
    const reload = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://verity.example/?nosw=1',
      reload,
    });

    await expect(registerServiceWorker()).resolves.toBeUndefined();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never throws when unregistering fails', async () => {
    const getRegistrations = vi.fn().mockRejectedValue(new Error('boom'));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations, register: vi.fn(), controller: null },
      configurable: true,
    });
    vi.stubGlobal('location', {
      href: 'https://verity.example/?nosw=1',
      reload: vi.fn(),
    });

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it('clears the reload guard once nosw is no longer requested, so a later nosw=1 still reloads', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations, register: vi.fn(), controller: null },
      configurable: true,
    });

    const firstReload = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://verity.example/?nosw=1',
      reload: firstReload,
    });
    await registerServiceWorker();
    expect(firstReload).toHaveBeenCalledTimes(1);

    // Navigate away from ?nosw=1 within the same tab session.
    const secondReload = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://verity.example/dashboard',
      reload: secondReload,
    });
    await registerServiceWorker();
    expect(secondReload).not.toHaveBeenCalled();

    // ...then ask for the kill switch again.
    const thirdReload = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://verity.example/dashboard?nosw=1',
      reload: thirdReload,
    });
    await registerServiceWorker();
    expect(thirdReload).toHaveBeenCalledTimes(1);
  });
});
