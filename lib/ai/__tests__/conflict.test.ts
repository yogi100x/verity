import { describe, it, expect } from 'vitest';
import {
  BANNED_QUESTION_TERMS,
  containsBannedTerm,
  valuesConflict,
  valueState,
  generateQuestion,
  detectConflicts,
  type ConflictGroupView,
} from '@/lib/ai/conflict';
import { CaseSnapshot, Conflict, type Claim } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

const furosemideClaims: Claim[] = fixture.claims.filter(
  (c) => c.ontology_key === 'medication.furosemide',
);

const marchClaim = furosemideClaims.find((c) => c.asserted_at === '2026-03-12');
if (marchClaim === undefined) {
  throw new Error('fixture invariant broken: expected a furosemide claim asserted 2026-03-12');
}

const furosemideGroup: ConflictGroupView = {
  ontology_key: 'medication.furosemide',
  subject: 'furosemide',
  claims: furosemideClaims,
};

const fixtureConflict = fixture.conflicts[0];
if (fixtureConflict === undefined) {
  throw new Error('fixture invariant broken: expected at least one conflict');
}

function idSet(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

describe('detectConflicts — the demo beat: three sources disagree about furosemide', () => {
  it('with the March cardiology claim marked superseded, yields exactly one conflict whose three claim ids match the fixture conflict', () => {
    const conflicts = detectConflicts(
      [furosemideGroup],
      fixture.person.id,
      { supersededClaimIds: [marchClaim.id] },
    );

    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('unreachable');

    expect(conflict.claim_ids).toHaveLength(3);
    expect(sameSet(idSet(conflict.claim_ids), idSet(fixtureConflict.claim_ids))).toBe(true);
    expect(conflict.ontology_key).toBe('medication.furosemide');
    expect(conflict.subject).toBe('furosemide');
  });

  it('with NO supersession information, the same group yields one conflict containing all FOUR claims', () => {
    // This documents a real dependency on the supersession pass (stretch S6),
    // not a bug: without knowing the March claim is superseded, it is still
    // "live" by this function's contract, and it disagrees with the June
    // discharge claim just as much as the other two do.
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id);

    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('unreachable');
    expect(conflict.claim_ids).toHaveLength(4);
    expect(sameSet(idSet(conflict.claim_ids), idSet(furosemideClaims.map((c) => c.id)))).toBe(
      true,
    );
  });

  it('generated question contains no banned term and mentions the subject', () => {
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('unreachable');

    expect(containsBannedTerm(conflict.generated_question)).toBeNull();
    expect(conflict.generated_question.toLowerCase()).toContain('furosemide');
  });

  it('generated question is not directive advice', () => {
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('unreachable');

    expect(conflict.generated_question).not.toMatch(/should restart|she should|must restart/i);
  });

  it('resolution is always unresolved', () => {
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    for (const conflict of conflicts) {
      expect(conflict.resolution).toBe('unresolved');
    }
  });

  it('every emitted conflict parses against the Conflict zod schema', () => {
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    for (const conflict of conflicts) {
      expect(() => Conflict.parse(conflict)).not.toThrow();
    }
  });

  it('is deterministic: shuffled input claim order does not change claim_ids order', () => {
    const shuffled: ConflictGroupView = {
      ...furosemideGroup,
      claims: [...furosemideClaims].reverse(),
    };

    const a = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    const b = detectConflicts([shuffled], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });

    const conflictA = a[0];
    const conflictB = b[0];
    if (conflictA === undefined || conflictB === undefined) throw new Error('unreachable');
    expect(conflictB.claim_ids).toEqual(conflictA.claim_ids);
  });
});

describe('valuesConflict', () => {
  it('detects a stopped/discontinued value against a continuing value', () => {
    expect(valuesConflict('40mg, stopped prior to discharge', '40mg, on active repeat')).toBe(
      true,
    );
    expect(valuesConflict('discontinued', 'still taking')).toBe(true);
  });

  it('does NOT flag two claims that agree, even if differently worded', () => {
    expect(valuesConflict('still taking it at bedtime', '40mg, on active repeat, 28 days')).toBe(
      false,
    );
  });

  it('does NOT flag identical values', () => {
    expect(valuesConflict('continue 40mg daily', 'continue 40mg daily')).toBe(false);
  });

  it('does NOT flag values with no recognised opposition vocabulary', () => {
    expect(valuesConflict('taken with food', 'taken in the morning')).toBe(false);
  });

  // Every pair below is real medication-reconciliation wording. The plain
  // substring implementation got 11 of these 12 wrong: 'continue' matched
  // inside "discontinued" and 'active' inside "inactive" (so AGREEING pairs
  // were flagged), while suffixes and negation were invisible (so genuinely
  // DISAGREEING pairs were silently dropped).
  it.each([
    ['Furosemide — discontinued', '40mg stopped prior to discharge'],
    ['no longer active on repeat', 'stopped prior to discharge'],
    ['inactive', 'stopped'],
    ['dose increased to 5mg', 'dose reduced to 2.5mg'],
  ])('does NOT flag %s against %s — they agree, or carry no opposition', (a, b) => {
    expect(valuesConflict(a, b)).toBe(false);
  });

  it.each([
    ['not currently taking', 'continue 40mg daily'],
    ['no longer taking', 'on active repeat'],
    ['do not restart', 'continue 40mg daily'],
    ['omitted', 'continue 40mg daily'],
    ['suspended pending review', 'continued 40mg'],
    ['on hold', 'resumed 40mg'],
    ['STOP furosemide', 'continues 40mg'],
    ['deprescribed', 'unchanged, 40mg'],
    ['withdrawn', 'restarted 40mg'],
    ['ceased 25 June', 'maintained on 40mg'],
    ['withheld during admission', 'ongoing'],
  ])('DOES flag %s against %s — a genuine disagreement', (a, b) => {
    expect(valuesConflict(a, b)).toBe(true);
  });

  it('is symmetric in its arguments', () => {
    const pairs: readonly [string, string][] = [
      ['discontinued', 'still taking'],
      ['inactive', 'stopped'],
      ['2.5mg', '5mg'],
    ];
    for (const [a, b] of pairs) {
      expect(valuesConflict(a, b)).toBe(valuesConflict(b, a));
    }
  });

  it('classifies genuinely ambiguous wording as ambiguous, not as a guess', () => {
    expect(valueState('stopped on discharge, restart if weight rises')).toBe('ambiguous');
    expect(valueState('40mg, on active repeat')).toBe('continuing');
    expect(valueState('discontinued')).toBe('stopped');
    expect(valueState('2.5mg once daily')).toBe('unknown');
  });

  it('does not fire on a stem buried mid-word', () => {
    // "capecitabine" contains no \b before any stem; "handholding" contains
    // "hold" only mid-word. Neither is a signal.
    expect(valueState('capecitabine 500mg')).toBe('unknown');
    expect(valueState('handholding required')).toBe('unknown');
  });
});

describe('containsBannedTerm', () => {
  it('finds a banned term word-boundary matched, case-insensitively', () => {
    expect(containsBannedTerm('This is Urgent.')).toBe('urgent');
    expect(containsBannedTerm('She should restart it.')).toBe('she should');
  });

  it('returns null for clean text', () => {
    expect(containsBannedTerm('Three sources disagree about furosemide.')).toBeNull();
  });

  it('does not false-positive on a substring that is not a whole word', () => {
    // "moderate" is banned; "moderately" and "accommodate" must not trip it.
    expect(containsBannedTerm('The dose was adjusted moderately.')).toBeNull();
    expect(containsBannedTerm('We will accommodate the request.')).toBeNull();
  });

  it('every term in BANNED_QUESTION_TERMS is individually detectable', () => {
    for (const term of BANNED_QUESTION_TERMS) {
      expect(containsBannedTerm(`context ${term} context`)).toBe(term);
    }
  });

  it('catches a multi-word term that straddles a line break or double space', () => {
    // A single-space pattern would miss both of these, and text arriving from a
    // PDF text layer is full of mid-sentence newlines.
    expect(containsBannedTerm('findings consistent\nwith heart failure')).toBe(
      'consistent with',
    );
    expect(containsBannedTerm('she  should  restart it')).toBe('she should');
  });
});

describe('generateQuestion', () => {
  it('never contains directive advice', () => {
    const question = generateQuestion('furosemide', furosemideClaims);
    expect(question).not.toMatch(/should restart|she should|must restart/i);
    expect(containsBannedTerm(question)).toBeNull();
  });

  it('mentions the subject and a source count', () => {
    const question = generateQuestion('furosemide', furosemideClaims);
    expect(question.toLowerCase()).toContain('furosemide');
    expect(question).toMatch(/^[A-Z][a-z]+ sources disagree/);
  });

  // `subject` is model-authored text lifted from a document. It is the only
  // untrusted input to the one sentence a clinician reads, so a hostile or
  // sloppy subject must not be able to put urgency or advice into it.
  it.each([
    'furosemide — stop immediately',
    'water tablet, she should restart it urgently',
    'medication (severe risk)',
    'the priority medication',
  ])('refuses to paste a banned term into the question via the subject: %s', (subject) => {
    const question = generateQuestion(subject, furosemideClaims);
    expect(containsBannedTerm(question)).toBeNull();
    expect(question).toContain('one entry in these records');
  });

  it('refuses a subject that is a paragraph rather than a subject', () => {
    const question = generateQuestion('x'.repeat(400), furosemideClaims);
    expect(question).toContain('one entry in these records');
    expect(question.length).toBeLessThan(120);
  });

  it('an empty subject falls back rather than rendering "about the ."', () => {
    expect(generateQuestion('   ', furosemideClaims)).toContain('one entry in these records');
  });

  it('does not claim two sources when both claims came from ONE source', () => {
    const first = furosemideClaims[0];
    if (first === undefined) throw new Error('unreachable');
    const sameSource: Claim[] = [
      { ...first, value: 'stopped' },
      { ...first, value: 'continue 40mg daily' },
    ];

    const question = generateQuestion('furosemide', sameSource);
    expect(question).not.toMatch(/^One sources/);
    expect(question).toContain('One source gives conflicting entries');
    expect(containsBannedTerm(question)).toBeNull();
  });
});

describe('edge cases', () => {
  it('a single live claim produces no conflict', () => {
    const oneClaim = furosemideClaims.slice(0, 1);
    const group: ConflictGroupView = {
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      claims: oneClaim,
    };
    expect(detectConflicts([group], fixture.person.id)).toEqual([]);
  });

  it('two claims that agree produce no conflict', () => {
    const c2 = furosemideClaims.find((c) => c.value.includes('active repeat'));
    const c3 = furosemideClaims.find((c) => c.value.includes('still taking'));
    if (c2 === undefined || c3 === undefined) throw new Error('unreachable');
    const group: ConflictGroupView = {
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      claims: [c2, c3],
    };
    expect(detectConflicts([group], fixture.person.id)).toEqual([]);
  });

  it('an unverified claim is excluded even if its value would conflict', () => {
    const stopped = furosemideClaims.find((c) => c.value.includes('stopped'));
    const continuing = furosemideClaims.find((c) => c.value.includes('active repeat'));
    if (stopped === undefined || continuing === undefined) throw new Error('unreachable');

    const unverifiedContinuing: Claim = { ...continuing, verified_substring: false };

    const group: ConflictGroupView = {
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      claims: [stopped, unverifiedContinuing],
    };
    expect(detectConflicts([group], fixture.person.id)).toEqual([]);
  });
});

describe('no judgement fields anywhere in emitted conflicts', () => {
  const BANNED_KEY_PATTERN = /severity|urgency|priority|rank|risk|score/i;

  function walkKeys(value: unknown, keys: Set<string>): void {
    if (Array.isArray(value)) {
      for (const item of value) walkKeys(item, keys);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        keys.add(key);
        walkKeys(val, keys);
      }
    }
  }

  it('recursive key walk finds no judgement key', () => {
    const conflicts = detectConflicts([furosemideGroup], fixture.person.id, {
      supersededClaimIds: [marchClaim.id],
    });
    const keys = new Set<string>();
    walkKeys(conflicts, keys);
    for (const key of keys) {
      expect(key).not.toMatch(BANNED_KEY_PATTERN);
    }
  });
});
