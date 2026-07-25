/**
 * The core seam tests: one function (callModel), three modes, identical
 * return shape. No test here touches the real filesystem, the network, or
 * needs ANTHROPIC_API_KEY — every store is in-memory and every transport is
 * an injected stub.
 */

import { describe, it, expect, vi } from 'vitest';
import { callModel } from '../call-model';
import { createInMemoryFixtureStore } from '../store';
import { requestHash } from '../hash';
import { MODES } from '../types';
import type {
  CallModelResult,
  FixtureStore,
  ModelRequest,
  ModelResponse,
  ModelTransport,
} from '../types';

/** SDK 0.115 Usage/TextBlock require the full field set; nullables null. */
const stubUsage = (input_tokens: number, output_tokens: number) => ({
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens,
  output_tokens,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: null,
});

const request: ModelRequest = {
  model: 'claude-test-model',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'What did the discharge summary say about furosemide?' }],
};

const fixtureResponse: ModelResponse = {
  id: 'msg_fixture',
  type: 'message',
  role: 'assistant',
  container: null,
  stop_details: null,
  model: 'claude-test-model',
  content: [
    { type: 'text', text: 'Furosemide 40mg was stopped prior to discharge.', citations: null },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: stubUsage(20, 10),
};

const liveResponse: ModelResponse = {
  id: 'msg_live',
  type: 'message',
  role: 'assistant',
  container: null,
  stop_details: null,
  model: 'claude-test-model',
  content: [
    { type: 'text', text: 'Live: furosemide was stopped due to renal function.', citations: null },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: stubUsage(22, 14),
};

/** Fails the test if the transport is ever invoked — used to prove
 *  fixtures/replay make zero network calls by construction. */
const throwingTransport: ModelTransport = () => {
  throw new Error('transport must not be called in fixtures/replay mode');
};

function seededStore() {
  const hash = requestHash(request);
  return { hash, store: createInMemoryFixtureStore(new Map([[hash, fixtureResponse]])) };
}

describe('callModel — fixtures mode', () => {
  it('makes zero network calls and returns the seeded fixture on a hit', async () => {
    const { store, hash } = seededStore();

    const result = await callModel(request, { mode: 'fixtures', store, transport: throwingTransport });

    expect(result).toEqual({ kind: 'hit', response: fixtureResponse, degraded: false, hash });
  });

  it('a missing fixture is a typed miss, not a throw', async () => {
    const store = createInMemoryFixtureStore();
    const hash = requestHash(request);

    const result = await callModel(request, { mode: 'fixtures', store, transport: throwingTransport });

    expect(result).toEqual({ kind: 'miss', degraded: false, hash });
  });
});

describe('callModel — replay mode', () => {
  it('makes zero network calls (same path as fixtures)', async () => {
    const { store } = seededStore();
    await expect(
      callModel(request, { mode: 'replay', store, transport: throwingTransport }),
    ).resolves.toMatchObject({ kind: 'hit' });
  });

  // KNOWN GAP vs brief Test 4 ("replay mode completes the full journey with
  // network disabled"): the FULL journey — upload → extraction → conflict card
  // → artefact — needs Lane A's pipeline and Lane B's screens, which do not
  // exist inside this lane. The strongest property provable today is below:
  // a replay round trip with a throwing transport (zero network by
  // construction) that is byte-identical to a fixtures-mode hit, plus the
  // one-shape-across-all-modes suite at the bottom of this file. The journey
  // itself is covered at integration time by docs/user-journey.md over a
  // seeded deploy in ?mode=replay with the network disabled.
  it('completes a representative request/response round trip identical to a fixtures-mode hit', async () => {
    const { store, hash } = seededStore();

    const replay = await callModel(request, { mode: 'replay', store, transport: throwingTransport });
    const fixtures = await callModel(request, { mode: 'fixtures', store, transport: throwingTransport });

    expect(replay).toEqual({ kind: 'hit', response: fixtureResponse, degraded: false, hash });
    // The brief's core property: replay is indistinguishable from fixtures.
    expect(replay).toEqual(fixtures);
  });
});

describe('callModel — live mode', () => {
  it('on success, records the response via the injected store keyed by request hash', async () => {
    const store = createInMemoryFixtureStore();
    const hash = requestHash(request);
    const transport: ModelTransport = vi.fn(async () => liveResponse);

    const result = await callModel(request, { mode: 'live', store, transport });

    expect(result).toEqual({ kind: 'hit', response: liveResponse, degraded: false, hash });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(store.read(hash)).resolves.toEqual(liveResponse);
  });

  it('a transport failure degrades to fixtures with no thrown error', async () => {
    const { store, hash } = seededStore();
    const transport: ModelTransport = async () => {
      throw new Error('network is down');
    };

    const result = await callModel(request, { mode: 'live', store, transport });

    expect(result).toEqual({ kind: 'hit', response: fixtureResponse, degraded: true, hash });
  });

  it('a transport failure with no matching fixture degrades to a typed miss, still no throw', async () => {
    const store = createInMemoryFixtureStore();
    const hash = requestHash(request);
    const transport: ModelTransport = async () => {
      throw new Error('network is down');
    };

    const result = await callModel(request, { mode: 'live', store, transport });

    expect(result).toEqual({ kind: 'miss', degraded: true, hash });
  });

  it('a transport that never resolves degrades to fixtures once the injectable timeout elapses', async () => {
    const { store, hash } = seededStore();
    const neverResolves: ModelTransport = () => new Promise<ModelResponse>(() => {});

    const result = await callModel(request, {
      mode: 'live',
      store,
      transport: neverResolves,
      timeoutMs: 20,
    });

    expect(result).toEqual({ kind: 'hit', response: fixtureResponse, degraded: true, hash });
  });

  it('a fast transport under the timeout is not degraded', async () => {
    const store = createInMemoryFixtureStore();
    const hash = requestHash(request);
    const fast: ModelTransport = async () => liveResponse;

    const result = await callModel(request, { mode: 'live', store, transport: fast, timeoutMs: 20 });

    expect(result).toEqual({ kind: 'hit', response: liveResponse, degraded: false, hash });
  });

  it('a garbage timeoutMs falls back to the default instead of degrading instantly', async () => {
    const store = createInMemoryFixtureStore();
    const slowish: ModelTransport = () =>
      new Promise<ModelResponse>((resolve) => setTimeout(() => resolve(liveResponse), 10));

    for (const timeoutMs of [0, -1, Number.NaN]) {
      const result = await callModel(request, { mode: 'live', store, transport: slowish, timeoutMs });
      expect(result).toMatchObject({ kind: 'hit', response: liveResponse, degraded: false });
    }
  });
});

describe('callModel — degrade path hygiene', () => {
  it('a transport that rejects AFTER the timeout fired raises no unhandled rejection', async () => {
    // The reason withTimeout is not Promise.race: race leaves the losing
    // promise unobserved, and a late rejection then crashes Node by default —
    // during a degrade that is meant to be invisible.
    const { store, hash } = seededStore();
    const lateReject: ModelTransport = () =>
      new Promise<ModelResponse>((_resolve, reject) => {
        setTimeout(() => reject(new Error('transport failed after we gave up')), 40);
      });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const result = await callModel(request, {
        mode: 'live',
        store,
        transport: lateReject,
        timeoutMs: 10,
      });
      expect(result).toEqual({ kind: 'hit', response: fixtureResponse, degraded: true, hash });
      // Let the late rejection land and any unhandled-rejection tick run.
      await new Promise((resolve) => setTimeout(resolve, 80));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
  });

  it('aborts the in-flight live call when the timeout fires', async () => {
    const { store } = seededStore();
    let captured: AbortSignal | undefined;
    const hangs: ModelTransport = (_req, signal) => {
      captured = signal;
      return new Promise<ModelResponse>(() => {});
    };

    await callModel(request, { mode: 'live', store, transport: hangs, timeoutMs: 10 });

    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured?.aborted).toBe(true);
  });

  it('does not abort a live call that completed in time', async () => {
    const store = createInMemoryFixtureStore();
    let captured: AbortSignal | undefined;
    const fast: ModelTransport = async (_req, signal) => {
      captured = signal;
      return liveResponse;
    };

    await callModel(request, { mode: 'live', store, transport: fast, timeoutMs: 50 });

    expect(captured?.aborted).toBe(false);
  });

  it('a synchronously throwing transport degrades like a rejecting one', async () => {
    const { store, hash } = seededStore();
    const result = await callModel(request, {
      mode: 'live',
      store,
      transport: throwingTransport,
    });
    expect(result).toEqual({ kind: 'hit', response: fixtureResponse, degraded: true, hash });
  });
});

describe('callModel — recording is insurance, not a dependency', () => {
  function failingWriteStore(seed?: ReadonlyMap<string, ModelResponse>): {
    store: FixtureStore;
    writes: number;
  } {
    const inner = createInMemoryFixtureStore(seed);
    let writes = 0;
    const store: FixtureStore = {
      read: (hash) => inner.read(hash),
      write: async () => {
        writes += 1;
        throw new Error('disk is read-only');
      },
    };
    return {
      store,
      get writes() {
        return writes;
      },
    };
  }

  it('a store write failure does not throw and does not change the result', async () => {
    const { store } = failingWriteStore();
    const hash = requestHash(request);
    const errors: unknown[] = [];

    const result = await callModel(request, {
      mode: 'live',
      store,
      transport: async () => liveResponse,
      onRecordError: (error) => errors.push(error),
    });

    // Identical to the successful-recording case, including degraded: false.
    expect(result).toEqual({ kind: 'hit', response: liveResponse, degraded: false, hash });
    expect(errors).toHaveLength(1);
  });

  it('a store write failure is silent when no onRecordError is supplied', async () => {
    const { store } = failingWriteStore();
    await expect(
      callModel(request, { mode: 'live', store, transport: async () => liveResponse }),
    ).resolves.toMatchObject({ kind: 'hit', degraded: false });
  });

  it('never writes on the degrade path — a fixture must not be overwritten by a failure', async () => {
    const probe = failingWriteStore(new Map([[requestHash(request), fixtureResponse]]));
    const result = await callModel(request, {
      mode: 'live',
      store: probe.store,
      transport: async () => {
        throw new Error('network is down');
      },
    });

    expect(result).toMatchObject({ kind: 'hit', degraded: true });
    expect(probe.writes).toBe(0);
  });

  it.each(['fixtures', 'replay'] as const)('never writes in %s mode', async (mode) => {
    const probe = failingWriteStore(new Map([[requestHash(request), fixtureResponse]]));
    await callModel(request, { mode, store: probe.store, transport: throwingTransport });
    expect(probe.writes).toBe(0);
  });
});

describe('callModel — one shape across all three modes', () => {
  /** Sorted key list, so the assertion is about shape rather than order. */
  function shapeOf(result: CallModelResult): string[] {
    return Object.keys(result).sort();
  }

  it('a hit has identical keys in live, fixtures and replay', async () => {
    const { store } = seededStore();
    const liveStore = createInMemoryFixtureStore();

    const results = [
      await callModel(request, { mode: 'live', store: liveStore, transport: async () => liveResponse }),
      await callModel(request, { mode: 'fixtures', store, transport: throwingTransport }),
      await callModel(request, { mode: 'replay', store, transport: throwingTransport }),
      // A degraded live hit is the same shape as an undegraded one.
      await callModel(request, {
        mode: 'live',
        store,
        transport: async () => {
          throw new Error('down');
        },
      }),
    ];

    const shapes = new Set(results.map((result) => shapeOf(result).join(',')));
    for (const result of results) {
      expect(result.kind).toBe('hit');
      expect(shapeOf(result)).toEqual(['degraded', 'hash', 'kind', 'response']);
    }
    // One shape, not four that happen to each match a literal.
    expect(shapes.size).toBe(1);
  });

  it('a miss has identical keys in live, fixtures and replay', async () => {
    const empty = () => createInMemoryFixtureStore();

    const results = [
      await callModel(request, {
        mode: 'live',
        store: empty(),
        transport: async () => {
          throw new Error('down');
        },
      }),
      await callModel(request, { mode: 'fixtures', store: empty(), transport: throwingTransport }),
      await callModel(request, { mode: 'replay', store: empty(), transport: throwingTransport }),
    ];

    for (const result of results) {
      expect(result.kind).toBe('miss');
      expect(shapeOf(result)).toEqual(['degraded', 'hash', 'kind']);
    }
  });

  it('the hash in the result is the fixture key, in every mode', async () => {
    const { store, hash } = seededStore();
    for (const mode of MODES) {
      const result = await callModel(request, {
        mode,
        store,
        transport: async () => liveResponse,
      });
      expect(result.hash).toBe(hash);
      await expect(store.read(result.hash)).resolves.not.toBeNull();
    }
  });
});
