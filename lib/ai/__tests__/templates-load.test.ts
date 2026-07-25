/**
 * Template loading and the small primitives every renderer depends on:
 * `loadTemplates`, `templateByKey`, `ontologyMatches`, `slotsOf`.
 *
 * `lib/__tests__/templates.test.ts` already proves the deep structural
 * invariants (cross-check against the fixture, CHC domain headings match
 * `CHC_DOMAIN_NAMES` exactly, no judgement slot keys). This file does not
 * duplicate that — it proves the loader/lookup surface in `lib/ai/templates.ts`
 * behaves correctly against that same frozen data.
 */

import { describe, it, expect } from 'vitest';
import {
  loadTemplates,
  templateByKey,
  ontologyMatches,
  slotsOf,
  levelsNotAvailableInDomain,
  UnknownTemplateError,
  InvalidOntologyPatternError,
} from '@/lib/ai/templates';
import {
  CHC_DOMAIN_NAMES,
  CHC_DOMAIN_LEVELS,
  ChcDomain,
  ChcLevel,
  isValidLevel,
} from '@/lib/contracts';

describe('loadTemplates', () => {
  it('loads and parses both phase-1 templates', () => {
    const templates = loadTemplates();
    const keys = templates.map((t) => t.key);
    expect(keys).toContain('chc_dst_pack_v1');
    expect(keys).toContain('gp_brief_v1');
  });
});

describe('templateByKey', () => {
  it('returns the chc_dst_pack_v1 template', () => {
    const t = templateByKey('chc_dst_pack_v1');
    expect(t.key).toBe('chc_dst_pack_v1');
  });

  it('returns the gp_brief_v1 template', () => {
    const t = templateByKey('gp_brief_v1');
    expect(t.key).toBe('gp_brief_v1');
  });

  it('throws UnknownTemplateError for a key no template registers', () => {
    // TemplateKey includes 'discharge_pack_v1' and 'aa1_narrative_v1' in the
    // contract (future phases) but neither has a row in fixtures/templates.json
    // yet — exactly the "unknown to the loader" case this function guards.
    expect(() => templateByKey('discharge_pack_v1')).toThrow(UnknownTemplateError);
  });
});

describe('slotsOf', () => {
  it('chc_dst_pack_v1 has the real slot and section counts — a template change must break this', () => {
    const slots = slotsOf(templateByKey('chc_dst_pack_v1'));
    expect(slots).toHaveLength(31);
    const sectionKeys = new Set(slots.map((s) => s.section.key));
    expect(sectionKeys.size).toBe(14);
  });

  it('gp_brief_v1 has the real slot and section counts', () => {
    const slots = slotsOf(templateByKey('gp_brief_v1'));
    expect(slots).toHaveLength(8);
    const sectionKeys = new Set(slots.map((s) => s.section.key));
    expect(sectionKeys.size).toBe(5);
  });

  it('every returned entry carries the section its slot actually lives in', () => {
    const template = templateByKey('chc_dst_pack_v1');
    for (const { section, slot } of slotsOf(template)) {
      const owningSection = template.sections.find((s) =>
        s.slots.some((sl) => sl.key === slot.key),
      );
      expect(owningSection).toBeDefined();
      expect(section.key).toBe(owningSection?.key);
      expect(section.title).toBe(owningSection?.title);
    }
  });
});

describe('ontologyMatches', () => {
  it('a trailing-wildcard pattern matches a key strictly under its prefix', () => {
    expect(ontologyMatches('medication.*', 'medication.furosemide')).toBe(true);
  });

  it('does not match a different plural prefix', () => {
    expect(ontologyMatches('medication.*', 'medications.foo')).toBe(false);
  });

  it('does not match the bare prefix with no suffix', () => {
    expect(ontologyMatches('medication.*', 'medication')).toBe(false);
  });

  it('does not match a key that merely starts with the same characters, no dot', () => {
    expect(ontologyMatches('medication.*', 'medicationfoo')).toBe(false);
  });

  it('an exact pattern matches only itself', () => {
    expect(ontologyMatches('chc.mobility', 'chc.mobility')).toBe(true);
    expect(ontologyMatches('chc.mobility', 'chc.mobility.extra')).toBe(false);
    expect(ontologyMatches('chc.mobility', 'chc.mobilit')).toBe(false);
  });

  it('a key containing regex metacharacters is matched literally, not as a pattern', () => {
    // No regex is ever compiled from either side, so metacharacters in the KEY
    // cannot widen or narrow the match.
    expect(ontologyMatches('medication.*', 'medication.a+b(c)')).toBe(true);
    expect(ontologyMatches('medication.a+b(c)', 'medication.a+b(c)')).toBe(true);
    expect(ontologyMatches('medication.a+b(c)', 'medication.aab(c)')).toBe(false);
    expect(ontologyMatches('medication.a(b)c', 'medication.anything')).toBe(false);
    expect(ontologyMatches('medication.^$', 'medication.^$')).toBe(true);
  });

  it('THROWS on any wildcard use it cannot honour, instead of matching nothing forever', () => {
    // These used to fall through to exact string comparison and therefore
    // match nothing at all — a template typo became a permanently empty slot,
    // indistinguishable from "no evidence yet". Templates are frozen data; a
    // malformed pattern is a data bug and must be loud.
    expect(() => ontologyMatches('medication.*.dose', 'medication.furosemide.dose')).toThrow(
      InvalidOntologyPatternError,
    );
    expect(() => ontologyMatches('*', 'medication.furosemide')).toThrow(InvalidOntologyPatternError);
    expect(() => ontologyMatches('*.dose', 'medication.dose')).toThrow(InvalidOntologyPatternError);
    expect(() => ontologyMatches('.*', 'medication.furosemide')).toThrow(
      InvalidOntologyPatternError,
    );
    expect(() => ontologyMatches('medication.**', 'medication.x')).toThrow(
      InvalidOntologyPatternError,
    );
    expect(() => ontologyMatches('', 'medication.furosemide')).toThrow(InvalidOntologyPatternError);
  });

  it('every pattern in the frozen templates is one this matcher accepts', () => {
    // The loud failure above is only safe if the committed data is clean.
    for (const template of loadTemplates()) {
      for (const { slot } of slotsOf(template)) {
        for (const pattern of slot.ontology_match) {
          expect(() => ontologyMatches(pattern, 'probe.key'), `pattern ${pattern}`).not.toThrow();
        }
      }
    }
  });
});

describe('levelsNotAvailableInDomain — the pack may never contradict the official form', () => {
  it('flags a level the domain does not have, and only in that domain', () => {
    // Continence caps at High on the real DST; breathing runs to Priority.
    expect(levelsNotAvailableInDomain('continence', ['severe'])).toEqual(['severe']);
    expect(levelsNotAvailableInDomain('breathing', ['severe'])).toEqual([]);
    // Altered states of consciousness skips Severe entirely yet reaches Priority.
    expect(levelsNotAvailableInDomain('altered_consciousness', ['severe'])).toEqual(['severe']);
    expect(levelsNotAvailableInDomain('altered_consciousness', ['priority'])).toEqual([]);
    expect(levelsNotAvailableInDomain('communication', ['Severe'])).toEqual(['Severe']);
    expect(levelsNotAvailableInDomain('psychological_emotional', ['  severe  '])).toEqual([
      'severe',
    ]);
  });

  it('every domain and every level agrees with CHC_DOMAIN_LEVELS — no second copy of the data', () => {
    for (const domain of Object.keys(CHC_DOMAIN_LEVELS)) {
      for (const level of ChcLevel.options) {
        const flagged = levelsNotAvailableInDomain(domain, [level]);
        const available = isValidLevel(ChcDomain.parse(domain), level);
        expect(flagged, `${domain} / ${level}`).toEqual(available ? [] : [level]);
      }
    }
  });

  it('says nothing about narrative evidence, or about a non-domain section', () => {
    // "high" appears inside the sentence but the value is not a level.
    expect(
      levelsNotAvailableInDomain('continence', ['Continence needs are high overnight per the RN']),
    ).toEqual([]);
    expect(levelsNotAvailableInDomain('continence', ['Disputed — 3 sources disagree'])).toEqual([]);
    // cover and method are not DST domains.
    expect(levelsNotAvailableInDomain('cover', ['severe'])).toEqual([]);
    expect(levelsNotAvailableInDomain('method', ['severe'])).toEqual([]);
  });
});

describe('CHC section titles are the official domain names, never hand-typed', () => {
  it('every chc_dst_pack_v1 section whose key is a ChcDomain has the matching official title', () => {
    const template = templateByKey('chc_dst_pack_v1');
    // Indexed through a widened record rather than `section.key as ChcDomain`:
    // `as` forces a shape the compiler cannot check, and it is banned.
    const officialNames: Readonly<Record<string, string | undefined>> = CHC_DOMAIN_NAMES;
    let checked = 0;
    for (const section of template.sections) {
      const official = officialNames[section.key];
      if (official === undefined) continue;
      checked += 1;
      expect(section.title).toBe(official);
    }
    // cover + method are the two non-domain sections in a 14-section template.
    expect(checked).toBe(12);
  });
});
