/**
 * Proves Lane A actually honours the mode seam (`@/lib/modes`), not just
 * that it compiles against it:
 *
 *   - fixtures/replay never touch the transport — a throwing transport still
 *     succeeds or misses cleanly.
 *   - a miss is a typed, honest report — zero claims, a populated notice,
 *     never a throw.
 *   - a live transport failure degrades to a fixture with `degraded: true`,
 *     never a thrown error.
 *   - a successful live call is demo insurance: it records to the store, and
 *     a later call against the identical request reads it back under the
 *     SAME hash.
 *   - the extraction request Lane A builds is a deterministic function of its
 *     inputs — this is the test that would have caught the per-run
 *     `source.id` that used to leak into the request text.
 *   - no file in lib/ai/** or app/api/** calls `@anthropic-ai/sdk`'s
 *     `messages.create` to make a request — the seam is the only path.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import {
  createInMemoryFixtureStore,
  requestHash,
  type ModelRequest,
  type ModelTransport,
} from '@/lib/modes';
import { extractSourceLive } from '@/lib/ai/extract';
import { EXTRACTION_TOOL } from '@/lib/ai/prompts';
import { MODELS } from '@/lib/ai/models';
import type { SourceInput } from '@/lib/ai/documents';
import type { Source } from '@/lib/contracts';

/* ------------------------------- fixtures ------------------------------- */

function usage(): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    inference_geo: null,
    input_tokens: 10,
    output_tokens: 20,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

function message(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.Message['stop_reason'] = 'tool_use',
): Anthropic.Message {
  return {
    id: 'msg_test',
    container: null,
    content,
    model: MODELS.sonnet,
    role: 'assistant',
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: usage(),
  };
}

function toolUse(input: unknown): Anthropic.ContentBlock {
  return { type: 'tool_use', id: 'toolu_test', name: EXTRACTION_TOOL.name, input, caller: { type: 'direct' } };
}

/** A transport that fails the test if invoked — proves fixtures/replay make
 *  zero network calls by construction. */
const throwingTransport: ModelTransport = () => {
  throw new Error('transport must not be called in fixtures/replay mode');
};

const source: Pick<Source, 'id' | 'title' | 'kind'> = {
  id: 'src-seam-1',
  title: 'Discharge summary',
  kind: 'pdf',
};
const input: SourceInput = { kind: 'text', text: 'Furosemide 40mg was stopped on discharge.' };

// Two verified claims, zero drops: keeps `shouldRetry` (lib/ai/extract.ts)
// false, so a single call produces the final report — the retry path has
// its own coverage in request-shape.test.ts and is not what this suite is
// about.
const EMIT = {
  transcript: 'Furosemide 40mg was stopped on discharge. Daily weights.',
  claims: [
    {
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      value: 'stopped',
      quote: 'Furosemide 40mg was stopped on discharge.',
      page: null,
      asserted_at: null,
      date_precision: 'unknown',
    },
    {
      ontology_key: 'instruction.monitoring',
      subject: 'weights',
      value: 'daily',
      quote: 'Daily weights.',
      page: null,
      asserted_at: null,
      date_precision: 'unknown',
    },
  ],
};

/* -------------------------- fixtures/replay: zero network -------------------------- */

describe('fixtures/replay never touch the transport', () => {
  it.each(['fixtures', 'replay'] as const)(
    'mode %s misses cleanly (no throw) against an empty store, with a throwing transport',
    async (mode) => {
      const report = await extractSourceLive(source, input, {
        mode,
        transport: throwingTransport,
        store: createInMemoryFixtureStore(),
      });

      expect(report.kept).toHaveLength(0);
      expect(report.notice).not.toBeNull();
      expect(report.degraded).toBe(false);
    },
  );

  it.each(['fixtures', 'replay'] as const)(
    'mode %s hits cleanly against a seeded store, with a throwing transport',
    async (mode) => {
      // Seed the store the honest way: one real live call records under the
      // exact hash the request produces, then fixtures/replay read it back.
      const store = createInMemoryFixtureStore();
      await extractSourceLive(source, input, {
        mode: 'live',
        transport: () => Promise.resolve(message([toolUse(EMIT)])),
        store,
      });

      const report = await extractSourceLive(source, input, { mode, transport: throwingTransport, store });

      expect(report.kept).toHaveLength(2);
      expect(report.kept[0]?.quote).toBe(EMIT.claims[0]?.quote);
      expect(report.degraded).toBe(false);
      expect(report.notice).toBeNull();
    },
  );
});

/* -------------------------------- a miss -------------------------------- */

describe('a miss', () => {
  it('produces a report with zero claims, a populated notice, and never throws', async () => {
    const report = await extractSourceLive(source, input, {
      mode: 'replay',
      transport: throwingTransport,
      store: createInMemoryFixtureStore(),
    });

    expect(report.kept).toEqual([]);
    expect(report.dropped).toEqual([]);
    expect(report.stats).toEqual({ claims_extracted: 0, claims_dropped: 0 });
    expect(report.notice).not.toBeNull();
    expect(report.notice).toMatch(/no recorded response/i);
    expect(report.degraded).toBe(false);
  });
});

/* ------------------------------- degrade ------------------------------- */

describe('a live transport failure', () => {
  it('degrades to a fixture with degraded: true and no thrown error', async () => {
    const store = createInMemoryFixtureStore();
    // Seed the fixture first via a real successful live call.
    await extractSourceLive(source, input, {
      mode: 'live',
      transport: () => Promise.resolve(message([toolUse(EMIT)])),
      store,
    });

    const failing: ModelTransport = () => {
      throw new Error('network is down');
    };

    const report = await extractSourceLive(source, input, { mode: 'live', transport: failing, store });

    expect(report.degraded).toBe(true);
    expect(report.kept).toHaveLength(2);
    expect(report.kept[0]?.quote).toBe(EMIT.claims[0]?.quote);
  });
});

/* --------------------------- demo insurance --------------------------- */

describe('a successful live call is demo insurance', () => {
  it('records to the store, and a second identical call reads it back under the same hash', async () => {
    const store = createInMemoryFixtureStore();
    let transportCalls = 0;
    const transport: ModelTransport = () => {
      transportCalls += 1;
      return Promise.resolve(message([toolUse(EMIT)]));
    };

    const first = await extractSourceLive(source, input, { mode: 'live', transport, store });
    expect(transportCalls).toBe(1);
    expect(first.degraded).toBe(false);

    // Second call: same source, same input, but mode: replay with a
    // throwing transport — it must be answered entirely from what the first
    // call recorded, at the identical hash.
    const second = await extractSourceLive(source, input, {
      mode: 'replay',
      transport: throwingTransport,
      store,
    });

    // Ids are freshly minted per call (no prior identity to preserve outside
    // fixture replay), so compare content, not identity.
    expect(second.kept.map((c) => c.quote)).toEqual(first.kept.map((c) => c.quote));
    expect(second.degraded).toBe(false);
    expect(second.notice).toBeNull();
  });
});

/* ------------------------------ determinism ------------------------------ */

describe('determinism — the request IS the fixture key', () => {
  it('building the same extraction request twice yields the same requestHash', async () => {
    const captured: ModelRequest[] = [];
    const capturingTransport: ModelTransport = (request) => {
      captured.push(request);
      return Promise.resolve(message([toolUse(EMIT)]));
    };

    await extractSourceLive(source, input, {
      mode: 'live',
      transport: capturingTransport,
      store: createInMemoryFixtureStore(),
    });
    await extractSourceLive(source, input, {
      mode: 'live',
      transport: capturingTransport,
      store: createInMemoryFixtureStore(),
    });

    expect(captured).toHaveLength(2);
    const [first, second] = captured;
    if (first === undefined || second === undefined) throw new Error('expected two captured requests');
    expect(requestHash(first)).toBe(requestHash(second));
  });

  it('a per-run source id does NOT leak into the request — two calls with different source ids for the same document hash identically', async () => {
    // Regression guard for the exact defect the mode seam migration found:
    // the instruction text used to read `(source id ${source.id})`, and
    // route.ts mints a fresh randomUUID() per upload — a genuinely per-run
    // value. That made every live request for the "same" document unique,
    // so fixtures/replay could never find what live had just recorded.
    const captured: ModelRequest[] = [];
    const capturingTransport: ModelTransport = (request) => {
      captured.push(request);
      return Promise.resolve(message([toolUse(EMIT)]));
    };

    const sourceA: Pick<Source, 'id' | 'title' | 'kind'> = { ...source, id: 'run-1-uuid' };
    const sourceB: Pick<Source, 'id' | 'title' | 'kind'> = { ...source, id: 'run-2-uuid' };

    await extractSourceLive(sourceA, input, {
      mode: 'live',
      transport: capturingTransport,
      store: createInMemoryFixtureStore(),
    });
    await extractSourceLive(sourceB, input, {
      mode: 'live',
      transport: capturingTransport,
      store: createInMemoryFixtureStore(),
    });

    const [first, second] = captured;
    if (first === undefined || second === undefined) throw new Error('expected two captured requests');
    expect(requestHash(first)).toBe(requestHash(second));
    // And the id must genuinely not appear anywhere in what got sent.
    expect(JSON.stringify(first)).not.toContain('run-1-uuid');
    expect(JSON.stringify(second)).not.toContain('run-2-uuid');
  });
});

/* --------------------------- no SDK bypass --------------------------- */

describe('no direct @anthropic-ai/sdk calls outside lib/modes', () => {
  function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(...listTsFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  it('lib/ai/** and app/api/** never call messages.create — only lib/modes may', () => {
    const root = process.cwd();
    const files = [...listTsFiles(path.join(root, 'lib', 'ai')), ...listTsFiles(path.join(root, 'app', 'api'))];
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/messages\s*\.\s*create\s*\(/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
