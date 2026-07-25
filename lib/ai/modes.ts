/**
 * The modes seam.
 *
 * Lane D owns `lib/modes/**` in the final layout; until it lands, this is the
 * single gateway every model and database call in Lane A passes through. It
 * exists so that no route reaches for the Anthropic SDK directly: that would
 * break `fixtures` and `replay` silently, and a broken fixtures path means the
 * lanes that depend on it (B and C) cannot work without an API key.
 *
 *   live      call the real API. Requires ANTHROPIC_API_KEY.
 *   fixtures  no network at all. Derive everything from fixtures/margaret.json.
 *   replay    same as fixtures today; reserved for recorded live responses.
 *
 * `fixtures` is the default on purpose, so nobody burns tokens by accident.
 */

import Anthropic from '@anthropic-ai/sdk';

export const MODES = ['live', 'fixtures', 'replay'] as const;
export type Mode = (typeof MODES)[number];

function isMode(value: string): value is Mode {
  // `.some` rather than `(MODES as readonly string[]).includes(value)`: the
  // widening cast is only there to satisfy the compiler, and casts are how the
  // contract stops being the shared truth.
  return MODES.some((mode) => mode === value);
}

/** Parse a mode from untrusted input. Returns null rather than guessing. */
export function parseMode(value: string | null | undefined): Mode | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  return isMode(trimmed) ? trimmed : null;
}

/**
 * Resolve the mode for a request: an explicit `?mode=` wins, then the
 * environment default, then `fixtures`.
 */
export function resolveMode(url: URL): Mode {
  return (
    parseMode(url.searchParams.get('mode')) ??
    parseMode(process.env.NEXT_PUBLIC_DEFAULT_MODE) ??
    'fixtures'
  );
}

/** Thrown when a mode needs credentials the environment does not have. */
export class MissingCredentialsError extends Error {
  constructor(what: string) {
    super(
      `${what} is not set, so live mode cannot run. Add it to .env.local, or ` +
        `use ?mode=fixtures to work from fixtures/margaret.json with no network.`,
    );
    this.name = 'MissingCredentialsError';
  }
}

/**
 * The only place in Lane A that constructs an Anthropic client.
 *
 * Returns null for the non-live modes, which is the signal to callers that they
 * must serve from fixtures instead of reaching for the network.
 */
export function anthropicFor(mode: Mode): Anthropic | null {
  if (mode !== 'live') return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new MissingCredentialsError('ANTHROPIC_API_KEY');
  }

  return new Anthropic({ apiKey });
}
