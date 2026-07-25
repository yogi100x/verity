/**
 * The source-inventory defect and its fix.
 *
 * THE DEFECT: `cover.sources` (`chc_dst_pack_v1`) and `documents`
 * (`gp_brief_v1`) — every slot in `fixtures/templates.json` whose
 * `ontology_match` includes `source.inventory` — always fell through to
 * their `gap_prompt`, because the only Fact that could ever match
 * `source.inventory` (the now-deleted `projectSourceInventory`) carried no
 * supporting claims, and `isVerifiedBacked` (lib/ai/artifacts.ts) correctly
 * never lets a fact with no supporting claims back a slot. An evidence pack
 * reaching an ICB panel said "ask for a document" where its own document
 * list belonged.
 *
 * THE FIX: route these slots down the structural/metadata path
 * (`isSourceInventorySlot` in lib/ai/artifacts.ts), the same shape as
 * `cover.subject` / `method.provenance`, sourced from
 * `BuildArtifactInput.sources` instead of a resolved `Fact`.
 * `isVerifiedBacked` itself is UNCHANGED — see the regression guard below.
 */

import { describe, it, expect } from 'vitest';
import { CaseSnapshot, type Fact } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import { templateByKey, slotsOf } from '@/lib/ai/templates';
import { buildArtifact, resolveSlot, type BackingClaim, type BuildArtifactInput } from '@/lib/ai/artifacts';
import { projectAll } from '@/lib/ai/projections';
import { GET } from '@/app/api/debug/inspect/route';
import { escapeHtml } from '@/lib/ai/inspect-html';
import { sectionById } from './html-sections';

const fixture = CaseSnapshot.parse(fixtureRaw);
const CREATED_AT = '2026-07-25T00:00:00.000Z';

function claimsById(): ReadonlyMap<string, BackingClaim> {
  const map = new Map<string, BackingClaim>();
  for (const claim of fixture.claims) {
    map.set(claim.id, { verified_substring: claim.verified_substring, quote: claim.quote });
  }
  return map;
}

/** Every slot, in either template, whose `ontology_match` includes the exact
 *  `source.inventory` key — found by filtering the live template, never a
 *  hardcoded slot-key list. */
function sourceInventorySlots(templateKey: 'chc_dst_pack_v1' | 'gp_brief_v1') {
  return slotsOf(templateByKey(templateKey)).filter((s) => s.slot.ontology_match.includes('source.inventory'));
}

function buildInput(
  templateKey: 'chc_dst_pack_v1' | 'gp_brief_v1',
  sources?: BuildArtifactInput['sources'],
): BuildArtifactInput {
  return {
    template: templateByKey(templateKey),
    facts: fixture.facts,
    claimsById: claimsById(),
    personId: fixture.person.id,
    createdAt: CREATED_AT,
    sources,
  };
}

describe('source.inventory slots — found by filtering the template, not listed', () => {
  it('chc_dst_pack_v1 has at least one source.inventory slot (cover.sources)', () => {
    const slots = sourceInventorySlots('chc_dst_pack_v1');
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((s) => s.slot.key === 'cover.sources')).toBe(true);
  });

  it('gp_brief_v1 has at least one source.inventory slot (documents)', () => {
    const slots = sourceInventorySlots('gp_brief_v1');
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((s) => s.slot.key === 'documents')).toBe(true);
  });
});

describe('buildArtifact — every source.inventory slot fills when sources are supplied', () => {
  it('chc_dst_pack_v1: every source.inventory slot is filled, its text contains every fixture source title', () => {
    const { artifact, structuralAssertions } = buildArtifact(buildInput('chc_dst_pack_v1', fixture.sources));
    for (const { slot } of sourceInventorySlots('chc_dst_pack_v1')) {
      const assertion = artifact.assertions.find((a) => a.slot_key === slot.key);
      expect(assertion, `${slot.key} produced no assertion`).toBeDefined();
      for (const source of fixture.sources) {
        expect(assertion?.text, `${slot.key} is missing "${source.title}"`).toContain(source.title);
      }
      const structural = structuralAssertions.find((s) => s.slot_key === slot.key);
      expect(structural?.source).toBe('source_inventory');
    }
  });

  it('gp_brief_v1: the documents slot is filled, its text contains every fixture source title', () => {
    const { artifact, structuralAssertions } = buildArtifact(buildInput('gp_brief_v1', fixture.sources));
    for (const { slot } of sourceInventorySlots('gp_brief_v1')) {
      const assertion = artifact.assertions.find((a) => a.slot_key === slot.key);
      expect(assertion, `${slot.key} produced no assertion`).toBeDefined();
      for (const source of fixture.sources) {
        expect(assertion?.text, `${slot.key} is missing "${source.title}"`).toContain(source.title);
      }
      const structural = structuralAssertions.find((s) => s.slot_key === slot.key);
      expect(structural?.source).toBe('source_inventory');
    }
  });

  it('the text contains only titles — no canonical values, quotes, or other source fields not carried by title', () => {
    const { artifact } = buildArtifact(buildInput('chc_dst_pack_v1', fixture.sources));
    const assertion = artifact.assertions.find((a) => a.slot_key === 'cover.sources');
    if (assertion === undefined) throw new Error('cover.sources produced no assertion');

    // Nothing from an unrelated document (a fact's canonical_value or a
    // claim's quote) leaks into the list — it is titles, and only titles.
    for (const fact of fixture.facts) {
      if (fixture.sources.some((s) => s.title === fact.canonical_value)) continue;
      expect(assertion.text).not.toContain(fact.canonical_value);
    }
    for (const claim of fixture.claims) {
      expect(assertion.text).not.toContain(claim.quote);
    }

    // Positive control: the text is exactly the titles, one per line, in
    // the order supplied — nothing generated, nothing summarised.
    expect(assertion.text).toBe(fixture.sources.map((s) => s.title).join('\n'));
  });

  it('the assertion has citation_verified: false and empty fact_ids — the DB constraint, honestly: this is not a cited claim', () => {
    const { artifact } = buildArtifact(buildInput('chc_dst_pack_v1', fixture.sources));
    const assertion = artifact.assertions.find((a) => a.slot_key === 'cover.sources');
    expect(assertion?.citation_verified).toBe(false);
    expect(assertion?.fact_ids).toEqual([]);
  });

  it('is labelled distinctly from Lane C copy and from a framework citation', () => {
    const { structuralAssertions } = buildArtifact({
      ...buildInput('chc_dst_pack_v1', fixture.sources),
      person: { display_name: fixture.person.display_name },
    });
    const inventory = structuralAssertions.find((s) => s.slot_key === 'cover.sources');
    const subject = structuralAssertions.find((s) => s.slot_key === 'cover.subject');
    expect(inventory?.source).toBe('source_inventory');
    expect(subject?.source).toBe('lane_c_copy');
    expect(inventory?.source).not.toBe(subject?.source);
  });
});

describe('buildArtifact — with no sources supplied, source.inventory slots stay honestly unfilled', () => {
  it('cover.sources falls through to its gap_prompt rather than inventing a list', () => {
    const { artifact, structuralAssertions } = buildArtifact(buildInput('chc_dst_pack_v1'));
    const assertion = artifact.assertions.find((a) => a.slot_key === 'cover.sources');
    expect(assertion).toBeDefined();
    expect(assertion?.text).toBe('');
    expect(assertion?.citation_verified).toBe(false);
    expect(structuralAssertions.some((s) => s.slot_key === 'cover.sources')).toBe(false);

    const slot = slotsOf(templateByKey('chc_dst_pack_v1')).find((s) => s.slot.key === 'cover.sources')?.slot;
    expect(assertion?.text).not.toBe(slot?.gap_prompt);
  });

  it('the same is true when sources is an explicit empty array — an empty list is never invented as "filled"', () => {
    const { structuralAssertions } = buildArtifact(buildInput('chc_dst_pack_v1', []));
    expect(structuralAssertions.some((s) => s.slot_key === 'cover.sources')).toBe(false);
  });
});

describe('regression guard — isVerifiedBacked is UNCHANGED: an empty supporting_claim_ids still cannot fill an ordinary evidence slot', () => {
  it('resolveSlot falls through to gap_prompt when the only matching fact has no supporting claims', () => {
    const template = templateByKey('chc_dst_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'mobility.evidence');
    if (slot === undefined) throw new Error('mobility.evidence slot not found');

    const unbackedFact: Fact = {
      id: crypto.randomUUID(),
      person_id: fixture.person.id,
      ontology_key: 'chc.mobility',
      subject: 'mobility',
      canonical_value: 'Unsteady on stairs',
      provenance: 'system_inferred',
      status: 'unknown',
      valid_from: null,
      valid_to: null,
      supporting_claim_ids: [],
      conflict_id: null,
      superseded_by: null,
    };

    const resolution = resolveSlot(slot, [unbackedFact], new Map());
    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.omitted).toBe(false);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
  });
});

describe('GET /api/debug/inspect — end to end: the document list reaches the artefacts section', () => {
  async function getArtifactsSection(): Promise<string> {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const body = await res.text();
    expect(res.status).toBe(200);
    return sectionById(body, 'artifacts');
  }

  it('every fixture source title appears in the artefacts section', async () => {
    const artifactsSection = await getArtifactsSection();
    for (const source of fixture.sources) {
      expect(artifactsSection).toContain(escapeHtml(source.title));
    }
  });

  it('the superseded March cardiology value appears nowhere in the artefacts section, with a positive control', async () => {
    const artifactsSection = await getArtifactsSection();
    const marchClaim = fixture.claims.find(
      (c) => c.ontology_key === 'medication.furosemide' && c.asserted_at === '2026-03-12',
    );
    if (marchClaim === undefined) {
      throw new Error('fixture invariant broken: expected the March cardiology furosemide claim');
    }
    expect(artifactsSection).not.toContain(marchClaim.quote);

    // Positive control: the document titles ARE visible, so the check above
    // is not passing because the section is empty or broken.
    expect(artifactsSection).toContain(escapeHtml(fixture.sources[0]?.title ?? ''));
  });

  it('the fabricated (unverified) quote appears nowhere in the artefacts section', async () => {
    const artifactsSection = await getArtifactsSection();
    const fabricatedClaim = fixture.claims.find((c) => c.verified_substring === false);
    if (fabricatedClaim === undefined) {
      throw new Error('fixture invariant broken: expected one claim with verified_substring === false');
    }
    expect(artifactsSection).not.toContain(fabricatedClaim.quote);
  });

  it('counts still add up for both templates: filled + verbatim_copy + gap_prompted + omitted === slots_total', async () => {
    const artifactsSection = await getArtifactsSection();
    const cards = [
      ...artifactsSection.matchAll(
        /data-slots-total="(\d+)" data-filled="(\d+)" data-verbatim-copy="(\d+)" data-gap-prompted="(\d+)" data-omitted="(\d+)"/g,
      ),
    ];
    expect(cards).toHaveLength(2);
    for (const [, slotsTotalStr, filledStr, verbatimCopyStr, gapPromptedStr, omittedStr] of cards) {
      const slotsTotal = Number(slotsTotalStr);
      const filled = Number(filledStr);
      const verbatimCopy = Number(verbatimCopyStr);
      const gapPrompted = Number(gapPromptedStr);
      const omitted = Number(omittedStr);
      expect(filled + verbatimCopy + gapPrompted + omitted).toBe(slotsTotal);
      expect(slotsTotal).toBeGreaterThan(0);
    }
  });
});

describe('projectAll no longer emits a source.inventory (or person.identity) fact', () => {
  it('projectAll output contains neither namespace', () => {
    const projected = projectAll({
      personId: fixture.person.id,
      conflicts: fixture.conflicts,
      gaps: fixture.gaps,
    });
    expect(projected.some((f) => f.ontology_key === 'source.inventory')).toBe(false);
    expect(projected.some((f) => f.ontology_key === 'person.identity')).toBe(false);
  });
});
