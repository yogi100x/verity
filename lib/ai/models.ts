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
 *     - Has no `output_config.effort`; sending it is an error.
 *     - `thinking: {type: 'enabled', budget_tokens: N}` is its dialect in
 *       general — but NOT here, because every Lane A call forces a tool, and
 *       the API returns 400 for enabled-type thinking combined with a forced
 *       tool_choice (proven live; the verbatim error is quoted inside
 *       `modelParams`). So Haiku requests omit `thinking` entirely.
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

/** The slice of a request body that varies by model. `thinking` is ABSENT
 *  for budget-family models — see the comment inside `modelParams`. */
export interface ModelParams {
  readonly model: ModelId;
  readonly max_tokens: number;
  readonly thinking?: { readonly type: 'adaptive' };
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
    // NO thinking parameter at all, and the reason is a live 400, verbatim:
    //
    //   "Thinking may not be enabled when tool_choice forces tool use."
    //
    // Every Lane A call goes through callForcedTool, which always forces a
    // tool — that is the pipeline's whole design — so the budget dialect
    // (`thinking: {type:'enabled', budget_tokens}`) this registry originally
    // encoded was unusable here: the API rejects enabled-type thinking
    // combined with a forced tool_choice. Discovered on the first real Haiku
    // call (date resolution), which is exactly why dead code should get a
    // live call before anything is built on it. On a pre-adaptive model,
    // omitting `thinking` means no extended thinking, which is legal under
    // forced tool use and right for the narrow structured tasks Haiku is
    // used for. If an unforced Haiku call ever exists, budget_tokens can
    // return — for that call shape only.
    return {
      model,
      max_tokens: maxTokens,
    };
  }

  return {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    ...(opts.effort === undefined ? {} : { output_config: { effort: opts.effort } }),
  };
}
