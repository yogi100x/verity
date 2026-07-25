/**
 * WELL-MANAGED-NEED DETECTOR.
 *
 * Stability language co-occurring with active-intervention evidence in the
 * same source is the highest-leverage CHC feature and the highest-risk one.
 * Precision matters more than recall: a missed flag costs a point, a false
 * flag with a wrong citation loses the room. These tests protect both the
 * detection logic and the structural guarantee that a flag can only ever
 * carry a `CitationId`, never free citation text.
 *
 * The care-log source is SEEDED in `fixtures/margaret.json` (the fifth
 * source, id 60000000-…-0001) — the orchestrator added it on 25 July 2026,
 * so the "fires on the seeded care-log entry" test reads it straight from
 * the parsed snapshot. A cross-check asserts the fixture's transcript is
 * byte-identical to the flattening of `demo/documents/05-care-log.md`, so
 * the fixture, the demo document and these tests cannot drift apart.
 *
 * `CARE_LOG_TRANSCRIPT` is derived AT TEST TIME from the actual text of
 * `demo/documents/05-care-log.md` (the indented log block, line wraps
 * rejoined as an OCR transcript would be — nothing else altered), so it can
 * never drift from the document the demo actually runs on. A hard-coded
 * copy or an abridged paraphrase would prove nothing about that document —
 * in particular it would hide both the canonical Wed 08/07 hit and the
 * deliberate Sat 11/07 near-miss. Reading a repo doc at test time is the
 * same sanctioned test-only I/O pattern as lib/copy's prd.md check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CaseSnapshot, Source } from '../../contracts';
import { ChcDomain, ChcLevel } from '../../contracts';
import { CHC_DOMAIN_LEVELS, CHC_DOMAIN_NAMES, isValidLevel } from '../../contracts';
import fixture from '../../../fixtures/margaret.json';
import {
  FRAMEWORK_CITATIONS,
  detectWellManagedNeeds,
  getDomainHeading,
  type WellManagedFlag,
} from '../well_managed';

// jsdom's `import.meta.url` is not a file: URL, so resolve from the vitest
// root (the repo root), as lib/copy's prd.md test does.
const CARE_LOG_DOC = readFileSync(
  join(process.cwd(), 'demo/documents/05-care-log.md'),
  'utf8',
);

const CARE_LOG_TRANSCRIPT = CARE_LOG_DOC.split('\n')
  .filter((line) => line.startsWith('    ') && line.trim().length > 0)
  .map((line) => line.trim())
  .filter((line) => !/^-+$/.test(line))
  .join(' ');

function syntheticSource(id: string, title: string, transcript: string): Source {
  return Source.parse({
    id,
    person_id: '00000000-0000-4000-8000-000000000001',
    kind: 'text',
    title,
    storage_path: `demo/documents/synthetic-${id}.md`,
    transcript,
    transcript_confidence: 0.9,
    author_member_id: null,
    created_at: '2026-07-11T09:00:00Z',
  });
}

describe('detectWellManagedNeeds', () => {
  it('fires on the seeded care-log entry in fixtures/margaret.json', () => {
    const snap = CaseSnapshot.parse(fixture);

    const careLogSource = snap.sources.find((s) => s.title === 'Care log extract');
    expect(careLogSource, 'fixture should contain the seeded care-log source').toBeDefined();
    if (careLogSource === undefined) return;

    // The fixture and the demo document must never drift apart: the seeded
    // transcript is exactly the flattening of demo/documents/05-care-log.md.
    expect(careLogSource.transcript).toBe(CARE_LOG_TRANSCRIPT);

    const flags = detectWellManagedNeeds(snap.sources);
    const careLogFlags = flags.filter((f) => f.source_id === careLogSource.id);

    expect(careLogFlags.length).toBeGreaterThan(0);
    for (const flag of careLogFlags) {
      expect(flag.citation).toBe('pg_23_2');
      expect(flag.supporting_citations).toEqual(['para_162']);
    }
  });

  it('surfaces the canonical Wed 08/07 hit — PRN lorazepam beside "Settled overnight, no incidents"', () => {
    // demo/documents/05-care-log.md names this the canonical hit. A detector
    // that flags the source but quotes some weaker pairing from another day
    // has technically fired and practically failed: the citation is only as
    // good as the evidence printed next to it.
    const careLog = syntheticSource(
      '60000000-0000-4000-8000-000000000001',
      'Care log extract',
      CARE_LOG_TRANSCRIPT,
    );

    const flags = detectWellManagedNeeds([careLog]);

    expect(
      flags.some(
        (f) =>
          f.intervention_quote === 'PRN lorazepam 0.5mg administered' &&
          /^settled$/i.test(f.stability_quote),
      ),
    ).toBe(true);
    expect(
      flags.some(
        (f) =>
          f.intervention_quote === 'PRN lorazepam 0.5mg administered' &&
          /^no incidents$/i.test(f.stability_quote),
      ),
    ).toBe(true);
  });

  it('every quote is a verbatim substring of the transcript — nothing is paraphrased', () => {
    const careLog = syntheticSource(
      '60000000-0000-4000-8000-000000000001',
      'Care log extract',
      CARE_LOG_TRANSCRIPT,
    );

    const flags = detectWellManagedNeeds([careLog]);
    expect(flags.length).toBeGreaterThan(0);

    for (const flag of flags) {
      expect(CARE_LOG_TRANSCRIPT).toContain(flag.stability_quote);
      expect(CARE_LOG_TRANSCRIPT).toContain(flag.intervention_quote);
    }
  });

  it('emits no citation text or paragraph number — only CitationIds', () => {
    const careLog = syntheticSource(
      '60000000-0000-4000-8000-000000000001',
      'Care log extract',
      CARE_LOG_TRANSCRIPT,
    );

    const ids = Object.keys(FRAMEWORK_CITATIONS);
    const flags = detectWellManagedNeeds([careLog]);
    expect(flags.length).toBeGreaterThan(0);

    for (const flag of flags) {
      expect(ids).toContain(flag.citation);
      for (const support of flag.supporting_citations) {
        expect(ids).toContain(support);
      }

      // The flag carries ids, never prose. No citation `text` or `ref` may
      // leak into the output, and no quote may carry a paragraph reference.
      const serialised = JSON.stringify(flag);
      for (const citation of Object.values(FRAMEWORK_CITATIONS)) {
        expect(serialised).not.toContain(citation.text);
        expect(serialised).not.toContain(citation.ref);
      }
      expect(flag.stability_quote).not.toMatch(/\bpara\b|National Framework|Practice Guidance/i);
      expect(flag.intervention_quote).not.toMatch(/\bpara\b|National Framework|Practice Guidance/i);

      // The flag has exactly these fields — no free-text citation field exists.
      expect(Object.keys(flag).sort()).toEqual([
        'citation',
        'intervention_quote',
        'source_id',
        'stability_quote',
        'supporting_citations',
      ]);
    }
  });

  it('does NOT fire on stability language with no intervention nearby', () => {
    const quietSource = syntheticSource(
      '60000000-0000-4000-8000-000000000002',
      'Weekly summary, no interventions',
      'Client remains stable on her current regimen. No concerns raised this week. ' +
        'Slept well throughout. Settled and in good spirits at every visit.',
    );

    expect(detectWellManagedNeeds([quietSource])).toEqual([]);
  });

  it('does NOT fire on the deliberate Sat 11/07 near-miss line in isolation', () => {
    // demo/documents/05-care-log.md: "Good day, no concerns, client in good
    // spirits" with no intervention nearby. Over-firing on a CHC claim is
    // worse than missing one.
    const nearMiss = syntheticSource(
      '60000000-0000-4000-8000-000000000003',
      'Care log extract, Saturday only',
      'Sat 11/07 0800 Good day, no concerns, client in good spirits. ' +
        '1900 Evening call. Client in good spirits.',
    );

    expect(detectWellManagedNeeds([nearMiss])).toEqual([]);
  });

  it('does NOT fire when stability and intervention are far apart in the same source', () => {
    // The brief says same-source co-occurrence; the window is stricter on
    // purpose. A discharge summary mentioning "assisted" in one section and
    // "no incidents" hundreds of characters later in another is not evidence
    // of a well-managed need.
    const dischargeSummary = syntheticSource(
      '60000000-0000-4000-8000-000000000004',
      'Discharge summary',
      'DISCHARGE SUMMARY. Patient assisted to mobilise on the ward by ' +
        'physiotherapy during the admission. ' +
        'INVESTIGATIONS: bloods, chest radiograph and echocardiography were all ' +
        'performed during the admission and reviewed by the consultant team on ' +
        'the post-take ward round, with results filed in the electronic record ' +
        'and copied to the general practitioner in the usual way for this ward. ' +
        'POST-OPERATIVE COURSE: recovery was uneventful, no incidents.',
    );

    const transcript = dischargeSummary.transcript;
    // Guard the guard: both signals really are present in the same source.
    expect(transcript).toMatch(/assisted/i);
    expect(transcript).toMatch(/no incidents/i);
    expect(transcript.indexOf('no incidents') - transcript.indexOf('assisted')).toBeGreaterThan(150);

    expect(detectWellManagedNeeds([dischargeSummary])).toEqual([]);
  });

  it('does NOT treat "unsettled" as stability language', () => {
    // /settled/ without word boundaries matches "unsettled" — the exact
    // opposite of a well-managed need, cited to the framework.
    const unsettled = syntheticSource(
      '60000000-0000-4000-8000-000000000005',
      'Care log extract, unsettled night',
      'Wed 08/07 1900 PRN lorazepam 0.5mg administered. ' +
        'Client unsettled overnight, repeated calls.',
    );

    expect(detectWellManagedNeeds([unsettled])).toEqual([]);
  });

  it('does NOT fire on negated stability language', () => {
    const negated = syntheticSource(
      '60000000-0000-4000-8000-000000000006',
      'Care log extract, negated stability',
      'Wed 08/07 1900 PRN lorazepam 0.5mg administered. Not settled overnight. ' +
        'No longer settled at night. Client was never settled after the visit.',
    );

    expect(detectWellManagedNeeds([negated])).toEqual([]);
  });

  it('does NOT fire on a negated intervention', () => {
    const notDone = syntheticSource(
      '60000000-0000-4000-8000-000000000007',
      'Care log extract, intervention not carried out',
      'Wed 08/07 0800 Hoist not used, client refused. Settled.',
    );

    expect(detectWellManagedNeeds([notDone])).toEqual([]);
  });

  it('a negation in the PREVIOUS sentence does not suppress a genuine hit', () => {
    const stillFires = syntheticSource(
      '60000000-0000-4000-8000-000000000008',
      'Care log extract, prior-sentence negation',
      'Wed 08/07 1900 PRN lorazepam 0.5mg administered. Client did not eat much. ' +
        'Settled overnight, no incidents.',
    );

    expect(detectWellManagedNeeds([stillFires]).length).toBeGreaterThan(0);
  });

  it('returns an empty array for no sources and for a source with no stability language', () => {
    expect(detectWellManagedNeeds([])).toEqual([]);
    const noStability = syntheticSource(
      '60000000-0000-4000-8000-000000000010',
      'Intervention only',
      'Mon 06/07 0800 Assisted wash/dress. Prompted meds. Hoist used for transfer.',
    );
    expect(detectWellManagedNeeds([noStability])).toEqual([]);
  });

  it('a well-managed flag can only carry a CitationId — arbitrary citation text fails to typecheck', () => {
    const validFlag: WellManagedFlag = {
      source_id: 'x',
      stability_quote: 'settled',
      intervention_quote: 'PRN lorazepam administered',
      citation: 'pg_23_2',
      supporting_citations: ['para_162'],
    };
    expect(validFlag.citation).toBe('pg_23_2');

    const invalidFlag: WellManagedFlag = {
      source_id: 'x',
      stability_quote: 'settled',
      intervention_quote: 'PRN lorazepam administered',
      // @ts-expect-error — citation must be a CitationId, never a free-text or
      // fabricated citation string.
      citation: 'National Framework para 999',
      supporting_citations: ['para_162'],
    };
    expect(invalidFlag).toBeDefined();

    const invalidSupport: WellManagedFlag = {
      source_id: 'x',
      stability_quote: 'settled',
      intervention_quote: 'PRN lorazepam administered',
      citation: 'pg_23_2',
      // @ts-expect-error — supporting citations are CitationIds too. A
      // fabricated reference cannot be smuggled in through the support list.
      supporting_citations: ['para_162', 'DST Guidance 2022, para 999'],
    };
    expect(invalidSupport).toBeDefined();
  });
});

describe('FRAMEWORK_CITATIONS — verified verbatim against primary sources', () => {
  it('pg_23_2 matches the brief exactly', () => {
    expect(FRAMEWORK_CITATIONS.pg_23_2).toEqual({
      ref: 'DST Guidance 2022, Practice Guidance note 23.2',
      text: 'Where needs are being managed via medication (whether for behaviour or for physical health needs), it may be more appropriate to reflect this in the Drug Therapies and Medication domain.',
    });
  });

  it('para_162 matches the brief exactly', () => {
    expect(FRAMEWORK_CITATIONS.para_162).toEqual({
      ref: 'National Framework (July 2022, rev. July 2023), para 162',
      text: 'The decision-making rationale should not marginalise a need just because it is successfully managed: well-managed needs are still needs.',
    });
  });

  it('para_164 matches the brief exactly', () => {
    expect(FRAMEWORK_CITATIONS.para_164).toEqual({
      ref: 'National Framework (July 2022, rev. July 2023), paras 162-166',
      text: 'It may be necessary to ask the provider to complete a detailed diary over a suitable period of time to demonstrate the nature and frequency of the needs and interventions, and their effectiveness.',
    });
  });

  it('has exactly three citations — no extra, no missing', () => {
    expect(Object.keys(FRAMEWORK_CITATIONS).sort()).toEqual(['para_162', 'para_164', 'pg_23_2']);
  });
});

describe('isValidLevel', () => {
  it('rejects "severe" for altered_consciousness, continence, communication, psychological_emotional', () => {
    expect(isValidLevel('altered_consciousness', 'severe')).toBe(false);
    expect(isValidLevel('continence', 'severe')).toBe(false);
    expect(isValidLevel('communication', 'severe')).toBe(false);
    expect(isValidLevel('psychological_emotional', 'severe')).toBe(false);
  });

  it('accepts "priority" for altered_consciousness, behaviour, drug_therapies, breathing', () => {
    expect(isValidLevel('altered_consciousness', 'priority')).toBe(true);
    expect(isValidLevel('behaviour', 'priority')).toBe(true);
    expect(isValidLevel('drug_therapies', 'priority')).toBe(true);
    expect(isValidLevel('breathing', 'priority')).toBe(true);
  });

  it('exhaustively rejects every level absent from a domain\'s CHC_DOMAIN_LEVELS list', () => {
    // Domains and levels come from the contract's own enums — no `as`, and no
    // hand-typed list that could silently drift from `lib/contracts.ts`.
    const domains = ChcDomain.options;
    const allLevels = ChcLevel.options;

    // Without this the loop below could pass vacuously if the enum shrank.
    expect(domains).toHaveLength(12);
    expect(Object.keys(CHC_DOMAIN_LEVELS).sort()).toEqual([...domains].sort());

    for (const domain of domains) {
      const allowed = new Set(CHC_DOMAIN_LEVELS[domain]);
      for (const level of allLevels) {
        expect(isValidLevel(domain, level)).toBe(allowed.has(level));
      }
    }
  });
});

describe('getDomainHeading', () => {
  it('returns CHC_DOMAIN_NAMES verbatim for every domain', () => {
    const domains = ChcDomain.options;
    expect(domains).toHaveLength(12);
    expect(Object.keys(CHC_DOMAIN_NAMES).sort()).toEqual([...domains].sort());
    for (const domain of domains) {
      expect(getDomainHeading(domain)).toBe(CHC_DOMAIN_NAMES[domain]);
    }
  });

  it('nutrition heading matches the official DST wording', () => {
    expect(getDomainHeading('nutrition')).toBe('Nutrition – food and drink');
  });

  it('has no API surface for a custom heading — the function takes only a ChcDomain', () => {
    // @ts-expect-error — getDomainHeading accepts only a ChcDomain, never a
    // hand-typed heading string.
    expect(() => getDomainHeading('Nutrition – food and drink')).toBeDefined();
  });
});
