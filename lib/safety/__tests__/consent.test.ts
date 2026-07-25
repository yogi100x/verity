import { describe, it, expect } from 'vitest';
import { AccessBasis } from '../../contracts';
import {
  CARER_ACCESS_BASES,
  isCarerAccessBasis,
  makeDeclaration,
  accessBadge,
  revokeAccess,
  type CarerAccessBasis,
} from '../consent';
import * as consentModule from '../consent';

describe('CARER_ACCESS_BASES', () => {
  it('is exactly the four carer bases', () => {
    expect([...CARER_ACCESS_BASES].sort()).toEqual(
      [
        'person_consent',
        'lpa_health_welfare',
        'court_deputy',
        'best_interests_declared',
      ].sort(),
    );
    expect(CARER_ACCESS_BASES).toHaveLength(4);
  });

  it('does not include self', () => {
    expect(CARER_ACCESS_BASES).not.toContain('self');
  });

  it('is a subset of the contract AccessBasis enum', () => {
    for (const basis of CARER_ACCESS_BASES) {
      expect(AccessBasis.options).toContain(basis);
    }
  });

  it('isCarerAccessBasis rejects self and accepts the four carer bases', () => {
    expect(isCarerAccessBasis('self')).toBe(false);
    for (const basis of CARER_ACCESS_BASES) {
      expect(isCarerAccessBasis(basis)).toBe(true);
    }
  });
});

describe('makeDeclaration', () => {
  it('rejects an empty name', () => {
    const result = makeDeclaration({
      basis: 'lpa_health_welfare',
      declaredByFullName: '',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = makeDeclaration({
      basis: 'lpa_health_welfare',
      declaredByFullName: '   ',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a single-word name', () => {
    const result = makeDeclaration({
      basis: 'person_consent',
      declaredByFullName: 'Margaret',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a full name and carries the asserted basis unchanged', () => {
    for (const basis of CARER_ACCESS_BASES) {
      const result = makeDeclaration({
        basis,
        declaredByFullName: 'Margaret Ellis',
        date: '2026-07-25',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.declaration.basis).toBe(basis);
        expect(result.declaration.declaredByFullName).toBe('Margaret Ellis');
      }
    }
  });

  it('trims surrounding whitespace on an otherwise valid full name', () => {
    const result = makeDeclaration({
      basis: 'court_deputy',
      declaredByFullName: '  Margaret Ellis  ',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaration.declaredByFullName).toBe('Margaret Ellis');
    }
  });

  it('accepts a multi-word full name beyond two words', () => {
    const result = makeDeclaration({
      basis: 'best_interests_declared',
      declaredByFullName: 'Margaret Anne Ellis',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects other whitespace-only names (tab, newline, non-breaking space)', () => {
    for (const blank of ['\t', '\n', '\r\n', '  \t \n ', ' ', '　']) {
      const result = makeDeclaration({
        basis: 'person_consent',
        declaredByFullName: blank,
        date: '2026-07-25',
      });
      expect(result.ok, `"${JSON.stringify(blank)}" should be rejected`).toBe(false);
    }
  });

  it('accepts hyphenated, apostrophised, accented and non-Latin full names', () => {
    const realNames = [
      "Anne-Marie O'Neill",
      'José María Álvarez',
      'Иван Петров',
      '李 小龍',
      'Μαρία Παπαδόπουλου',
      'Seán Ó Súilleabháin',
      'Ngọc Trần',
      'van der Berg Jansen',
    ];
    for (const name of realNames) {
      const result = makeDeclaration({
        basis: 'person_consent',
        declaredByFullName: name,
        date: '2026-07-25',
      });
      expect(result.ok, `"${name}" should be accepted`).toBe(true);
      if (result.ok) {
        expect(result.declaration.declaredByFullName).toBe(name);
      }
    }
  });

  it('rejects a hyphenated single word — it is still one word', () => {
    const result = makeDeclaration({
      basis: 'person_consent',
      declaredByFullName: 'Anne-Marie',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects names whose words carry no letters at all', () => {
    for (const notAName of ['- -', '. .', '1 2', '123 456', '*** ***', '_ _']) {
      const result = makeDeclaration({
        basis: 'court_deputy',
        declaredByFullName: notAName,
        date: '2026-07-25',
      });
      expect(result.ok, `"${notAName}" should be rejected`).toBe(false);
    }
  });

  it('normalises internal whitespace runs in an otherwise valid name', () => {
    const result = makeDeclaration({
      basis: 'person_consent',
      declaredByFullName: ' Margaret \t\n  Ellis ',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaration.declaredByFullName).toBe('Margaret Ellis');
    }
  });

  it('records the asserted basis without any validity verdict on the declaration', () => {
    const result = makeDeclaration({
      basis: 'best_interests_declared',
      declaredByFullName: 'Margaret Ellis',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Exactly the three recorded fields — no `valid`, `verified`,
      // `capacity`, `confidence` or any other judgement field may appear.
      expect(Object.keys(result.declaration).sort()).toEqual(
        ['basis', 'date', 'declaredByFullName'].sort(),
      );
    }
  });

  it('passes the date through untouched — it is a record, not a computation', () => {
    const result = makeDeclaration({
      basis: 'person_consent',
      declaredByFullName: 'Margaret Ellis',
      date: '2026-07-25',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaration.date).toBe('2026-07-25');
    }
  });
});

describe('API surface — record-only, no assessment semantics', () => {
  it('no exported consent function name implies assessment, evaluation, or a capacity judgement', () => {
    const bannedNamePattern = /assess|evaluat|judg|capacity/i;
    const exportedFunctionNames = Object.entries(consentModule)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);

    expect(exportedFunctionNames.length).toBeGreaterThan(0);
    for (const name of exportedFunctionNames) {
      expect(bannedNamePattern.test(name)).toBe(false);
    }
  });
});

describe('accessBadge', () => {
  it('returns a non-empty, distinct string per basis', () => {
    const badges = CARER_ACCESS_BASES.map((basis: CarerAccessBasis) =>
      accessBadge(basis, 'Margaret Ellis'),
    );
    for (const badge of badges) {
      expect(badge.length).toBeGreaterThan(0);
    }
    expect(new Set(badges).size).toBe(badges.length);
  });

  it('names the declarer and uses plain factual wording', () => {
    const badge = accessBadge('lpa_health_welfare', 'Margaret Ellis');
    expect(badge).toContain('Margaret Ellis');
    expect(badge).toContain('Lasting Power of Attorney');
  });

  it('uses no judgement, validity or capacity language for any basis', () => {
    const bannedBadgeTerms = [
      'valid',
      'verified',
      'confirmed',
      'approved',
      'authorised',
      'entitled',
      'capacity',
      'assess',
      'lacks',
      'proven',
      'legitimate',
      'we have checked',
    ];
    for (const basis of CARER_ACCESS_BASES) {
      const badge = accessBadge(basis, 'Margaret Ellis').toLowerCase();
      for (const term of bannedBadgeTerms) {
        expect(badge, `${basis} badge should not contain "${term}"`).not.toContain(term);
      }
    }
  });

  it('always names the basis as declared, never as established', () => {
    for (const basis of CARER_ACCESS_BASES) {
      expect(accessBadge(basis, 'Margaret Ellis')).toContain('declared by');
    }
  });
});

describe('revokeAccess', () => {
  it('produces an emptied/revoked state carrying the basis', () => {
    const revoked = revokeAccess({ basis: 'lpa_health_welfare' }, '2026-07-25T10:00:00Z');
    expect(revoked.status).toBe('revoked');
    expect(revoked.basis).toBe('lpa_health_welfare');
    expect(revoked.revokedAt).toBe('2026-07-25T10:00:00Z');
  });

  it('empties the state — no declarer name or declaration date survives', () => {
    const declared = makeDeclaration({
      basis: 'court_deputy',
      declaredByFullName: 'Margaret Ellis',
      date: '2026-07-25',
    });
    expect(declared.ok).toBe(true);
    if (!declared.ok) {
      return;
    }
    const revoked = revokeAccess(declared.declaration, '2026-07-25T10:00:00Z');
    expect(Object.keys(revoked).sort()).toEqual(['basis', 'revokedAt', 'status'].sort());
    expect(JSON.stringify(revoked)).not.toContain('Margaret Ellis');
    expect(Object.keys(revoked)).not.toContain('date');
    expect(Object.keys(revoked)).not.toContain('declaredByFullName');
    expect(JSON.stringify(revoked)).toContain('revoked');
  });

  it('is pure — it does not mutate the declaration it is given', () => {
    const declaration: { basis: CarerAccessBasis } = { basis: 'lpa_health_welfare' };
    const before = JSON.stringify(declaration);
    revokeAccess(declaration, '2026-07-25T10:00:00Z');
    expect(JSON.stringify(declaration)).toBe(before);
  });
});
