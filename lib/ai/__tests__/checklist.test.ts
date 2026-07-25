// @vitest-environment node
/**
 * instruction.chc_checklist — checklist dates from real documents.
 *
 * The fixture deliberately has no checklist claim (the seed covers the demo),
 * so this capability only exists in live extraction, and only a real call can
 * prove it. The live test below therefore runs when ANTHROPIC_API_KEY is
 * present and skips otherwise — it must never make CI depend on a secret.
 *
 * The deterministic tests pin the prompt guidance and prove the key flows
 * through the existing pipeline (grouping, S7's what-to-watch slot) with no
 * pipeline change — which is the reason this was buildable as a prompt edit.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXTRACTION_SYSTEM } from '../prompts';
import { hasWellFormedKey } from '../verify';
import { groupClaims } from '../group';
import { ontologyMatches, templateByKey } from '../templates';
import { extractSourceLive } from '../extract';
import { createInMemoryFixtureStore } from '@/lib/modes';
import type { Claim } from '@/lib/contracts';

function liveKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^ANTHROPIC_API_KEY=(.+)$/.exec(line.trim());
    if (m?.[1]) return m[1];
  }
  return undefined;
}

describe('the prompt teaches the key', () => {
  it('names instruction.chc_checklist exactly, and stays judgement-free', () => {
    expect(EXTRACTION_SYSTEM).toContain('instruction.chc_checklist');
    expect(EXTRACTION_SYSTEM).toContain('Continuing Healthcare Checklist');
    // "a door, not a verdict" — the guidance must not tell the model to
    // characterise an outcome.
    expect(EXTRACTION_SYSTEM).toContain('not a verdict');
  });

  it('the key itself passes the anchoring key check', () => {
    expect(hasWellFormedKey({ ontology_key: 'instruction.chc_checklist' })).toBe(true);
  });
});

describe('the key flows through the existing pipeline untouched', () => {
  const claim: Claim = {
    id: '00000000-0000-4000-8000-00000000c0de',
    source_id: '50000000-0000-4000-8000-000000000001',
    ontology_key: 'instruction.chc_checklist',
    subject: 'chc checklist',
    value: 'completed 10 July 2026',
    quote: 'CHC Checklist completed on 10 July 2026 by the district nurse.',
    locator: { page: 1, char_start: null, char_end: null, ms_start: null, ms_end: null },
    asserted_at: '2026-07-10',
    date_precision: 'exact',
    provenance: 'document_extracted',
    verified_substring: true,
  };

  it('groups under its own key', () => {
    const groups = groupClaims([claim]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.ontology_key).toBe('instruction.chc_checklist');
  });

  it('matches instruction.* slots in the shipped templates — no template change needed', () => {
    // gp_brief_v1 is on this branch; discharge_pack_v1 (S7) rides a separate
    // branch and also matches instruction.* — its own suite covers that.
    const brief = templateByKey('gp_brief_v1');
    const patterns = brief.sections
      .flatMap((s) => s.slots)
      .flatMap((s) => s.ontology_match);
    expect(
      patterns.some((p) => ontologyMatches(p, 'instruction.chc_checklist')),
    ).toBe(true);
  });
});

describe('live: a real document mentioning a checklist', () => {
  const key = liveKey();

  it.skipIf(key === undefined)(
    'yields an instruction.chc_checklist claim with the checklist date',
    async () => {
      if (key !== undefined && process.env.ANTHROPIC_API_KEY === undefined) {
        process.env.ANTHROPIC_API_KEY = key;
      }
      // A synthetic care-plan snippet. Text source: no PDF needed, and the
      // transcript is exactly this string, so anchoring is fully checkable.
      const text = [
        'CARE PLAN REVIEW — Margaret Ellis.',
        'Seen at home by the community matron.',
        'CHC Checklist completed on 10 July 2026 by the district nurse;',
        'referral form sent to the ICB for consideration of a full assessment.',
        'Next medication review due September 2026.',
      ].join('\n');

      // An injected store, per lib/modes/store.ts: a test must NEVER record
      // into the real fixtures/recorded/ — verify.sh blocks fixtures edits,
      // and a synthetic test snippet is not demo insurance. In-memory also
      // lets us assert the recording actually happened.
      const store = createInMemoryFixtureStore();
      const report = await extractSourceLive(
        { id: '50000000-0000-4000-8000-0000000000aa', title: 'Care plan review', kind: 'text' },
        { kind: 'text', text },
        { mode: 'live', timeoutMs: 180_000, store },
      );

      console.log('\n===== CHECKLIST LIVE RESULT =====');
      for (const c of report.kept) {
        console.log(' ', c.ontology_key, '|', c.asserted_at, '|', JSON.stringify(c.quote.slice(0, 60)));
      }
      for (const d of report.dropped) console.log('  DROPPED', d.reason, d.claim.ontology_key);
      console.log('=================================\n');

      expect(report.degraded).toBe(false);
      const checklist = report.kept.filter(
        (c) => c.ontology_key === 'instruction.chc_checklist',
      );
      expect(checklist.length, 'no instruction.chc_checklist claim emerged').toBeGreaterThan(0);
      const dated = checklist.find((c) => c.asserted_at === '2026-07-10');
      expect(dated, 'checklist claim did not carry the checklist date').toBeDefined();
      expect(dated?.date_precision).toBe('exact');
    },
    240_000,
  );
});
