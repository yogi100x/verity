/**
 * Recorder tests. ALWAYS point createFsFixtureStore at a temp directory
 * here, never at fixtures/recorded/ — scripts/verify.sh blocks unstaged
 * edits under fixtures/ on purpose (recorded fixtures are committed only
 * deliberately, in a merge window), and a test writing there would trip
 * that guard for a PR that has nothing to do with fixtures.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsFixtureStore, createInMemoryFixtureStore } from '../store';
import { requestHash } from '../hash';
import type { ModelRequest, ModelResponse } from '../types';

const request: ModelRequest = {
  model: 'claude-test-model',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'List current medications.' }],
};

const response: ModelResponse = {
  id: 'msg_recorder_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-test-model',
  content: [{ type: 'text', text: 'Furosemide 40mg, stopped on discharge.' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 42, output_tokens: 12 },
};

describe('createFsFixtureStore (recorder)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'verity-modes-recorder-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a file whose name is the request hash', async () => {
    const store = createFsFixtureStore(dir);
    const hash = requestHash(request);

    await store.write(hash, response);

    const raw = await readFile(path.join(dir, `${hash}.json`), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toEqual(response);
  });

  it('reads back exactly what it wrote, keyed by hash', async () => {
    const store = createFsFixtureStore(dir);
    const hash = requestHash(request);

    await store.write(hash, response);
    const found = await store.read(hash);

    expect(found).toEqual(response);
  });

  it('a miss returns null, not a throw', async () => {
    const store = createFsFixtureStore(dir);
    await expect(store.read('0'.repeat(64))).resolves.toBeNull();
  });

  it('creates the directory when it does not exist yet', async () => {
    const nested = path.join(dir, 'does', 'not', 'exist', 'recorded');
    const store = createFsFixtureStore(nested);
    const hash = requestHash(request);

    await store.write(hash, response);

    await expect(store.read(hash)).resolves.toEqual(response);
  });

  it('leaves no temp files behind after a write', async () => {
    const store = createFsFixtureStore(dir);
    await store.write(requestHash(request), response);

    const entries = await readdir(dir);
    expect(entries).toEqual([`${requestHash(request)}.json`]);
  });

  it('concurrent writes of the same hash are last-wins, never a torn file', async () => {
    // The write goes to a unique temp file and is renamed into place, so a
    // reader can only ever see a complete fixture. A truncated one would fail
    // JSON.parse and silently become a miss on stage.
    const store = createFsFixtureStore(dir);
    const hash = requestHash(request);
    const variants: ModelResponse[] = Array.from({ length: 8 }, (_unused, index) => ({
      ...response,
      content: [{ type: 'text', text: `variant ${index} ${'padding '.repeat(500)}` }],
    }));

    await Promise.all(variants.map((variant) => store.write(hash, variant)));

    const found = await store.read(hash);
    expect(found).not.toBeNull();
    expect(variants).toContainEqual(found);
    expect(await readdir(dir)).toEqual([`${hash}.json`]);
  });

  describe('path traversal is impossible because the key is validated hex', () => {
    const evilKeys = [
      '../escaped',
      '../../etc/passwd',
      'a/b',
      '/absolute',
      `${'0'.repeat(64)}/../x`,
      '0'.repeat(63),
      '0'.repeat(65),
      'A'.repeat(64), // uppercase is not what requestHash emits
      'g'.repeat(64), // not hex
      '',
    ];

    it.each(evilKeys)('read(%j) is a miss, not a traversal', async (key) => {
      const store = createFsFixtureStore(dir);
      await expect(store.read(key)).resolves.toBeNull();
    });

    it.each(evilKeys)('write(%j) refuses rather than escaping the directory', async (key) => {
      const store = createFsFixtureStore(dir);
      await expect(store.write(key, response)).rejects.toThrow(/64-char hex/);
      await expect(readdir(dir)).resolves.toEqual([]);
    });

    it('accepts exactly what requestHash produces', async () => {
      const store = createFsFixtureStore(dir);
      const hash = requestHash(request);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      await expect(store.write(hash, response)).resolves.toBeUndefined();
    });
  });
});

describe('createInMemoryFixtureStore', () => {
  it('round-trips a write/read with no filesystem involved', async () => {
    const store = createInMemoryFixtureStore();
    const hash = requestHash(request);

    expect(await store.read(hash)).toBeNull();
    await store.write(hash, response);
    expect(await store.read(hash)).toEqual(response);
  });

  it('can be pre-seeded for replay-style tests', async () => {
    const hash = requestHash(request);
    const store = createInMemoryFixtureStore(new Map([[hash, response]]));
    expect(await store.read(hash)).toEqual(response);
  });
});
