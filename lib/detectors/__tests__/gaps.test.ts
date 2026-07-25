import { describe, it, expect } from 'vitest';
import {
  instructionWithoutResult,
  referralWithoutOutcome,
  reviewDatePassed,
  referencedDocumentAbsent,
  medicationWithoutReview,
  detectGaps,
} from '../gaps';
import { z } from 'zod';
import { CaseSnapshot, Fact, Gap, GapDetector, Source } from '../../contracts';
import fixture from '../../../fixtures/margaret.json';

/** Advice, urgency, severity, recommendation and likelihood language. A gap
 *  statement describes the record; anything on this list is a clinical act. */
const ADVICE_LANGUAGE =
  /\b(need|needs|needed|should|must|require|requires|required|urgent|urgently|immediately|asap|as soon as possible|book|booked|arrange|arranged|chase|recommend|recommended|advise|advised|advisable|ensure|make sure|likely|unlikely|probably|suggests|indicates|consistent with|could be|may be|risk|risky|severe|serious|critical|dangerous|concerning|priority|worsening|deteriorating)\b/i;

const snap = CaseSnapshot.parse(fixture);
const PERSON_ID = snap.person.id;
/** Every date-sensitive assertion pins `now`. Nothing here reads the clock. */
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

describe('instructionWithoutResult', () => {
  it('fires on the margaret fixture (renal review, deadline passed, no result recorded)', () => {
    const now = new Date('2026-07-25T00:00:00.000Z');
    const gaps = instructionWithoutResult(snap.facts, now);
    expect(gaps.length).toBeGreaterThan(0);
    const gap = gaps.find((g) => g.statement.includes('renal function review'));
    expect(gap).toBeDefined();
    expect(gap!.detector).toBe('instruction_without_result');
    expect(gap!.person_id).toBe(PERSON_ID);
  });

  it('does not fire when a matching result is recorded after the deadline', () => {
    const instruction = fact({
      ontology_key: 'instruction.wound_review',
      subject: 'wound review',
      canonical_value: 'Requested within 5 days of 1 January 2026',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const result = fact({
      ontology_key: 'result.wound_check',
      subject: 'wound check result',
      canonical_value: 'Wound checked, healing well',
      valid_from: '2026-01-10',
    });
    const now = new Date('2026-02-01T00:00:00.000Z');
    expect(instructionWithoutResult([instruction, result], now)).toEqual([]);
  });
});

describe('referralWithoutOutcome', () => {
  it('fires when a referral has no recorded outcome after its window', () => {
    const referral = fact({
      ontology_key: 'referral.district_nurse',
      subject: 'district nurse referral',
      canonical_value: 'District nurse referral made, to contact within 2 weeks',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const now = new Date('2026-02-01T00:00:00.000Z');
    const gaps = referralWithoutOutcome([referral], now);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.detector).toBe('referral_without_outcome');
    expect(gaps[0]!.person_id).toBe(PERSON_ID);
  });

  it('does not fire once a matching outcome is recorded', () => {
    const referral = fact({
      ontology_key: 'referral.district_nurse',
      subject: 'district nurse referral',
      canonical_value: 'District nurse referral made, to contact within 2 weeks',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const visit = fact({
      ontology_key: 'note.district_nurse_visit',
      subject: 'district nurse visit',
      canonical_value: 'District nurse visited and completed assessment',
      valid_from: '2026-01-10',
    });
    const now = new Date('2026-02-01T00:00:00.000Z');
    expect(referralWithoutOutcome([referral, visit], now)).toEqual([]);
  });
});

describe('reviewDatePassed', () => {
  it('fires on the margaret fixture (cardiology review due September 2026, now after)', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    const gaps = reviewDatePassed(snap.facts, now);
    expect(gaps.length).toBeGreaterThan(0);
    const gap = gaps.find((g) => g.statement.includes('September 2026'));
    expect(gap).toBeDefined();
    expect(gap!.detector).toBe('review_date_passed');
  });

  it('does not fire once a matching review is recorded after the due date', () => {
    const review = fact({
      ontology_key: 'instruction.dietician_review',
      subject: 'dietician review',
      canonical_value: 'Please review in six months',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const note = fact({
      ontology_key: 'result.dietician_review_note',
      subject: 'dietician review note',
      canonical_value: 'Dietician reviewed and updated the care plan',
      valid_from: '2026-07-15',
    });
    const now = new Date('2026-08-01T00:00:00.000Z');
    expect(reviewDatePassed([review, note], now)).toEqual([]);
  });

  it('does not fire before the due date arrives', () => {
    const review = fact({
      ontology_key: 'instruction.dietician_review',
      subject: 'dietician review',
      canonical_value: 'Please review in six months',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const now = new Date('2026-03-01T00:00:00.000Z');
    expect(reviewDatePassed([review], now)).toEqual([]);
  });
});

describe('referencedDocumentAbsent', () => {
  it('fires when a source references a document not among the sources', () => {
    const s = source({
      title: 'Discharge letter',
      transcript:
        'Patient seen today. Please see attached Community OT Assessment for full details.',
    });
    const gaps = referencedDocumentAbsent([s]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.detector).toBe('referenced_document_absent');
    expect(gaps[0]!.statement).toContain('Community OT Assessment');
    expect(gaps[0]!.person_id).toBe(PERSON_ID);
  });

  it('does not fire when the referenced document is among the sources', () => {
    const a = source({
      title: 'Discharge letter',
      transcript: 'Please see attached Blood Test Results from Elmfield Surgery.',
    });
    const b = source({ title: 'Blood Test Results' });
    expect(referencedDocumentAbsent([a, b])).toEqual([]);
  });
});

describe('medicationWithoutReview', () => {
  it('fires on the margaret fixture (amitriptyline has no recorded review)', () => {
    const gaps = medicationWithoutReview(snap.facts, NOW);
    const gap = gaps.find((g) => g.statement.toLowerCase().includes('amitriptyline'));
    expect(gap).toBeDefined();
    expect(gap!.detector).toBe('medication_without_review');
  });

  it('does not fire once a matching review is recorded', () => {
    const med = fact({
      ontology_key: 'medication.atorvastatin',
      subject: 'atorvastatin',
      canonical_value: '20mg once daily',
      valid_from: '2026-01-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    const review = fact({
      ontology_key: 'admin.medication_review',
      subject: 'atorvastatin review',
      canonical_value: 'Reviewed 2026-06-01, continue atorvastatin',
      valid_from: '2026-06-01',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    expect(medicationWithoutReview([med, review], NOW)).toEqual([]);
  });

  it('does not fire for a superseded medication fact', () => {
    const superseded = fact({
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      canonical_value: '40mg daily',
      valid_from: '2026-03-12',
      valid_to: '2026-06-25',
      supporting_claim_ids: [crypto.randomUUID()],
      superseded_by: crypto.randomUUID(),
    });
    expect(medicationWithoutReview([superseded], NOW)).toEqual([]);
  });

  it('does not fire for a medication fact whose validity has ended', () => {
    const ended = fact({
      ontology_key: 'medication.furosemide',
      subject: 'furosemide',
      canonical_value: '40mg daily',
      valid_from: '2026-03-12',
      valid_to: '2026-06-25',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    expect(medicationWithoutReview([ended], NOW)).toEqual([]);
    // ...but it is still live before valid_to arrives.
    expect(medicationWithoutReview([ended], new Date('2026-04-01T00:00:00.000Z'))).toHaveLength(1);
  });

  it('fires on the margaret fixture for furosemide only once (the superseded copy is skipped)', () => {
    const gaps = medicationWithoutReview(snap.facts, NOW).filter((g) =>
      g.statement.toLowerCase().includes('furosemide'),
    );
    expect(gaps).toHaveLength(1);
  });
});

describe('deadline arithmetic', () => {
  const instruction = () =>
    fact({
      ontology_key: 'instruction.renal_review',
      subject: 'renal function review',
      canonical_value: 'Requested within 7 days of 25 June 2026',
      valid_from: '2026-06-25',
      supporting_claim_ids: [crypto.randomUUID()],
    });

  it('does not fire during the deadline day itself (25 June + 7 days = 2 July)', () => {
    expect(instructionWithoutResult([instruction()], new Date('2026-07-02T00:00:00.000Z'))).toEqual(
      [],
    );
    expect(instructionWithoutResult([instruction()], new Date('2026-07-02T23:59:59.999Z'))).toEqual(
      [],
    );
  });

  it('fires from the start of the day after the deadline', () => {
    const gaps = instructionWithoutResult([instruction()], new Date('2026-07-03T00:00:00.000Z'));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.statement).toContain('2 July 2026');
  });

  it('reads bare ISO dates as UTC, so the result does not depend on the host timezone', () => {
    // 1 July 23:00 UTC is already 2 July in Europe/Berlin; the deadline day is
    // 2 July UTC either way, so no gap yet.
    expect(instructionWithoutResult([instruction()], new Date('2026-07-01T23:00:00.000Z'))).toEqual(
      [],
    );
  });

  it('ignores a fact with an unparseable date rather than treating it as the epoch', () => {
    const broken = fact({
      ontology_key: 'instruction.renal_review',
      subject: 'renal function review',
      canonical_value: 'Requested within 7 days of discharge',
      valid_from: 'not-a-date',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    expect(instructionWithoutResult([broken], NOW)).toEqual([]);
  });
});

describe("status 'unknown' placeholders never close a gap", () => {
  const instruction = fact({
    ontology_key: 'instruction.renal_review',
    subject: 'renal function review',
    canonical_value: 'Requested within 7 days of 25 June 2026',
    valid_from: '2026-06-25',
    supporting_claim_ids: [crypto.randomUUID()],
  });

  it('an unknown-status placeholder with no claims does not suppress the gap', () => {
    const placeholder = fact({
      ontology_key: 'result.renal_post_discharge',
      subject: 'renal function after discharge',
      canonical_value: 'No result recorded',
      status: 'unknown',
      valid_from: '2026-07-10',
      supporting_claim_ids: [],
    });
    expect(instructionWithoutResult([instruction, placeholder], NOW)).toHaveLength(1);
  });

  it('an unknown-status placeholder WITH supporting claims still does not suppress it', () => {
    // A source can quote the words "no result recorded"; citing an absence is
    // not recording a result.
    const placeholder = fact({
      ontology_key: 'result.renal_post_discharge',
      subject: 'renal function after discharge',
      canonical_value: 'No result recorded',
      status: 'unknown',
      valid_from: '2026-07-10',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    expect(instructionWithoutResult([instruction, placeholder], NOW)).toHaveLength(1);
  });

  it('a confirmed result on the same topic does suppress it', () => {
    const result = fact({
      ontology_key: 'result.renal_function',
      subject: 'renal function',
      canonical_value: 'Creatinine 121 umol/L',
      valid_from: '2026-07-10',
      supporting_claim_ids: [crypto.randomUUID()],
    });
    expect(instructionWithoutResult([instruction, result], NOW)).toEqual([]);
  });
});

describe('statement language', () => {
  /** Free text loaded with everything a gap statement may never say. If any
   *  detector interpolated `canonical_value` or transcript prose, these words
   *  would appear in its output. */
  const POISON = 'URGENT: must arrange immediately, needs review, high risk, likely to deteriorate';

  const facts = [
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
  const sources = [
    source({
      title: 'Discharge letter',
      transcript: `Please see attached Community OT Assessment. ${POISON}`,
    }),
  ];

  const perDetector = [
    ['instruction_without_result', instructionWithoutResult(facts, NOW)],
    ['referral_without_outcome', referralWithoutOutcome(facts, NOW)],
    ['review_date_passed', reviewDatePassed(facts, NOW)],
    ['referenced_document_absent', referencedDocumentAbsent(sources)],
    ['medication_without_review', medicationWithoutReview(facts, NOW)],
  ] as const;

  for (const [name, gaps] of perDetector) {
    it(`${name}: produces output whose every statement is record-language`, () => {
      expect(gaps.length).toBeGreaterThan(0);
      for (const g of gaps) {
        expect(ADVICE_LANGUAGE.test(g.statement), g.statement).toBe(false);
      }
    });
  }

  it('no statement carries free text from the record', () => {
    const all = perDetector.flatMap(([, gaps]) => gaps);
    for (const g of all) {
      expect(g.statement, g.statement).not.toContain('URGENT');
      expect(g.statement, g.statement).not.toContain('nocte');
    }
  });

  it('the same audit over the margaret fixture passes too', () => {
    const gaps = detectGaps(snap.facts, snap.sources, NOW);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(ADVICE_LANGUAGE.test(g.statement), g.statement).toBe(false);
    }
  });
});

describe('detectGaps', () => {
  const now = NOW;

  it('aggregates all five detectors over facts and sources', () => {
    const gaps = detectGaps(snap.facts, snap.sources, now);
    const detectors = new Set(gaps.map((g) => g.detector));
    expect(detectors.has('instruction_without_result')).toBe(true);
    expect(detectors.has('review_date_passed')).toBe(true);
    expect(detectors.has('medication_without_review')).toBe(true);
  });

  it('is deterministic: same inputs and same now produce identical statements', () => {
    const first = detectGaps(snap.facts, snap.sources, now).map((g) => g.statement).sort();
    const second = detectGaps(snap.facts, snap.sources, now).map((g) => g.statement).sort();
    expect(second).toEqual(first);
  });

  it('every produced statement is record-language, never advice', () => {
    const gaps = detectGaps(snap.facts, snap.sources, now);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(ADVICE_LANGUAGE.test(g.statement), g.statement).toBe(false);
    }
  });

  it('every gap is contract-valid and carries an exact GapDetector value', () => {
    const gaps = detectGaps(snap.facts, snap.sources, now);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(() => Gap.parse(g)).not.toThrow();
      expect(GapDetector.options).toContain(g.detector);
      expect(g.person_id).toBe(PERSON_ID);
      expect(g.suggested_next_document).toBeNull();
      expect(g.statement.length).toBeGreaterThan(0);
    }
  });

  it('statements reference real fixture content', () => {
    const statements = detectGaps(snap.facts, snap.sources, now).map((g) => g.statement);
    expect(statements.some((s) => s.includes('renal function review'))).toBe(true);
    expect(statements.some((s) => s.includes('25 June 2026'))).toBe(true);
    expect(statements.some((s) => s.includes('2 July 2026'))).toBe(true);
    expect(statements.some((s) => s.includes('cardiology review'))).toBe(true);
    expect(statements.some((s) => s.includes('30 September 2026'))).toBe(true);
    expect(statements.some((s) => s.includes('amitriptyline'))).toBe(true);
    expect(statements.some((s) => s.includes('furosemide'))).toBe(true);
  });
});
