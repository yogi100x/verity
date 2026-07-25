/**
 * Precedence: explicit ?mode= param > NEXT_PUBLIC_DEFAULT_MODE env > 'fixtures'.
 *
 * Never throws. A typo in a query string or an env var must not take down
 * the demo — an invalid value silently falls back to 'fixtures', the safest
 * mode (no network, no burned tokens).
 */

import type { Mode } from './types';

function isMode(value: string | null | undefined): value is Mode {
  return value === 'live' || value === 'fixtures' || value === 'replay';
}

export interface ResolveModeInput {
  readonly searchParam?: string | null;
}

export function resolveMode(input?: ResolveModeInput): Mode {
  if (isMode(input?.searchParam)) return input.searchParam;

  // Read at *call* time, not module load: tests mutate it between cases, and
  // a server-side runtime switch must take effect without a rebuild of this
  // module's import graph. Written as a literal static property access because
  // that is the form Next.js inlines into the client bundle — destructuring or
  // dynamic indexing of `process.env` silently yields undefined in the browser.
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_MODE;
  if (isMode(fromEnv)) return fromEnv;

  return 'fixtures';
}
