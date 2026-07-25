/**
 * FixtureStore implementations.
 *
 * `createFsFixtureStore` is the default, real implementation — it reads and
 * writes `<dir>/<hash>.json`. Production code points it at
 * `fixtures/recorded/`; every test in this package points it at a temp
 * directory instead. Never point a test at the real `fixtures/` tree:
 * `scripts/verify.sh` blocks unstaged edits there on purpose (recorded
 * fixtures are committed only deliberately, in a merge window), and a test
 * writing into it would trip that guard for an unrelated PR.
 *
 * `createInMemoryFixtureStore` is for tests that don't need the filesystem
 * at all.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FixtureStore, ModelResponse } from './types';

/**
 * A key is always a `requestHash` output: 64 lowercase hex characters. Since
 * the key becomes a path segment, validating it is what makes path traversal
 * structurally impossible — `..`, `/`, a leading `~` and an absolute path all
 * fail this pattern, so no caller (or corrupted caller) can steer a read or a
 * write outside `dir`.
 */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Narrows `unknown` JSON to ModelResponse without `as`. Deliberately
 *  shallow — it checks the fields every Anthropic Message response has,
 *  not the full SDK type, because that type has many optional fields we
 *  don't want to hand-duplicate here. A corrupted or foreign fixture file
 *  fails this and is treated as a miss rather than crashing the demo. */
function isModelResponse(value: unknown): value is ModelResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'role' in value &&
    'content' in value &&
    'model' in value
  );
}

export function createFsFixtureStore(dir: string): FixtureStore {
  return {
    async read(hash: string): Promise<ModelResponse | null> {
      // A malformed key is a miss, not a throw: reads happen on the degrade
      // path, where throwing would defeat the whole point.
      if (!HASH_PATTERN.test(hash)) return null;

      let raw: string;
      try {
        raw = await readFile(path.join(dir, `${hash}.json`), 'utf8');
      } catch {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      return isModelResponse(parsed) ? parsed : null;
    },

    /**
     * Write via a unique temp file plus `rename`, which is atomic within a
     * directory on every platform we deploy to. Two concurrent recordings of
     * the same hash are then genuinely last-wins — a reader sees one complete
     * fixture or none, never two interleaved writes producing a truncated file
     * that fails `JSON.parse` and silently becomes a miss.
     *
     * Throwing here is fine and deliberate: the only production caller is
     * `callModel`, which treats a failed recording as non-fatal.
     */
    async write(hash: string, response: ModelResponse): Promise<void> {
      if (!HASH_PATTERN.test(hash)) {
        throw new Error(`fixture key must be a 64-char hex sha256 digest, got: ${hash}`);
      }

      await mkdir(dir, { recursive: true });
      const target = path.join(dir, `${hash}.json`);
      const temp = path.join(dir, `.${hash}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(response, null, 2), 'utf8');
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        throw error;
      }
    },
  };
}

/** The default store for production use, rooted at fixtures/recorded/. Not
 *  read at call time beyond building the path string, so constructing it has
 *  no I/O side effects. */
export function createDefaultFixtureStore(): FixtureStore {
  return createFsFixtureStore(path.join(process.cwd(), 'fixtures', 'recorded'));
}

export function createInMemoryFixtureStore(
  initial?: ReadonlyMap<string, ModelResponse>,
): FixtureStore {
  const data = new Map<string, ModelResponse>(initial);
  return {
    async read(hash: string): Promise<ModelResponse | null> {
      return data.get(hash) ?? null;
    },
    async write(hash: string, response: ModelResponse): Promise<void> {
      data.set(hash, response);
    },
  };
}
