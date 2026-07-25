/**
 * The generated question is the single most visible thing Lane A produces. It
 * is what a GP reads, and it is the one place where a careless sentence would
 * turn "here is what your documents say" into clinical advice.
 *
 * These tests exist to make that sentence hard to break: they pin the fixture's
 * documented wording, and they assert the boundary between asking and telling.
 */

import { describe, expect, it } from 'vitest';

import { CaseSnapshot, type Claim } from '@/lib/contracts';
import fixture from '@/fixtures/margaret.json';
import { containsBannedTerm, generateQuestion } from '../conflict';

const snapshot = CaseSnapshot.parse(fixture);

function furosemideClaims(): Claim[] {
  return snapshot.claims.filter(
    (claim) =>
      claim.ontology_key === 'medication.furosemide' &&
      claim.verified_substring,
  );
}

/** The three live claims the fixture's own conflict names. */
function liveFurosemideClaims(): Claim[] {
  const conflict = snapshot.conflicts[0];
  if (conflict === undefined) throw new Error('fixture has no conflict');
  const ids = new Set(conflict.claim_ids);
  return furosemideClaims().filter((claim) => ids.has(claim.id));
}

describe('generateQuestion — names the dispute', () => {
  it('asks about restarting when one source says stopped and another says ongoing', () => {
    // The discharge summary stopped it; the repeat prescription and Margaret
    // both have it ongoing. The outstanding decision is whether it should have
    // resumed, and the question should say so rather than being generic.
    const question = generateQuestion('furosemide', liveFurosemideClaims());

    expect(question).toBe(
      'Three sources disagree about the water tablet (furosemide). ' +
        'Ask whether it should have been restarted.',
    );
  });

  it('counts distinct sources, not claims', () => {
    const claims = liveFurosemideClaims();
    expect(claims).toHaveLength(3);
    expect(new Set(claims.map((c) => c.source_id)).size).toBe(3);
    expect(generateQuestion('furosemide', claims)).toContain('Three sources');
  });

  it('falls back to an open question when the opposition is not stopped-vs-ongoing', () => {
    const [first, second] = liveFurosemideClaims();
    if (first === undefined || second === undefined) {
      throw new Error('expected at least two claims');
    }
    // Neither value carries stopped/continuing vocabulary.
    const question = generateQuestion('bisoprolol', [
      { ...first, value: '2.5mg' },
      { ...second, value: '5mg' },
    ]);

    expect(question).toContain('Ask which of these records is current.');
    expect(question).not.toContain('restarted');
  });

  it('uses the clinical name alone when no lay synonym is known', () => {
    const question = generateQuestion('dapagliflozin', liveFurosemideClaims());
    expect(question).toContain('dapagliflozin');
    // No invented lay term in parentheses.
    expect(question).not.toMatch(/dapagliflozin \(/);
  });
});

describe('generateQuestion — asks, never tells', () => {
  it('carries no banned term', () => {
    expect(
      containsBannedTerm(generateQuestion('furosemide', liveFurosemideClaims())),
    ).toBeNull();
  });

  it('never states what should be done', () => {
    const question = generateQuestion('furosemide', liveFurosemideClaims());

    // "Ask whether it should have been restarted" is a question a prescriber
    // answers. "She should restart it" is advice this product must never give.
    expect(question).not.toMatch(/\b(she|he|they|you) should\b/i);
    expect(question).not.toMatch(/\brestart it\b/i);
    expect(question).not.toMatch(/\b(we|I) recommend\b/i);
    expect(question).toMatch(/^\w+ sources disagree about/);
    expect(question).toContain('Ask ');
  });

  it('attaches no timeframe of its own', () => {
    // A question that says "now", "today", or "as soon as possible" has smuggled
    // in an urgency judgement the contract has nowhere to store.
    const question = generateQuestion('furosemide', liveFurosemideClaims());
    expect(question).not.toMatch(/\b(now|today|soon|as soon as possible)\b/i);
  });
});
