import { describe, it, expect } from 'vitest';
import { requestHash, canonicalize } from '../hash';
import type { ModelRequest } from '../types';

const base: ModelRequest = {
  model: 'claude-test-model',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'What medications is Margaret taking?' }],
};

describe('requestHash', () => {
  it('is stable across differently-ordered object keys', () => {
    const a: ModelRequest = {
      model: 'claude-test-model',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'hello' }],
    };
    const b: ModelRequest = {
      messages: [{ content: 'hello', role: 'user' }],
      max_tokens: 256,
      model: 'claude-test-model',
    };
    expect(requestHash(a)).toBe(requestHash(b));
  });

  it('produces a different hash for a different request', () => {
    const other: ModelRequest = { ...base, max_tokens: 512 };
    expect(requestHash(base)).not.toBe(requestHash(other));
  });

  it('produces a different hash when message content differs', () => {
    const other: ModelRequest = {
      ...base,
      messages: [{ role: 'user', content: 'What allergies does Margaret have?' }],
    };
    expect(requestHash(base)).not.toBe(requestHash(other));
  });

  it('is a 64-character lowercase hex sha256 digest', () => {
    const hash = requestHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across repeated calls on the same request', () => {
    expect(requestHash(base)).toBe(requestHash(base));
  });

  it('canonicalize sorts nested keys too', () => {
    const x = canonicalize({ b: { z: 1, a: 2 }, a: 1 });
    const y = canonicalize({ a: 1, b: { a: 2, z: 1 } });
    expect(x).toBe(y);
  });

  it('is stable under a key-order permutation nested several levels deep', () => {
    const a: ModelRequest = {
      model: 'm',
      max_tokens: 8,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'one' },
            { type: 'text', text: 'two' },
          ],
        },
      ],
      metadata: { user_id: 'stable-not-per-run' },
    };
    const b: ModelRequest = {
      metadata: { user_id: 'stable-not-per-run' },
      messages: [
        {
          content: [
            { text: 'one', type: 'text' },
            { text: 'two', type: 'text' },
          ],
          role: 'user',
        },
      ],
      max_tokens: 8,
      model: 'm',
    };
    expect(requestHash(a)).toBe(requestHash(b));
  });

  describe('array order is semantic', () => {
    it('reordering messages changes the hash', () => {
      const forward: ModelRequest = {
        model: 'm',
        max_tokens: 8,
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
        ],
      };
      const reversed: ModelRequest = {
        model: 'm',
        max_tokens: 8,
        messages: [
          { role: 'assistant', content: 'second' },
          { role: 'user', content: 'first' },
        ],
      };
      expect(requestHash(forward)).not.toBe(requestHash(reversed));
    });

    it('reordering content blocks within one message changes the hash', () => {
      const forward: ModelRequest = {
        model: 'm',
        max_tokens: 8,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'A' },
              { type: 'text', text: 'B' },
            ],
          },
        ],
      };
      const reversed: ModelRequest = {
        model: 'm',
        max_tokens: 8,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'B' },
              { type: 'text', text: 'A' },
            ],
          },
        ],
      };
      expect(requestHash(forward)).not.toBe(requestHash(reversed));
    });

    it('canonicalize never sorts an array', () => {
      expect(canonicalize(['b', 'a'])).toBe('["b","a"]');
      expect(canonicalize([2, 1])).not.toBe(canonicalize([1, 2]));
    });
  });

  describe('awkward values (documented decisions in hash.ts)', () => {
    it('treats an undefined property as missing, matching the SDK wire body', () => {
      expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
      const withUndefined: ModelRequest = { ...base, temperature: undefined };
      expect(requestHash(withUndefined)).toBe(requestHash(base));
    });

    it('does NOT collide undefined with null as a property value', () => {
      expect(canonicalize({ a: undefined })).not.toBe(canonicalize({ a: null }));
    });

    it('does NOT collide undefined with null inside an array', () => {
      // JSON.stringify would render both as `null` and lose the distinction.
      expect(canonicalize([undefined])).not.toBe(canonicalize([null]));
    });

    it('keeps NaN, Infinity, -Infinity and null distinct instead of collapsing to null', () => {
      const hashes = new Set(
        [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, 0].map((v) =>
          canonicalize({ temperature: v }),
        ),
      );
      expect(hashes.size).toBe(5);
    });

    it('never throws on a value JSON.stringify cannot represent', () => {
      // requestHash sits on the first line of callModel, which must never throw.
      expect(() => canonicalize(undefined)).not.toThrow();
      expect(canonicalize(undefined)).toMatch(/undefined/);
      expect(() => canonicalize({ nested: { deep: [Number.NaN] } })).not.toThrow();
    });

    it('honours toJSON so a Date does not collapse to an empty object', () => {
      const early = canonicalize({ at: new Date('2026-07-25T00:00:00.000Z') });
      const later = canonicalize({ at: new Date('2026-07-26T00:00:00.000Z') });
      expect(early).not.toBe(later);
      expect(early).not.toBe(canonicalize({ at: {} }));
    });
  });

  describe('unicode', () => {
    it('hashes non-ASCII content stably and distinguishably', () => {
      const accented: ModelRequest = { ...base, messages: [{ role: 'user', content: 'café' }] };
      const plain: ModelRequest = { ...base, messages: [{ role: 'user', content: 'cafe' }] };
      expect(requestHash(accented)).toBe(requestHash({ ...accented }));
      expect(requestHash(accented)).not.toBe(requestHash(plain));
      expect(requestHash(accented)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not normalise unicode: NFC and NFD are different requests', () => {
      // Deliberate — the recorded fixture must correspond to the bytes sent.
      const nfc = 'café';
      const nfd = 'café';
      expect(nfc.normalize('NFC')).toBe(nfc);
      expect(canonicalize({ q: nfc })).not.toBe(canonicalize({ q: nfd }));
    });

    it('survives emoji, CJK and a lone surrogate without throwing', () => {
      for (const text of ['🧪', '患者記録', '\ud800']) {
        const request: ModelRequest = { ...base, messages: [{ role: 'user', content: text }] };
        expect(requestHash(request)).toMatch(/^[0-9a-f]{64}$/);
        expect(requestHash(request)).toBe(requestHash(request));
      }
    });

    it('sorts keys by code unit, not locale', () => {
      // localeCompare would order these differently under some ICU locales;
      // a hash that moved with the machine's locale would be unusable.
      expect(canonicalize({ b: 1, B: 2, a: 3, A: 4 })).toBe('{"A":4,"B":2,"a":3,"b":1}');
    });
  });
});
