/**
 * lib/modes — the mode seam.
 *
 * Lane A routes every model call (and, later, DB read) through `callModel`
 * instead of touching `@anthropic-ai/sdk` directly. That single indirection
 * is what lets Lane D own `?mode=live|fixtures|replay` without ever editing
 * a Lane A file.
 *
 * Types only in this file — no runtime code, so it is always safe to import.
 */

import type Anthropic from '@anthropic-ai/sdk';

/** The three demo modes. Precedence and fallback live in resolve-mode.ts. */
export type Mode = 'live' | 'fixtures' | 'replay';

export const MODES: readonly Mode[] = ['live', 'fixtures', 'replay'];

/**
 * The request shape callers build. This is exactly the Anthropic Messages
 * API's non-streaming create params — no wrapper type — so Lane A's call
 * sites stay the SDK shape it already knows, and `requestHash` hashes
 * precisely what would go over the wire.
 *
 * Because the request IS the fixture key, it must be a deterministic function
 * of the inputs: no timestamps, no per-run ids (including `metadata.user_id`),
 * no random sampling of anything. See the determinism contract at the top of
 * `hash.ts` — a per-run field means every live call records a fixture nothing
 * can ever look up again.
 */
export type ModelRequest = Anthropic.MessageCreateParamsNonStreaming;

/** The response shape returned on a hit, in every mode, unchanged. */
export type ModelResponse = Anthropic.Message;

/**
 * A successful lookup or live call. `degraded` is true only when a live
 * call failed or timed out and the result came from a fixture instead —
 * callers may log it, they must never render it as an error.
 */
export interface CallModelHit {
  readonly kind: 'hit';
  readonly response: ModelResponse;
  readonly degraded: boolean;
  readonly hash: string;
}

/** No fixture recorded for this request's hash. Never a throw. */
export interface CallModelMiss {
  readonly kind: 'miss';
  readonly degraded: boolean;
  readonly hash: string;
}

export type CallModelResult = CallModelHit | CallModelMiss;

/**
 * The one seam to a real network call. Swapped in tests for a fn that throws
 * (proves zero network in fixtures/replay) or never resolves (proves the
 * timeout degrade).
 *
 * `signal` is aborted when the mode timeout fires, so a slow live call is
 * actually cancelled rather than left running to completion behind a result
 * the caller has already stopped waiting for. It is optional in the signature
 * so a test stub can ignore it.
 */
export type ModelTransport = (
  request: ModelRequest,
  signal?: AbortSignal,
) => Promise<ModelResponse>;

/**
 * Where recorded fixtures live and where they're read back from. The real
 * implementation is a thin node:fs wrapper over `fixtures/recorded/`; tests
 * always inject a temp-dir or in-memory store instead — never the real
 * `fixtures/` tree, which `scripts/verify.sh` guards and which is committed
 * only deliberately, in a merge window.
 */
export interface FixtureStore {
  read(hash: string): Promise<ModelResponse | null>;
  write(hash: string, response: ModelResponse): Promise<void>;
}

export interface CallModelOptions {
  readonly mode: Mode;
  /** Default: a lazily-constructed real Anthropic transport. */
  readonly transport?: ModelTransport;
  /** Default: node fs over fixtures/recorded/. */
  readonly store?: FixtureStore;
  /**
   * Live calls slower than this degrade to fixtures. Default 8000. A
   * non-finite or non-positive value falls back to the default rather than
   * degrading instantly.
   */
  readonly timeoutMs?: number;
  /**
   * Called when recording a live response to the store fails. Recording is
   * insurance, not a dependency: a failed write never fails the call and
   * never changes the returned shape, so this hook is the only way to notice
   * one. Default: silently ignored.
   */
  readonly onRecordError?: (error: unknown) => void;
}
