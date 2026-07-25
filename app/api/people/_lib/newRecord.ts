/**
 * Pure validation for a new care record. No I/O, no Supabase, no
 * next/headers — so the same function runs in the browser (the /welcome
 * form, before it posts) and on the server (POST /api/people, which never
 * trusts the client's copy of it).
 *
 * The four carer bases come from Lane C's `lib/safety/consent.ts` and the
 * declared name is validated by Lane C's `makeDeclaration`. Neither the
 * list nor the name rule is restated here — a second copy of a consent rule
 * is a second thing to get wrong.
 *
 * This module records what a carer *declares*. It never evaluates whether
 * the basis is legally held, and never assesses capacity — same boundary as
 * consent.ts, for the same reason.
 */

import {
  CARER_ACCESS_BASES,
  makeDeclaration,
  type CarerAccessBasis,
} from '@/lib/safety/consent';

/** Matches the `people.display_name` column's practical ceiling; a name
 *  longer than this is a paste accident, not a name. */
export const MAX_DISPLAY_NAME_LENGTH = 120;

export type NewRecordField = 'display_name' | 'dob' | 'basis' | 'declared_name';

export interface NewRecordInput {
  readonly displayName: string;
  /** Empty string and null both mean "not given" — date of birth is optional. */
  readonly dob: string | null;
  readonly basis: string;
  readonly declaredName: string;
}

export interface NewRecord {
  readonly displayName: string;
  readonly dob: string | null;
  readonly basis: CarerAccessBasis;
  readonly declaredName: string;
}

export type NewRecordResult =
  | { readonly ok: true; readonly record: NewRecord }
  | { readonly ok: false; readonly field: NewRecordField; readonly error: string };

/**
 * Every message a caller may see. Exported so the form and the route render
 * identical words, and so a test asserts on the constant rather than on a
 * string literal that can drift. Statements about what is missing, never
 * instructions about what the record means.
 */
export const NEW_RECORD_ERRORS = {
  displayNameEmpty: 'Enter the name of the person this record is for.',
  displayNameTooLong: `That name is longer than we can store (${MAX_DISPLAY_NAME_LENGTH} characters).`,
  dobNotADate: 'Date of birth needs to be a real date, or left blank.',
  dobInFuture: 'That date of birth is in the future. Leave it blank if you are not sure.',
  basisNotChosen: 'Choose the basis on which you hold this person’s records.',
  declaredNameEmpty: 'Type your own full name to sign this declaration.',
  declaredNameNotFull: 'Type your full name — at least two words.',
} as const;

function isCarerBasis(value: string): value is CarerAccessBasis {
  return CARER_ACCESS_BASES.some((basis) => basis === value);
}

/**
 * ISO calendar date, checked by round-trip rather than by regex alone:
 * '2026-02-30' matches the pattern and is not a date. Returns null for a
 * blank value (date of birth is optional) and undefined for a value that is
 * present but unusable, which the caller turns into an error.
 */
function parseIsoDate(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match === null) return undefined;

  const [, year, month, day] = match;
  const asUtc = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return undefined;

  // Rejects overflow dates, which Date silently rolls forward (31 Feb -> 3 Mar).
  const roundTripped =
    asUtc.getUTCFullYear() === Number(year) &&
    asUtc.getUTCMonth() + 1 === Number(month) &&
    asUtc.getUTCDate() === Number(day);

  return roundTripped ? trimmed : undefined;
}

/**
 * `today` is passed in, never read from the clock here: a pure function that
 * consults Date.now() is a function whose tests depend on the day they run.
 * Expected as an ISO date (YYYY-MM-DD); anything unparseable disables the
 * future check rather than failing an otherwise valid record.
 */
export function validateNewRecord(
  input: NewRecordInput,
  options: { readonly today: string },
): NewRecordResult {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    return { ok: false, field: 'display_name', error: NEW_RECORD_ERRORS.displayNameEmpty };
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, field: 'display_name', error: NEW_RECORD_ERRORS.displayNameTooLong };
  }

  const dob = parseIsoDate(input.dob ?? '');
  if (dob === undefined) {
    return { ok: false, field: 'dob', error: NEW_RECORD_ERRORS.dobNotADate };
  }
  const today = parseIsoDate(options.today);
  // String comparison is safe and total for two ISO dates of equal shape.
  if (dob !== null && typeof today === 'string' && dob > today) {
    return { ok: false, field: 'dob', error: NEW_RECORD_ERRORS.dobInFuture };
  }

  if (!isCarerBasis(input.basis)) {
    return { ok: false, field: 'basis', error: NEW_RECORD_ERRORS.basisNotChosen };
  }

  // Lane C owns what counts as a typed full name. This maps its two failure
  // modes onto copy a person can act on, and keeps the rule itself there.
  if (input.declaredName.trim().length === 0) {
    return { ok: false, field: 'declared_name', error: NEW_RECORD_ERRORS.declaredNameEmpty };
  }
  const declaration = makeDeclaration({
    basis: input.basis,
    declaredByFullName: input.declaredName,
    date: options.today,
  });
  if (!declaration.ok) {
    return { ok: false, field: 'declared_name', error: NEW_RECORD_ERRORS.declaredNameNotFull };
  }

  return {
    ok: true,
    record: {
      displayName,
      dob,
      basis: declaration.declaration.basis,
      // Whitespace-normalised by makeDeclaration — use its version, not the raw input.
      declaredName: declaration.declaration.declaredByFullName,
    },
  };
}
