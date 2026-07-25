/**
 * callModel — the single function every mode flows through.
 *
 * live, fixtures, and replay all return the identical CallModelResult shape.
 * That is the core property: if replay ever looked different from live in
 * what it returns, the fallback would be a lie and a judge would spot it.
 *
 *   - fixtures / replay: look up the fixture by request hash. Zero network
 *     by construction — the transport is never referenced on this path, so
 *     even a transport injected to throw-on-call cannot fire.
 *   - live: call the transport with a timeout race. On success, record the
 *     response to the store keyed by request hash. On failure OR timeout,
 *     fall back to the exact same fixture lookup used by fixtures/replay,
 *     with `degraded: true` — no error is ever thrown out of this function
 *     for a live failure or timeout.
 *   - a missing fixture is a typed `{ kind: 'miss' }` result, never a throw.
 *   - anything other than `mode: 'live'` takes the zero-network path. The
 *     check is written that way round on purpose: a mode value that somehow
 *     escaped `resolveMode` (an untyped JS caller, a future fourth mode)
 *     must fail towards "no network", never towards a surprise live call.
 *
 * Recording is insurance, not a dependency: a store write that fails is
 * reported through `opts.onRecordError` and otherwise ignored. The live
 * response is still returned, unchanged and not marked degraded — the model
 * answered, which is all the caller asked about.
 */

import { requestHash } from './hash';
import { createDefaultFixtureStore } from './store';
import { createAnthropicTransport } from './transport';
import type {
  CallModelOptions,
  CallModelResult,
  FixtureStore,
  ModelRequest,
  ModelResponse,
  ModelTransport,
} from './types';

export const DEFAULT_TIMEOUT_MS = 8000;

// Built on first use, not at module scope: `createDefaultFixtureStore()` calls
// `process.cwd()`, which does not exist on every runtime Lane A might import
// this from. Importing lib/modes must never be able to throw — fixtures and
// replay mode do not need either of these to exist.
let defaultTransport: ModelTransport | undefined;
let defaultStore: FixtureStore | undefined;

function getDefaultTransport(): ModelTransport {
  defaultTransport ??= createAnthropicTransport();
  return defaultTransport;
}

function getDefaultStore(): FixtureStore {
  defaultStore ??= createDefaultFixtureStore();
  return defaultStore;
}

class ModeTimeoutError extends Error {
  constructor() {
    super('live model call exceeded the mode timeout');
    this.name = 'ModeTimeoutError';
  }
}

/**
 * Deliberately not `Promise.race`. Race leaves the losing promise unobserved,
 * so a transport that rejects *after* the timeout already fired produces an
 * unhandled rejection — which in Node crashes the process by default and in
 * Next.js logs a scary error during a degrade that is supposed to be silent.
 * Attaching handlers to `promise` directly means the late rejection is always
 * observed: `reject` on an already-settled promise is a no-op, and the derived
 * promise from `.then` settles fulfilled, so nothing is left dangling.
 *
 * The timer is cleared on both settlement paths, so a fast call leaves no
 * pending timer holding the event loop open.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new ModeTimeoutError());
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function lookupFixture(
  store: FixtureStore,
  hash: string,
  degraded: boolean,
): Promise<CallModelResult> {
  const response: ModelResponse | null = await store.read(hash);
  if (response === null) return { kind: 'miss', degraded, hash };
  return { kind: 'hit', response, degraded, hash };
}

function resolveTimeoutMs(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_TIMEOUT_MS;
  return requested;
}

export async function callModel(
  request: ModelRequest,
  opts: CallModelOptions,
): Promise<CallModelResult> {
  const hash = requestHash(request);
  const store = opts.store ?? getDefaultStore();

  // Fail towards zero network: only an exact 'live' reaches the transport.
  if (opts.mode !== 'live') {
    return lookupFixture(store, hash, false);
  }

  const transport = opts.transport ?? getDefaultTransport();
  const timeoutMs = resolveTimeoutMs(opts.timeoutMs);
  const controller = new AbortController();

  let response: ModelResponse;
  try {
    // Inside the try so that a transport which throws *synchronously* degrades
    // like one that rejects.
    response = await withTimeout(transport(request, controller.signal), timeoutMs, () =>
      controller.abort(new ModeTimeoutError()),
    );
  } catch {
    // Failure or timeout, indistinguishable to the caller on purpose: both
    // auto-degrade to fixtures with no thrown error surfaced.
    return lookupFixture(store, hash, true);
  }

  try {
    await store.write(hash, response);
  } catch (error) {
    // A recorder that cannot write must not turn a successful live call into a
    // failure. Losing tomorrow's fixture is a smaller problem than losing
    // today's answer.
    opts.onRecordError?.(error);
  }

  return { kind: 'hit', response, degraded: false, hash };
}
