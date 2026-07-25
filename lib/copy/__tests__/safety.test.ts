import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  PERSISTENT_BANNER,
  footer,
  RED_FLAG_HALT_CARD,
  SAFEGUARDING_FOOTER,
  BANNED_ARTEFACT_TITLES,
} from '../safety';
import { filterOutput } from '../../safety/output_filter';

/**
 * The verbatim contract is with prd.md itself, not with a literal retyped
 * into this test file — a literal can drift alongside the module and the
 * test would still pass. So we read prd.md §8.5 and compare byte-for-byte.
 */
// jsdom's `import.meta.url` is not a file: URL, so resolve from the vitest
// root (the repo root) instead.
const PRD = readFileSync(join(process.cwd(), 'prd.md'), 'utf8');

function prdBlockquoteAfter(label: string): string {
  const lines = PRD.split('\n');
  const labelIndex = lines.findIndex((line) => line.trim() === `**${label}:**`);
  expect(labelIndex, `prd.md should contain the "${label}" label`).toBeGreaterThan(-1);
  const quote = lines
    .slice(labelIndex + 1)
    .find((line) => line.startsWith('> '));
  expect(quote, `prd.md should have a blockquote after "${label}"`).toBeTruthy();
  return (quote ?? '').slice(2).trim();
}

describe('PERSISTENT_BANNER', () => {
  it('is character-identical to the prd §8.5 persistent banner in prd.md', () => {
    expect(PERSISTENT_BANNER).toBe(prdBlockquoteAfter('Persistent banner'));
  });

  it('matches the prd §8.5 string exactly', () => {
    expect(PERSISTENT_BANNER).toBe(
      'This tool organises evidence you already have. It does not assess ' +
        'symptoms, diagnose, or tell you how urgent something is. If you ' +
        'need to know how urgent something is, use NHS 111 online. If ' +
        "someone's life is at risk, call 999.",
    );
  });
});

describe('footer', () => {
  it('is character-identical to the prd §8.5 artefact footer, [Name]/[date] aside', () => {
    const template = prdBlockquoteAfter('Artefact footer');
    expect(footer('[Name]', '[date]')).toBe(template);
  });

  it('slot-fills name and date into the prd §8.5 template exactly', () => {
    expect(footer('Margaret Ellis', '25 July 2026')).toBe(
      'Assembled by Margaret Ellis using Verity on 25 July 2026 from ' +
        'documents they supplied and reviewed. This is not a clinical ' +
        'record, not a clinical summary, and has not been reviewed by a ' +
        'clinician. Every dated item links to the page it came from.',
    );
  });

  it('does slot-filling only — the surrounding template text never changes', () => {
    const a = footer('Alice Smith', '1 January 2026');
    const b = footer('Bob Jones', '2 February 2026');
    expect(a.replace('Alice Smith', 'X').replace('1 January 2026', 'Y')).toBe(
      b.replace('Bob Jones', 'X').replace('2 February 2026', 'Y'),
    );
  });
});

describe('RED_FLAG_HALT_CARD', () => {
  it('keeps the four structural beats adapted from research/01 §6, with Verity in place of CarePath', () => {
    expect(RED_FLAG_HALT_CARD.heading).toContain('Verity');
    expect(RED_FLAG_HALT_CARD.heading.toLowerCase()).toContain('stopped');
    expect(RED_FLAG_HALT_CARD.body).toContain('We have not assessed you');
    expect(RED_FLAG_HALT_CARD.body.toLowerCase()).toContain("simply stopped");
    expect(RED_FLAG_HALT_CARD.primaryAction).toBe('Call 999 now.');
    expect(RED_FLAG_HALT_CARD.fallback).toContain('NHS 111 online can assess this');
    expect(RED_FLAG_HALT_CARD.fallback).toContain('registered medical device');
    expect(RED_FLAG_HALT_CARD.fallback).toContain('We are not');
  });

  it('leaves the OGL-attributed NHS guidance slot explicitly empty rather than fabricating it', () => {
    // research/01 §6 has *[verbatim NHS 999 guidance text + source link,
    // OGL-attributed]* as a slot. Empty is the correct shipped state; any
    // plausible-sounding NHS text here would be a fabricated citation.
    expect(RED_FLAG_HALT_CARD.nhsGuidanceQuote).toBe('');
    expect(RED_FLAG_HALT_CARD.nhsGuidanceSourceUrl).toBe('');
  });

  it('invents no NHS attribution, licence text, or source link anywhere on the card', () => {
    const wholeCard = [
      RED_FLAG_HALT_CARD.heading,
      RED_FLAG_HALT_CARD.body,
      RED_FLAG_HALT_CARD.nhsGuidanceQuote,
      RED_FLAG_HALT_CARD.nhsGuidanceSourceUrl,
      RED_FLAG_HALT_CARD.primaryAction,
      RED_FLAG_HALT_CARD.fallback,
    ].join(' ');
    expect(wholeCard.toLowerCase()).not.toContain('open government licence');
    expect(wholeCard.toLowerCase()).not.toContain('ogl');
    expect(wholeCard).not.toMatch(/https?:\/\//);
    expect(wholeCard.toLowerCase()).not.toContain('nhs.uk');
    // The only NHS references permitted are the two structural beats.
    expect(wholeCard.match(/NHS/g)).toEqual(["NHS", "NHS"]);
  });

  it('never mentions the old product name', () => {
    const wholeCard = [
      RED_FLAG_HALT_CARD.heading,
      RED_FLAG_HALT_CARD.body,
      RED_FLAG_HALT_CARD.primaryAction,
      RED_FLAG_HALT_CARD.fallback,
    ].join(' ');
    expect(wholeCard).not.toContain('CarePath');
    expect(wholeCard).not.toContain('Juno');
  });
});

describe('SAFEGUARDING_FOOTER', () => {
  it('signposts adult social care and 999', () => {
    expect(SAFEGUARDING_FOOTER.toLowerCase()).toContain('adult social care');
    expect(SAFEGUARDING_FOOTER).toContain('999');
  });

  it('never claims to detect or identify abuse', () => {
    expect(SAFEGUARDING_FOOTER.toLowerCase()).toContain('cannot identify or assess');
    expect(SAFEGUARDING_FOOTER.toLowerCase()).not.toMatch(/we (detect|identify|have identified|found)/);
  });
});

describe('BANNED_ARTEFACT_TITLES', () => {
  it('contains exactly the four banned titles', () => {
    expect([...BANNED_ARTEFACT_TITLES].sort()).toEqual(
      ['clinical summary', 'handover note', 'referral', 'SBAR'].sort(),
    );
  });
});

describe('copy constants — no judgement or likelihood language', () => {
  const bannedJudgementTerms = [
    'likely',
    'suggests',
    'consistent with',
    'probably',
    'indicates',
    'could be',
    'too high',
    'too low',
    'dangerous',
    'concerning',
  ];

  const copyConstants: Record<string, string> = {
    PERSISTENT_BANNER,
    ARTEFACT_FOOTER_SAMPLE: footer('Margaret Ellis', '25 July 2026'),
    RED_FLAG_HALT_CARD_HEADING: RED_FLAG_HALT_CARD.heading,
    RED_FLAG_HALT_CARD_BODY: RED_FLAG_HALT_CARD.body,
    RED_FLAG_HALT_CARD_PRIMARY_ACTION: RED_FLAG_HALT_CARD.primaryAction,
    RED_FLAG_HALT_CARD_FALLBACK: RED_FLAG_HALT_CARD.fallback,
    SAFEGUARDING_FOOTER,
  };

  it('contains none of the banned judgement/likelihood terms', () => {
    for (const [name, value] of Object.entries(copyConstants)) {
      for (const term of bannedJudgementTerms) {
        expect(value.toLowerCase(), `${name} should not contain "${term}"`).not.toContain(term);
      }
    }
  });

  it('is never itself equal to a banned artefact title', () => {
    const bannedLower = BANNED_ARTEFACT_TITLES.map((t) => t.toLowerCase());
    for (const [name, value] of Object.entries(copyConstants)) {
      expect(
        bannedLower.includes(value.trim().toLowerCase()),
        `${name} should not equal a banned artefact title`,
      ).toBe(false);
    }
  });

  // "urgent" is banned everywhere EXCEPT the persistent banner, where it
  // appears only in its meta-disclaimer sense — "it does not [...] tell you
  // how urgent something is [...] use NHS 111 online". There the word
  // describes what the tool refuses to do; it is never an urgency claim.
  // No other constant gets that exemption.
  it('confines "urgent" to the banner\'s meta-disclaimer usage', () => {
    expect(PERSISTENT_BANNER.toLowerCase()).toContain('urgent');
    for (const [name, value] of Object.entries(copyConstants)) {
      if (name === 'PERSISTENT_BANNER') {
        continue;
      }
      expect(value.toLowerCase(), `${name} should not contain "urgent"`).not.toContain(
        'urgent',
      );
    }
  });

  // THE BOUNDARY, DOCUMENTED AS AN EXECUTABLE FACT: filterOutput is for
  // GENERATED strings; this module is static copy shipped verbatim and is
  // never routed through the filter by any lane. The banner and halt card
  // contain "urgent"/"emergency"/"999" by design (the meta-disclaimer), so
  // the filter — doing its job for generated text — rejects them. If either
  // assertion below ever flips to ok:true, the meta-disclaimer language has
  // been watered down; if someone routes copy through the filter, the app
  // loses its banner. Both directions are wrong. Do not "fix" by relaxing
  // the filter or rewording the copy.
  it('the banner and halt card would FAIL filterOutput — proof they are meta-disclaimer copy, exempt as static, not as allowlisted', () => {
    expect(filterOutput(PERSISTENT_BANNER, []).ok).toBe(false);
    const haltCardProse = [
      RED_FLAG_HALT_CARD.heading,
      RED_FLAG_HALT_CARD.body,
      RED_FLAG_HALT_CARD.primaryAction,
      RED_FLAG_HALT_CARD.fallback,
    ].join(' ');
    expect(filterOutput(haltCardProse, []).ok).toBe(false);
  });

  it('banner uses "urgent" only in the negated meta-disclaimer clauses', () => {
    const occurrences = PERSISTENT_BANNER.match(/urgent/g) ?? [];
    expect(occurrences).toHaveLength(2);
    expect(PERSISTENT_BANNER).toContain('does not assess');
    expect(PERSISTENT_BANNER).toContain('or tell you how urgent something is');
    expect(PERSISTENT_BANNER).toContain(
      'If you need to know how urgent something is, use NHS 111 online',
    );
  });
});
