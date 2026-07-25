import { describe, it, expect, afterEach } from 'vitest';
import { resolveMode } from '../resolve-mode';

const ENV_KEY = 'NEXT_PUBLIC_DEFAULT_MODE';

describe('resolveMode', () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('defaults to fixtures when nothing is set', () => {
    delete process.env[ENV_KEY];
    expect(resolveMode()).toBe('fixtures');
    expect(resolveMode({})).toBe('fixtures');
    expect(resolveMode({ searchParam: null })).toBe('fixtures');
  });

  it('falls back to the env default when no search param is present', () => {
    process.env[ENV_KEY] = 'replay';
    expect(resolveMode()).toBe('replay');
    expect(resolveMode({ searchParam: null })).toBe('replay');
  });

  it('an explicit search param wins over the env default', () => {
    process.env[ENV_KEY] = 'replay';
    expect(resolveMode({ searchParam: 'live' })).toBe('live');
    expect(resolveMode({ searchParam: 'fixtures' })).toBe('fixtures');
  });

  it('an invalid search param falls back to fixtures rather than throwing', () => {
    delete process.env[ENV_KEY];
    expect(() => resolveMode({ searchParam: 'lvie-typo' })).not.toThrow();
    expect(resolveMode({ searchParam: 'lvie-typo' })).toBe('fixtures');
    expect(resolveMode({ searchParam: '' })).toBe('fixtures');
  });

  it('an invalid env default falls back to fixtures rather than throwing', () => {
    process.env[ENV_KEY] = 'not-a-mode';
    expect(() => resolveMode()).not.toThrow();
    expect(resolveMode()).toBe('fixtures');
  });

  it('an invalid search param falls through to a valid env default, not straight to fixtures', () => {
    // Precedence is a chain: explicit param > env > 'fixtures'. An invalid
    // value at one level drops to the next level rather than jumping
    // straight to the final floor.
    process.env[ENV_KEY] = 'live';
    expect(resolveMode({ searchParam: 'bogus' })).toBe('live');
  });
});
