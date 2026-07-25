import { describe, it, expect } from 'vitest';
import { projectConflicts, projectGaps, projectAll, type ProjectionInput } from '@/lib/ai/projections';
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
    conflicts: fixture.conflicts,
    gaps: fixture.gaps,
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

describe('projectConflicts — a settled disagreement is never resurrected', () => {
  // `Conflict.resolution` is a frozen contract field and nothing consulted it.
  // A `user_resolved` conflict was still projected as a LIVE, `disputed` fact,
  // so `gp_brief_v1.questions` would keep asking a question the person had
  // already answered, on every rebuild, with no way to stop it.
  //
  // The fixture's own conflict is the positive control: this must not pass by
  // projecting nothing at all.
  it('a user_resolved conflict projects no fact, while the same conflict unresolved projects one', () => {
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error('fixture has no conflict to resolve');

    const open = projectConflicts({
      personId: fixture.person.id,
      conflicts: [{ ...conflict, resolution: 'unresolved' }],
      gaps: [],
    });
    expect(open).toHaveLength(1);

    const settled = projectConflicts({
      personId: fixture.person.id,
      conflicts: [{ ...conflict, resolution: 'user_resolved' }],
      gaps: [],
    });
    expect(settled).toHaveLength(0);
  });

  it('the resolved conflict’s generated_question reaches no projected canonical_value anywhere in projectAll', () => {
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error('fixture has no conflict to resolve');

    const facts = projectAll({
      personId: fixture.person.id,
      conflicts: [{ ...conflict, resolution: 'user_resolved' }],
      gaps: fixture.gaps,
    });
    for (const fact of facts) {
      expect(fact.canonical_value).not.toBe(conflict.generated_question);
      expect(fact.conflict_id).toBeNull();
    }
  });

  it('never emits a disputed fact for a conflict that is not unresolved', () => {
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error('fixture has no conflict to resolve');
    const facts = projectAll({
      personId: fixture.person.id,
      conflicts: [{ ...conflict, resolution: 'user_resolved' }],
      gaps: fixture.gaps,
    });
    expect(facts.some((f) => f.status === 'disputed')).toBe(false);
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
    const gaps = projectGaps(input);

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

describe('Fact schema conformance', () => {
  it('every projected fact parses against the Fact zod schema', () => {
    const all = projectAll(makeInput());
    expect(all.length).toBeGreaterThan(0);
    for (const fact of all) {
      expect(() => Fact.parse(fact)).not.toThrow();
    }
  });
});

describe('projectAll no longer emits source.inventory or person.identity facts', () => {
  // These two namespaces used to be projected here, but neither can ever
  // back a slot: both describe the pack itself (its documents; who it is
  // about), not a claim about the person, so the DB constraint forced
  // `status: 'unknown'` with no supporting claims, and `isVerifiedBacked`
  // (lib/ai/artifacts.ts) correctly never lets such a fact fill a slot.
  // `cover.sources` / `documents` / `cover.subject` are now filled via
  // `BuildArtifactInput.sources` / `.person` on the structural/metadata path
  // instead — see lib/ai/artifacts.ts and lib/ai/__tests__/source-inventory.test.ts.
  it('emits no fact keyed source.inventory', () => {
    const all = projectAll(makeInput());
    expect(all.some((f) => f.ontology_key === 'source.inventory')).toBe(false);
  });

  it('emits no fact keyed person.identity', () => {
    const all = projectAll(makeInput());
    expect(all.some((f) => f.ontology_key === 'person.identity')).toBe(false);
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
  });
});
