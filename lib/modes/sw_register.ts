/**
 * Service worker registration — lib/modes/sw_register.ts
 *
 * Companion to public/sw.js (see docs/lanes/lane-d-integrator.md §4). This
 * is the only file Lane B's client shell should import to opt into the
 * offline shell / static-asset caching.
 *
 * Lane B: call `registerServiceWorker()` once from the client shell (e.g.
 * a top-level `useEffect` in the root layout's client component) — it is
 * a no-op during SSR and in non-production environments, and it self-guards
 * against reload loops, so a single unconditional call is safe.
 */

const NOSW_PARAM = 'nosw';
const NOSW_RELOAD_KEY = 'verity-nosw-reloaded';
const SW_URL = '/sw.js';

/**
 * Registers /sw.js in production-like environments. Honours `?nosw=1` by
 * unregistering all service worker registrations and hard-reloading once
 * (guarded against reload loops via sessionStorage). No-ops cleanly when
 * `navigator.serviceWorker` is unavailable (SSR, jsdom, unsupported
 * browsers) — safe to call unconditionally.
 */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (isNoSwRequested()) {
    try {
      await disableAndReloadOnce();
    } catch {
      // A failed unregister must not leave the page in a broken state; the
      // user can still hard-reload. Never rethrow into the render tree.
    }
    return;
  }

  // A previous `?nosw=1` visit in this tab session set the reload guard. Clear
  // it now that the kill switch is no longer requested, so a *later* `?nosw=1`
  // in the same session still gets its one reload.
  clearReloadGuard();

  if (!isProductionLike()) {
    return;
  }

  try {
    await navigator.serviceWorker.register(SW_URL);
  } catch {
    // Registration failure must never block the app — the app works
    // identically with or without the service worker installed.
  }
}

function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isNoSwRequested(): boolean {
  const url = new URL(window.location.href);
  return url.searchParams.get(NOSW_PARAM) === '1';
}

/**
 * Unregisters every service worker registration, then reloads the page
 * exactly once. A sessionStorage flag prevents a second reload if this
 * function runs again in the same tab session (e.g. the caller re-invokes
 * registration on a subsequent render) — without it, `?nosw=1` plus a
 * naive reload would loop forever.
 */
async function disableAndReloadOnce(): Promise<void> {
  // Tell the *controlling* worker to latch itself into pass-through mode.
  // `unregister()` alone does not stop an active worker from intercepting
  // requests for already-loaded clients, so without this message the page
  // could keep being served from cache right up until the reload lands.
  navigator.serviceWorker.controller?.postMessage({ type: 'NOSW' });

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => registration.unregister())
  );

  const storage = readSessionStorage();
  const alreadyReloaded = storage?.getItem(NOSW_RELOAD_KEY) === '1';

  if (alreadyReloaded) {
    return;
  }

  storage?.setItem(NOSW_RELOAD_KEY, '1');
  window.location.reload();
}

function clearReloadGuard(): void {
  readSessionStorage()?.removeItem(NOSW_RELOAD_KEY);
}

function readSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
