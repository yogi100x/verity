/**
 * TEMPLATE INTEGRITY.
 *
 * `ArtifactTemplate` is data, not code — that is the claim the whole "one
 * engine, any gatekeeper" pitch rests on. These tests make the claim true
 * rather than aspirational.
 *
 * The cross-check in 'every slot_key used by an artefact exists in its
 * template' is the one that matters: without it, Lane A can fill slots that
 * Lane B never renders, and neither notices until integration.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ArtifactTemplate,
  CaseSnapshot,
  CHC_DOMAIN_NAMES,
  type ChcDomain,
} from '../contracts';
import templates from '../../fixtures/templates.json';
import fixture from '../../fixtures/margaret.json';

const Templates = z.array(ArtifactTemplate);

describe('artifact templates', () => {
  it('conform to the contract', () => {
    expect(() => Templates.parse(templates)).not.toThrow();
  });

  it('both phase-1 templates exist', () => {
    const parsed = Templates.parse(templates);
    const keys = parsed.map((t) => t.key);
    expect(keys).toContain('chc_dst_pack_v1');
    expect(keys).toContain('gp_brief_v1');
  });

  it('slot keys are unique within a template', () => {
    for (const t of Templates.parse(templates)) {
      const keys = t.sections.flatMap((s) => s.slots.map((sl) => sl.key));
      expect(new Set(keys).size, 'duplicate slot key in ' + t.key).toBe(keys.length);
    }
  });

  it('every slot requiring a citation has a gap_prompt or is intentionally exempt', () => {
    // A slot that requires a citation but cannot fall back would render blank.
    // Two exemptions: the framework quote and the cover/method prose, which are
    // fixed copy rather than evidence-driven.
    const exempt = new Set(['drug_therapies.framework_note']);
    for (const t of Templates.parse(templates)) {
      for (const s of t.sections) {
        for (const sl of s.slots) {
          if (!sl.citation_required || exempt.has(sl.key)) continue;
          expect(sl.gap_prompt, 'slot ' + sl.key + ' needs a gap_prompt').toBeTruthy();
        }
      }
    }
  });

  it('THE CROSS-CHECK: every slot_key used by an artefact exists in its template', () => {
    const parsed = Templates.parse(templates);
    const snap = CaseSnapshot.parse(fixture);

    const slotsByTemplate = new Map(
      parsed.map((t) => [
        t.key,
        new Set(t.sections.flatMap((s) => s.slots.map((sl) => sl.key))),
      ]),
    );

    for (const artifact of snap.artifacts) {
      const known = slotsByTemplate.get(artifact.template_key);
      expect(known, 'no template defines ' + artifact.template_key).toBeDefined();
      for (const a of artifact.assertions) {
        expect(
          known!.has(a.slot_key),
          'slot "' + a.slot_key + '" is used by ' + artifact.template_key + ' but no template defines it',
        ).toBe(true);
      }
    }
  });

  it('the CHC pack covers all twelve DST domains, named officially', () => {
    const chc = Templates.parse(templates).find((t) => t.key === 'chc_dst_pack_v1');
    expect(chc).toBeDefined();

    const sectionKeys = new Set(chc!.sections.map((s) => s.key));
    for (const domain of Object.keys(CHC_DOMAIN_NAMES) as ChcDomain[]) {
      expect(sectionKeys.has(domain), 'CHC pack is missing the ' + domain + ' domain').toBe(true);

      const section = chc!.sections.find((s) => s.key === domain)!;
      expect(
        section.title,
        'domain heading must match the official DST name exactly',
      ).toBe(CHC_DOMAIN_NAMES[domain]);
    }
  });

  it('no template slot smuggles in a judgement field', () => {
    // 'suggested_level' is permitted and deliberate — the PRD requires levels to
    // be labelled suggested, never determined. A severity/risk/score slot is not.
    const banned = /severity|urgency|\brisk\b|\bscore\b|\brank\b/i;
    for (const t of Templates.parse(templates)) {
      for (const s of t.sections) {
        for (const sl of s.slots) {
          expect(banned.test(sl.key), 'banned slot key ' + sl.key).toBe(false);
        }
      }
    }
  });

  it('every suggested_level slot says it is suggested, not determined', () => {
    for (const t of Templates.parse(templates)) {
      for (const s of t.sections) {
        for (const sl of s.slots) {
          if (!sl.key.endsWith('suggested_level')) continue;
          expect(
            /suggested|ceiling|no Severe/i.test(sl.label),
            'slot ' + sl.key + ' must not read as a determination',
          ).toBe(true);
        }
      }
    }
  });
});
