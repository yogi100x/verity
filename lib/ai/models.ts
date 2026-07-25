/**
 * Model identifiers and the per-model request-parameter policy.
 *
 * These parameters are not uniform across models, and getting them wrong costs
 * a 400 rather than a warning. Encoding the rules once, here, is the difference
 * between one lane losing an hour to rediscovery and every lane losing one.
 *
 *   Sonnet 5 / Opus 5 (adaptive family)
 *     - `thinking: {type: 'adaptive'}` plus `output_config.effort`.
 *     - `thinking.budget_tokens` returns 400.
 *     - Non-default `temperature` / `top_p` / `top_k` return 400. We omit them.
 *     - Assistant-turn prefills return 400. We use forced strict tool use.
 *
 *   Haiku 4.5 (budget family)
 *     - `thinking: {type: 'enabled', budget_tokens: N}`, and N < max_tokens.
 *     - Has no `output_config.effort`; sending it is an error.
 *
 * Also worth stating because it shapes the whole extraction design: the
 * citations API and `output_config.format` are mutually incompatible and
 * return 400 together. That is why extraction forces a strict tool instead of
 * asking for citations, and why `lib/ai/verify.ts` exists at all.
 */

export const MODELS = {
  /** Extraction, grouping assist, gap pass, artefact generation. */
  sonnet: 'claude-sonnet-5',
  /** Date resolution only. Cheap, narrow, parameterised differently. */
  haiku: 'claude-haiku-4-5',
  /** Artefact prose behind a flag. Never structural. */
  opus: 'claude-opus-5',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** Effort levels. Adaptive-family models only. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type ThinkingFamily = 'adaptive' | 'budget';

const FAMILY: Record<ModelId, ThinkingFamily> = {
  'claude-sonnet-5': 'adaptive',
  'claude-opus-5': 'adaptive',
  'claude-haiku-4-5': 'budget',
};

/** The API floor for `thinking.budget_tokens` on budget-family models. */
export const MIN_THINKING_BUDGET = 1024;

/** The slice of a request body that varies by model. */
export interface ModelParams {
  readonly model: ModelId;
  readonly max_tokens: number;
  readonly thinking:
    | { readonly type: 'adaptive' }
    | { readonly type: 'enabled'; readonly budget_tokens: number };
  readonly output_config?: { readonly effort: Effort };
}

/**
 * Build the model-dependent request parameters, choosing the dialect the given
 * model actually speaks.
 *
 * `effort` is honoured on adaptive-family models and ignored on budget-family
 * ones, where it would be rejected. Callers may therefore pass an effort hint
 * unconditionally and let this function decide whether it is expressible.
 */
export function modelParams(
  model: ModelId,
  opts: { readonly effort?: Effort; readonly maxTokens: number },
): ModelParams {
  const { maxTokens } = opts;

  if (FAMILY[model] === 'budget') {
    // budget_tokens must be STRICTLY LESS than max_tokens and at least 1024.
    // Both bounds are 400s, and both are reachable: clamping up to the 1024
    // floor without checking max_tokens is how you send budget >= max_tokens.
    if (maxTokens <= MIN_THINKING_BUDGET) {
      throw new RangeError(
        `modelParams: ${model} needs max_tokens greater than ${MIN_THINKING_BUDGET} ` +
          `(the thinking-budget floor), got ${maxTokens}. budget_tokens must be ` +
          'strictly less than max_tokens.',
      );
    }
    // Half leaves room for the answer; never below the floor, never at max.
    const budget = Math.max(MIN_THINKING_BUDGET, Math.floor(maxTokens / 2));
    return {
      model,
      max_tokens: maxTokens,
      thinking: { type: 'enabled', budget_tokens: budget },
    };
  }

  return {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    ...(opts.effort === undefined ? {} : { output_config: { effort: opts.effort } }),
  };
}
