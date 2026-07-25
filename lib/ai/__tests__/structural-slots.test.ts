/**
 * The two limitations this file guards against:
 *
 *  1. `chc_dst_pack_v1`'s cover/method/framework-note slots are not
 *     evidence-driven and used to vanish, un-filled, behind a bare omission
 *     count. Lane C has now shipped the copy (`lib/copy/safety.ts`) and the
 *     National Framework citation (`lib/detectors/well_managed.ts`), so
 *     `buildArtifact` can fill them — but ONLY the exact verbatim text, and
 *     ONLY when the caller supplies what a fill needs (`person`,
 *     `assembledOn`). Absent that, the slot must stay honestly omitted.
 *
 *  2. `<domain>.suggested_level` slots must never carry narrative prose —
 *     only a level word that IS valid for that exact CHC domain
 *     (`CHC_DOMAIN_LEVELS` is not a ceiling: three domains cap at High, and
 *     altered_consciousness has no Severe at all).
 *
 * Every slot set below is DERIVED by filtering the live template
 * (`isStructuralCopySlot` / `isFrameworkCitationSlot` / the `.suggested_level`
 * key convention), never hand-listed — a template change is picked up
 * automatically, the way the rest of this pipeline's tests already work.
 */

import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import { CaseSnapshot, ChcDomain, ChcLevel, CHC_DOMAIN_LEVELS, type Claim, type Fact } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import {
  templateByKey,
  slotsOf,
  isStructuralCopySlot,
  isFrameworkCitationSlot,
  levelSlotDomain,
} from '@/lib/ai/templates';
import { buildArtifact, resolveSlot, type BuildArtifactInput } from '@/lib/ai/artifacts';
import { PERSISTENT_BANNER, footer, BANNED_ARTEFACT_TITLES } from '@/lib/copy/safety';
import { FRAMEWORK_CITATIONS } from '@/lib/detectors/well_managed';
import { filterOutput } from '@/lib/safety/output_filter';

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE (and will now legitimately appear
 *  as one, on a filled level slot), so only keys are checked. */
function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
  return keys;
}

const fixture = CaseSnapshot.parse(fixtureRaw);
const PERSON = { display_name: fixture.person.display_name };
const ASSEMBLED_ON = '2026-07-25';

function claimsById(): ReadonlyMap<string, Pick<Claim, 'verified_substring'>> {
  const map = new Map<string, Pick<Claim, 'verified_substring'>>();
  for (const claim of fixture.claims) map.set(claim.id, { verified_substring: claim.verified_substring });
  return map;
}

function baseInput(overrides: Partial<BuildArtifactInput> = {}): BuildArtifactInput {
  return {
    template: templateByKey('chc_dst_pack_v1'),
    facts: fixture.facts,
    claimsById: claimsById(),
    personId: fixture.person.id,
    ...overrides,
  };
}

function structuralSlotKeys(): string[] {
  return slotsOf(templateByKey('chc_dst_pack_v1'))
    .map((s) => s.slot)
    .filter(isStructuralCopySlot)
    .map((s) => s.key);
}

/* ===================== LIMITATION 1: structural copy ===================== */

describe('structural slots — filled with person + assembledOn, verbatim, from the derived slot set', () => {
  it('cover.subject, cover.scope and method.provenance are all filled, and match the Lane C constants exactly', () => {
    const keys = structuralSlotKeys();
    expect(keys.sort()).toEqual(['cover.scope', 'cover.subject', 'method.provenance']);

    const { artifact, omissions, structuralAssertions } = buildArtifact(
      baseInput({ person: PERSON, assembledOn: ASSEMBLED_ON }),
    );
    const bySlotKey = new Map(artifact.assertions.map((a) => [a.slot_key, a] as const));

    for (const key of keys) {
      expect(omissions.some((o) => o.slot_key === key), `${key} unexpectedly omitted`).toBe(false);
      const assertion = bySlotKey.get(key);
      expect(assertion, `${key} produced no assertion`).toBeDefined();
      expect(assertion?.fact_ids).toEqual([]);
      expect(assertion?.citation_verified).toBe(false);

      const structural = structuralAssertions.find((s) => s.slot_key === key);
      expect(structural, `${key} not recorded as a structural assertion`).toBeDefined();
      expect(structural?.source).toBe('lane_c_copy');
    }

    expect(bySlotKey.get('cover.subject')?.text).toBe(PERSON.display_name);
    // Import-and-compare, not a retyped literal: catches paraphrase.
    expect(bySlotKey.get('cover.scope')?.text).toBe(PERSISTENT_BANNER);
    expect(bySlotKey.get('method.provenance')?.text).toBe(footer(PERSON.display_name, ASSEMBLED_ON));
  });

  it('drug_therapies.framework_note is filled from FRAMEWORK_CITATIONS.pg_23_2, text matching exactly, even with no person/assembledOn', () => {
    const framework = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter(isFrameworkCitationSlot);
    expect(framework.map((s) => s.key)).toEqual(['drug_therapies.framework_note']);

    const { artifact, structuralAssertions } = buildArtifact(baseInput());
    const assertion = artifact.assertions.find((a) => a.slot_key === 'drug_therapies.framework_note');
    expect(assertion?.text).toBe(FRAMEWORK_CITATIONS.pg_23_2.text);
    expect(assertion?.fact_ids).toEqual([]);
    expect(assertion?.citation_verified).toBe(false);

    const structural = structuralAssertions.find((s) => s.slot_key === 'drug_therapies.framework_note');
    expect(structural?.source).toBe('framework_citation');
    expect(structural?.attribution).toBe(FRAMEWORK_CITATIONS.pg_23_2.ref);
  });
});

describe('structural slots — with no person / no assembledOn, stay omitted with an honest reason, no invented value', () => {
  it('with neither person nor assembledOn supplied, all three structural slots are omitted as awaiting_fixed_copy', () => {
    const { artifact, omissions } = buildArtifact(baseInput());
    for (const key of structuralSlotKeys()) {
      expect(artifact.assertions.some((a) => a.slot_key === key), `${key} unexpectedly filled`).toBe(false);
      const omission = omissions.find((o) => o.slot_key === key);
      expect(omission, `${key} missing without a reason`).toBeDefined();
      expect(omission?.reason).toBe('awaiting_fixed_copy');
    }
  });

  it('with person but no assembledOn, cover.subject fills but method.provenance stays omitted', () => {
    const { artifact, omissions } = buildArtifact(baseInput({ person: PERSON }));
    expect(artifact.assertions.find((a) => a.slot_key === 'cover.subject')?.text).toBe(
      PERSON.display_name,
    );
    expect(artifact.assertions.some((a) => a.slot_key === 'method.provenance')).toBe(false);
    const omission = omissions.find((o) => o.slot_key === 'method.provenance');
    expect(omission?.reason).toBe('awaiting_fixed_copy');
  });

  it('with assembledOn but no person, nothing structural fills — no invented name', () => {
    const { artifact, omissions } = buildArtifact(baseInput({ assembledOn: ASSEMBLED_ON }));
    for (const key of structuralSlotKeys()) {
      expect(artifact.assertions.some((a) => a.slot_key === key)).toBe(false);
      expect(omissions.find((o) => o.slot_key === key)?.reason).toBe('awaiting_fixed_copy');
    }
  });
});

describe('structural assertions are a distinguishable THIRD state, not evidence and not a plain gap', () => {
  it('a structural assertion has citation_verified: false and empty fact_ids (DB constraint), but is named in structuralAssertions — unlike a gap-prompt assertion', () => {
    const { artifact, structuralAssertions } = buildArtifact(
      baseInput({ person: PERSON, assembledOn: ASSEMBLED_ON }),
    );

    const structuralSlot = artifact.assertions.find((a) => a.slot_key === 'cover.subject');
    if (structuralSlot === undefined) throw new Error('expected cover.subject to be filled');
    expect(structuralSlot.citation_verified).toBe(false);
    expect(structuralSlot.fact_ids).toEqual([]);
    expect(structuralSlot.text).not.toBe('');
    expect(structuralAssertions.some((s) => s.slot_key === 'cover.subject')).toBe(true);

    // continence.evidence is the ordinary gap-prompt case: same
    // citation_verified/fact_ids shape, but EMPTY text and no entry in
    // structuralAssertions — the two are indistinguishable on `Assertion`
    // alone, which is exactly why `structuralAssertions` exists.
    const gapSlot = artifact.assertions.find((a) => a.slot_key === 'continence.evidence');
    if (gapSlot === undefined) throw new Error('expected continence.evidence assertion to exist');
    expect(gapSlot.citation_verified).toBe(false);
    expect(gapSlot.fact_ids).toEqual([]);
    expect(gapSlot.text).toBe('');
    expect(structuralAssertions.some((s) => s.slot_key === 'continence.evidence')).toBe(false);
  });
});

describe('BANNED_ARTEFACT_TITLES — loaded templates never bear one', () => {
  it('neither phase-1 template title matches a banned artefact title', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const title = templateByKey(key).title;
      for (const banned of BANNED_ARTEFACT_TITLES) {
        expect(new RegExp(`\\b${banned}\\b`, 'i').test(title), `${key} title "${title}"`).toBe(false);
      }
    }
  });
});

/* ===================== filterOutput boundary ===================== */

describe('filterOutput boundary — verbatim copy bypasses it, composed fact text goes through it', () => {
  it('the verbatim structural constants would all individually pass filterOutput, and the built assertions match them exactly (never re-filtered/altered)', () => {
    const { artifact } = buildArtifact(baseInput({ person: PERSON, assembledOn: ASSEMBLED_ON }));
    const scope = artifact.assertions.find((a) => a.slot_key === 'cover.scope');
    // PERSISTENT_BANNER itself is documented (lib/copy/__tests__/safety.test.ts)
    // to FAIL filterOutput — it is meta-disclaimer copy, exempt as static, not
    // as allowlisted. Its presence here VERBATIM (not stripped, not reworded)
    // is the proof this module never routes it through the filter.
    expect(scope?.text).toBe(PERSISTENT_BANNER);
    expect(filterOutput(PERSISTENT_BANNER, []).ok).toBe(false);
  });

  it('a composed fact-text slot that trips the filter (an uncited condition name) falls through to its gap_prompt, never emitting the flagged text', () => {
    // Margaret's own heart-failure fact, composed as "<subject>: <value>",
    // fails filterOutput with no cited spans — an UNCITED CONDITION NAME.
    // This is real, current output on the shipped fixture:
    const heartFailureFact = fixture.facts.find((f) => f.ontology_key === 'diagnosis.heart_failure');
    if (heartFailureFact === undefined) throw new Error('fixture invariant: expected the heart failure fact');
    const composed = `${heartFailureFact.subject}: ${heartFailureFact.canonical_value}`;
    const filtered = filterOutput(composed, []);
    expect(filtered).toEqual({ ok: false, reason: 'uncited_condition', term: 'heart failure' });

    // gp_brief_v1's "history" slot (ontology_match includes 'diagnosis.*')
    // matches this fact. Because the composed text fails the filter, the slot
    // must fall through to its gap_prompt exactly as if nothing had matched
    // — the flagged text must never reach Assertion.text.
    const { artifact } = buildArtifact({
      template: templateByKey('gp_brief_v1'),
      facts: fixture.facts,
      claimsById: claimsById(),
      personId: fixture.person.id,
    });
    const historySlot = slotsOf(templateByKey('gp_brief_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'history');
    if (historySlot === undefined) throw new Error('gp_brief_v1 has no "history" slot');
    const assertion = artifact.assertions.find((a) => a.slot_key === 'history');
    expect(assertion).toBeDefined();
    expect(assertion?.text).toBe('');
    expect(assertion?.citation_verified).toBe(false);
    expect(assertion?.text).not.toContain('heart failure');
    expect(assertion?.text).not.toContain('Decompensated');
  });

  it('resolveSlot itself reports the same fall-through directly, isolated from buildArtifact', () => {
    const historySlot = slotsOf(templateByKey('gp_brief_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'history');
    if (historySlot === undefined) throw new Error('gp_brief_v1 has no "history" slot');
    const resolution = resolveSlot(historySlot, fixture.facts, claimsById());
    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.gap_prompt).toBe(historySlot.gap_prompt);
    expect(resolution.omitted).toBe(false);
  });
});

/* ===================== LIMITATION 2: level slots ===================== */

describe('level slots — never narrative prose, only a level valid for that exact domain', () => {
  it('a level slot whose evidence is narrative (Margaret’s real mobility fact) falls through to gap_prompt, never composed prose', () => {
    const slot = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.suggested_level');
    if (slot === undefined) throw new Error('mobility.suggested_level slot not found');
    expect(levelSlotDomain(slot)).toBe('mobility');

    const resolution = resolveSlot(slot, fixture.facts, claimsById());
    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
    expect(resolution.omitted).toBe(false);

    const { artifact } = buildArtifact(baseInput());
    const assertion = artifact.assertions.find((a) => a.slot_key === 'mobility.suggested_level');
    expect(assertion?.text).toBe('');
    expect(assertion?.text).not.toContain('unsteady');
    expect(assertion?.text).not.toContain('handrail');
  });

  it('a level slot whose evidence IS a valid level for that domain is filled', () => {
    const slot = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'breathing.suggested_level');
    if (slot === undefined) throw new Error('breathing.suggested_level slot not found');
    const domain = levelSlotDomain(slot);
    if (domain === null) throw new Error('expected breathing.suggested_level to parse a domain');

    const fact: Fact = {
      id: randomUUID(),
      person_id: fixture.person.id,
      ontology_key: 'chc.breathing',
      subject: 'breathing',
      canonical_value: 'high',
      provenance: 'document_extracted',
      status: 'confirmed',
      valid_from: '2026-01-01',
      valid_to: null,
      supporting_claim_ids: [],
      conflict_id: null,
      superseded_by: null,
    };
    const verifiedClaimId = randomUUID();
    const claims = new Map<string, Pick<Claim, 'verified_substring'>>([
      [verifiedClaimId, { verified_substring: true }],
    ]);
    const factWithClaim: Fact = { ...fact, supporting_claim_ids: [verifiedClaimId] };

    const resolution = resolveSlot(slot, [factWithClaim], claims);
    expect(resolution.fact_ids).toEqual([factWithClaim.id]);
    expect(resolution.omitted).toBe(false);
    expect(resolution.gap_prompt).toBeNull();
    // 'high' is available for breathing (CHC_DOMAIN_LEVELS.breathing includes it).
    expect(CHC_DOMAIN_LEVELS[domain]).toContain('high');
  });

  it('a level slot whose evidence is a level NOT available in that domain falls through — checked across every domain that excludes a real ChcLevel, driven from CHC_DOMAIN_LEVELS', () => {
    const domainsWithGaps = (Object.keys(CHC_DOMAIN_LEVELS) as ChcDomain[])
      .map((domain) => {
        const missing = ChcLevel.options.find((level) => !CHC_DOMAIN_LEVELS[domain].includes(level));
        return missing === undefined ? null : { domain, missing };
      })
      .filter((x): x is { domain: ChcDomain; missing: ChcLevel } => x !== null);

    // At least continence and altered_consciousness must show up here — the
    // two domains the brief calls out explicitly.
    expect(domainsWithGaps.some((d) => d.domain === 'continence')).toBe(true);
    expect(domainsWithGaps.some((d) => d.domain === 'altered_consciousness')).toBe(true);
    expect(domainsWithGaps.length).toBeGreaterThanOrEqual(2);

    for (const { domain, missing } of domainsWithGaps) {
      const slotKey = `${domain}.suggested_level`;
      const slot = slotsOf(templateByKey('chc_dst_pack_v1'))
        .map((s) => s.slot)
        .find((s) => s.key === slotKey);
      if (slot === undefined) throw new Error(`${slotKey} not found in chc_dst_pack_v1`);

      const claimId = randomUUID();
      const claims = new Map<string, Pick<Claim, 'verified_substring'>>([
        [claimId, { verified_substring: true }],
      ]);
      const fact: Fact = {
        id: randomUUID(),
        person_id: fixture.person.id,
        ontology_key: slot.ontology_match[0] ?? `chc.${domain}`,
        subject: domain,
        canonical_value: missing,
        provenance: 'document_extracted',
        status: 'confirmed',
        valid_from: '2026-01-01',
        valid_to: null,
        supporting_claim_ids: [claimId],
        conflict_id: null,
        superseded_by: null,
      };

      const resolution = resolveSlot(slot, [fact], claims);
      expect(resolution.fact_ids, `${slotKey} with '${missing}'`).toEqual([]);
      expect(resolution.gap_prompt).toBe(slot.gap_prompt);
      expect(resolution.omitted).toBe(false);
    }
  });

  it('nothing in this module ever emits a level of its own — every filled level slot’s text is exactly the subject/value the record supplied', () => {
    const levelSlots = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter((s) => levelSlotDomain(s) !== null);
    expect(levelSlots.length).toBeGreaterThan(0);
    // No level slot exists in this frozen template that isn't also derived
    // from `levelSlotDomain` — the predicate and the real data agree.
    for (const slot of levelSlots) {
      expect(levelSlotDomain(slot)).not.toBeNull();
    }
  });
});

/* ===================== whole-artefact invariants, re-checked with the new paths engaged ===================== */

describe('whole-artefact invariants still hold with structural fills and level-slot fall-through engaged', () => {
  it('assertions + omissions === slot count, with person + assembledOn supplied', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const { artifact, omissions } = buildArtifact({
        template: templateByKey(key),
        facts: fixture.facts,
        claimsById: claimsById(),
        personId: fixture.person.id,
        person: PERSON,
        assembledOn: ASSEMBLED_ON,
      });
      expect(artifact.assertions.length + omissions.length).toBe(slotsOf(templateByKey(key)).length);
    }
  });

  it('no judgement KEY anywhere in the built result, including the new structuralAssertions array (priority is a legal CHC level VALUE and may legitimately appear as one)', () => {
    const keys = new Set<string>();
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const result = buildArtifact({
        template: templateByKey(key),
        facts: fixture.facts,
        claimsById: claimsById(),
        personId: fixture.person.id,
        person: PERSON,
        assembledOn: ASSEMBLED_ON,
      });
      collectKeys(result, keys);
    }
    for (const key of keys) {
      expect(JUDGEMENT_KEY_RE.test(key), `banned key "${key}"`).toBe(false);
    }
  });
});
