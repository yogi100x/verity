import { describe, expect, it } from 'vitest';
import {
  MAX_DISPLAY_NAME_LENGTH,
  NEW_RECORD_ERRORS,
  validateNewRecord,
} from '@/app/api/people/_lib/newRecord';
import { CARER_ACCESS_BASES } from '@/lib/safety/consent';

const TODAY = '2026-07-26';

const VALID = {
  displayName: 'Margaret Ellis',
  dob: '1944-03-02',
  basis: 'person_consent',
  declaredName: 'Sarah Ellis',
} as const;

describe('validateNewRecord', () => {
  it('accepts a complete declaration and normalises the values it keeps', () => {
    const result = validateNewRecord(
      { ...VALID, displayName: '  Margaret Ellis  ', declaredName: 'Sarah   Ellis' },
      { today: TODAY },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.displayName).toBe('Margaret Ellis');
    // Whitespace normalisation is Lane C's makeDeclaration, not a second copy here.
    expect(result.record.declaredName).toBe('Sarah Ellis');
    expect(result.record.dob).toBe('1944-03-02');
    expect(result.record.basis).toBe('person_consent');
  });

  it('blocks an empty name with copy a person can act on', () => {
    const result = validateNewRecord({ ...VALID, displayName: '   ' }, { today: TODAY });
    expect(result).toEqual({
      ok: false,
      field: 'display_name',
      error: NEW_RECORD_ERRORS.displayNameEmpty,
    });
  });

  it('blocks a name longer than the column ceiling', () => {
    const result = validateNewRecord(
      { ...VALID, displayName: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1) },
      { today: TODAY },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('display_name');
  });

  it('treats a blank date of birth as not given, not as an error', () => {
    for (const blank of ['', '   ', null]) {
      const result = validateNewRecord({ ...VALID, dob: blank }, { today: TODAY });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.record.dob).toBeNull();
    }
  });

  it('rejects a date that matches the shape but is not a date', () => {
    // Date would silently roll this forward to 2 March; the round-trip check
    // is what catches it.
    const result = validateNewRecord({ ...VALID, dob: '2026-02-30' }, { today: TODAY });
    expect(result).toEqual({ ok: false, field: 'dob', error: NEW_RECORD_ERRORS.dobNotADate });
  });

  it('rejects free text in the date field', () => {
    const result = validateNewRecord({ ...VALID, dob: 'around 1944' }, { today: TODAY });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('dob');
  });

  it('rejects a date of birth after today, and accepts today itself', () => {
    const future = validateNewRecord({ ...VALID, dob: '2026-07-27' }, { today: TODAY });
    expect(future).toEqual({ ok: false, field: 'dob', error: NEW_RECORD_ERRORS.dobInFuture });

    const bornToday = validateNewRecord({ ...VALID, dob: TODAY }, { today: TODAY });
    expect(bornToday.ok).toBe(true);
  });

  it('accepts every carer basis and no others', () => {
    for (const basis of CARER_ACCESS_BASES) {
      expect(validateNewRecord({ ...VALID, basis }, { today: TODAY }).ok).toBe(true);
    }

    // 'self' is a real AccessBasis but is not one a carer may declare, so the
    // form cannot offer it and the validator must not accept it either.
    for (const rejected of ['self', '', 'guardian', 'person_consent ']) {
      const result = validateNewRecord({ ...VALID, basis: rejected }, { today: TODAY });
      expect(result).toEqual({
        ok: false,
        field: 'basis',
        error: NEW_RECORD_ERRORS.basisNotChosen,
      });
    }
  });

  it('blocks an empty declared name and a single-word one, with different copy', () => {
    const empty = validateNewRecord({ ...VALID, declaredName: '  ' }, { today: TODAY });
    expect(empty).toEqual({
      ok: false,
      field: 'declared_name',
      error: NEW_RECORD_ERRORS.declaredNameEmpty,
    });

    const oneWord = validateNewRecord({ ...VALID, declaredName: 'Sarah' }, { today: TODAY });
    expect(oneWord).toEqual({
      ok: false,
      field: 'declared_name',
      error: NEW_RECORD_ERRORS.declaredNameNotFull,
    });
  });

  it('accepts full names in other scripts and with punctuation', () => {
    for (const name of ["Anne-Marie O'Neill", 'José María Álvarez', 'Иван Петров']) {
      expect(validateNewRecord({ ...VALID, declaredName: name }, { today: TODAY }).ok).toBe(
        true,
      );
    }
  });

  it('is pure with respect to the clock: an unparseable today only disables the future check', () => {
    const result = validateNewRecord({ ...VALID, dob: '2099-01-01' }, { today: 'not-a-date' });
    expect(result.ok).toBe(true);
  });
});
