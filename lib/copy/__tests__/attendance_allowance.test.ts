import { describe, it, expect } from 'vitest';
import { AA_RATES, AA_CHECK_URL, attendanceAllowanceLine } from '../attendance_allowance';
import { filterOutput } from '../../safety/output_filter';

describe('AA_RATES', () => {
  it('carries the verified rates for 2026/27', () => {
    expect(AA_RATES).toEqual({
      lower: '£76.70',
      higher: '£114.60',
      period: 'week',
      taxYear: '2026/27',
    });
  });
});

describe('AA_CHECK_URL', () => {
  it('points at the official gov.uk Attendance Allowance page', () => {
    expect(AA_CHECK_URL).toBe('https://www.gov.uk/attendance-allowance');
  });
});

describe('attendanceAllowanceLine', () => {
  const line = attendanceAllowanceLine('Margaret');

  it('contains "may be eligible"', () => {
    expect(line).toContain('may be eligible');
  });

  it('contains a gov.uk link', () => {
    expect(line).toContain(AA_CHECK_URL);
    expect(line).toMatch(/https:\/\/www\.gov\.uk\//);
  });

  it('never contains "you qualify"', () => {
    expect(line.toLowerCase()).not.toContain('you qualify');
  });

  it('never contains any inflection of "qualif" — no verdict language at all', () => {
    expect(line.toLowerCase()).not.toContain('qualif');
  });

  it('never asserts "is eligible" as a verdict', () => {
    expect(line.toLowerCase()).not.toContain('is eligible');
  });

  it('never asserts an entitlement — no "entitled to"', () => {
    expect(line.toLowerCase()).not.toContain('entitled to');
    expect(line.toLowerCase()).not.toContain('entitlement');
  });

  it('never promises an outcome — no "will receive"', () => {
    expect(line.toLowerCase()).not.toContain('will receive');
    expect(line.toLowerCase()).not.toContain('will get');
  });

  it('bans every verdict phrasing for any name, not just Margaret', () => {
    const banned = [
      'you qualify',
      'qualif',
      'is eligible',
      'are eligible',
      'entitled to',
      'will receive',
      'will get',
      'you get',
    ];
    for (const name of ['Margaret', 'Bob Jones', 'Margaret Ellis']) {
      const lowered = attendanceAllowanceLine(name).toLowerCase();
      for (const phrase of banned) {
        expect(lowered).not.toContain(phrase);
      }
    }
  });

  it('interpolates the person\'s name', () => {
    expect(line.startsWith('Margaret ')).toBe(true);
  });

  it('quotes the higher rate exactly as it appears in AA_RATES', () => {
    expect(line).toContain(AA_RATES.higher);
  });

  it('the rate is loaded from the rates param (default AA_RATES), never hardcoded in the template', () => {
    const fakeRates = {
      lower: '£1.00',
      higher: '£999.99',
      period: 'week',
      taxYear: '2099/00',
    } as const;
    const swapped = attendanceAllowanceLine('Margaret', fakeRates);
    expect(swapped).toContain('£999.99');
    expect(swapped).not.toContain(AA_RATES.higher);
  });

  it('carries exactly one £ figure, and it came from the injected rates', () => {
    const swapped = attendanceAllowanceLine('Margaret', {
      lower: '£1.00',
      higher: '£999.99',
      period: 'fortnight',
      taxYear: '2099/00',
    });
    expect(swapped.match(/£/g)).toEqual(['£']);
    expect(swapped).toContain('per fortnight');
  });

  it('ends with the bare URL — no trailing punctuation to break the link', () => {
    expect(line.endsWith(AA_CHECK_URL)).toBe(true);
  });

  it('is deterministic — same input, same output, every call', () => {
    const a = attendanceAllowanceLine('Margaret');
    const b = attendanceAllowanceLine('Margaret');
    expect(a).toBe(b);
    expect(a).toBe(
      'Margaret may be eligible for Attendance Allowance. The higher rate is ' +
        '£114.60 per week and is not backdated — every week of delay is money ' +
        'lost. Check eligibility: https://www.gov.uk/attendance-allowance',
    );
  });

  it('passes filterOutput — no urgency, likelihood or clinical-judgement language', () => {
    const result = filterOutput(line, []);
    expect(result).toEqual({ ok: true });
  });

  it('every generated line for a different name also passes filterOutput', () => {
    expect(filterOutput(attendanceAllowanceLine('Bob Jones'), []).ok).toBe(true);
  });

  it('"may be" itself is not on the output filter\'s banned list', () => {
    expect(filterOutput('This may be a record statement.', []).ok).toBe(true);
  });
});
