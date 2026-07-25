/**
 * INTEGRATION — gap detectors compose with the output filter.
 *
 * Every Gap.statement is a GENERATED string, so downstream lanes run it
 * through `lib/safety/output_filter.ts` before persistence or render. This
 * suite proves the two modules compose: every statement the detectors can
 * produce — from the real fixture and from adversarial records whose free
 * text is loaded with banned language — passes `filterOutput` with EMPTY
 * citedSpans. Empty spans is the strictest setting: a statement passing with
 * no cited spans cannot be relying on the condition-name allowance.
 *
 * WELL-MANAGED QUOTES ARE DELIBERATELY EXEMPT AND NOT TESTED HERE.
 * `WellManagedFlag.stability_quote` / `intervention_quote` are verbatim
 * substrings of `source.transcript` — document text, which is DATA. The
 * output filter exists for GENERATED strings; a quote is quoted evidence,
 * shown as what the record says, not something the product asserts. Forcing
 * source quotes through the filter would block quoting a care log that says
 * "no concerns" next to a PRN entry — the exact evidence the detector
 * exists to surface. The brief's framing (lane-c-safety.md §2: the filter
 * runs over "every generated string") encodes this boundary; renderers must
 * present quotes as quotes, never re-emit them as product prose.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CaseSnapshot, Fact, Source } from '../../contracts';
import fixture from '../../../fixtures/margaret.json';
import {
  instructionWithoutResult,
  referralWithoutOutcome,
  reviewDatePassed,
  referencedDocumentAbsent,
  medicationWithoutReview,
  detectGaps,
} from '../gaps';
import { filterOutput } from '../../safety/output_filter';

const snap = CaseSnapshot.parse(fixture);
const PERSON_ID = snap.person.id;
const NOW = new Date('2026-10-01T00:00:00.000Z');

function fact(overrides: Partial<z.input<typeof Fact>>) {
  return Fact.parse({
    id: crypto.randomUUID(),
    person_id: PERSON_ID,
    ontology_key: 'observation.placeholder',
    subject: 'placeholder',
    canonical_value: 'placeholder',
    provenance: 'document_extracted',
    status: 'confirmed',
    valid_from: null,
    valid_to: null,
    supporting_claim_ids: [],
    conflict_id: null,
    ...overrides,
  });
}

function source(overrides: Partial<z.input<typeof Source>>) {
  return Source.parse({
    id: crypto.randomUUID(),
    person_id: PERSON_ID,
    kind: 'text',
    title: 'Untitled',
    storage_path: 'demo/untitled.txt',
    transcript: '',
    transcript_confidence: 1,
    author_member_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  });
}

describe('every fixture-derived gap statement passes filterOutput', () => {
  it('detectGaps over margaret.json produces only filter-clean statements (empty citedSpans)', () => {
    const gaps = detectGaps(snap.facts, snap.sources, NOW);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(filterOutput(gap.statement, []), gap.statement).toEqual({ ok: true });
    }
  });
});

describe('every adversarial gap statement passes filterOutput', () => {
  /** Free text saturated with the filter's banned categories: routing,
   *  urgency, likelihood, clinical judgement, and an uncited condition
   *  name. If any detector interpolated record free text, the resulting
   *  statement would be rejected below. */
  const POISON =
    'URGENT: go to A&E immediately, you should see the GP within 24 hours — ' +
    'this is an emergency, likely heart failure, dangerous interaction, dose too high';

  const adversarialFacts = [
    fact({
      ontology_key: 'instruction.renal_review',
      subject: 'renal function review',
      canonical_value: `Requested within 7 days of 25 June 2026 — ${POISON}`,
      valid_from: '2026-06-25',
      supporting_claim_ids: [crypto.randomUUID()],
    }),
    fact({
      ontology_key: 'referral.district_nurse',
      subject: 'district nurse referral',
      canonical_value: `Referral made, to contact within 2 weeks — ${POISON}`,
      valid_from: '2026-06-25',
      supporting_claim_ids: [crypto.randomUUID()],
    }),
    fact({
      ontology_key: 'instruction.cardiology_review',
      subject: 'cardiology review',
      canonical_value: `Due September 2026 — ${POISON}`,
      valid_from: '2026-03-12',
      supporting_claim_ids: [crypto.randomUUID()],
    }),
    fact({
      ontology_key: 'medication.amitriptyline',
      subject: 'amitriptyline',
      canonical_value: `10mg nocte — ${POISON}`,
      valid_from: '2026-07-03',
      supporting_claim_ids: [crypto.randomUUID()],
    }),
  ];

  const adversarialSources = [
    source({
      title: 'Discharge letter',
      transcript: `${POISON}. Please see attached Community OT Assessment. ${POISON}`,
    }),
  ];

  const perDetector = [
    ['instruction_without_result', instructionWithoutResult(adversarialFacts, NOW)],
    ['referral_without_outcome', referralWithoutOutcome(adversarialFacts, NOW)],
    ['review_date_passed', reviewDatePassed(adversarialFacts, NOW)],
    ['referenced_document_absent', referencedDocumentAbsent(adversarialSources)],
    ['medication_without_review', medicationWithoutReview(adversarialFacts, NOW)],
  ] as const;

  for (const [name, gaps] of perDetector) {
    it(`${name}: statements built from a poisoned record still pass (empty citedSpans)`, () => {
      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(filterOutput(gap.statement, []), gap.statement).toEqual({ ok: true });
      }
    });
  }
});

describe('defence in depth — the filter still backstops the one interpolation that exists', () => {
  it('a source TITLE carrying a banned term produces a statement the filter blocks — blocked is correct', () => {
    // referenced_document_absent interpolates two things beyond fixed framing:
    // the source's title and the referenced title. Titles are user/record
    // metadata, so a pathological title ("Urgent care plan") CAN reach a
    // statement. That is exactly why the filter runs downstream: the caller
    // stores nothing and renders the refusal card. This is layered safety
    // working, not a bug — do not "fix" the detector to launder the title.
    const poisonedTitle = source({
      title: 'Urgent care plan',
      transcript: 'Please see attached Community OT Assessment.',
    });
    const gaps = referencedDocumentAbsent([poisonedTitle]);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      const result = filterOutput(gap.statement, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('urgency');
    }
  });
});
