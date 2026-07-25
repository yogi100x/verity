/**
 * CONSENT — asserted legal basis, never an evaluated one.
 *
 * Pure functions, zero dependencies, no I/O. This module records what a
 * carer *declares* about their legal basis for accessing someone else's
 * record. It never assesses, evaluates, or otherwise forms a judgement
 * about whether that basis is legally valid — that determination sits with
 * courts, the OPG, and clinicians, never with this code. Every function
 * below is a record-only helper: given an asserted basis and a declared
 * name, it returns a typed record of the assertion, nothing more.
 */

// Type-only import: this module must stay dependency-free at runtime, so it
// never pulls zod in via the contracts module.
import type { AccessBasis } from '../contracts';

/**
 * The four bases on which a carer (not the person themself) may access a
 * record. 'self' is a valid AccessBasis for the person's own account, but
 * it is deliberately excluded here — a carer cannot declare 'self'.
 */
export const CARER_ACCESS_BASES = [
  'person_consent',
  'lpa_health_welfare',
  'court_deputy',
  'best_interests_declared',
] as const satisfies readonly AccessBasis[];

export type CarerAccessBasis = (typeof CARER_ACCESS_BASES)[number];

export function isCarerAccessBasis(basis: AccessBasis): basis is CarerAccessBasis {
  return CARER_ACCESS_BASES.some((carerBasis) => carerBasis === basis);
}

/** A recorded assertion. Carries the basis exactly as asserted — never a
 *  verdict on whether it is legally sound. */
export interface ConsentDeclaration {
  readonly basis: CarerAccessBasis;
  readonly declaredByFullName: string;
  readonly date: string;
}

export interface DeclarationInput {
  readonly basis: CarerAccessBasis;
  readonly declaredByFullName: string;
  readonly date: string;
}

export type DeclarationResult =
  | { readonly ok: true; readonly declaration: ConsentDeclaration }
  | { readonly ok: false; readonly error: string };

/**
 * Any Unicode letter. Built via `new RegExp` rather than a literal so the
 * property escape does not depend on the compile target.
 */
const UNICODE_LETTER = new RegExp('\\p{L}', 'u');

/** Splits on any run of whitespace, dropping empties. */
function words(name: string): readonly string[] {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Shape check only: a typed full name is at least two whitespace-separated
 * words, each containing at least one letter in any script. Deliberately
 * permissive about scripts, accents, hyphens and apostrophes — "Anne-Marie
 * O'Neill", "José María Álvarez" and "Иван Петров" are all full names. It
 * rejects only what cannot be a name at all: nothing, whitespace, a single
 * word, or tokens made purely of digits or punctuation.
 */
function isFullName(name: string): boolean {
  const parts = words(name);
  if (parts.length < 2) {
    return false;
  }
  return parts.every((word) => UNICODE_LETTER.test(word));
}

/**
 * Validates that the declared name looks like a typed full name (non-empty,
 * at least two letter-bearing words) and returns a typed record of the
 * assertion with surrounding and internal whitespace normalised.
 *
 * This function validates the SHAPE of the declaration only. It never
 * assesses capacity, never evaluates whether the asserted legal basis is
 * actually held, and never returns any judgement about the validity of the
 * basis itself — that is out of scope for this module, structurally.
 */
export function makeDeclaration(input: DeclarationInput): DeclarationResult {
  const trimmedName = input.declaredByFullName.trim();

  if (trimmedName.length === 0) {
    return { ok: false, error: 'declaredByFullName must not be empty' };
  }

  if (!isFullName(trimmedName)) {
    return {
      ok: false,
      error:
        'declaredByFullName must be a full name (at least two words, each containing a letter)',
    };
  }

  return {
    ok: true,
    declaration: {
      basis: input.basis,
      declaredByFullName: words(trimmedName).join(' '),
      date: input.date,
    },
  };
}

const ACCESS_BASIS_LABEL: Record<CarerAccessBasis, string> = {
  person_consent: "the person's consent",
  lpa_health_welfare: 'Lasting Power of Attorney (health and welfare)',
  court_deputy: 'a court-appointed deputy order',
  best_interests_declared: 'a best interests declaration',
};

/**
 * Persistent badge copy for the carer dashboard. Plain, factual wording —
 * names the asserted basis and who declared it, never comments on whether
 * the basis is sound.
 */
export function accessBadge(basis: CarerAccessBasis, declaredByFullName: string): string {
  return `Access basis: ${ACCESS_BASIS_LABEL[basis]}, declared by ${declaredByFullName}`;
}

/** The shared shape other lanes render when a carer's access has been
 *  revoked. RLS enforces the emptied view server-side; this is the pure
 *  marker other lanes key their UI off. */
export interface RevokedAccess {
  readonly status: 'revoked';
  readonly basis: CarerAccessBasis;
  readonly revokedAt: string;
}

/**
 * Pure helper other lanes call on revocation. Produces the revoked marker
 * meaning the carer's view empties immediately. It does not perform the
 * revocation itself — RLS enforces that server-side — this only returns the
 * shared shape describing the resulting state.
 */
export function revokeAccess(
  declaration: Pick<ConsentDeclaration, 'basis'>,
  revokedAt: string,
): RevokedAccess {
  return {
    status: 'revoked',
    basis: declaration.basis,
    revokedAt,
  };
}
