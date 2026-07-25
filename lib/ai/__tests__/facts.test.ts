import { describe, it, expect } from 'vitest';
import {
  buildFacts,
  applySupersession,
  liveFacts,
  supersededClaimIds,
  periodDecisionFor,
  type BuildFactsInput,
} from '@/lib/ai/facts';
import { groupClaims, type ClaimGroup } from '@/lib/ai/group';
import { CaseSnapshot, Fact, type Claim, type DatePrecision, type Source } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked here —
 *  matching the convention already used in group.test.ts. */
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

const fixture = CaseSnapshot.parse(fixtureRaw);

function sourcesById(): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const source of fixture.sources) {
    map.set(source.id, { kind: source.kind, title: source.title });
  }
  return map;
}

function furosemideGroup(claims: readonly Claim[] = fixture.claims): ClaimGroup {
  const groups = groupClaims(claims);
  const group = groups.find(
    (g) => g.ontology_key === 'medication.furosemide' && g.subject === 'furosemide',
  );
  if (group === undefined) throw new Error('fixture furosemide group not found');
  return group;
}

function buildAndSupersede(group: ClaimGroup = furosemideGroup()) {
  const input: BuildFactsInput = {
    group,
    sourcesById: sourcesById(),
    personId: fixture.person.id,
  };
  return applySupersession(buildFacts(input));
}

describe('buildFacts + applySupersession — the fixture furosemide timeline', () => {
  it('produces exactly two facts', () => {
    const facts = buildAndSupersede();
    expect(facts).toHaveLength(2);
  });

  it('the earlier fact covers the March cardiology claim only', () => {
    const facts = buildAndSupersede();
    const earlier = facts.find((f) => f.valid_from === '2026-03-12');
    if (earlier === undefined) throw new Error('earlier fact not found');
    const later = facts.find((f) => f.valid_from === '2026-06-25');
    if (later === undefined) throw new Error('later fact not found');

    expect(earlier.valid_to).toBe('2026-06-25');
    expect(earlier.superseded_by).toBe(later.id);
    expect(earlier.status).toBe('confirmed');
    expect(earlier.supporting_claim_ids).toEqual([
      'c0000000-0000-4000-8000-000000000004',
    ]);
  });

  it('the later fact is disputed, current, and carries all three conflicting claims', () => {
    const facts = buildAndSupersede();
    const later = facts.find((f) => f.valid_from === '2026-06-25');
    if (later === undefined) throw new Error('later fact not found');

    expect(later.valid_to).toBeNull();
    expect(later.superseded_by).toBeNull();
    expect(later.status).toBe('disputed');

    const conflict = fixture.conflicts.find(
      (c) => c.ontology_key === 'medication.furosemide' && c.subject === 'furosemide',
    );
    if (conflict === undefined) throw new Error('fixture conflict not found');

    expect(later.supporting_claim_ids).toHaveLength(3);
    expect([...later.supporting_claim_ids].sort()).toEqual([...conflict.claim_ids].sort());
  });

  it('supersededClaimIds returns exactly the March claim id', () => {
    const facts = buildAndSupersede();
    expect(supersededClaimIds(facts)).toEqual([
      'c0000000-0000-4000-8000-000000000004',
    ]);
  });

  it('liveFacts returns exactly the later (disputed) fact', () => {
    const facts = buildAndSupersede();
    const live = liveFacts(facts);
    expect(live).toHaveLength(1);
    expect(live[0]?.valid_from).toBe('2026-06-25');
  });

  it('a superseded fact keeps its supporting claim ids — it must stay citable', () => {
    const facts = buildAndSupersede();
    const earlier = facts.find((f) => f.superseded_by !== null);
    if (earlier === undefined) throw new Error('superseded fact not found');
    expect(earlier.supporting_claim_ids.length).toBeGreaterThan(0);
  });

  it('every emitted Fact parses against the Fact zod schema', () => {
    const facts = buildAndSupersede();
    for (const fact of facts) {
      expect(() => Fact.parse(fact)).not.toThrow();
    }
  });

  it('no disputed fact\'s canonical_value equals any single competing claim value', () => {
    const facts = buildAndSupersede();
    const group = furosemideGroup();
    const values = new Set(group.claims.map((c) => c.value));

    for (const fact of facts) {
      if (fact.status !== 'disputed') continue;
      expect(values.has(fact.canonical_value)).toBe(false);
    }
  });

  it('is deterministic: shuffling the input claim order does not change the result (ignoring ids)', () => {
    const forward = furosemideGroup();
    const shuffled: ClaimGroup = { ...forward, claims: [...forward.claims].reverse() };

    const a = buildAndSupersede(forward);
    const b = buildAndSupersede(shuffled);

    const strip = (facts: ReturnType<typeof buildAndSupersede>) =>
      facts
        .map((f) => {
          const { id, superseded_by, ...rest } = f;
          void id;
          void superseded_by;
          return rest;
        })
        .sort((x, y) => (x.valid_from ?? '').localeCompare(y.valid_from ?? ''));

    expect(strip(a)).toEqual(strip(b));
  });

  it('recursive key walk: no judgement KEY anywhere in the emitted facts', () => {
    const facts = buildAndSupersede();
    const keys = new Set<string>();
    collectKeys(facts, keys);
    for (const key of keys) {
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }
  });
});

/* ================= synthetic cases the fixture does not cover ================= */

/**
 * The fixture has exactly one shape: instruction, instruction, two
 * observations, all four exactly dated. Reproducing it proves nothing about
 * whether the instruction/observation model is a MODEL or a curve fitted to
 * one file. These build the shapes the fixture does not have.
 */

const INSTRUCTION_SOURCE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OBSERVATION_SOURCE = 'bbbbbbbb-0000-4000-8000-00000000000b';

const syntheticSources: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> = new Map([
  [INSTRUCTION_SOURCE, { kind: 'pdf' as const, title: 'Discharge summary' }],
  [OBSERVATION_SOURCE, { kind: 'pdf' as const, title: 'Repeat prescription' }],
]);

let claimCounter = 0;

function claim(opts: {
  role: 'instruction' | 'observation';
  value: string;
  asserted_at: string | null;
  date_precision?: DatePrecision;
}): Claim {
  claimCounter += 1;
  const suffix = claimCounter.toString(16).padStart(12, '0');
  return {
    id: `cccccccc-0000-4000-8000-${suffix}`,
    source_id: opts.role === 'instruction' ? INSTRUCTION_SOURCE : OBSERVATION_SOURCE,
    ontology_key: 'medication.bisoprolol',
    subject: 'bisoprolol',
    value: opts.value,
    quote: opts.value,
    locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
    asserted_at: opts.asserted_at,
    date_precision: opts.date_precision ?? 'exact',
    provenance: 'document_extracted',
    verified_substring: true,
  };
}

function timelineOf(claims: readonly Claim[]) {
  const group = {
    ontology_key: 'medication.bisoprolol',
    subject: 'bisoprolol',
    claims: [...claims].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  return applySupersession(
    buildFacts({ group, sourcesById: syntheticSources, personId: fixture.person.id }),
  );
}

/** Every returned fact must be internally coherent, whatever the input. */
function expectCoherent(facts: readonly Fact[]): void {
  for (const fact of facts) {
    // A fact that was replaced must say WHEN it stopped applying. `superseded_by`
    // set with `valid_to` still null is "replaced but never ended" — incoherent,
    // and it also breaks the S6 stretch test that a superseded fact has valid_to.
    if (fact.superseded_by !== null) {
      expect(fact.valid_to).not.toBeNull();
    }
    if (fact.valid_to !== null) {
      expect(fact.valid_from).not.toBeNull();
      // Never a period that ends before, or exactly when, it starts.
      if (fact.valid_from !== null) {
        expect(fact.valid_to > fact.valid_from).toBe(true);
      }
    }
    // Evidence is never destroyed, superseded or not.
    expect(fact.supporting_claim_ids.length).toBeGreaterThan(0);
  }
}

describe('the instruction/observation model — shapes the fixture does not contain', () => {
  it('three instructions in a row produce three periods chained end to end', () => {
    const facts = timelineOf([
      claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-01-10' }),
      claim({ role: 'instruction', value: 'stopped', asserted_at: '2026-03-10' }),
      claim({ role: 'instruction', value: 'restarted at 2.5mg', asserted_at: '2026-05-10' }),
    ]);

    expect(facts).toHaveLength(3);
    expect(facts.map((f) => [f.valid_from, f.valid_to])).toEqual([
      ['2026-01-10', '2026-03-10'],
      ['2026-03-10', '2026-05-10'],
      ['2026-05-10', null],
    ]);
    // Each earlier fact names the one that replaced it, and only the last is live.
    expect(facts[0]?.superseded_by).toBe(facts[1]?.id);
    expect(facts[1]?.superseded_by).toBe(facts[2]?.id);
    expect(facts[2]?.superseded_by).toBeNull();
    expect(liveFacts(facts)).toHaveLength(1);
    expectCoherent(facts);
  });

  it('an observation BEFORE any instruction gets its own leading period, closed by the instruction', () => {
    const facts = timelineOf([
      claim({ role: 'observation', value: 'on active repeat', asserted_at: '2026-01-05' }),
      claim({ role: 'instruction', value: 'stopped', asserted_at: '2026-04-05' }),
    ]);

    expect(facts).toHaveLength(2);
    expect(facts[0]?.valid_from).toBe('2026-01-05');
    expect(facts[0]?.valid_to).toBe('2026-04-05');
    expect(facts[1]?.valid_from).toBe('2026-04-05');
    expect(facts[1]?.valid_to).toBeNull();
    expectCoherent(facts);
  });

  it('a group of observations only yields ONE period and nothing is ever superseded', () => {
    const facts = timelineOf([
      claim({ role: 'observation', value: 'on active repeat', asserted_at: '2026-01-05' }),
      claim({ role: 'observation', value: 'still taking it', asserted_at: '2026-02-05' }),
      claim({ role: 'observation', value: 'on active repeat', asserted_at: '2026-03-05' }),
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.valid_from).toBe('2026-01-05');
    expect(facts[0]?.valid_to).toBeNull();
    expect(facts[0]?.superseded_by).toBeNull();
    expect(facts[0]?.supporting_claim_ids).toHaveLength(3);
    expect(supersededClaimIds(facts)).toEqual([]);
    expectCoherent(facts);
  });

  it('TWO instructions on the SAME date do not create a zero-length period — they share one and disagree', () => {
    // Two documents dated the same day cannot be ordered. Ordering them anyway
    // produced valid_from === valid_to and picked the loser by random uuid.
    const facts = timelineOf([
      claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-04-05' }),
      claim({ role: 'instruction', value: 'stopped', asserted_at: '2026-04-05' }),
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.valid_from).toBe('2026-04-05');
    expect(facts[0]?.valid_to).toBeNull();
    expect(facts[0]?.status).toBe('disputed');
    expect(facts[0]?.supporting_claim_ids).toHaveLength(2);
    expectCoherent(facts);
  });

  it('same-date instructions give the same answer whichever order they arrive in', () => {
    const a = claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-04-05' });
    const b = claim({ role: 'instruction', value: 'stopped', asserted_at: '2026-04-05' });

    const forward = timelineOf([a, b]);
    const reverse = timelineOf([b, a]);

    const strip = (facts: readonly Fact[]) =>
      facts.map(({ id, superseded_by, ...rest }) => {
        void id;
        void superseded_by;
        return { ...rest, supporting_claim_ids: [...rest.supporting_claim_ids].sort() };
      });

    expect(strip(reverse)).toEqual(strip(forward));
  });

  it('an UNDATED instruction opens no period and supersedes nothing — it joins as evidence', () => {
    const facts = timelineOf([
      claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-01-10' }),
      claim({ role: 'instruction', value: 'stopped', asserted_at: null, date_precision: 'unknown' }),
    ]);

    // A null date cannot anchor a valid_from, so it cannot end anything either.
    expect(facts).toHaveLength(1);
    expect(facts[0]?.valid_from).toBe('2026-01-10');
    expect(facts[0]?.valid_to).toBeNull();
    expect(facts[0]?.superseded_by).toBeNull();
    // ...but the evidence is still there. It is never dropped.
    expect(facts[0]?.supporting_claim_ids).toHaveLength(2);
    expect(facts[0]?.status).toBe('disputed');
    expectCoherent(facts);
  });

  it.each<DatePrecision>(['month', 'year', 'approximate', 'unknown'])(
    "an instruction dated with precision '%s' opens no period",
    (precision) => {
      const facts = timelineOf([
        claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-01-10' }),
        claim({
          role: 'instruction',
          value: 'stopped',
          asserted_at: '2026-06',
          date_precision: precision,
        }),
      ]);

      expect(facts).toHaveLength(1);
      expect(facts[0]?.superseded_by).toBeNull();
      expect(facts[0]?.supporting_claim_ids).toHaveLength(2);
      expectCoherent(facts);
    },
  );

  it('the refusal is visible: periodDecisionFor says why an undated instruction opened no period', () => {
    const source = syntheticSources.get(INSTRUCTION_SOURCE);
    if (source === undefined) throw new Error('unreachable');

    const undated = periodDecisionFor({ asserted_at: null, date_precision: 'unknown' }, source);
    expect(undated.role).toBe('instruction');
    expect(undated.opens_period).toBe(false);
    expect(undated.reason).toContain('no date');

    const imprecise = periodDecisionFor({ asserted_at: '2026', date_precision: 'year' }, source);
    expect(imprecise.opens_period).toBe(false);
    expect(imprecise.reason).toContain('year');

    const exact = periodDecisionFor({ asserted_at: '2026-06-25', date_precision: 'exact' }, source);
    expect(exact.opens_period).toBe(true);
  });

  it('an instruction that AGREES with the previous period still opens one, and the old period stays citable', () => {
    // A re-issued instruction genuinely starts a new period even when it
    // changes nothing: the earlier one was true earlier, and it must stay
    // visible with its own citation rather than being folded away.
    const facts = timelineOf([
      claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-01-10' }),
      claim({ role: 'instruction', value: 'continue 5mg', asserted_at: '2026-06-10' }),
    ]);

    expect(facts).toHaveLength(2);
    expect(facts[0]?.superseded_by).toBe(facts[1]?.id);
    expect(facts[0]?.status).toBe('confirmed');
    expect(facts[1]?.status).toBe('confirmed');
    // Neither is a disagreement: nothing changed, so no question is raised.
    expect(facts[0]?.canonical_value).toBe('continue 5mg');
    expect(facts[1]?.canonical_value).toBe('continue 5mg');
    expectCoherent(facts);
  });

  it('an observation AFTER an instruction joins its period rather than starting one', () => {
    const facts = timelineOf([
      claim({ role: 'instruction', value: 'stopped', asserted_at: '2026-01-10' }),
      claim({ role: 'observation', value: 'on active repeat', asserted_at: '2026-02-10' }),
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.valid_from).toBe('2026-01-10');
    expect(facts[0]?.status).toBe('disputed');
    // The pharmacy repeat does NOT get to overrule the hospital decision by
    // opening a period of its own; it disagrees inside the current one.
    expect(facts[0]?.supporting_claim_ids).toHaveLength(2);
    expectCoherent(facts);
  });
});

describe('applySupersession — the never-destroy-evidence guarantees', () => {
  function twoFacts(): Fact[] {
    const base: Fact = {
      id: 'dddddddd-0000-4000-8000-00000000d001',
      person_id: fixture.person.id,
      ontology_key: 'medication.bisoprolol',
      subject: 'bisoprolol',
      canonical_value: 'continue 5mg',
      provenance: 'document_extracted',
      status: 'confirmed',
      valid_from: '2026-01-10',
      valid_to: null,
      supporting_claim_ids: ['cccccccc-0000-4000-8000-00000000e001'],
      conflict_id: null,
      superseded_by: null,
    };
    return [
      base,
      {
        ...base,
        id: 'dddddddd-0000-4000-8000-00000000d002',
        canonical_value: 'stopped',
        valid_from: '2026-06-10',
        supporting_claim_ids: ['cccccccc-0000-4000-8000-00000000e002'],
      },
    ];
  }

  it('does not mutate its input', () => {
    const input = twoFacts();
    const before = JSON.parse(JSON.stringify(input)) as unknown;

    applySupersession(input);

    expect(JSON.parse(JSON.stringify(input)) as unknown).toEqual(before);
  });

  it('returns every fact it was given — never drops the superseded one', () => {
    const input = twoFacts();
    const out = applySupersession(input);

    expect(out).toHaveLength(input.length);
    for (const original of input) {
      const match = out.find((f) => f.id === original.id);
      if (match === undefined) throw new Error(`fact ${original.id} was dropped`);
      expect(match.supporting_claim_ids).toEqual(original.supporting_claim_ids);
      expect(match.canonical_value).toBe(original.canonical_value);
    }
  });

  it('is idempotent, and never erases supersession it did not derive', () => {
    const once = applySupersession(twoFacts());
    const twice = applySupersession(once);
    expect(twice).toEqual(once);

    // A lone fact that already carries supersession keeps it, rather than
    // having it cleared because this call found no successor for it.
    const [first] = twoFacts();
    if (first === undefined) throw new Error('unreachable');
    const preMarked: Fact = {
      ...first,
      valid_to: '2026-06-10',
      superseded_by: 'dddddddd-0000-4000-8000-00000000d002',
    };
    const out = applySupersession([preMarked]);
    expect(out[0]?.valid_to).toBe('2026-06-10');
    expect(out[0]?.superseded_by).toBe('dddddddd-0000-4000-8000-00000000d002');
  });

  it('never chains facts belonging to different people or different subjects', () => {
    const [a, b] = twoFacts();
    if (a === undefined || b === undefined) throw new Error('unreachable');

    const otherPerson: Fact = { ...b, person_id: '99999999-9999-4999-8999-999999999999' };
    const otherSubject: Fact = { ...b, subject: 'ramipril', ontology_key: 'medication.ramipril' };

    for (const stranger of [otherPerson, otherSubject]) {
      const out = applySupersession([a, stranger]);
      const mine = out.find((f) => f.id === a.id);
      expect(mine?.superseded_by).toBeNull();
      expect(mine?.valid_to).toBeNull();
    }
  });

  it('a superseded fact is excluded from liveFacts — it can never fill a current-state slot', () => {
    const out = applySupersession(twoFacts());
    const superseded = out.find((f) => f.superseded_by !== null);
    if (superseded === undefined) throw new Error('expected a superseded fact');

    const live = liveFacts(out);
    expect(live.map((f) => f.id)).not.toContain(superseded.id);
    expect(live).toHaveLength(1);

    // ...and the superseding fact is identifiable FROM the superseded one.
    expect(out.find((f) => f.id === superseded.superseded_by)).toBeDefined();
  });
});

describe('buildFacts — unverified claims never contribute', () => {
  it('an unverified instruction claim does not open, extend, or otherwise affect a period', () => {
    const baseline = buildAndSupersede();

    const group = furosemideGroup();
    const fakeUnverified: Claim = {
      id: 'c0000000-0000-4000-8000-0000000000ff',
      source_id: group.claims[0]?.source_id ?? '',
      ontology_key: group.ontology_key,
      subject: group.subject,
      value: 'STOP IMMEDIATELY',
      quote: 'a quote that is not actually in the source',
      locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
      asserted_at: '2026-08-01',
      date_precision: 'exact',
      provenance: 'document_extracted',
      verified_substring: false,
    };

    const withFake: ClaimGroup = { ...group, claims: [...group.claims, fakeUnverified] };
    const result = buildAndSupersede(withFake);

    expect(result).toHaveLength(baseline.length);
    for (const fact of result) {
      for (const claimId of fact.supporting_claim_ids) {
        expect(claimId).not.toBe(fakeUnverified.id);
      }
    }
  });
});
