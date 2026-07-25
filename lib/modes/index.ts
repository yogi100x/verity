/**
 * Public surface of lib/modes. Lane A imports from here — never from a
 * sub-module, and never from `@anthropic-ai/sdk` directly.
 *
 * Minimal and sufficient, on purpose:
 *
 *   - `callModel` is the seam. It is the only way a model call should happen.
 *   - `resolveMode` turns `?mode=` plus env into the `Mode` you pass to it.
 *   - `requestHash` / `canonicalize` are exported for tooling and tests that
 *     need to name a fixture file or inspect exactly what gets hashed. They
 *     are pure functions; nothing can bypass the seam with them.
 *   - the store factories are exported so scripts (the recorder, a fixture
 *     lint) and tests can point at a temp directory instead of
 *     `fixtures/recorded/`. `callModel` already defaults to the real one, so
 *     Lane A should not normally need these.
 *   - `createAnthropicTransport` is exported **only** so an E2E test can
 *     assert the real transport is wired, and so a script can record fixtures
 *     deliberately. Calling it in product code would be a bypass of the seam:
 *     no timeout, no degrade, no recording. Don't.
 *
 * Deliberately NOT exported: nothing else exists to export — there is no
 * hidden "just call the SDK" escape hatch in this package.
 */

export type {
  CallModelHit,
  CallModelMiss,
  CallModelOptions,
  CallModelResult,
  FixtureStore,
  Mode,
  ModelRequest,
  ModelResponse,
  ModelTransport,
} from './types';
export { MODES } from './types';

export { canonicalize, requestHash } from './hash';
export { resolveMode } from './resolve-mode';
export type { ResolveModeInput } from './resolve-mode';
export { callModel, DEFAULT_TIMEOUT_MS } from './call-model';
export {
  createDefaultFixtureStore,
  createFsFixtureStore,
  createInMemoryFixtureStore,
} from './store';
export { createAnthropicTransport } from './transport';
