/**
 * `resolveSlot` / `buildArtifact` — the load-bearing tests for the central
 * rule: a slot resolves only to facts backed by at least one claim with
 * `verified_substring === true`; otherwise it falls through to `gap_prompt`,
 * NEVER to invented text. Built against the real fixture wherever possible,
 * per the brief.
 */

import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  Assertion,
  CaseSnapshot,
  type Artifact,
  type Claim,
  type Fact,
} from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import { templateByKey, slotsOf } from '@/lib/ai/templates';
import { resolveSlot, buildArtifact, type BuildArtifactInput } from '@/lib/ai/artifacts';

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;
const JUDGEMENT_LANGUAGE_RE =
  /\b(urgent|urgently|immediately|likely|suggests|probably|triage|severe|serious|critical)\b/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked —
 *  matching the convention in lib/ai/__tests__/facts.test.ts. */
function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
}

const fixture = CaseSnapshot.parse(fixtureRaw);

function claimsById(): ReadonlyMap<string, Pick<Claim, 'verified_substring'>> {
  const map = new Map<string, Pick<Claim, 'verified_substring'>>();
  for (const claim of fixture.claims) {
    map.set(claim.id, { verified_substring: claim.verified_substring });
  }
  return map;
}

/** A minimal, well-formed Fact for constructing scenarios the fixture does
 *  not already contain (a superseded-only match, an unverified-only match). */
function makeFact(overrides: Partial<Fact> & Pick<Fact, 'ontology_key' | 'subject'>): Fact {
  return {
    id: randomUUID(),
    person_id: fixture.person.id,
    canonical_value: 'placeholder value',
    provenance: 'document_extracted',
    status: 'confirmed',
    valid_from: '2026-01-01',
    valid_to: null,
    supporting_claim_ids: [],
    conflict_id: null,
    superseded_by: null,
    ...overrides,
  };
}

describe('resolveSlot — the fixture proves the fall-through path', () => {
  it('continence.evidence has no backing fact and renders the gap_prompt verbatim, never invented text', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'continence.evidence');
    if (slot === undefined) throw new Error('continence.evidence slot not found');

    const resolution = resolveSlot(slot, fixture.facts, claimsById());

    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.omitted).toBe(false);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
    expect(slot.gap_prompt).toBeTruthy();
  });
});

describe('resolveSlot — S6: a superseded fact must never fill a slot', () => {
  it('falls through to gap_prompt when the only ontology match is superseded', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (slot === undefined) throw new Error('mobility.evidence slot not found');

    const verifiedClaimId = randomUUID();
    const claims = new Map<string, Pick<Claim, 'verified_substring'>>([
      [verifiedClaimId, { verified_substring: true }],
    ]);

    const successorId = randomUUID();
    const supersededFact = makeFact({
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      canonical_value: 'Unsteady on stairs',
      valid_from: '2026-01-01',
      valid_to: '2026-02-01',
      superseded_by: successorId,
      supporting_claim_ids: [verifiedClaimId],
    });

    // Its claim is genuinely verified — if the fact were still live it would
    // back the slot. Only supersession stands in the way.
    const resolution = resolveSlot(slot, [supersededFact], claims);

    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.omitted).toBe(false);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
  });
});

describe('resolveSlot — an unverified-only claim does not back a fact', () => {
  it('falls through to gap_prompt when the only supporting claim is unverified', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (slot === undefined) throw new Error('mobility.evidence slot not found');

    const unverifiedClaimId = randomUUID();
    const claims = new Map<string, Pick<Claim, 'verified_substring'>>([
      [unverifiedClaimId, { verified_substring: false }],
    ]);

    const fact = makeFact({
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      supporting_claim_ids: [unverifiedClaimId],
    });

    const resolution = resolveSlot(slot, [fact], claims);

    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
  });

  it('also falls through when the supporting claim id is not in claimsById at all', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (slot === undefined) throw new Error('mobility.evidence slot not found');

    const fact = makeFact({
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      supporting_claim_ids: [randomUUID()],
    });

    const resolution = resolveSlot(slot, [fact], new Map());

    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
  });
});

describe('resolveSlot — a live fact and a superseded fact matching the same slot', () => {
  it('resolves to the live fact ONLY — the superseded id never reaches fact_ids', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (slot === undefined) throw new Error('mobility.evidence slot not found');

    const verifiedClaimId = randomUUID();
    const claims = new Map<string, Pick<Claim, 'verified_substring'>>([
      [verifiedClaimId, { verified_substring: true }],
    ]);

    const liveFact = makeFact({
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      canonical_value: 'Now uses a frame indoors',
      valid_from: '2026-02-01',
      supporting_claim_ids: [verifiedClaimId],
    });
    const supersededFact = makeFact({
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      canonical_value: 'Unsteady on stairs',
      valid_from: '2026-01-01',
      valid_to: '2026-02-01',
      superseded_by: liveFact.id,
      supporting_claim_ids: [verifiedClaimId],
    });

    const resolution = resolveSlot(slot, [supersededFact, liveFact], claims);

    expect(resolution.fact_ids).toEqual([liveFact.id]);
    expect(resolution.fact_ids).not.toContain(supersededFact.id);

    // And the composed text carries only the live wording.
    const { artifact } = buildArtifact({
      template,
      facts: [supersededFact, liveFact],
      claimsById: claims,
      personId: fixture.person.id,
    });
    const assertion = artifact.assertions.find((a) => a.slot_key === 'mobility.evidence');
    expect(assertion?.text).toContain('Now uses a frame indoors');
    expect(assertion?.text).not.toContain('Unsteady on stairs');
  });
});

describe('resolveSlot — drug_therapies.framework_note is the one exempt slot', () => {
  it('is OMITTED, not emitted with empty text, when it has no backing fact', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'drug_therapies.framework_note');
    if (slot === undefined) throw new Error('drug_therapies.framework_note slot not found');
    expect(slot.gap_prompt).toBeNull();

    const resolution = resolveSlot(slot, [], new Map());

    expect(resolution.omitted).toBe(true);
    expect(resolution.gap_prompt).toBeNull();
    expect(resolution.fact_ids).toEqual([]);
    // citation_required === true, so this is a genuine evidence gap, not a
    // slot waiting on fixed copy from another lane.
    expect(resolution.omission_reason).toBe('no_evidence');
  });
});

describe('buildArtifact — a structural slot can never disappear silently', () => {
  /**
   * THE REGRESSION GUARD for the defect this file was reviewed for.
   *
   * `chc_dst_pack_v1` has three slots that are not evidence-driven at all
   * (`citation_required === false`, no `gap_prompt`): the cover page's subject
   * and scope statements, and the method section's provenance note. They
   * produce no assertion — correctly, because their wording is fixed copy this
   * pipeline is not allowed to invent — and they used to VANISH behind a bare
   * "3 omitted" count, indistinguishable from three empty clinical domains.
   *
   * An evidence pack reaching an ICB panel with no statement of who it
   * concerns, no scope statement and no provenance section is a serious
   * defect. This test does not require it to be filled. It requires it to be
   * IMPOSSIBLE to leave out quietly.
   *
   * The slot set is derived from the frozen template, never listed here — add
   * a fourth non-evidence slot to the template and this test covers it too.
   */
  it('every non-evidence-driven, non-fallback slot is named as awaiting_fixed_copy', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const structural = slotsOf(template)
      .map((s) => s.slot)
      .filter((s) => !s.citation_required && s.gap_prompt === null);

    // Fixture invariant: the cover/method slots exist and are structural.
    expect(structural.length).toBeGreaterThan(0);

    const { artifact, omissions } = buildArtifact(buildInput('chc_dst_pack_v1'));
    const namedByKey = new Map(omissions.map((o) => [o.slot_key, o]));

    for (const slot of structural) {
      expect(
        artifact.assertions.some((a) => a.slot_key === slot.key),
        `${slot.key} produced an assertion — did someone invent its copy?`,
      ).toBe(false);

      const named = namedByKey.get(slot.key);
      expect(named, `${slot.key} was left out WITHOUT being named`).toBeDefined();
      expect(named?.reason).toBe('awaiting_fixed_copy');
      // Named legibly: a human reading the output must see the slot's own
      // label and the section it belongs to, not just a key.
      expect(named?.label).toBe(slot.label);
      expect(named?.section_title).toBeTruthy();
    }
  });

  it('every slot is accounted for: assertions + omissions === the template slot count', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const { artifact, omissions } = buildArtifact(buildInput(key));
      expect(artifact.assertions.length + omissions.length).toBe(slotsOf(templateByKey(key)).length);
    }
  });

  it('every omission carries a reason — there is no unexplained absence', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const { omissions } = buildArtifact(buildInput(key));
      for (const omission of omissions) {
        expect(['awaiting_fixed_copy', 'no_evidence']).toContain(omission.reason);
        expect(omission.slot_key).toBeTruthy();
        expect(omission.label).toBeTruthy();
      }
    }
  });
});

describe('buildArtifact — a gap-prompted assertion stores EMPTY text', () => {
  /** `fixtures/margaret.json` commits to this shape: the continence assertion
   *  has no facts and no text, and Lane B renders the fall-through by reading
   *  `gap_prompt` from the frozen template. Copying the prompt into
   *  `Assertion.text` instead would freeze template copy into stored artefacts
   *  and let a reader mistake template wording for something the record said. */
  it('matches the fixture convention: no facts, empty text, citation_verified false', () => {
    const { artifact } = buildArtifact(buildInput('chc_dst_pack_v1'));
    const assertion = artifact.assertions.find((a) => a.slot_key === 'continence.evidence');
    expect(assertion).toBeDefined();
    expect(assertion?.fact_ids).toEqual([]);
    expect(assertion?.citation_verified).toBe(false);
    expect(assertion?.text).toBe('');

    const fixtureArtifact = fixture.artifacts.find((a) => a.template_key === 'chc_dst_pack_v1');
    const fixtureAssertion = fixtureArtifact?.assertions.find(
      (a) => a.slot_key === 'continence.evidence',
    );
    expect(fixtureAssertion?.text).toBe(assertion?.text);
    expect(fixtureAssertion?.citation_verified).toBe(assertion?.citation_verified);
  });

  it('no gap-prompted assertion smuggles the template prompt into its text', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const { artifact } = buildArtifact(buildInput(key));
      const promptsByKey = new Map(slotsOf(templateByKey(key)).map((s) => [s.slot.key, s.slot.gap_prompt]));
      for (const assertion of artifact.assertions) {
        if (assertion.citation_verified) continue;
        expect(assertion.text).toBe('');
        expect(assertion.text).not.toBe(promptsByKey.get(assertion.slot_key));
      }
    }
  });
});

function buildInput(templateKey: 'chc_dst_pack_v1' | 'gp_brief_v1'): BuildArtifactInput {
  return {
    template: templateByKey(templateKey),
    facts: fixture.facts,
    claimsById: claimsById(),
    personId: fixture.person.id,
  };
}

function buildFor(templateKey: 'chc_dst_pack_v1' | 'gp_brief_v1'): Artifact {
  return buildArtifact(buildInput(templateKey)).artifact;
}

describe('buildArtifact — both templates over the same fact set', () => {
  it('drug_therapies.framework_note never appears as an assertion when unfillable, only omitted', () => {
    const { artifact, omissions } = buildArtifact({
      template: templateByKey('chc_dst_pack_v1'),
      facts: [],
      claimsById: new Map(),
      personId: fixture.person.id,
    });
    expect(artifact.assertions.some((a) => a.slot_key === 'drug_therapies.framework_note')).toBe(
      false,
    );
    // ...but it is NAMED as an omission, with the reason. Being absent from
    // the assertions is not licence to be absent from the output.
    const named = omissions.find((o) => o.slot_key === 'drug_therapies.framework_note');
    expect(named).toBeDefined();
    expect(named?.reason).toBe('no_evidence');
  });

  it('produce different, non-empty section-key sets from one fact set — templates are data', () => {
    const chc = buildFor('chc_dst_pack_v1');
    const gp = buildFor('gp_brief_v1');

    function sectionKeysUsed(templateKey: 'chc_dst_pack_v1' | 'gp_brief_v1', slotKeys: string[]) {
      const template = templateByKey(templateKey);
      const bySlotKey = new Map(slotsOf(template).map((s) => [s.slot.key, s.section.key]));
      return new Set(slotKeys.map((k) => bySlotKey.get(k)));
    }

    const chcSections = sectionKeysUsed('chc_dst_pack_v1', chc.assertions.map((a) => a.slot_key));
    const gpSections = sectionKeysUsed('gp_brief_v1', gp.assertions.map((a) => a.slot_key));

    expect(chcSections.size).toBeGreaterThan(0);
    expect(gpSections.size).toBeGreaterThan(0);
    expect(chcSections).not.toEqual(gpSections);
  });

  it('every Assertion parses against the Assertion zod schema', () => {
    const chc = buildFor('chc_dst_pack_v1');
    const gp = buildFor('gp_brief_v1');
    for (const assertion of [...chc.assertions, ...gp.assertions]) {
      expect(() => Assertion.parse(assertion)).not.toThrow();
    }
  });

  it('no assertion has citation_verified: true with empty fact_ids — the DB constraint', () => {
    const chc = buildFor('chc_dst_pack_v1');
    const gp = buildFor('gp_brief_v1');
    for (const assertion of [...chc.assertions, ...gp.assertions]) {
      if (assertion.citation_verified) {
        expect(assertion.fact_ids.length).toBeGreaterThan(0);
      }
    }
  });

  it('every emitted slot_key exists in the template it came from', () => {
    for (const key of ['chc_dst_pack_v1', 'gp_brief_v1'] as const) {
      const artifact = buildFor(key);
      const known = new Set(slotsOf(templateByKey(key)).map((s) => s.slot.key));
      for (const assertion of artifact.assertions) {
        expect(known.has(assertion.slot_key), `unknown slot ${assertion.slot_key} in ${key}`).toBe(
          true,
        );
      }
    }
  });

  it('user_verified is always false — a human has not checked it yet', () => {
    expect(buildFor('chc_dst_pack_v1').user_verified).toBe(false);
    expect(buildFor('gp_brief_v1').user_verified).toBe(false);
  });

  it('NO assertion text contains judgement language — not narrowed to the fact-backed ones', () => {
    // This assertion used to skip every gap-prompted assertion, because the
    // frozen gap_prompt copy contains the word "suggest" and was being copied
    // into `Assertion.text`. It no longer is: a gap-prompted assertion now
    // carries EMPTY text (the fixture's own convention) and the prompt is read
    // live from the template at render time. So the narrowing is gone and
    // every assertion this module emits is checked.
    const chc = buildFor('chc_dst_pack_v1');
    const gp = buildFor('gp_brief_v1');
    for (const assertion of [...chc.assertions, ...gp.assertions]) {
      expect(
        JUDGEMENT_LANGUAGE_RE.test(assertion.text),
        `judgement language in ${assertion.slot_key}: "${assertion.text}"`,
      ).toBe(false);
    }
  });

  it('no key anywhere in either artifact matches the banned judgement pattern', () => {
    const chc = buildFor('chc_dst_pack_v1');
    const gp = buildFor('gp_brief_v1');
    const keys = new Set<string>();
    collectKeys(chc, keys);
    collectKeys(gp, keys);
    for (const key of keys) {
      expect(JUDGEMENT_KEY_RE.test(key), `banned key "${key}"`).toBe(false);
    }
  });

  it('is deterministic: building twice from the same input yields equal artifacts, ignoring ids and timestamps', () => {
    function normalise(artifact: Artifact) {
      return {
        person_id: artifact.person_id,
        template_key: artifact.template_key,
        user_verified: artifact.user_verified,
        assertions: artifact.assertions.map((a) => ({
          slot_key: a.slot_key,
          text: a.text,
          fact_ids: [...a.fact_ids].sort(),
          citation_verified: a.citation_verified,
        })),
      };
    }

    const a1 = buildFor('chc_dst_pack_v1');
    const a2 = buildFor('chc_dst_pack_v1');
    expect(normalise(a1)).toEqual(normalise(a2));

    const b1 = buildFor('gp_brief_v1');
    const b2 = buildFor('gp_brief_v1');
    expect(normalise(b1)).toEqual(normalise(b2));
  });
});
