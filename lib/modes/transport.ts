/**
 * The real, live transport — a thin wrapper over @anthropic-ai/sdk.
 *
 * Constructed lazily: `new Anthropic()` throws when no API key is present,
 * so the client is built on first use inside the returned closure, not at
 * module scope. Importing this module (or calling
 * `createAnthropicTransport()` to get the closure) must never throw just
 * because ANTHROPIC_API_KEY is unset — fixtures and replay mode never touch
 * this file's client at all.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelRequest, ModelResponse, ModelTransport } from './types';

export function createAnthropicTransport(): ModelTransport {
  let client: Anthropic | undefined;

  return async function anthropicTransport(
    request: ModelRequest,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    if (!client) client = new Anthropic();
    // The signal is what makes the 8s degrade an actual cancellation rather
    // than an abandoned in-flight request still burning tokens.
    return client.messages.create(request, { signal });
  };
}
