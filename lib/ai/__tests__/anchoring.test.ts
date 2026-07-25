/**
 * Quote anchoring — the checks added after the first real live call.
 *
 * The model emitted {"ontology_key":"x","subject":"x","value":"x","quote":"x"}
 * and the bare substring check verified it. These tests pin the three
 * structural checks that now reject it, and — just as load-bearing — prove
 * that every genuine claim in the fixture still passes all of them.
 */

import { describe, expect, it } from 'vitest';

import { CaseSnapshot } from '@/lib/contracts';
import fixture from '@/fixtures/margaret.json';
import {
  anchorClaim,
  hasWellFormedKey,
  isUniquelyAnchored,
  quoteSupportsClaim,
} from '../verify';
import { partitionClaims } from '../extract';

const snap = CaseSnapshot.parse(fixture);

/** The junk the live run actually produced, verbatim. */
const JUNK = { ontology_key: 'x', subject: 'x', value: 'x', quote: 'x' };

describe('the live junk claim is rejected', () => {
  // "x" genuinely appears in this transcript, exactly once (inside
  // "maximum") — mirroring the real live transcript where the bare substring
  // check passed it. Keep it to ONE occurrence: with two, the uniqueness
  // check fires first and the support check is never reached.
  const source = { transcript: 'Patient took the maximum dose today.' };

  it('fails the key check (and the key alone is fatal)', () => {
    expect(hasWellFormedKey(JUNK)).toBe(false);
    expect(anchorClaim(JUNK, source)).toBe('malformed_ontology_key');
  });

  it('even with a plausible key, a token quote fails the support check', () => {
    const withKey = { ...JUNK, ontology_key: 'medication.furosemide' };
    expect(anchorClaim(withKey, source)).toBe('quote_does_not_support_claim');
  });
});

describe('uniqueness — a citation must land somewhere specific', () => {
  it('a quote occurring twice is rejected, and the reason says so', () => {
    const source = { transcript: 'Take daily. Review soon. Take daily.' };
    const claim = {
      ontology_key: 'instruction.dosing',
      subject: 'dosing',
      value: 'take daily',
      quote: 'Take daily.',
    };
    expect(isUniquelyAnchored(claim, source)).toBe(false);
    expect(anchorClaim(claim, source)).toBe('quote_not_uniquely_locatable');
  });

  it('a fabricated quote reports as fabricated, not as non-unique', () => {
    const source = { transcript: 'Nothing relevant here.' };
    const claim = {
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      value: 'stopped',
      quote: 'Furosemide was stopped',
    };
    expect(anchorClaim(claim, source)).toBe('quote_not_in_source');
  });
});

describe('no genuine claim is lost — the fixture is the evidence', () => {
  it('all 16 verified claims pass every check, including the lay-synonym case', () => {
    const sources = new Map(snap.sources.map((s) => [s.id, s]));
    for (const claim of snap.claims) {
      const source = sources.get(claim.source_id);
      if (source === undefined) throw new Error('dangling source_id');
      const failure = anchorClaim(claim, source);
      if (claim.verified_substring) {
        expect(failure, `${claim.subject}: ${claim.quote.slice(0, 40)}`).toBeNull();
      } else {
        expect(failure).toBe('quote_not_in_source');
      }
    }
  });

  it('the water-tablet claim survives — strict containment would have dropped it', () => {
    const claim = snap.claims.find((c) => c.quote.includes('water tablet'));
    if (claim === undefined) throw new Error('fixture changed');
    // The subject (furosemide) appears nowhere in the quote; the connecting
    // token comes from the value. This is the case that rules out requiring
    // the quote to contain the whole subject or value.
    expect(claim.quote.toLowerCase()).not.toContain('furosemide');
    expect(quoteSupportsClaim(claim)).toBe(true);
  });

  it('partitionClaims still reproduces the fixture stats — derived, not pinned', () => {
    let kept = 0;
    let droppedCount = 0;
    for (const source of snap.sources) {
      const raw = snap.claims
        .filter((c) => c.source_id === source.id)
        .map((c) => ({
          ontology_key: c.ontology_key,
          subject: c.subject,
          value: c.value,
          quote: c.quote,
          page: c.locator.page,
          asserted_at: c.asserted_at,
          date_precision: c.date_precision,
        }));
      const result = partitionClaims(raw, source);
      kept += result.kept.length;
      droppedCount += result.dropped.length;
    }
    // Derived from fixture.stats — the fixture gains sources over time and
    // this suite tracks it rather than pinning a moment.
    expect(kept).toBe(snap.stats.claims_extracted - snap.stats.claims_dropped);
    expect(droppedCount).toBe(snap.stats.claims_dropped);
  });
});

describe('locator correctness falls out of uniqueness', () => {
  it('an anchored claim gets char offsets pointing at the only occurrence', () => {
    const transcript = 'Preamble text. Furosemide 40mg STOPPED at discharge. End.';
    const raw = [{
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      value: '40mg stopped',
      quote: 'Furosemide 40mg STOPPED',
      page: 1,
      asserted_at: null,
      date_precision: 'unknown' as const,
    }];
    const { kept } = partitionClaims(raw, { id: 'src-1', transcript });
    expect(kept).toHaveLength(1);
    const claim = kept[0];
    if (claim === undefined) throw new Error('unreachable');
    expect(claim.locator.char_start).toBe(transcript.indexOf('Furosemide'));
    expect(
      transcript.slice(claim.locator.char_start ?? 0, claim.locator.char_end ?? 0),
    ).toBe('Furosemide 40mg STOPPED');
  });
});
