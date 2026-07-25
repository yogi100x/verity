import { describe, it, expect } from 'vitest';
import { classifySource, roleForSource, type RoleDecision } from '@/lib/ai/sources';
import type { Source } from '@/lib/contracts';

type SourceLike = Pick<Source, 'kind' | 'title'>;

function src(kind: Source['kind'], title: string): SourceLike {
  return { kind, title };
}

describe('classifySource — instruction titles', () => {
  const instructionTitles = [
    'Discharge summary',
    'Discharge letter',
    'Clinic letter',
    'Outpatient letter',
    'Consultant letter',
    'Medication review outcome',
    'Care plan',
  ];

  it.each(instructionTitles)('%s classifies as instruction', (title) => {
    const decision = classifySource(src('pdf', title));
    expect(decision.role).toBe('instruction');
    expect(decision.reason.length).toBeGreaterThan(0);
  });

  it.each(instructionTitles)('%s -> instruction via roleForSource too', (title) => {
    expect(roleForSource(src('pdf', title))).toBe('instruction');
  });
});

describe('classifySource — observation titles', () => {
  const observationTitles = [
    'Repeat prescription',
    'Prescription list',
    'Medication list',
    'Care log',
    'Daily log',
    'Diary',
    'Observation chart',
    'Test result',
    'Blood results',
  ];

  it.each(observationTitles)('%s classifies as observation', (title) => {
    const decision = classifySource(src('pdf', title));
    expect(decision.role).toBe('observation');
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});

describe('classifySource — kind is a format, not a document type', () => {
  it('a PHOTOGRAPHED discharge summary (kind: image) is still an instruction', () => {
    const decision = classifySource(src('image', 'Discharge summary'));
    expect(decision.role).toBe('instruction');
    expect(decision.reason).toContain('discharge summary');
  });

  it('a native-pdf discharge summary and a photographed one classify identically', () => {
    const pdf = classifySource(src('pdf', 'Discharge summary'));
    const image = classifySource(src('image', 'Discharge summary'));
    expect(pdf.role).toBe(image.role);
    expect(pdf.role).toBe('instruction');
  });
});

describe('classifySource — juno_conversation is always an observation', () => {
  it('a plain juno title is an observation', () => {
    const decision = classifySource(src('juno_conversation', "Margaret's Juno history"));
    expect(decision.role).toBe('observation');
    expect(decision.reason).toBe('juno_conversation is always a patient account');
  });

  it('a juno title that would otherwise match an instruction rule is STILL an observation', () => {
    // A patient pasting or reading out a letter's text does not make it a
    // clinical instruction from them — the source is still their own account.
    const decision = classifySource(src('juno_conversation', 'Discharge summary'));
    expect(decision.role).toBe('observation');
    expect(decision.reason).toBe('juno_conversation is always a patient account');
  });
});

describe('classifySource — audio is always an observation', () => {
  it('a recorded voice note is an observation regardless of title', () => {
    const decision = classifySource(src('audio', 'Clinic letter'));
    expect(decision.role).toBe('observation');
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});

describe("classifySource — the word 'letter' alone never makes an instruction", () => {
  // The whole point of these: a FALSE instruction invents a validity period
  // that never existed and marks a fact superseded that never was, silently.
  // A false observation only means a real change shows up as a visible
  // disagreement. So every one of these must land on observation.
  const hostileTitles = [
    'letter from my daughter',
    'covering letter',
    'letter of complaint',
    "solicitor's letter",
    'Letter to the council about care funding',
    'thank you letter',
    'scanned letter',
    'letter (photo)',
    'Newsletter',
  ];

  it.each(hostileTitles)('%s is an observation, not an instruction', (title) => {
    const decision = classifySource(src('pdf', title));
    expect(decision.role).toBe('observation');
  });

  it.each(hostileTitles)('%s -> observation via roleForSource too', (title) => {
    expect(roleForSource(src('pdf', title))).toBe('observation');
  });

  it('says why it refused, so the refusal is not silent', () => {
    const decision = classifySource(src('pdf', 'letter from my daughter'));
    expect(decision.reason).toContain('no clinical context');
  });

  it("'daughter' does not smuggle in the 'dr' clinical-context word as a substring", () => {
    // Word-boundary matching is load-bearing here: substring matching on 'dr'
    // or 'gp' would fire inside ordinary words and re-open the exact hole
    // this rule was narrowed to close.
    expect(roleForSource(src('pdf', 'letter from my daughter'))).toBe('observation');
    expect(roleForSource(src('pdf', 'letter about her hydration'))).toBe('observation');
  });
});

describe("classifySource — 'letter' WITH clinical context is an instruction", () => {
  const clinicalLetterTitles = [
    'Diabetes team letter',
    'Renal department letter',
    'GP letter',
    'Letter from Dr Okafor',
    'Hospital letter',
    'Ward 4 letter',
  ];

  it.each(clinicalLetterTitles)('%s classifies as instruction', (title) => {
    const decision = classifySource(src('pdf', title));
    expect(decision.role).toBe('instruction');
    expect(decision.reason).toContain('clinical context');
  });

  it('a clinical-context letter is STILL an observation when the source is a voice recording', () => {
    expect(roleForSource(src('audio', 'GP letter'))).toBe('observation');
    expect(roleForSource(src('juno_conversation', 'GP letter'))).toBe('observation');
  });
});

describe('classifySource — default', () => {
  it('an unrecognised title defaults to observation, and says so', () => {
    const decision = classifySource(src('pdf', 'Miscellaneous scan'));
    expect(decision.role).toBe('observation');
    expect(decision.reason).toBe('no rule matched; defaulted to observation');
  });

  it('an empty title defaults to observation', () => {
    const decision = classifySource(src('text', ''));
    expect(decision.role).toBe('observation');
  });
});

describe('classifySource — reason is never empty and never a clinical judgement', () => {
  const cases: SourceLike[] = [
    src('juno_conversation', 'anything'),
    src('audio', 'anything'),
    src('pdf', 'Discharge summary'),
    src('image', 'Repeat prescription'),
    src('pdf', 'Unrecognised title'),
  ];

  it.each(cases)('reason is a non-empty, non-judgemental string for %j', (source) => {
    const decision: RoleDecision = classifySource(source);
    expect(decision.reason.length).toBeGreaterThan(0);
    expect(decision.reason).not.toMatch(/severity|urgency|priority|rank|risk|score/i);
  });
});
