/**
 * Vocabulary alignment — every exact key the extraction prompt teaches must
 * have a consumer.
 *
 * The class of bug this kills: the prompt taught instruction.chc_checklist
 * while the fixture seed and the 28-day-clock detector consumed
 * chc.checklist_date. Same concept, two spellings — and NOTHING errored. The
 * claim extracted, verified, grouped, became a fact, and then joined nothing:
 * the clock built to count 28 days from it never started. Divergence like
 * this never fails a gate; it just quietly never joins. This test turns it
 * into a red check.
 *
 * A key is "consumed" when it matches at least one template slot's
 * ontology_match, or appears as a literal in a detector source file. Reading
 * detector SOURCE (Lane C's files, read-only) is deliberate: their tests
 * already pin their own behaviour; this test only needs to know the
 * vocabulary they speak.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXTRACTION_SYSTEM, TAUGHT_KEYS } from '../prompts';
import { hasWellFormedKey } from '../verify';
import { loadTemplates, ontologyMatches } from '../templates';

function detectorSources(): string {
  const dir = path.join(process.cwd(), 'lib', 'detectors');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

describe('vocabulary alignment', () => {
  const templates = loadTemplates();
  const allPatterns = templates
    .flatMap((t) => t.sections)
    .flatMap((s) => s.slots)
    .flatMap((s) => s.ontology_match);
  const detectors = detectorSources();

  it('the taught-keys list and the prompt cannot drift apart', () => {
    for (const key of TAUGHT_KEYS) {
      expect(EXTRACTION_SYSTEM, `prompt no longer teaches ${key}`).toContain(key);
    }
  });

  for (const key of TAUGHT_KEYS) {
    it(`${key} is well-formed and has a consumer`, () => {
      expect(hasWellFormedKey({ ontology_key: key })).toBe(true);

      const templateConsumes = allPatterns.some((p) => ontologyMatches(p, key));
      const detectorConsumes = detectors.includes(`'${key}'`) || detectors.includes(`"${key}"`);

      expect(
        templateConsumes || detectorConsumes,
        `${key} is taught to the model but nothing consumes it — no template ` +
          `slot matches it and no detector names it. Claims under this key ` +
          `will verify, group, and then silently join nothing.`,
      ).toBe(true);
    });
  }

  it('the superseded checklist key has no consumer left — and is not taught', () => {
    // Guards the ruling itself: if someone reintroduces the old spelling on
    // either side, one of these two assertions goes red.
    const old = 'instruction.chc_checklist';
    expect(EXTRACTION_SYSTEM).not.toContain(old);
    const templateConsumes = allPatterns.some((p) => p === old);
    const detectorConsumes = detectors.includes(`'${old}'`) || detectors.includes(`"${old}"`);
    expect(templateConsumes || detectorConsumes).toBe(false);
  });
});
