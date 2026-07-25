import { describe, it, expect } from 'vitest';
import { verifyClaim } from '@/lib/ai/verify';
import { CaseSnapshot } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';

describe('verifyClaim — the substring kill switch', () => {
  it('returns FALSE for a paraphrase of source text', () => {
    const source = { transcript: 'The patient was discharged home on 25 June 2026.' };
    const claim = { quote: 'She went home from hospital on the 25th of June.' };
    expect(verifyClaim(claim, source)).toBe(false);
  });

  it('returns FALSE for a quote whose spelling has been "corrected" relative to the source', () => {
    const source = { transcript: 'Patient recieved dapagliflozin 10mg on discharge.' };
    const claim = { quote: 'Patient received dapagliflozin 10mg on discharge.' };
    expect(verifyClaim(claim, source)).toBe(false);
  });

  it('returns FALSE for a quote that expands an abbreviation the source did not expand', () => {
    const source = { transcript: 'Please continue furosemide 40mg od and bisoprolol 2.5mg od.' };
    const claim = { quote: 'Please continue furosemide 40mg once daily and bisoprolol 2.5mg once daily.' };
    expect(verifyClaim(claim, source)).toBe(false);
  });

  it('returns TRUE when the only difference is curly vs straight quotes (single and double)', () => {
    const source = {
      transcript: 'Margaret said, “Still taking my water tablet, that’s all.”',
    };
    const claim = { quote: 'Still taking my water tablet, that\'s all.' };
    expect(verifyClaim(claim, source)).toBe(true);
  });

  it('returns TRUE when the only difference is doubled/extra whitespace, including a newline mid-sentence', () => {
    const source = {
      transcript: 'Daily   weights.  Contact GP if\nweight rises more than 2kg over 3 days.',
    };
    const claim = { quote: 'Daily weights. Contact GP if weight rises more than 2kg over 3 days.' };
    expect(verifyClaim(claim, source)).toBe(true);
  });

  it('returns TRUE when the source hyphenates a word across a line break', () => {
    const source = { transcript: 'Please continue furose-\nmide 40mg daily as before.' };
    const claim = { quote: 'furosemide 40mg daily' };
    expect(verifyClaim(claim, source)).toBe(true);
  });

  it('returns TRUE across a soft hyphen (U+00AD) in the source', () => {
    const source = { transcript: 'Continue furo­semide 40mg once daily.' };
    const claim = { quote: 'furosemide 40mg once daily' };
    expect(verifyClaim(claim, source)).toBe(true);
  });

  it('is case-insensitive: a quote differing only in letter case passes', () => {
    const source = { transcript: 'FUROSEMIDE 40MG — STOPPED prior to discharge.' };
    const claim = { quote: 'furosemide 40mg — stopped prior to discharge.' };
    expect(verifyClaim(claim, source)).toBe(true);
  });

  describe('against the margaret fixture', () => {
    const fixture: CaseSnapshot = CaseSnapshot.parse(fixtureRaw);
    const sourceById = new Map(fixture.sources.map((s) => [s.id, s]));

    it('every claim with verified_substring: true passes verifyClaim against its own source', () => {
      const verifiedClaims = fixture.claims.filter((c) => c.verified_substring);
      expect(verifiedClaims.length).toBeGreaterThan(0);

      for (const claim of verifiedClaims) {
        const source = sourceById.get(claim.source_id);
        expect(source, `no source found for claim ${claim.id}`).toBeDefined();
        if (source === undefined) continue;
        expect(
          verifyClaim(claim, source),
          `claim ${claim.id} (quote: ${JSON.stringify(claim.quote)}) should verify ` +
            `against source ${claim.source_id}`,
        ).toBe(true);
      }
    });

    it('the one claim with verified_substring: false FAILS verifyClaim — the deliberate drop-path fixture', () => {
      const unverifiedClaims = fixture.claims.filter((c) => !c.verified_substring);
      expect(unverifiedClaims).toHaveLength(1);

      const claim = unverifiedClaims[0];
      expect(claim).toBeDefined();
      if (claim === undefined) return;

      const source = sourceById.get(claim.source_id);
      expect(source).toBeDefined();
      if (source === undefined) return;

      expect(
        verifyClaim(claim, source),
        'fixture deliberately contains a quote not present in its source — ' +
          'do not "fix" the fixture, this test exists to catch exactly that',
      ).toBe(false);
    });
  });
});
