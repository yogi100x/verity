// @vitest-environment node
/**
 * chc.checklist_date — checklist dates from real documents.
 *
 * KEY RULING (orchestrator, 25 Jul): the canonical key is chc.checklist_date
 * — the fixture seed and the 28-day-clock detector both consume it, and the
 * fixture is the contract's shadow. The board's instruction.chc_checklist
 * wording was shorthand. PR #14 shipped teaching the shorthand; this aligns
 * the prompt to the ecosystem.
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
import { extractSourceLive } from '../extract';
import { createInMemoryFixtureStore } from '@/lib/modes';
import { chcDeadlines } from '@/lib/detectors/chc_clock';
import { Fact, type Claim } from '@/lib/contracts';

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
  it('names chc.checklist_date exactly, and stays judgement-free', () => {
    expect(EXTRACTION_SYSTEM).toContain('chc.checklist_date');
    // The superseded shorthand must be GONE — teaching both keys would
    // recreate the split vocabulary this ruling closed.
    expect(EXTRACTION_SYSTEM).not.toContain('instruction.chc_checklist');
    expect(EXTRACTION_SYSTEM).toContain('Continuing Healthcare Checklist');
    // "a door, not a verdict" — the guidance must not tell the model to
    // characterise an outcome.
    expect(EXTRACTION_SYSTEM).toContain('not a verdict');
  });

  it('the key itself passes the anchoring key check', () => {
    expect(hasWellFormedKey({ ontology_key: 'chc.checklist_date' })).toBe(true);
  });
});

describe('the key flows through the existing pipeline untouched', () => {
  const claim: Claim = {
    id: '00000000-0000-4000-8000-00000000c0de',
    source_id: '50000000-0000-4000-8000-000000000001',
    ontology_key: 'chc.checklist_date',
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
    expect(groups[0]?.ontology_key).toBe('chc.checklist_date');
  });

  it('the 28-day-clock detector consumes it — the join the old key silently missed', () => {
    // THIS is the assertion the ruling exists for. Under the superseded
    // instruction.chc_checklist key, this fact was invisible to the detector
    // built to count 28 days from it: nothing errored, the clock just never
    // started. The fact below mirrors what the pipeline derives from the
    // claim above.
    const fact = {
      id: '00000000-0000-4000-8000-00000000fac7',
      person_id: '00000000-0000-4000-8000-000000000001',
      ontology_key: 'chc.checklist_date',
      subject: 'chc checklist',
      // ISO here, deliberately. The detector parses canonical_value FIRST,
      // and its parseIsoDate only forces UTC for bare YYYY-MM-DD — free text
      // like 'completed 10 July 2026' falls through to raw new Date(), which
      // V8 parses as LOCAL time, so on a UTC+1 machine the clock reports the
      // 9th for a checklist done on the 10th. Timezone-dependent off-by-one,
      // and buildFacts DOES emit free-text canonical values. Lane C's file,
      // reported on the PR, not fixed here. This test proves the JOIN — the
      // thing the key ruling exists for — with the value shape the detector
      // handles correctly.
      canonical_value: '2026-07-10',
      provenance: 'document_extracted',
      status: 'confirmed',
      valid_from: '2026-07-10',
      valid_to: null,
      supporting_claim_ids: [claim.id],
      conflict_id: null,
      superseded_by: null,
    } as const;
    const deadlines = chcDeadlines([Fact.parse(fact)], new Date('2026-07-25T12:00:00Z'));
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.checklist_date).toBe('2026-07-10');
  });
});

describe('live: a real document mentioning a checklist', () => {
  const key = liveKey();

  it.skipIf(key === undefined)(
    'yields a chc.checklist_date claim with the checklist date',
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
        (c) => c.ontology_key === 'chc.checklist_date',
      );
      expect(checklist.length, 'no chc.checklist_date claim emerged').toBeGreaterThan(0);
      const dated = checklist.find((c) => c.asserted_at === '2026-07-10');
      expect(dated, 'checklist claim did not carry the checklist date').toBeDefined();
      expect(dated?.date_precision).toBe('exact');
    },
    240_000,
  );
});
