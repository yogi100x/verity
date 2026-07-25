/**
 * The single call-shape every extraction, grouping, gap, and artefact call in
 * Lane A goes through: force a tool, get back its unvalidated input, and a
 * usage summary the caller can log or use to verify prompt caching.
 *
 * This file does not validate anything — callers Zod-parse `result.input`
 * against the shape they expect (`EMIT_CLAIMS_TOOL`'s schema, etc). Keeping
 * validation out of here keeps this file honest about what it actually
 * guarantees: a tool ran, or an error says why not.
 *
 * Every call goes through `callModel` (`@/lib/modes`) — the mode seam Lane D
 * owns. This file never imports `@anthropic-ai/sdk` to make a call; the
 * import here is types only (`ModelRequest` IS
 * `Anthropic.MessageCreateParamsNonStreaming`).
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
  callModel,
  type FixtureStore,
  type Mode,
  type ModelRequest,
  type ModelTransport,
} from '@/lib/modes';
import { modelParams, type Effort, type ModelId } from './models';

/** Non-streaming requests risk SDK HTTP timeouts above this — see models.ts. */
const DEFAULT_MAX_TOKENS = 16000;

export interface ForcedToolCall {
  readonly model: ModelId;
  /** The stable, cacheable system prefix. Must not vary per request. */
  readonly system: string;
  /**
   * Appended as a SECOND system block, after the cache breakpoint, so that a
   * per-attempt addendum (e.g. extraction's contrast-boost retry) does not
   * change the cached prefix and cost every other call its cache hit.
   */
  readonly systemSuffix?: string;
  readonly content: readonly Anthropic.ContentBlockParam[];
  readonly tool: Anthropic.Tool;
  readonly effort?: Effort;
  readonly maxTokens?: number;
}

/** Every option `callModel` accepts, minus `mode`'s inline position — callers
 *  supply `mode` alongside these when invoking `callForcedTool`. Production
 *  code omits `transport`/`store`; tests inject them to run with zero network
 *  and no real filesystem. */
export interface CallSeamOptions {
  readonly mode: Mode;
  /** Default: the real Anthropic transport. Tests inject a stub. */
  readonly transport?: ModelTransport;
  /** Default: node fs over fixtures/recorded/. Tests inject a temp/in-memory store. */
  readonly store?: FixtureStore;
  readonly timeoutMs?: number;
  readonly onRecordError?: (error: unknown) => void;
}

export interface CallUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
}

export type ForcedToolOutcome =
  | {
      readonly kind: 'ok';
      /** The tool_use input, UNVALIDATED. Callers Zod-parse it. */
      readonly input: unknown;
      readonly usage: CallUsage;
      readonly degraded: boolean;
      readonly hash: string;
    }
  | {
      readonly kind: 'miss';
      readonly degraded: boolean;
      readonly hash: string;
    };

/**
 * Thrown whenever the model DID respond but did not hand back a usable
 * forced tool call: a refusal, or a stop before any tool_use block appeared
 * (most often `max_tokens` — the message names the stop_reason so that's
 * obvious from the log without re-deriving it). A missing fixture is NOT
 * this — that is a `{ kind: 'miss' }` result, never a throw.
 */
export class ToolCallFailedError extends Error {}

export async function callForcedTool(
  req: ForcedToolCall,
  opts: CallSeamOptions,
): Promise<ForcedToolOutcome> {
  const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  const params = modelParams(req.model, { effort: req.effort, maxTokens });

  // Render order is tools -> system -> messages, so a breakpoint on the last
  // system block caches the tool schema and the system prefix together. Verify
  // it is working with `usage.cache_read_input_tokens`, surfaced as
  // `cacheReadTokens` below and rendered on /api/debug/inspect.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: req.system, cache_control: { type: 'ephemeral' } },
  ];
  if (req.systemSuffix !== undefined) {
    system.push({ type: 'text', text: req.systemSuffix });
  }

  const request: ModelRequest = {
    ...params,
    system,
    messages: [{ role: 'user', content: [...req.content] }],
    tools: [req.tool],
    // `disable_parallel_tool_use` makes "exactly one tool call" an API-level
    // guarantee rather than something we hope for and then paper over by
    // taking the first block. Every Lane A call emits one structured payload
    // per request, so a second tool_use block would always be a bug; better to
    // make it impossible than to silently discard it.
    tool_choice: {
      type: 'tool',
      name: req.tool.name,
      disable_parallel_tool_use: true,
    },
  };

  const result = await callModel(request, {
    mode: opts.mode,
    ...(opts.transport === undefined ? {} : { transport: opts.transport }),
    ...(opts.store === undefined ? {} : { store: opts.store }),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
    ...(opts.onRecordError === undefined ? {} : { onRecordError: opts.onRecordError }),
  });

  if (result.kind === 'miss') {
    return { kind: 'miss', degraded: result.degraded, hash: result.hash };
  }

  const response = result.response;

  // A refusal carries no usable content — check before indexing into it.
  if (response.stop_reason === 'refusal') {
    throw new ToolCallFailedError(
      `${req.tool.name}: model refused (stop_reason: refusal)`,
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (toolUse === undefined) {
    throw new ToolCallFailedError(
      `${req.tool.name}: no tool_use block in response ` +
        `(stop_reason: ${response.stop_reason}). A max_tokens stop is the ` +
        'usual cause — the response was cut off before the tool call completed.',
    );
  }

  return {
    kind: 'ok',
    input: toolUse.input,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    degraded: result.degraded,
    hash: result.hash,
  };
}
