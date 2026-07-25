// @vitest-environment node
/**
 * lib/ai/dates.ts — the date-resolution post-pass.
 *
 * Deterministic tests inject a transport/store (never the real network, never
 * the real fixtures/recorded/ tree — see lib/modes/store.ts). The live test
 * at the bottom is committed and CI-safe: it skips when no ANTHROPIC_API_KEY
 * is available, following the exact pattern in `checklist.test.ts`.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  createInMemoryFixtureStore,
  requestHash,
  type ModelRequest,
  type ModelTransport,
} from '@/lib/modes';
import { MODELS } from '@/lib/ai/models';
import {
  DATE_RESOLUTION_SYSTEM,
  DATE_RESOLUTION_TOOL,
  resolveClaimDates,
} from '@/lib/ai/dates';
import type { Claim, DatePrecision } from '@/lib/contracts';

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
    model: MODELS.haiku,
    role: 'assistant',
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: usage(),
  };
}

function toolUse(input: unknown): Anthropic.ContentBlock {
  return {
    type: 'tool_use',
    id: 'toolu_test',
    name: DATE_RESOLUTION_TOOL.name,
    input,
    caller: { type: 'direct' },
  };
}

/** Records every request it receives and replays canned responses in order. */
function recorder(responses: Anthropic.Message[]): {
  transport: ModelTransport;
  calls: ModelRequest[];
} {
  const calls: ModelRequest[] = [];
  let index = 0;
  const transport: ModelTransport = (request) => {
    calls.push(request);
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined) throw new Error('recorder: no canned response');
    return Promise.resolve(next);
  };
  return { transport, calls };
}

const throwingTransport: ModelTransport = () => {
  throw new Error('transport must not be called in fixtures/replay mode');
};

let nextClaimId = 0;

/** A minimal, valid Claim. Every field a real caller would already have. */
function claim(overrides: {
  readonly id?: string;
  readonly quote?: string;
  readonly value?: string;
  readonly date_precision?: DatePrecision;
  readonly asserted_at?: string | null;
}): Claim {
  nextClaimId += 1;
  const suffix = String(nextClaimId).padStart(12, '0');
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${suffix}`,
    source_id: '50000000-0000-4000-8000-000000000001',
    ontology_key: 'observation.fall',
    subject: 'fall',
    value: overrides.value ?? 'a fall',
    quote: overrides.quote ?? 'I had a fall a few months ago',
    locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
    asserted_at: overrides.asserted_at ?? null,
    date_precision: overrides.date_precision ?? 'unknown',
    provenance: 'document_extracted',
    verified_substring: true,
  };
}

/** Every key present anywhere in a value, at any depth — including inside
 *  JSON-encoded string content, so a banned key hiding in a serialised
 *  request body is still caught. */
function keysOf(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    try {
      keysOf(JSON.parse(value), out);
    } catch {
      // not JSON — nothing to walk
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      out.add(key);
      keysOf(val, out);
    }
  }
  return out;
}

const REFERENCE_DATE = '2026-07-20';

/* ------------------------------ the schema ------------------------------ */

describe('DATE_RESOLUTION_TOOL', () => {
  it("the precision enum is exactly ['approximate', 'month', 'year']", () => {
    const schema = DATE_RESOLUTION_TOOL.input_schema as {
      properties: {
        resolutions: { items: { properties: { date_precision: { enum: readonly string[] } } } };
      };
    };
    expect(schema.properties.resolutions.items.properties.date_precision.enum).toEqual([
      'approximate',
      'month',
      'year',
    ]);
  });

  it('is strict, so the API — not our prose — enforces the schema', () => {
    expect(DATE_RESOLUTION_TOOL.strict).toBe(true);
  });
});

describe('no judgement key anywhere in the tool, prompt, or a resolved claim', () => {
  it('recursive walk finds nothing matching severity|urgency|priority|rank|risk|score', () => {
    const BANNED = /severity|urgency|priority|rank|risk|score/i;
    for (const key of keysOf(DATE_RESOLUTION_TOOL)) {
      expect(key).not.toMatch(BANNED);
    }
    expect(DATE_RESOLUTION_SYSTEM).not.toMatch(BANNED);
  });
});

/* ------------------------------ candidates ------------------------------ */

describe('candidate selection', () => {
  it('exact/month/year claims never enter the request and never change', async () => {
    const cExact = claim({ date_precision: 'exact', asserted_at: '2026-01-01', quote: 'seen on 1 Jan' });
    const cMonth = claim({ date_precision: 'month', asserted_at: '2026-02-01', quote: 'in February' });
    const cYear = claim({ date_precision: 'year', asserted_at: '2026-01-01', quote: 'sometime in 2026' });
    // Deliberately ordered so id-sort reorders them in the request.
    const cB = claim({ id: '00000000-0000-4000-8000-b00000000000', date_precision: 'approximate', quote: 'last winter' });
    const cA = claim({ id: '00000000-0000-4000-8000-a00000000000', date_precision: 'unknown', quote: 'a few months ago' });

    const { transport, calls } = recorder([message([toolUse({ resolutions: [] })])]);

    const result = await resolveClaimDates(
      { claims: [cExact, cMonth, cYear, cB, cA], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    // Pass-through fidelity: non-candidates come back byte-identical.
    expect(result.claims[0]).toBe(cExact);
    expect(result.claims[1]).toBe(cMonth);
    expect(result.claims[2]).toBe(cYear);
    expect(result.resolved).toBe(0);

    // Only the two candidates were sent, sorted by id: cA ('...a00...') before cB ('...b00...').
    const call = calls[0];
    if (call === undefined) throw new Error('expected one request');
    const userMessage = call.messages[0];
    if (userMessage === undefined || typeof userMessage.content === 'string') {
      throw new Error('expected structured user content');
    }
    const textBlock = userMessage.content[0];
    if (textBlock === undefined || textBlock.type !== 'text') throw new Error('expected a text block');
    const payload = JSON.parse(textBlock.text) as {
      reference_date: string;
      candidates: readonly { index: number; quote: string; value: string }[];
    };

    expect(payload.reference_date).toBe(REFERENCE_DATE);
    expect(payload.candidates).toHaveLength(2);
    expect(payload.candidates[0]).toEqual({ index: 0, quote: cA.quote, value: cA.value });
    expect(payload.candidates[1]).toEqual({ index: 1, quote: cB.quote, value: cB.value });
    // No candidate carries anything beyond index/quote/value.
    for (const candidate of payload.candidates) {
      expect(Object.keys(candidate).sort()).toEqual(['index', 'quote', 'value']);
    }
  });

  it('a claim that already carries a date is never a candidate and never re-dated', async () => {
    // Extraction's own contract is "no stated date -> null + 'unknown'"
    // (lib/ai/prompts.ts), so a dated 'approximate' claim was anchored from
    // the whole document. This pass sees one quote and must not second-guess
    // it — including by "upgrading" it to 'month' or downgrading it to 'year'.
    const dated = claim({
      date_precision: 'approximate',
      asserted_at: '2026-03-15',
      quote: 'around the middle of March',
    });

    // No candidates at all, so the transport must never be reached.
    const result = await resolveClaimDates(
      { claims: [dated], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport: throwingTransport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(dated);
  });

  it('an accepted resolution changes ONLY asserted_at and date_precision', async () => {
    const target = claim({
      id: '00000000-0000-4000-8000-000000000aaa',
      date_precision: 'unknown',
      quote: 'I had a fall a few months ago',
      value: 'a fall',
    });

    const { transport } = recorder([
      message([
        toolUse({ resolutions: [{ index: 0, asserted_at: '2026-05-01', date_precision: 'approximate' }] }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(1);
    const updated = result.claims[0];
    if (updated === undefined) throw new Error('expected one claim back');
    expect(updated).not.toBe(target); // a copy, not a mutation
    expect(updated.asserted_at).toBe('2026-05-01');
    expect(updated.date_precision).toBe('approximate');
    // Every other field byte-identical.
    const { asserted_at: _a, date_precision: _d, ...restUpdated } = updated;
    const { asserted_at: _a2, date_precision: _d2, ...restOriginal } = target;
    expect(restUpdated).toEqual(restOriginal);
  });
});

/* ------------------------------- discards -------------------------------- */

describe('discarded resolutions', () => {
  it("a resolution claiming precision 'exact' is discarded; claim unchanged", async () => {
    const target = claim({ date_precision: 'unknown' });
    const { transport } = recorder([
      message([
        toolUse({
          resolutions: [{ index: 0, asserted_at: '2026-05-01', date_precision: 'exact' }],
        }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(target);
  });

  it('a resolution dated after the reference date is discarded', async () => {
    const target = claim({ date_precision: 'approximate' });
    const { transport } = recorder([
      message([
        toolUse({
          resolutions: [{ index: 0, asserted_at: '2026-08-01', date_precision: 'approximate' }],
        }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(target);
  });

  it('a resolution for an unlisted index is discarded; no crash', async () => {
    const target = claim({ date_precision: 'unknown' });
    const { transport } = recorder([
      message([
        toolUse({
          resolutions: [
            { index: 5, asserted_at: '2026-05-01', date_precision: 'approximate' },
            { index: -1, asserted_at: '2026-05-01', date_precision: 'month' },
          ],
        }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(target);
  });

  it('a duplicate claim id cannot carry a resolution onto a precisely dated claim', async () => {
    // Nothing in this pipeline enforces unique claim ids, and id-keyed
    // application would let an undated claim's resolution overwrite a claim
    // that shares its id — the one path by which this pass could destroy a
    // documented date. Resolutions are applied by array position instead.
    const sharedId = '00000000-0000-4000-8000-00000000d0be';
    const precise = claim({ id: sharedId, date_precision: 'exact', asserted_at: '2026-01-05' });
    const vague = claim({ id: sharedId, date_precision: 'unknown', quote: 'a few months ago' });

    const { transport } = recorder([
      message([
        toolUse({ resolutions: [{ index: 0, asserted_at: '2026-05-01', date_precision: 'approximate' }] }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [precise, vague], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    // Exactly one claim changed, and it is the undated one.
    expect(result.resolved).toBe(1);
    expect(result.claims[0]).toBe(precise);
    expect(result.claims[0]?.asserted_at).toBe('2026-01-05');
    expect(result.claims[0]?.date_precision).toBe('exact');
    expect(result.claims[1]?.asserted_at).toBe('2026-05-01');
    expect(result.claims[1]?.date_precision).toBe('approximate');
  });

  it('two resolutions for one candidate contradict each other: the claim is left alone', async () => {
    const target = claim({ date_precision: 'unknown' });
    const { transport } = recorder([
      message([
        toolUse({
          resolutions: [
            { index: 0, asserted_at: '2026-05-01', date_precision: 'approximate' },
            { index: 0, asserted_at: '2026-02-01', date_precision: 'month' },
          ],
        }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(target);
  });

  it('an unusable reference date refuses the whole pass — no call, nothing changed', async () => {
    // The future-date guard is a lexicographic comparison; against a
    // reference like 'abc' every resolved date compares as "not after" and
    // the guard stops guarding. So a bad reference must stop the pass before
    // the request, not merely be passed along to the model.
    for (const referenceDate of ['abc', '', '20/07/2026', '2026-07-20T09:00:00Z', '2026-02-30']) {
      const target = claim({ date_precision: 'unknown' });
      const result = await resolveClaimDates(
        { claims: [target], referenceDate },
        { mode: 'live', transport: throwingTransport, store: createInMemoryFixtureStore() },
      );
      expect(result.resolved, referenceDate).toBe(0);
      expect(result.claims[0], referenceDate).toBe(target);
    }
  });

  it('a malformed date is discarded rather than honoured', async () => {
    const target = claim({ date_precision: 'unknown' });
    const { transport } = recorder([
      message([
        toolUse({
          resolutions: [{ index: 0, asserted_at: '2026-02-30', date_precision: 'month' }],
        }),
      ]),
    ]);

    const result = await resolveClaimDates(
      { claims: [target], referenceDate: REFERENCE_DATE },
      { mode: 'live', transport, store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(target);
  });
});

/* ---------------------------------- miss ---------------------------------- */

describe('a miss', () => {
  it('leaves every claim unchanged with resolved: 0, and never throws', async () => {
    const claims = [
      claim({ date_precision: 'unknown' }),
      claim({ date_precision: 'approximate' }),
      claim({ date_precision: 'exact', asserted_at: '2026-01-01' }),
    ];

    const result = await resolveClaimDates(
      { claims, referenceDate: REFERENCE_DATE },
      { mode: 'fixtures', store: createInMemoryFixtureStore() },
    );

    expect(result.resolved).toBe(0);
    expect(result.degraded).toBe(false);
    expect(result.claims).toEqual(claims);
    expect(result.claims[0]).toBe(claims[0]);
    expect(result.claims[1]).toBe(claims[1]);
    expect(result.claims[2]).toBe(claims[2]);
  });

  it('no candidates means no call at all — zero network by construction', async () => {
    const claims = [claim({ date_precision: 'exact', asserted_at: '2026-01-01' })];
    const result = await resolveClaimDates(
      { claims, referenceDate: REFERENCE_DATE },
      { mode: 'live', transport: throwingTransport, store: createInMemoryFixtureStore() },
    );
    expect(result.resolved).toBe(0);
    expect(result.claims[0]).toBe(claims[0]);
  });
});

/* ------------------------------ determinism ------------------------------ */

describe('determinism', () => {
  it('two calls over the same input produce byte-identical request bodies', async () => {
    const claims = [
      claim({ id: '00000000-0000-4000-8000-000000000001', date_precision: 'unknown' }),
      claim({ id: '00000000-0000-4000-8000-000000000002', date_precision: 'approximate', quote: 'last winter' }),
    ];

    const { transport: t1, calls: calls1 } = recorder([message([toolUse({ resolutions: [] })])]);
    const { transport: t2, calls: calls2 } = recorder([message([toolUse({ resolutions: [] })])]);

    await resolveClaimDates(
      { claims, referenceDate: REFERENCE_DATE },
      { mode: 'live', transport: t1, store: createInMemoryFixtureStore() },
    );
    await resolveClaimDates(
      { claims, referenceDate: REFERENCE_DATE },
      { mode: 'live', transport: t2, store: createInMemoryFixtureStore() },
    );

    const first = calls1[0];
    const second = calls2[0];
    if (first === undefined || second === undefined) throw new Error('expected two captured requests');
    expect(requestHash(first)).toBe(requestHash(second));
  });
});

/* --------------------------------- live ---------------------------------- */

function liveKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^ANTHROPIC_API_KEY=(.+)$/.exec(line.trim());
    if (m?.[1]) return m[1];
  }
  return undefined;
}

describe('live: a genuinely vague, relative date', () => {
  const key = liveKey();

  // HISTORY, kept because it is the reason models.ts looks the way it does:
  // the first live Haiku call returned 400 — "Thinking may not be enabled
  // when tool_choice forces tool use." The budget dialect models.ts
  // originally encoded was incompatible with the forced tool_choice every
  // Lane A call sends. models.ts now omits `thinking` for Haiku, and this
  // test — briefly an `it.fails` red flag — is the live proof of the fix.
  const runLive = key === undefined ? it.skip : it;

  runLive(
    '"a few months ago" resolves to a past date with approximate or month precision',
    async () => {
      if (key !== undefined && process.env.ANTHROPIC_API_KEY === undefined) {
        process.env.ANTHROPIC_API_KEY = key;
      }

      const target = claim({
        quote: 'I had a fall a few months ago',
        value: 'a fall',
        date_precision: 'unknown',
        asserted_at: null,
      });

      // Never the real fixtures/recorded/ tree — see lib/modes/store.ts.
      const store = createInMemoryFixtureStore();
      const result = await resolveClaimDates(
        { claims: [target], referenceDate: '2026-07-20' },
        { mode: 'live', timeoutMs: 180_000, store },
      );

      console.log('\n===== DATE RESOLUTION LIVE RESULT =====');
      const resolved = result.claims[0];
      console.log('  asserted_at:', resolved?.asserted_at, '| date_precision:', resolved?.date_precision);
      console.log('========================================\n');

      expect(result.degraded).toBe(false);
      expect(result.resolved).toBe(1);
      if (resolved === undefined) throw new Error('expected the resolved claim back');
      const date = resolved.asserted_at;
      if (date === null) throw new Error('expected a resolved date');
      expect(date < '2026-07-20').toBe(true);
      expect(['approximate', 'month']).toContain(resolved.date_precision);
    },
    240_000,
  );

  // The prompt carries ONE worked example, and its arithmetic is reference
  // minus three months. The first live result equalled that example exactly,
  // which is either the right answer or the example's gravity. This case has
  // a different, unambiguous distance: if everything collapses onto ref-3mo,
  // this fails and the example is overfitting the task.
  runLive(
    '"six weeks earlier" resolves near six weeks back, not onto the worked example\'s ref-3mo',
    async () => {
      if (key !== undefined && process.env.ANTHROPIC_API_KEY === undefined) {
        process.env.ANTHROPIC_API_KEY = key;
      }

      const target = claim({
        quote: 'she stopped managing the stairs six weeks earlier',
        value: 'unable to manage stairs',
        date_precision: 'unknown',
        asserted_at: null,
      });

      const store = createInMemoryFixtureStore();
      const result = await resolveClaimDates(
        { claims: [target], referenceDate: '2026-07-20' },
        { mode: 'live', timeoutMs: 180_000, store },
      );

      const resolved = result.claims[0];
      console.log('\n===== DATE RESOLUTION LIVE RESULT (six weeks) =====');
      console.log('  asserted_at:', resolved?.asserted_at, '| date_precision:', resolved?.date_precision);
      console.log('==================================================\n');

      expect(result.resolved).toBe(1);
      if (resolved === undefined) throw new Error('expected the resolved claim back');
      const date = resolved.asserted_at;
      if (date === null) throw new Error('expected a resolved date');
      // Six weeks back from 2026-07-20 is 2026-06-08. A generous window still
      // excludes 2026-04-20, the worked example's answer.
      expect(date > '2026-05-15').toBe(true);
      expect(date <= '2026-07-20').toBe(true);
      expect(resolved.date_precision).not.toBe('exact');
    },
    240_000,
  );
});
