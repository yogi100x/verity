import { describe, it, expect } from 'vitest';
import {
  projectConflicts,
  projectGaps,
  projectSourceInventory,
  projectPersonIdentity,
  projectAll,
  type ProjectionInput,
} from '@/lib/ai/projections';
import { CaseSnapshot, Fact } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked —
 *  matching the convention used in lib/ai/__tests__/facts.test.ts. */
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

function makeInput(): ProjectionInput {
  return {
    personId: fixture.person.id,
    person: { display_name: fixture.person.display_name },
    conflicts: fixture.conflicts,
    gaps: fixture.gaps,
    sources: fixture.sources,
  };
}

describe('projectConflicts', () => {
  it('projects exactly one fact carrying the demo question verbatim', () => {
    const input = makeInput();
    const facts = projectConflicts(input);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.canonical_value).toBe(fixture.conflicts[0]?.generated_question);
    expect(facts[0]?.supporting_claim_ids).toEqual(fixture.conflicts[0]?.claim_ids);
  });

  it('keys every conflict fact under conflict.<one-segment>, matching the shipped conflict.* pattern', () => {
    const facts = projectConflicts(makeInput());
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.ontology_key.startsWith('conflict.')).toBe(true);
      const rest = fact.ontology_key.slice('conflict.'.length);
      expect(rest.length).toBeGreaterThan(0);
      expect(rest.includes('.')).toBe(false);
    }
  });

  it('sets conflict_id to the conflict itself', () => {
    const facts = projectConflicts(makeInput());
    expect(facts[0]?.conflict_id).toBe(fixture.conflicts[0]?.id);
  });
});

describe('projectGaps', () => {
  it('projects one fact per gap, canonical_value verbatim, keyed under gap.', () => {
    const facts = projectGaps(makeInput());
    expect(facts).toHaveLength(fixture.gaps.length);
    for (const gap of fixture.gaps) {
      const match = facts.find((f) => f.canonical_value === gap.statement);
      expect(match).toBeDefined();
      expect(match?.ontology_key.startsWith('gap.')).toBe(true);
      expect(match?.supporting_claim_ids).toEqual(gap.supporting_claim_ids);
    }
  });
});

describe('status / supporting_claim_ids DB constraint', () => {
  it('a fact with no supporting claims has status unknown', () => {
    const input = makeInput();
    const sourceInventory = projectSourceInventory(input);
    const personIdentity = projectPersonIdentity(input);
    const gaps = projectGaps(input);

    for (const fact of [...sourceInventory, ...personIdentity]) {
      expect(fact.supporting_claim_ids).toHaveLength(0);
      expect(fact.status).toBe('unknown');
    }

    for (const fact of gaps) {
      if (fact.supporting_claim_ids.length === 0) {
        expect(fact.status).toBe('unknown');
      }
    }
  });

  it('a fact with supporting claims does not have status unknown', () => {
    const input = makeInput();
    const conflicts = projectConflicts(input);
    const gaps = projectGaps(input);

    for (const fact of conflicts) {
      expect(fact.supporting_claim_ids.length).toBeGreaterThan(0);
      expect(fact.status).not.toBe('unknown');
    }

    for (const fact of gaps) {
      if (fact.supporting_claim_ids.length > 0) {
        expect(fact.status).not.toBe('unknown');
      }
    }
  });
});

describe('projectPersonIdentity', () => {
  it('uses provenance user_stated, not document_extracted', () => {
    const facts = projectPersonIdentity(makeInput());
    expect(facts).toHaveLength(1);
    expect(facts[0]?.provenance).toBe('user_stated');
    expect(facts[0]?.canonical_value).toBe(fixture.person.display_name);
    expect(facts[0]?.ontology_key).toBe('person.identity');
  });
});

describe('projectSourceInventory', () => {
  it('produces one fact, keyed source.inventory, listing every source title', () => {
    const facts = projectSourceInventory(makeInput());
    expect(facts).toHaveLength(1);
    expect(facts[0]?.ontology_key).toBe('source.inventory');
    for (const source of fixture.sources) {
      expect(facts[0]?.canonical_value.includes(source.title)).toBe(true);
    }
  });
});

describe('Fact schema conformance', () => {
  it('every projected fact parses against the Fact zod schema', () => {
    const all = projectAll(makeInput());
    expect(all.length).toBeGreaterThan(0);
    for (const fact of all) {
      expect(() => Fact.parse(fact)).not.toThrow();
    }
  });
});

describe('projectAll determinism', () => {
  it('is deterministic across repeated calls, ignoring id', () => {
    const input = makeInput();
    const first = projectAll(input);
    const second = projectAll(input);
    const stripId = (f: Fact) => {
      const { id, ...rest } = f;
      void id;
      return rest;
    };
    expect(first.map(stripId)).toEqual(second.map(stripId));
  });

  it('output order is unchanged when input arrays are shuffled', () => {
    const input = makeInput();
    const baseline = projectAll(input).map((f) => f.ontology_key);

    const shuffled: ProjectionInput = {
      ...input,
      conflicts: [...input.conflicts].reverse(),
      gaps: [...input.gaps].reverse(),
      sources: [...input.sources].reverse(),
    };
    const afterShuffle = projectAll(shuffled).map((f) => f.ontology_key);

    expect(afterShuffle).toEqual(baseline);
  });
});

describe('no judgement fields', () => {
  it('no projected fact has a key named severity/urgency/priority/rank/risk/score', () => {
    const all = projectAll(makeInput());
    const keys = new Set<string>();
    collectKeys(all, keys);
    for (const key of keys) {
      expect(JUDGEMENT_KEY_RE.test(key)).toBe(false);
    }
  });
});

describe('no fabricated prose', () => {
  it('every canonical_value is traceable to its originating entity', () => {
    const input = makeInput();

    for (const fact of projectConflicts(input)) {
      const conflict = input.conflicts.find((c) => c.id === fact.conflict_id);
      expect(conflict).toBeDefined();
      expect(fact.canonical_value).toBe(conflict?.generated_question);
    }

    for (const fact of projectGaps(input)) {
      const gap = input.gaps.find((g) => g.statement === fact.canonical_value);
      expect(gap).toBeDefined();
    }

    for (const fact of projectSourceInventory(input)) {
      for (const source of input.sources) {
        expect(fact.canonical_value.includes(source.title)).toBe(true);
      }
    }

    for (const fact of projectPersonIdentity(input)) {
      expect(fact.canonical_value).toBe(input.person.display_name);
    }
  });
});
