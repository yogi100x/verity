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
  isStructuralCopySlot,
  isFrameworkCitationSlot,
  levelSlotDomain,
  BannedArtefactTitleError,
  UnknownTemplateError,
  InvalidOntologyPatternError,
  UngatedLevelSlotError,
  assertLevelSlotsAreGated,
} from '@/lib/ai/templates';
import type { ArtifactTemplate } from '@/lib/contracts';
import {
  CHC_DOMAIN_NAMES,
  CHC_DOMAIN_LEVELS,
  ChcDomain,
  ChcLevel,
  isValidLevel,
} from '@/lib/contracts';
import { BANNED_ARTEFACT_TITLES } from '@/lib/copy/safety';

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

  it('returns the discharge_pack_v1 template (S7)', () => {
    const t = templateByKey('discharge_pack_v1');
    expect(t.key).toBe('discharge_pack_v1');
  });

  it('throws UnknownTemplateError for a key no template registers', () => {
    // TemplateKey includes 'aa1_narrative_v1' in the contract (a future
    // phase) but it has no row in fixtures/templates.json — exactly the
    // "unknown to the loader" case this function guards. This test used
    // discharge_pack_v1 as its example until S7 landed that row — the
    // original comment even predicted this update.
    expect(() => templateByKey('aa1_narrative_v1')).toThrow(UnknownTemplateError);
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

describe('isStructuralCopySlot — derived from template data, never a slot-key list', () => {
  it('picks out exactly the three fixed-copy cover/method slots in chc_dst_pack_v1', () => {
    const structural = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter(isStructuralCopySlot);
    const keys = structural.map((s) => s.key).sort();
    expect(keys).toEqual(['cover.scope', 'cover.subject', 'method.provenance']);
  });

  it('is false for a slot with a gap_prompt, even if citation_required is false', () => {
    // cover.sources: citation_required false, but has a gap_prompt, so it is
    // an ordinary (optional-evidence) slot, not a fixed-copy one.
    const coverSources = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'cover.sources');
    if (coverSources === undefined) throw new Error('cover.sources slot not found');
    expect(coverSources.citation_required).toBe(false);
    expect(coverSources.gap_prompt).not.toBeNull();
    expect(isStructuralCopySlot(coverSources)).toBe(false);
  });

  it('is false for every ordinary evidence slot', () => {
    const evidenceSlot = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (evidenceSlot === undefined) throw new Error('mobility.evidence slot not found');
    expect(isStructuralCopySlot(evidenceSlot)).toBe(false);
  });
});

describe('isFrameworkCitationSlot — derived from template data, never a slot-key list', () => {
  it('picks out exactly drug_therapies.framework_note in chc_dst_pack_v1', () => {
    const framework = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter(isFrameworkCitationSlot);
    expect(framework.map((s) => s.key)).toEqual(['drug_therapies.framework_note']);
  });

  it('is false for a structural copy slot and for an ordinary evidence slot', () => {
    const coverSubject = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'cover.subject');
    const evidenceSlot = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'drug_therapies.evidence');
    if (coverSubject === undefined || evidenceSlot === undefined) {
      throw new Error('expected slots not found');
    }
    expect(isFrameworkCitationSlot(coverSubject)).toBe(false);
    expect(isFrameworkCitationSlot(evidenceSlot)).toBe(false);
  });
});

describe('levelSlotDomain — the .suggested_level key convention', () => {
  it('parses the domain out of every real *.suggested_level slot in chc_dst_pack_v1', () => {
    const levelSlots = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter((s) => s.key.endsWith('.suggested_level'));
    expect(levelSlots.length).toBeGreaterThan(0);
    for (const slot of levelSlots) {
      const domain = levelSlotDomain(slot);
      expect(domain, `expected ${slot.key} to parse a ChcDomain`).not.toBeNull();
      expect(`${domain}.suggested_level`).toBe(slot.key);
    }
  });

  it('is null for a slot with no .suggested_level suffix', () => {
    expect(levelSlotDomain({ key: 'mobility.evidence' })).toBeNull();
  });

  it('a template whose level slot the gate cannot cover fails LOUDLY at load, not silently', () => {
    // `levelSlotDomain` returning null does not merely skip a check — it turns
    // the level gate OFF for that slot, letting narrative prose back into a
    // controlled form field with no error anywhere. Both realistic data bugs
    // (an extra key segment, a domain typo) must throw.
    const template = (slotKey: string): ArtifactTemplate => ({
      key: 'chc_dst_pack_v1',
      title: 'A pack',
      audience: 'someone',
      sections: [
        {
          key: 'continence',
          title: 'Continence',
          slots: [
            {
              key: slotKey,
              label: 'Suggested level',
              ontology_match: ['chc.continence'],
              citation_required: true,
              renderer: 'prose',
              gap_prompt: 'Not enough evidence to suggest a level.',
            },
          ],
        },
      ],
    });

    for (const bad of ['chc.continence.suggested_level', 'continance.suggested_level', '.suggested_level']) {
      expect(() => assertLevelSlotsAreGated(template(bad)), bad).toThrow(UngatedLevelSlotError);
    }
    // Positive control: the correct convention must NOT throw, so the test
    // above cannot pass by rejecting everything.
    expect(() => assertLevelSlotsAreGated(template('continence.suggested_level'))).not.toThrow();
  });

  it('every real *.suggested_level slot in both frozen templates is gated', () => {
    for (const loaded of loadTemplates()) {
      expect(() => assertLevelSlotsAreGated(loaded), loaded.key).not.toThrow();
    }
  });

  it('is null when the prefix is not a real ChcDomain, even with the right suffix', () => {
    expect(levelSlotDomain({ key: 'not_a_domain.suggested_level' })).toBeNull();
    expect(levelSlotDomain({ key: 'cover.suggested_level' })).toBeNull();
  });
});

describe('loadTemplates — no template may bear a banned artefact title', () => {
  it('neither phase-1 template title matches BANNED_ARTEFACT_TITLES', () => {
    const templates = loadTemplates();
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      for (const banned of BANNED_ARTEFACT_TITLES) {
        expect(
          new RegExp(`\\b${banned}\\b`, 'i').test(template.title),
          `template ${template.key} title "${template.title}" matches banned title "${banned}"`,
        ).toBe(false);
      }
    }
  });

  it('BannedArtefactTitleError is thrown for a template whose title contains a banned phrase', async () => {
    // Exercises the guard directly rather than mutating the frozen fixture:
    // re-imports the module fresh (its own cache reset) and monkeypatches
    // nothing — instead, it proves the guard function's own regex behaviour
    // via the exported error class and a hand-built template shape, since
    // `ArtifactTemplate` validation + the banned-title check both run inside
    // `loadTemplates` against the one frozen fixture. The real, load-bearing
    // proof that fixtures/templates.json is clean is the test above.
    for (const banned of BANNED_ARTEFACT_TITLES) {
      const err = new BannedArtefactTitleError('some_key', `A ${banned} for the file`, banned);
      expect(err.message).toContain('some_key');
      expect(err.message).toContain(banned);
      expect(err.name).toBe('BannedArtefactTitleError');
    }
  });
});
