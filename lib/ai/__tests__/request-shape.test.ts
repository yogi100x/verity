/**
 * The request body we send Anthropic, asserted statically.
 *
 * Every rule checked here returns HTTP 400 at runtime and only with a real API
 * key — i.e. it would be discovered on stage, not in CI. That is why these are
 * tests and not comments: `budget_tokens` on Sonnet, a stray `temperature`, an
 * assistant-turn prefill, `strict` on `tool_choice`, or a date-suffixed model
 * id are all silent until the first live call.
 *
 * Every call goes through the mode seam (`callModel`, `@/lib/modes`) via an
 * injected `transport` — never a stub of the Anthropic SDK client. That is
 * what proves `fixtures`/`replay` make zero network calls by construction: a
 * transport that throws when invoked, still succeeding, is the strongest
 * statement this suite can make about "no network".
 */

import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createInMemoryFixtureStore, requestHash, type ModelRequest, type ModelTransport } from '@/lib/modes';
import { callForcedTool, ToolCallFailedError, type CallSeamOptions } from '@/lib/ai/client';
import { MODELS, modelParams } from '@/lib/ai/models';
import { EXTRACTION_TOOL } from '@/lib/ai/prompts';
import { extractSourceLive, type RawClaim } from '@/lib/ai/extract';
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
  stopReason: Anthropic.Message['stop_reason'],
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

/** A transport that records every request and replays canned responses in order. */
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

/** Every live-mode call in this suite gets its own in-memory store — never
 *  the real `fixtures/recorded/` tree, which `scripts/verify.sh` guards. */
function liveOpts(transport: ModelTransport): CallSeamOptions {
  return { mode: 'live', transport, store: createInMemoryFixtureStore() };
}

/** A transport that fails the test if it is ever invoked — proves
 *  fixtures/replay make zero network calls by construction. */
const throwingTransport: ModelTransport = () => {
  throw new Error('transport must not be called in fixtures/replay mode');
};

const EMPTY_EMIT = { transcript: 'nothing here', claims: [] };

/** Every key present anywhere in a request body, at any depth. */
function keysOf(value: unknown, out: Set<string> = new Set()): Set<string> {
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

/* -------------------------------- model ids -------------------------------- */

describe('model ids', () => {
  it('are the exact undated strings the API accepts', () => {
    expect(MODELS.sonnet).toBe('claude-sonnet-5');
    expect(MODELS.haiku).toBe('claude-haiku-4-5');
    expect(MODELS.opus).toBe('claude-opus-5');
  });

  it('carry no date suffix', () => {
    for (const id of Object.values(MODELS)) {
      expect(id).not.toMatch(/-\d{8}$/);
    }
  });
});

/* ------------------------------ modelParams ------------------------------ */

describe('modelParams — adaptive family (Sonnet 5, Opus 5)', () => {
  for (const model of [MODELS.sonnet, MODELS.opus]) {
    it(`${model}: adaptive thinking + effort, never budget_tokens`, () => {
      const params = modelParams(model, { effort: 'low', maxTokens: 16000 });
      expect(params.thinking).toEqual({ type: 'adaptive' });
      expect(keysOf(params).has('budget_tokens')).toBe(false);
      expect(params.output_config).toEqual({ effort: 'low' });
    });
  }

  it('omits output_config entirely when no effort is given', () => {
    const params = modelParams(MODELS.sonnet, { maxTokens: 16000 });
    expect(params.output_config).toBeUndefined();
    expect(Object.keys(params)).not.toContain('output_config');
  });
});

describe('modelParams — budget family (Haiku 4.5)', () => {
  // These assertions INVERTED on live evidence. The registry originally sent
  // `thinking: {type:'enabled', budget_tokens}` for Haiku, and the first real
  // Haiku call returned 400: "Thinking may not be enabled when tool_choice
  // forces tool use." Every Lane A call forces a tool, so Haiku requests must
  // omit `thinking` entirely — which on a pre-adaptive model means no
  // extended thinking, legal under forced tool use.
  it('omits thinking entirely — forced tool use forbids enabled-type thinking', () => {
    const params = modelParams(MODELS.haiku, { effort: 'high', maxTokens: 16000 });
    expect(params.thinking).toBeUndefined();
    expect(Object.keys(params)).not.toContain('thinking');
    expect(keysOf(params).has('budget_tokens')).toBe(false);
    expect(params.output_config).toBeUndefined();
  });

  it('never emits budget_tokens at any size', () => {
    for (const maxTokens of [512, 1024, 2048, 16000, 64000]) {
      const params = modelParams(MODELS.haiku, { maxTokens });
      expect(keysOf(params).has('budget_tokens'), `maxTokens ${maxTokens}`).toBe(false);
      expect(params.max_tokens).toBe(maxTokens);
    }
  });
});

/* ---------------------------- the tool definition ---------------------------- */

describe('EXTRACTION_TOOL', () => {
  it('puts strict:true at the TOP LEVEL of the tool, with the schema the API requires', () => {
    expect(EXTRACTION_TOOL.strict).toBe(true);
    expect(EXTRACTION_TOOL.input_schema.additionalProperties).toBe(false);
    expect(EXTRACTION_TOOL.input_schema.required).toEqual(['transcript', 'claims']);
  });
});

/* ----------------------------- callForcedTool ----------------------------- */

describe('callForcedTool — request body', () => {
  it('sends no sampling parameters, no prefill, and strict only on the tool', async () => {
    const { transport, calls } = recorder([message([toolUse(EMPTY_EMIT)], 'tool_use')]);

    await callForcedTool(
      {
        model: MODELS.sonnet,
        system: 'system prefix',
        content: [{ type: 'text', text: 'go' }],
        tool: EXTRACTION_TOOL,
        effort: 'low',
      },
      liveOpts(transport),
    );

    const [request] = calls;
    if (request === undefined) throw new Error('no request was recorded');

    // Sampling parameters are 400s on Sonnet 5 / Opus 5.
    const keys = keysOf(request);
    for (const banned of ['temperature', 'top_p', 'top_k', 'budget_tokens']) {
      expect(keys.has(banned)).toBe(false);
    }

    // Citations and output_config.format are mutually incompatible; we rely on
    // forced strict tool use plus our own substring check instead.
    expect(keys.has('citations')).toBe(false);
    expect(keys.has('format')).toBe(false);

    // No assistant-turn prefill: the last message must be the user's.
    expect(request.messages.every((m) => m.role === 'user')).toBe(true);
    expect(request.messages.at(-1)?.role).toBe('user');

    // strict belongs on the tool, never on tool_choice. And exactly one tool
    // call, forced by name: `disable_parallel_tool_use` means
    // a second tool_use block cannot arrive, so nothing downstream has to
    // decide which of several payloads to trust.
    expect(request.tool_choice).toEqual({
      type: 'tool',
      name: EXTRACTION_TOOL.name,
      disable_parallel_tool_use: true,
    });
    expect(keysOf(request.tool_choice).has('strict')).toBe(false);
    expect(request.tools?.[0]).toHaveProperty('strict', true);

    expect(request.model).toBe('claude-sonnet-5');
    expect(request.thinking).toEqual({ type: 'adaptive' });
  });

  it('caches the stable system prefix and puts a per-attempt suffix after it', async () => {
    const { transport, calls } = recorder([message([toolUse(EMPTY_EMIT)], 'tool_use')]);

    await callForcedTool(
      {
        model: MODELS.sonnet,
        system: 'stable prefix',
        systemSuffix: 'per-attempt addendum',
        content: [{ type: 'text', text: 'go' }],
        tool: EXTRACTION_TOOL,
      },
      liveOpts(transport),
    );

    const system = calls[0]?.system;
    expect(Array.isArray(system)).toBe(true);
    if (!Array.isArray(system)) return;
    expect(system[0]).toEqual({
      type: 'text',
      text: 'stable prefix',
      cache_control: { type: 'ephemeral' },
    });
    // The addendum must sit AFTER the breakpoint or it changes the cached
    // prefix and costs every other call its cache hit.
    expect(system[1]).toEqual({ type: 'text', text: 'per-attempt addendum' });
  });

  it('checks stop_reason for refusal BEFORE touching content', async () => {
    // A refusal carries no content; indexing into it first is the bug.
    const { transport } = recorder([message([], 'refusal')]);
    await expect(
      callForcedTool(
        {
          model: MODELS.sonnet,
          system: 's',
          content: [{ type: 'text', text: 'go' }],
          tool: EXTRACTION_TOOL,
        },
        liveOpts(transport),
      ),
    ).rejects.toThrow(ToolCallFailedError);
  });

  it('fails loudly when the turn stopped before any tool_use block', async () => {
    const { transport } = recorder([
      message([{ type: 'text', text: 'partial…', citations: null }], 'max_tokens'),
    ]);
    await expect(
      callForcedTool(
        {
          model: MODELS.sonnet,
          system: 's',
          content: [{ type: 'text', text: 'go' }],
          tool: EXTRACTION_TOOL,
        },
        liveOpts(transport),
      ),
    ).rejects.toThrow(/max_tokens/);
  });

  it('the captured request is exactly what gets hashed', async () => {
    const { transport, calls } = recorder([message([toolUse(EMPTY_EMIT)], 'tool_use')]);

    const outcome = await callForcedTool(
      {
        model: MODELS.sonnet,
        system: 'system prefix',
        content: [{ type: 'text', text: 'go' }],
        tool: EXTRACTION_TOOL,
        effort: 'low',
      },
      liveOpts(transport),
    );

    const [request] = calls;
    if (request === undefined) throw new Error('no request was recorded');
    if (outcome.kind !== 'ok') throw new Error('expected an ok outcome');
    expect(outcome.hash).toBe(requestHash(request));
  });

  it('calling with mode: "fixtures" never invokes the transport at all', async () => {
    const outcome = await callForcedTool(
      {
        model: MODELS.sonnet,
        system: 'system prefix',
        content: [{ type: 'text', text: 'go' }],
        tool: EXTRACTION_TOOL,
        effort: 'low',
      },
      { mode: 'fixtures', transport: throwingTransport, store: createInMemoryFixtureStore() },
    );

    // No fixture was ever recorded for this request, and the throwing
    // transport was never reached (it would have thrown out of the await
    // above if it had been) — a miss, not a crash.
    expect(outcome).toEqual({ kind: 'miss', degraded: false, hash: outcome.hash });
  });
});

/* --------------------------- the retry, end to end --------------------------- */

describe('extractSourceLive — retry', () => {
  const source: Pick<Source, 'id' | 'title' | 'kind'> = {
    id: 'src-1',
    title: 'Scan',
    kind: 'image',
  };
  const input: SourceInput = { kind: 'text', text: 'x' };

  const TRANSCRIPT = 'Furosemide 40mg was stopped on discharge. Daily weights.';

  const verifiable: RawClaim = {
    ontology_key: 'medication.furosemide',
    subject: 'furosemide',
    value: 'stopped',
    quote: 'Furosemide 40mg was stopped on discharge.',
    page: 1,
    asserted_at: null,
    date_precision: 'unknown',
  };
  const alsoVerifiable: RawClaim = {
    ontology_key: 'instruction.monitoring',
    subject: 'weights',
    value: 'daily',
    quote: 'Daily weights.',
    page: 1,
    asserted_at: null,
    date_precision: 'unknown',
  };
  const fabricated: RawClaim = {
    ontology_key: 'medication.furosemide',
    subject: 'furosemide',
    value: 'restarted',
    quote: 'the patient was told to restart furosemide',
    page: 1,
    asserted_at: null,
    date_precision: 'unknown',
  };
  const alsoFabricated: RawClaim = {
    ontology_key: 'medication.bisoprolol',
    subject: 'bisoprolol',
    value: '5mg',
    quote: 'bisoprolol increased to 5mg',
    page: 1,
    asserted_at: null,
    date_precision: 'unknown',
  };

  const GOOD = { transcript: TRANSCRIPT, claims: [verifiable, alsoVerifiable] };
  const ALL_FABRICATED = { transcript: TRANSCRIPT, claims: [fabricated, alsoFabricated] };

  it('retries once when every quote failed verification', async () => {
    const { transport, calls } = recorder([
      message([toolUse(ALL_FABRICATED)], 'tool_use'),
      message([toolUse(GOOD)], 'tool_use'),
    ]);

    const report = await extractSourceLive(source, input, liveOpts(transport));

    expect(calls).toHaveLength(2);
    expect(report.retried).toBe(true);
    expect(report.kept).toHaveLength(2);
    expect(report.dropped).toHaveLength(0);
    expect(report.notice).toBeNull();
    expect(report.degraded).toBe(false);
    // The retry is the contrast-boosted variant, sent as a system suffix.
    const secondSystem = calls[1]?.system;
    expect(Array.isArray(secondSystem) ? secondSystem.length : 0).toBe(2);
  });

  it('keeps the better attempt when the retry comes back worse', async () => {
    // First pass: 1 of 2 verified (a 50% drop rate, so it retries). Second
    // pass: nothing verified. Overwriting unconditionally would lose the one
    // good claim — a manufactured missing claim.
    const half = { transcript: TRANSCRIPT, claims: [verifiable, fabricated] };
    const { transport } = recorder([
      message([toolUse(half)], 'tool_use'),
      message([toolUse(ALL_FABRICATED)], 'tool_use'),
    ]);

    const report = await extractSourceLive(source, input, liveOpts(transport));

    expect(report.retried).toBe(true);
    expect(report.kept).toHaveLength(1);
    expect(report.kept[0]?.quote).toBe(verifiable.quote);
  });

  it('never silently returns nothing: a still-bad source carries an honest notice', async () => {
    const { transport } = recorder([
      message([toolUse(ALL_FABRICATED)], 'tool_use'),
      message([toolUse(ALL_FABRICATED)], 'tool_use'),
    ]);

    const report = await extractSourceLive(source, input, liveOpts(transport));

    expect(report.kept).toHaveLength(0);
    expect(report.notice).not.toBeNull();
    expect(report.notice).toContain('could not be read');
    // An honest notice, not a judgement and not a guess at the missing text.
    expect(report.notice).not.toMatch(/severity|urgency|risk|score|triage/i);
  });
});
