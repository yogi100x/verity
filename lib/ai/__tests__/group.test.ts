import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import {
  SUBJECT_SYNONYMS,
  normaliseSubject,
  groupClaims,
  unmatchedSubjects,
  type ClaimGroup,
} from '@/lib/ai/group';
import { CaseSnapshot, type Claim, type DatePrecision } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

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

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: randomUUID(),
    source_id: randomUUID(),
    ontology_key: 'medication.furosemide',
    subject: 'furosemide',
    value: 'stopped',
    quote: 'furosemide 40mg was stopped',
    locator: { page: 1, char_start: 0, char_end: 10, ms_start: null, ms_end: null },
    asserted_at: '2026-06-25',
    date_precision: 'exact' as DatePrecision,
    provenance: 'document_extracted',
    verified_substring: true,
    ...overrides,
  };
}

describe('normaliseSubject', () => {
  it('normalises "water tablet" and "Furosemide 40mg" to the same subject', () => {
    expect(normaliseSubject('water tablet')).toBe(normaliseSubject('Furosemide 40mg'));
    expect(normaliseSubject('water tablet')).toBe('furosemide');
  });

  it.each([
    'Furosemide',
    'furosemide 40mg',
    'Furosemide 40 mg',
    'furosemide 40mg tablets',
    'FUROSEMIDE tablets',
  ])('normalises %s to furosemide', (input) => {
    expect(normaliseSubject(input)).toBe('furosemide');
  });

  it('does not mangle a drug name that contains a form word as a substring', () => {
    // "capecitabine" contains "cap" but is not a form word occurrence — the
    // \b anchors must not fire mid-word.
    expect(normaliseSubject('Capecitabine')).toBe('capecitabine');
    expect(normaliseSubject('Capecitabine 500mg tablets')).toBe('capecitabine');
  });

  it('never maps two different drugs to the same normalised subject', () => {
    expect(normaliseSubject('Furosemide 40mg')).not.toBe(normaliseSubject('Bisoprolol 2.5mg'));
    expect(normaliseSubject('Amitriptyline 10mg tablets')).not.toBe(
      normaliseSubject('Dapagliflozin 10mg'),
    );
  });

  it('lowercases, trims, and collapses whitespace with no dose/form present', () => {
    expect(normaliseSubject('  Bisoprolol   ')).toBe('bisoprolol');
  });
});

describe('SUBJECT_SYNONYMS', () => {
  it('maps every documented lay term for furosemide to "furosemide" via normaliseSubject', () => {
    expect(normaliseSubject('water tablet')).toBe('furosemide');
    expect(normaliseSubject('water tablets')).toBe('furosemide');
    expect(normaliseSubject('water pill')).toBe('furosemide');
  });

  it('contains no judgement-field key and every value is a plain string', () => {
    const keys = new Set<string>();
    collectKeys(SUBJECT_SYNONYMS, keys);
    for (const key of keys) {
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }
    for (const value of Object.values(SUBJECT_SYNONYMS)) {
      expect(typeof value).toBe('string');
    }
  });
});

describe('groupClaims', () => {
  it('excludes any claim with verified_substring !== true', () => {
    const verified = makeClaim({ id: randomUUID() });
    const unverified = makeClaim({ id: randomUUID(), verified_substring: false });

    const groups = groupClaims([verified, unverified]);
    const allClaimIds = groups.flatMap((g) => g.claims.map((c) => c.id));

    expect(allClaimIds).toContain(verified.id);
    expect(allClaimIds).not.toContain(unverified.id);
  });

  it('groups claims sharing ontology_key + normalised subject, dose/form and phrasing aside', () => {
    const a = makeClaim({ subject: 'Furosemide 40mg', asserted_at: '2026-06-25' });
    const b = makeClaim({ subject: 'water tablet', asserted_at: '2026-07-03' });
    const c = makeClaim({ subject: 'FUROSEMIDE tablets', asserted_at: '2026-03-12' });

    const groups = groupClaims([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.subject).toBe('furosemide');
    expect(groups[0]?.claims).toHaveLength(3);
  });

  it('never groups two different drugs together', () => {
    const furosemide = makeClaim({ subject: 'furosemide' });
    const bisoprolol = makeClaim({
      ontology_key: 'medication.bisoprolol',
      subject: 'bisoprolol',
    });

    const groups = groupClaims([furosemide, bisoprolol]);
    expect(groups).toHaveLength(2);
    const subjects = groups.map((g) => g.subject).sort();
    expect(subjects).toEqual(['bisoprolol', 'furosemide']);
  });

  it('is order-independent: shuffling the input produces a deeply equal result', () => {
    const claims = [
      makeClaim({ id: randomUUID(), subject: 'furosemide', asserted_at: '2026-06-25' }),
      makeClaim({ id: randomUUID(), subject: 'water tablet', asserted_at: '2026-07-03' }),
      makeClaim({ id: randomUUID(), subject: 'FUROSEMIDE tablets', asserted_at: '2026-03-12' }),
      makeClaim({
        id: randomUUID(),
        ontology_key: 'medication.bisoprolol',
        subject: 'bisoprolol',
        asserted_at: '2026-07-03',
      }),
      makeClaim({
        id: randomUUID(),
        ontology_key: 'medication.bisoprolol',
        subject: 'Bisoprolol 5mg tablets',
        asserted_at: null,
      }),
    ];

    const forward = groupClaims(claims);
    const shuffled = [...claims].reverse();
    const backward = groupClaims(shuffled);

    expect(backward).toEqual(forward);

    // A few more shuffles for good measure.
    const rotated = [...claims.slice(2), ...claims.slice(0, 2)];
    expect(groupClaims(rotated)).toEqual(forward);
  });

  it('sorts claims within a group by asserted_at ascending, nulls last, then id', () => {
    const claims = [
      makeClaim({ id: 'b0000000-0000-4000-8000-000000000002', asserted_at: null }),
      makeClaim({ id: 'a0000000-0000-4000-8000-000000000001', asserted_at: '2026-06-25' }),
      makeClaim({ id: 'c0000000-0000-4000-8000-000000000003', asserted_at: '2026-03-12' }),
      makeClaim({ id: 'd0000000-0000-4000-8000-000000000004', asserted_at: null }),
    ];

    const [group] = groupClaims(claims);
    expect(group).toBeDefined();
    if (group === undefined) return;

    expect(group.claims.map((c) => c.id)).toEqual([
      'c0000000-0000-4000-8000-000000000003',
      'a0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'd0000000-0000-4000-8000-000000000004',
    ]);
  });

  it('against the real fixture: all four medication.furosemide claims land in one group', () => {
    const fixture = CaseSnapshot.parse(fixtureRaw);
    const groups = groupClaims(fixture.claims);

    const furosemideGroups = groups.filter((g) => g.ontology_key === 'medication.furosemide');
    expect(furosemideGroups).toHaveLength(1);

    const group = furosemideGroups[0];
    expect(group).toBeDefined();
    if (group === undefined) return;

    expect(group.subject).toBe('furosemide');
    expect(group.claims).toHaveLength(4);

    // The unverified bisoprolol claim in the fixture must never leak into any group.
    const allClaimIds = groups.flatMap((g) => g.claims.map((c) => c.id));
    const unverifiedIds = fixture.claims
      .filter((c) => !c.verified_substring)
      .map((c) => c.id);
    for (const id of unverifiedIds) {
      expect(allClaimIds).not.toContain(id);
    }
  });

  it('produces no group object containing a judgement KEY (recursive key walk)', () => {
    const fixture = CaseSnapshot.parse(fixtureRaw);
    const groups: ClaimGroup[] = groupClaims(fixture.claims);

    const keys = new Set<string>();
    collectKeys(groups, keys);
    for (const key of keys) {
      // Keys only — "priority" is a legal CHC level VALUE, never asserted on here.
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }
  });
});

describe('unmatchedSubjects', () => {
  it('returns the normalised subjects of single-claim groups only', () => {
    const furosemideA = makeClaim({ subject: 'furosemide', asserted_at: '2026-06-25' });
    const furosemideB = makeClaim({ subject: 'water tablet', asserted_at: '2026-07-03' });
    const lonelyDrug = makeClaim({
      ontology_key: 'medication.amitriptyline',
      subject: 'Amitriptyline 10mg',
    });

    const groups = groupClaims([furosemideA, furosemideB, lonelyDrug]);
    expect(unmatchedSubjects(groups)).toEqual(['amitriptyline']);
  });

  it('returns an empty array when every group has more than one claim', () => {
    const a = makeClaim({ subject: 'furosemide', asserted_at: '2026-06-25' });
    const b = makeClaim({ subject: 'water tablet', asserted_at: '2026-07-03' });
    expect(unmatchedSubjects(groupClaims([a, b]))).toEqual([]);
  });
});
