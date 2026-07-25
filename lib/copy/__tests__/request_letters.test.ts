/**
 * REQUEST LETTERS — draftRequestLetter / composeLetter.
 *
 * S3 (docs/lanes/lane-c-safety.md, "Stretch tests"): deterministic
 * slot-filling only, no model call, so fabrication is structurally
 * impossible. These tests drive gaps produced by the real detectors in
 * lib/detectors/gaps.ts wherever a detector can produce one:
 * `instruction_without_result`, `review_date_passed` and
 * `medication_without_review` fire on facts already in
 * fixtures/margaret.json via `detectGaps`. `referral_without_outcome` and
 * `referenced_document_absent` are exercised through their real detector
 * functions over small synthetic facts/sources (the fixture's own Facts
 * array happens not to contain a referral Fact or a document cross-
 * reference that fires those two, only Claims that never made it into a
 * Fact — so `detectGaps(snap.facts, snap.sources, NOW)` alone cannot reach
 * them). `domain_evidence_thin` has no detector implementation yet
 * (night-shift backlog item 4 in lane-c-safety.md), so it is the one gap
 * here that is Zod-parsed by hand, in the same record-statement style the
 * other five detectors use — see DOMAIN_EVIDENCE_THIN_GAP below.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { CaseSnapshot, Fact, Gap, GapDetector, Source } from '../../contracts';
import { filterOutput } from '../../safety/output_filter';
import {
  detectGaps,
  referralWithoutOutcome,
  referencedDocumentAbsent,
} from '../../detectors/gaps';
import { draftRequestLetter, composeLetter, type LetterRecipient } from '../request_letters';
import fixture from '../../../fixtures/margaret.json';

const snap = CaseSnapshot.parse(fixture);
const PERSON = snap.person;
const FACTS = snap.facts;
/** Same fixed instant the gap-detector suite pins, so results here match. */
const NOW = new Date('2026-10-01T00:00:00.000Z');

/** Advice, urgency, likelihood and severity language — the same sweep the
 *  gap-detector suite uses. A request letter is generated text, so none of
 *  this may appear regardless of whether it would also trip filterOutput;
 *  this is a belt-and-braces language check independent of the filter's
 *  own (narrower) term list. */
const ADVICE_LANGUAGE =
  /\b(need|needs|needed|should|must|require|requires|required|urgent|urgently|immediately|asap|as soon as possible|book|booked|arrange|arranged|chase|recommend|recommended|advise|advised|advisable|ensure|make sure|likely|unlikely|probably|suggests|indicates|consistent with|could be|risk|risky|severe|serious|critical|dangerous|concerning|priority|worsening|deteriorating)\b/i;

/** Second sweep: the polite-pressure register a single-word regex misses.
 *  These phrases assert no clinical judgement, which is exactly why they are
 *  easy to leave in — but each one either states that something ought to have
 *  happened (`missing`, `outstanding`, `overdue`, `still awaited`) or applies
 *  time pressure (`at your earliest convenience`, `prompt reply`), and the
 *  letter is only ever allowed to say what the record shows and ask. The
 *  sanctioned shape for an absence is "I can't find a record of this".
 *
 *  Verified against the real detector statements in lib/detectors/gaps.ts:
 *  none of the six uses any of these words, so the sweep constrains the
 *  templates in this file without depending on another module's prose. */
const PRESSURE_LANGUAGE =
  /\b(missing|outstanding|overdue|awaited|awaiting|kindly|promptly|prompt (reply|response|attention)|earliest convenience|without delay|expedite|escalate|as a matter of|please (arrange|ensure|chase|action|expedite|confirm)|would appreciate|grateful if you)\b/i;

/** The sanctioned way to state an absence (docs/lanes/lane-c-safety.md §S3,
 *  prd.md §8.1: state what the record shows, never that something is due). */
const SANCTIONED_ABSENCE_SHAPE = "I can't find a record of this";

function letterText(letter: { salutation: string; body: string; closing: string }): string {
  return `${letter.salutation}\n\n${letter.body}\n\n${letter.closing}`;
}

function fact(overrides: Partial<z.input<typeof Fact>>): Fact {
  return Fact.parse({
    id: crypto.randomUUID(),
    person_id: PERSON.id,
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

function source(overrides: Partial<z.input<typeof Source>>): Source {
  return Source.parse({
    id: crypto.randomUUID(),
    person_id: PERSON.id,
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

function syntheticGap(detector: GapDetector, statement: string): Gap {
  return Gap.parse({
    id: crypto.randomUUID(),
    person_id: PERSON.id,
    detector,
    statement,
    supporting_claim_ids: [],
    suggested_next_document: null,
  });
}

/** The three detectors that fire directly on fixtures/margaret.json's own
 *  Facts, via the real aggregator. */
const REAL_FIXTURE_GAPS = detectGaps(FACTS, snap.sources, NOW);

function firstRealGap(detector: GapDetector): Gap {
  const gap = REAL_FIXTURE_GAPS.find((g) => g.detector === detector);
  if (gap === undefined) {
    throw new Error(`detectGaps(margaret.json) produced no gap for ${detector}`);
  }
  return gap;
}

/** referral_without_outcome — driven through the real detector function
 *  over a synthetic referral Fact, deliberately about a subject with no
 *  condition-name overlap ("district nurse referral"), rather than the
 *  fixture's own referral (which is a Claim, never promoted to a Fact, so
 *  detectGaps cannot reach it from margaret.json alone). */
const REFERRAL_WITHOUT_OUTCOME_GAP: Gap = (() => {
  const referral = fact({
    ontology_key: 'referral.district_nurse',
    subject: 'district nurse referral',
    canonical_value: 'District nurse referral made, to contact within 2 weeks',
    valid_from: '2026-01-01',
    supporting_claim_ids: [crypto.randomUUID()],
  });
  const gaps = referralWithoutOutcome([referral], NOW);
  if (gaps.length === 0) {
    throw new Error('synthetic referral fact did not produce a gap');
  }
  return gaps[0]!;
})();

/** referenced_document_absent — driven through the real detector function
 *  over a synthetic Source, in place of a hand-authored statement. */
const REFERENCED_DOCUMENT_ABSENT_GAP: Gap = (() => {
  const discharge = source({
    title: 'Discharge summary',
    transcript: 'Please see attached vascular clinic letter for further detail.',
  });
  const gaps = referencedDocumentAbsent([discharge]);
  if (gaps.length === 0) {
    throw new Error('synthetic source did not produce a referenced_document_absent gap');
  }
  return gaps[0]!;
})();

/** domain_evidence_thin — no detector implementation exists yet (see the
 *  module doc comment above), so this is the only way to exercise it. It is
 *  written in the same record-statement style as the five real detectors:
 *  it describes what is and is not present in the record, and asserts
 *  nothing about what should happen next. */
const DOMAIN_EVIDENCE_THIN_GAP = syntheticGap(
  'domain_evidence_thin',
  'The mobility domain has only user-stated evidence recorded. No professional assessment is present in the record.',
);

const ALL_DETECTORS: readonly GapDetector[] = GapDetector.options;

const ALL_RECIPIENTS: readonly LetterRecipient[] = [
  'gp',
  'provider',
  'records_holder',
  'chc_coordinator',
];

function gapFor(detector: GapDetector): Gap {
  switch (detector) {
    case 'instruction_without_result':
      return firstRealGap('instruction_without_result');
    case 'review_date_passed':
      return firstRealGap('review_date_passed');
    case 'medication_without_review':
      return firstRealGap('medication_without_review');
    case 'referral_without_outcome':
      return REFERRAL_WITHOUT_OUTCOME_GAP;
    case 'referenced_document_absent':
      return REFERENCED_DOCUMENT_ABSENT_GAP;
    case 'domain_evidence_thin':
      return DOMAIN_EVIDENCE_THIN_GAP;
  }
}

describe('draftRequestLetter — coverage of all six detector types', () => {
  it('covers every GapDetector value with a real or synthetic gap', () => {
    expect(ALL_DETECTORS).toHaveLength(6);
    for (const detector of ALL_DETECTORS) {
      expect(gapFor(detector).detector).toBe(detector);
    }
  });

  for (const detector of ALL_DETECTORS) {
    it(`${detector}: the whole letter — salutation, body and closing concatenated — passes filterOutput with empty citedSpans`, () => {
      const gap = gapFor(detector);
      const letter = draftRequestLetter(gap, FACTS, PERSON);
      // The concatenated form is what a caller sends, and it is the only
      // form in which a banned phrase straddling a join boundary is
      // visible. The three fields are checked individually as well, so a
      // failure localises.
      const text = letterText(letter);
      expect(filterOutput(text, []), text).toEqual({ ok: true });
      expect(filterOutput(letter.salutation, []), letter.salutation).toEqual({ ok: true });
      expect(filterOutput(letter.body, []), letter.body).toEqual({ ok: true });
      expect(filterOutput(letter.closing, []), letter.closing).toEqual({ ok: true });
    });

    it(`${detector}: contains no advice, urgency, likelihood or polite-pressure language`, () => {
      const gap = gapFor(detector);
      const letter = draftRequestLetter(gap, FACTS, PERSON);
      const text = letterText(letter);
      expect(ADVICE_LANGUAGE.test(text), text).toBe(false);
      expect(PRESSURE_LANGUAGE.test(text), text).toBe(false);
    });

    it(`${detector}: states the absence in the sanctioned shape`, () => {
      const gap = gapFor(detector);
      const letter = draftRequestLetter(gap, FACTS, PERSON);
      expect(letter.body).toContain(SANCTIONED_ABSENCE_SHAPE);
    });

    it(`${detector}: contains the person's name and asks at least one question`, () => {
      const gap = gapFor(detector);
      const letter = draftRequestLetter(gap, FACTS, PERSON);
      expect(letter.body).toContain(PERSON.display_name);
      expect(letter.body).toContain('?');
      // The question is the last thing in the letter body, and it is a
      // question, not an instruction dressed as one.
      expect(letter.body.trimEnd().endsWith('?')).toBe(true);
    });
  }
});

describe('draftRequestLetter — recipient routing', () => {
  const expected: Readonly<Record<GapDetector, LetterRecipient>> = {
    instruction_without_result: 'gp',
    medication_without_review: 'gp',
    review_date_passed: 'gp',
    referral_without_outcome: 'provider',
    referenced_document_absent: 'records_holder',
    domain_evidence_thin: 'chc_coordinator',
  };

  /** The salutation each recipient gets. Asserted verbatim because routing
   *  is only useful if the letter is also addressed to that person — a
   *  correct `recipient` field with a GP salutation on a records request is
   *  still the wrong letter. */
  const salutations: Readonly<Record<LetterRecipient, string>> = {
    gp: 'Dear Doctor,',
    provider: 'Dear Colleague,',
    records_holder: 'Dear Records Team,',
    chc_coordinator: 'Dear CHC Coordinator,',
  };

  for (const detector of ALL_DETECTORS) {
    it(`${detector} routes to ${expected[detector]}`, () => {
      const gap = gapFor(detector);
      const letter = draftRequestLetter(gap, FACTS, PERSON);
      expect(letter.recipient).toBe(expected[detector]);
      expect(letter.salutation).toBe(salutations[expected[detector]]);
    });
  }

  it('routes every detector to exactly one recipient, and covers all four recipients', () => {
    const routed = ALL_DETECTORS.map(
      (detector) => draftRequestLetter(gapFor(detector), FACTS, PERSON).recipient,
    );
    expect(new Set(routed)).toEqual(
      new Set<LetterRecipient>(['gp', 'provider', 'records_holder', 'chc_coordinator']),
    );
  });
});

describe('draftRequestLetter — subject clause', () => {
  it('names the supporting Fact’s subject when one can be found', () => {
    const claimId = crypto.randomUUID();
    const supporting = fact({
      ontology_key: 'instruction.renal_function',
      subject: 'renal function review',
      supporting_claim_ids: [claimId],
    });
    const gap = Gap.parse({
      id: crypto.randomUUID(),
      person_id: PERSON.id,
      detector: 'instruction_without_result',
      statement: 'The record contains an instruction dated 25 June 2026.',
      supporting_claim_ids: [claimId],
      suggested_next_document: null,
    });
    const letter = draftRequestLetter(gap, [supporting], PERSON);
    expect(letter.body).toContain('regarding renal function review');
  });

  it('omits the subject clause rather than fabricating one when no Fact matches', () => {
    const gap = syntheticGap(
      'referenced_document_absent',
      '"Discharge summary" refers to "vascular clinic letter". No source with that title is held for this record.',
    );
    const letter = draftRequestLetter(gap, FACTS, PERSON);
    expect(letter.body).not.toContain('regarding');
    expect(letter.body).toContain(`${PERSON.display_name}'s record includes the following.`);
  });
});

describe('draftRequestLetter — determinism', () => {
  it('the same gap, facts and person produce an identical letter every time', () => {
    const gap = gapFor('instruction_without_result');
    const first = draftRequestLetter(gap, FACTS, PERSON);
    const second = draftRequestLetter(gap, FACTS, PERSON);
    expect(second).toEqual(first);
  });

  it('is identical across all six detector types on repeated calls', () => {
    for (const detector of ALL_DETECTORS) {
      const gap = gapFor(detector);
      const first = draftRequestLetter(gap, FACTS, PERSON);
      const second = draftRequestLetter(gap, FACTS, PERSON);
      expect(second).toEqual(first);
    }
  });

  it('does not read the clock: the same letter is produced two years apart', () => {
    // Proves there is no Date.now()/new Date() in the drafting path. A
    // letter that embedded “today” would differ between these two instants.
    const drafted = (instant: string): readonly string[] => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(instant));
      const letters = ALL_DETECTORS.map((detector) => {
        const letter = draftRequestLetter(gapFor(detector), FACTS, PERSON);
        return letterText(letter);
      });
      vi.useRealTimers();
      return letters;
    };
    expect(drafted('2028-12-31T23:59:59.000Z')).toEqual(drafted('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('draftRequestLetter — adversarial: poisoned statement fails the filter', () => {
  /** Simulates a gap.statement that was (incorrectly, upstream) built from
   *  unfiltered record free text. draftRequestLetter interpolates
   *  gap.statement verbatim by contract — it does not and must not try to
   *  clean it up — so the resulting letter must fail filterOutput. This is
   *  the proof that safety here is layered: a bad statement is caught by
   *  the filter a caller is required to run, not silently absorbed by this
   *  module. */
  const poisonedGap = syntheticGap(
    'instruction_without_result',
    'The record contains an instruction dated 25 June 2026 for renal function review. ' +
      'URGENT review needed immediately.',
  );

  it('draftRequestLetter still slots the statement in verbatim (no fabrication, no silent cleanup)', () => {
    const letter = draftRequestLetter(poisonedGap, FACTS, PERSON);
    expect(letter.body).toContain('URGENT review needed immediately.');
  });

  it('the resulting letter fails filterOutput', () => {
    const letter = draftRequestLetter(poisonedGap, FACTS, PERSON);
    expect(filterOutput(letterText(letter), []).ok).toBe(false);
    expect(filterOutput(letter.body, []).ok).toBe(false);
  });

  it('a statement carrying routing language is caught, and reported as routing', () => {
    const gap = syntheticGap(
      'medication_without_review',
      'The record lists furosemide as a current medication. You should contact your GP about it.',
    );
    const result = filterOutput(letterText(draftRequestLetter(gap, FACTS, PERSON)), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('routing');
  });

  it('a statement naming an uncited condition is caught, and passes once the span cites it', () => {
    const gap = syntheticGap(
      'review_date_passed',
      'The record gives a review date of 1 March 2026 for heart failure follow-up.',
    );
    const letter = letterText(draftRequestLetter(gap, FACTS, PERSON));
    const uncited = filterOutput(letter, []);
    expect(uncited.ok).toBe(false);
    if (!uncited.ok) expect(uncited.reason).toBe('uncited_condition');
    // Layering, not suppression: the same letter is fine when the cited
    // source span actually contains the condition name verbatim.
    expect(filterOutput(letter, ['Diagnosis on admission: heart failure.']).ok).toBe(true);
  });

  it('draftRequestLetter never returns a filter verdict — filtering is the caller’s job', () => {
    const letter = draftRequestLetter(poisonedGap, FACTS, PERSON);
    expect(Object.keys(letter).sort()).toEqual(['body', 'closing', 'recipient', 'salutation']);
  });
});

describe('composeLetter — reusable envelope helper', () => {
  /** lib/detectors/chc_clock.ts builds its own paragraphs and calls
   *  composeLetter for the envelope, so this surface is a published one:
   *  (recipient, paragraphs) in, blank-line-joined body out, salutation and
   *  closing supplied. These assertions are what that module depends on. */
  it('joins paragraphs with blank lines and fills in the recipient-specific salutation and closing', () => {
    const letter = composeLetter('gp', ['First paragraph.', 'Second paragraph.']);
    expect(letter).toEqual({
      recipient: 'gp',
      salutation: 'Dear Doctor,',
      body: 'First paragraph.\n\nSecond paragraph.',
      closing: 'Yours faithfully,',
    });
  });

  it('gives every recipient a non-empty salutation and the same closing', () => {
    for (const recipient of ALL_RECIPIENTS) {
      const letter = composeLetter(recipient, ['A paragraph.']);
      expect(letter.salutation.startsWith('Dear ')).toBe(true);
      expect(letter.salutation.endsWith(',')).toBe(true);
      expect(letter.closing).toBe('Yours faithfully,');
    }
  });

  it('the envelope itself contains no advice, urgency or pressure language', () => {
    for (const recipient of ALL_RECIPIENTS) {
      const letter = composeLetter(recipient, []);
      const text = `${letter.salutation}\n\n${letter.closing}`;
      expect(ADVICE_LANGUAGE.test(text), text).toBe(false);
      expect(PRESSURE_LANGUAGE.test(text), text).toBe(false);
      expect(filterOutput(text, []), text).toEqual({ ok: true });
    }
  });

  it('is deterministic and pure — same inputs, same output, for every recipient', () => {
    for (const recipient of ALL_RECIPIENTS) {
      const first = composeLetter(recipient, ['A paragraph.']);
      const second = composeLetter(recipient, ['A paragraph.']);
      expect(second).toEqual(first);
      expect(first.recipient).toBe(recipient);
    }
  });

  it('produces an empty body for an empty paragraph list without throwing', () => {
    const letter = composeLetter('gp', []);
    expect(letter.body).toBe('');
  });
});
