import { describe, it, expect } from 'vitest';
import {
  DICTATION_PROMPT,
  MIC_START_LABEL,
  MIC_STOP_LABEL,
  DICTATION_STATES,
  DICTATION_ERRORS,
} from '../dictation';

const BANNED_WORDS =
  /\b(urgent|immediately|likely|suggests|consistent with|probably|triage)\b/i;

describe('exports exist and are non-empty', () => {
  it('DICTATION_PROMPT is a non-empty string', () => {
    expect(typeof DICTATION_PROMPT).toBe('string');
    expect(DICTATION_PROMPT.length).toBeGreaterThan(0);
  });

  it('MIC_START_LABEL is a non-empty string', () => {
    expect(typeof MIC_START_LABEL).toBe('string');
    expect(MIC_START_LABEL.length).toBeGreaterThan(0);
  });

  it('MIC_STOP_LABEL is a non-empty string', () => {
    expect(typeof MIC_STOP_LABEL).toBe('string');
    expect(MIC_STOP_LABEL.length).toBeGreaterThan(0);
  });

  it('every DICTATION_STATES value is a non-empty string', () => {
    for (const value of Object.values(DICTATION_STATES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('every DICTATION_ERRORS value is a non-empty string', () => {
    for (const value of Object.values(DICTATION_ERRORS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('DICTATION_STATES keys', () => {
  it('has exactly the four expected keys', () => {
    expect(Object.keys(DICTATION_STATES).sort()).toEqual(
      ['recording', 'requesting', 'saved', 'uploading'].sort(),
    );
  });
});

describe('DICTATION_ERRORS keys', () => {
  it('has exactly the three expected keys', () => {
    expect(Object.keys(DICTATION_ERRORS).sort()).toEqual(
      ['denied', 'failed', 'unsupported'].sort(),
    );
  });
});

describe('banned words', () => {
  const allStrings: Array<[string, string]> = [
    ['DICTATION_PROMPT', DICTATION_PROMPT],
    ['MIC_START_LABEL', MIC_START_LABEL],
    ['MIC_STOP_LABEL', MIC_STOP_LABEL],
    ...Object.entries(DICTATION_STATES).map(
      ([key, value]): [string, string] => [`DICTATION_STATES.${key}`, value],
    ),
    ...Object.entries(DICTATION_ERRORS).map(
      ([key, value]): [string, string] => [`DICTATION_ERRORS.${key}`, value],
    ),
  ];

  it.each(allStrings)('%s does not contain a banned word', (_name, value) => {
    expect(value).not.toMatch(BANNED_WORDS);
  });
});

describe('honesty constraints', () => {
  it('the "saved" state does not claim transcription has already happened', () => {
    expect(DICTATION_STATES.saved.toLowerCase()).not.toContain('transcribed');
    expect(DICTATION_STATES.saved.toLowerCase()).not.toContain('transcription');
  });

  it('the "unsupported" error says why the button is disabled', () => {
    expect(DICTATION_ERRORS.unsupported.toLowerCase()).toContain('cannot record');
  });

  it('the "denied" error says how to recover', () => {
    expect(DICTATION_ERRORS.denied.toLowerCase()).toContain('allow');
  });

  it('the "failed" error states nothing was stored', () => {
    const failed = DICTATION_ERRORS.failed.toLowerCase();
    expect(failed).toContain('nothing was stored');
    expect(failed).not.toContain('recording saved');
    expect(failed).not.toContain('recording stored');
  });

  it('the start and stop labels are distinct', () => {
    expect(MIC_START_LABEL).not.toBe(MIC_STOP_LABEL);
  });
});
