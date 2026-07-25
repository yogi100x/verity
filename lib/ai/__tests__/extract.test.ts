import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import {
  partitionClaims,
  extractFromFixtures,
  toWireReport,
  type RawClaim,
} from '@/lib/ai/extract';
import type { InspectReportView } from '@/lib/ai/inspect-html';
import { CaseSnapshot, Claim } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

// Parsed once: both the report-count assertion and the id-preservation suite
// read from the same validated snapshot.
const fixture = CaseSnapshot.parse(fixtureRaw);

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object key seen. */
function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
}

function makeRawClaim(overrides: Partial<RawClaim> = {}): RawClaim {
  return {
    ontology_key: 'medication.furosemide',
    subject: 'furosemide',
    value: 'stopped',
    quote: 'furosemide 40mg was stopped',
    page: 1,
    asserted_at: null,
    date_precision: 'unknown',
    ...overrides,
  };
}

describe('partitionClaims', () => {
  const source = {
    id: randomUUID(),
    transcript: 'Patient reviewed. furosemide 40mg was stopped on discharge.',
  };

  it('drops a fabricated quote and never returns it in kept', () => {
    const good = makeRawClaim();
    const fabricated = makeRawClaim({
      quote: 'the patient was told to restart furosemide immediately',
      value: 'restarted',
    });

    const { kept, dropped } = partitionClaims([good, fabricated], source);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.quote).toBe(good.quote);
    expect(kept.some((c) => c.quote === fabricated.quote)).toBe(false);

    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.reason).toBe('quote_not_in_source');
    expect(dropped[0]?.claim).toEqual(fabricated);
  });

  it('every kept claim has verified_substring === true', () => {
    const { kept } = partitionClaims([makeRawClaim()], source);
    expect(kept.length).toBeGreaterThan(0);
    for (const claim of kept) {
      expect(claim.verified_substring).toBe(true);
    }
  });

  it('reports counts that sum correctly: extracted = kept + dropped', () => {
    const raw = [
      makeRawClaim(),
      makeRawClaim({ quote: 'this quote does not appear anywhere' }),
      // A REAL sentence from the transcript attached to a claim it does not
      // support (the claim asserts furosemide was stopped; the quote says the
      // patient was reviewed). The original substring check kept this with a
      // verified badge; the anchoring rules added after the first live call
      // drop it — which is the point, so this case moved from kept to dropped.
      makeRawClaim({ quote: 'Patient reviewed.' }),
    ];
    const { kept, dropped } = partitionClaims(raw, source);
    expect(kept.length + dropped.length).toBe(raw.length);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(2);
    expect(dropped.map((d) => d.reason).sort()).toEqual([
      'quote_does_not_support_claim',
      'quote_not_in_source',
    ]);
  });

  it('kept claims parse cleanly against the Claim Zod schema', () => {
    const { kept } = partitionClaims([makeRawClaim()], source);
    for (const claim of kept) {
      expect(() => Claim.parse(claim)).not.toThrow();
    }
  });

  it('never produces an object with a judgement-field key', () => {
    const { kept, dropped } = partitionClaims(
      [makeRawClaim(), makeRawClaim({ quote: 'not in the source at all' })],
      source,
    );
    const keys = new Set<string>();
    collectKeys(kept, keys);
    collectKeys(dropped, keys);
    for (const key of keys) {
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }
  });
});

describe('extractFromFixtures', () => {
  const reports = extractFromFixtures();

  it('produces one report per source', () => {
    // Derived, not hardcoded: the fixture gains sources over time (the care-log
    // was seeded after this suite was written) and this test must not care.
    expect(reports).toHaveLength(fixture.sources.length);
  });

  it('reproduces the fixture-wide numbers: 17 extracted, 1 dropped', () => {
    const totalExtracted = reports.reduce((sum, r) => sum + r.stats.claims_extracted, 0);
    const totalDropped = reports.reduce((sum, r) => sum + r.stats.claims_dropped, 0);
    expect(totalExtracted).toBe(17);
    expect(totalDropped).toBe(1);
  });

  it('every report has usage: null, mode: fixtures, retried: false', () => {
    for (const report of reports) {
      expect(report.usage).toBeNull();
      expect(report.mode).toBe('fixtures');
      expect(report.retried).toBe(false);
    }
  });

  it('every kept claim has verified_substring === true and parses against Claim', () => {
    for (const report of reports) {
      for (const claim of report.kept) {
        expect(claim.verified_substring).toBe(true);
        expect(() => Claim.parse(claim)).not.toThrow();
      }
    }
  });

  it('stats per report equal kept.length + dropped.length', () => {
    for (const report of reports) {
      expect(report.kept.length + report.dropped.length).toBe(report.stats.claims_extracted);
      expect(report.dropped.length).toBe(report.stats.claims_dropped);
    }
  });

  it('contains no key matching /severity|urgency|priority|rank|risk|score/i anywhere', () => {
    // KEYS only. A judgement FIELD is banned; the string value "priority" is a
    // legal CHC level, so matching on values would fail the moment a level is
    // rendered — and a source quote may legitimately contain "risk".
    const keys = new Set<string>();
    collectKeys(reports, keys);
    for (const key of keys) {
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }
  });

  it('satisfies the view /api/debug/inspect renders — checked at compile time', () => {
    // Two modules, two shapes, four agents: this assignment is the only thing
    // stopping the renderer's view and the real report from drifting apart
    // silently. It is load-bearing at `pnpm typecheck`, not at runtime.
    const views: readonly InspectReportView[] = reports;
    expect(views).toHaveLength(reports.length);
  });
});

describe('toWireReport — what a JSON response is allowed to carry', () => {
  const source = { id: randomUUID(), transcript: 'furosemide 40mg was stopped' };
  const good = makeRawClaim({ quote: 'furosemide 40mg was stopped' });
  const fabricated = makeRawClaim({ quote: 'and then was restarted a week later' });

  const report = {
    source: { id: source.id, title: 'Discharge summary', kind: 'pdf' as const },
    transcript: source.transcript,
    ...partitionClaims([good, fabricated], source),
    stats: { claims_extracted: 2, claims_dropped: 1 },
    usage: null,
    mode: 'live' as const,
    retried: false,
    degraded: false,
    notice: null,
  };

  it('counts a dropped claim without carrying its fabricated quote', () => {
    const wire = toWireReport(report);
    expect(wire.dropped).toEqual([{ reason: 'quote_not_in_source', count: 1 }]);
    expect(JSON.stringify(wire)).not.toContain(fabricated.quote);
    expect(JSON.stringify(wire)).not.toContain('restarted');
  });

  it('keeps every verified claim, under a field name that says so', () => {
    const wire = toWireReport(report);
    expect(wire.claims).toHaveLength(1);
    expect(wire.claims[0]?.quote).toBe(good.quote);
    expect(wire.claims.every((c) => c.verified_substring)).toBe(true);
  });
});

describe('extractFromFixtures preserves the fixture’s own claim ids', () => {
  const snapshot = CaseSnapshot.parse(fixtureRaw);

  it('every kept claim keeps the id the fixture gave it', () => {
    const keptIds = extractFromFixtures().flatMap((r) => r.kept.map((c) => c.id));
    const verifiedFixtureIds = snapshot.claims
      .filter((c) => c.verified_substring)
      .map((c) => c.id);

    expect([...keptIds].sort()).toEqual([...verifiedFixtureIds].sort());
  });

  it('is stable across calls — replaying a known case is not a new case each time', () => {
    const first = extractFromFixtures().flatMap((r) => r.kept.map((c) => c.id));
    const second = extractFromFixtures().flatMap((r) => r.kept.map((c) => c.id));
    expect(second).toEqual(first);
  });

  it('every id a fixture Fact references still resolves to a kept claim', () => {
    // This is the assertion whose absence let the bug through: the fixture’s
    // facts.supporting_claim_ids are the only supersession signal that exists,
    // and regenerated ids left every one of them dangling silently.
    const keptIds = new Set(extractFromFixtures().flatMap((r) => r.kept.map((c) => c.id)));
    const referenced = snapshot.facts.flatMap((f) => f.supporting_claim_ids);

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) expect(keptIds.has(id)).toBe(true);
  });

  it('live extraction still mints a fresh id — there is no prior id to preserve', () => {
    const source = { id: randomUUID(), transcript: 'furosemide 40mg was stopped' };
    const raw: RawClaim[] = [
      {
        ontology_key: 'medication.furosemide',
        subject: 'furosemide',
        value: 'stopped',
        quote: 'furosemide 40mg was stopped',
        page: 1,
        asserted_at: null,
        date_precision: 'unknown',
      },
    ];

    const a = partitionClaims(raw, source).kept[0];
    const b = partitionClaims(raw, source).kept[0];
    expect(a?.id).toBeDefined();
    expect(a?.id).not.toBe(b?.id);
  });
});
