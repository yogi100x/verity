/**
 * computeArtifactSummary is exercised against hand-built ArtifactView
 * fixtures rather than the real margaret.json snapshot, so the assertions
 * below double as the specification of what each count means — independent
 * of whatever numbers the real fixture happens to produce today.
 */

import { describe, expect, it } from "vitest";
import type { ArtifactSectionView, ArtifactSlotView, ArtifactView } from "@/components/data/dal";
import type { Fact, Slot } from "@/lib/contracts";
import { computeArtifactSummary } from "../artifactSummary";

function slot(key: string, renderer: Slot["renderer"] = "prose"): Slot {
  return {
    key,
    label: key,
    ontology_match: [],
    citation_required: true,
    renderer,
    gap_prompt: `No evidence for ${key}`,
  };
}

function filledSlotView(key: string, opts: { citationVerified?: boolean; renderer?: Slot["renderer"] } = {}): ArtifactSlotView {
  const { citationVerified = true, renderer = "prose" } = opts;
  return {
    slot: slot(key, renderer),
    assertion: {
      id: `00000000-0000-4000-8000-00000000000${key.length}`,
      artifact_id: "00000000-0000-4000-8000-000000000000",
      slot_key: key,
      text: `text for ${key}`,
      fact_ids: [],
      citation_verified: citationVerified,
    },
    facts: [],
    hasContent: true,
  };
}

/** A minimal contract-shaped Fact. `disputed` here means what it means in
 *  the record: the fact carries a conflict_id and a disputed status. */
function fact(subject: string, index: number, opts: { disputed?: boolean } = {}): Fact {
  const { disputed = false } = opts;
  return {
    id: `f0000000-0000-4000-8000-00000000000${index}`,
    person_id: "00000000-0000-4000-8000-000000000099",
    ontology_key: `medication.${subject}`,
    subject,
    canonical_value: `value for ${subject}`,
    provenance: "document_extracted",
    status: disputed ? "disputed" : "confirmed",
    valid_from: null,
    valid_to: null,
    supporting_claim_ids: [],
    conflict_id: disputed ? "c1000000-0000-4000-8000-000000000001" : null,
    superseded_by: null,
  };
}

/** A slot whose assertion cites the given facts — the shape `artifactView`
 *  produces once it has resolved `assertion.fact_ids`. */
function citingSlotView(key: string, facts: Fact[]): ArtifactSlotView {
  return {
    slot: slot(key),
    assertion: {
      id: `00000000-0000-4000-8000-00000000000${key.length}`,
      artifact_id: "00000000-0000-4000-8000-000000000000",
      slot_key: key,
      text: `text for ${key}`,
      fact_ids: facts.map((candidate) => candidate.id),
      citation_verified: true,
    },
    facts,
    hasContent: true,
  };
}

function emptySlotView(key: string, renderer: Slot["renderer"] = "prose"): ArtifactSlotView {
  return {
    slot: slot(key, renderer),
    assertion: null,
    facts: [],
    hasContent: false,
  };
}

function section(key: string, title: string, slots: ArtifactSlotView[]): ArtifactSectionView {
  return { key, title, slots };
}

function view(sections: ArtifactSectionView[]): ArtifactView {
  return {
    templateKey: "chc_dst_pack_v1",
    title: "Test pack",
    audience: "Test audience",
    person: {
      id: "00000000-0000-4000-8000-000000000099",
      display_name: "Test Person",
      access_basis: "self",
    },
    stats: { claims_extracted: 0, claims_dropped: 0 },
    sections,
  };
}

describe("computeArtifactSummary", () => {
  it("counts a section as evidence-bearing only when a slot has a verified, non-empty assertion", () => {
    const sparse = view([
      section("cover", "Cover", [emptySlotView("cover.name")]),
      section("breathing", "Breathing", [emptySlotView("breathing.evidence")]),
      section("mobility", "Mobility", [filledSlotView("mobility.evidence")]),
    ]);

    const summary = computeArtifactSummary(sparse);
    expect(summary.sectionsWithEvidenceCount).toBe(1);
    expect(summary.totalSectionCount).toBe(3);
    expect(summary.totalDomainCount).toBe(2); // breathing, mobility — real ChcDomain keys
    expect(summary.domainsWithoutEvidence.map((s) => s.key)).toEqual(["breathing"]);
  });

  it("does not count a non-empty but unverified assertion as evidence", () => {
    const unverified = view([
      section("continence", "Continence", [
        filledSlotView("continence.evidence", { citationVerified: false }),
      ]),
    ]);

    const summary = computeArtifactSummary(unverified);
    expect(summary.sectionsWithEvidenceCount).toBe(0);
    expect(summary.domainsWithoutEvidence.map((s) => s.key)).toEqual(["continence"]);
  });

  it("two different artifact shapes produce two different, correctly-derived summaries", () => {
    const richer = view([
      section("breathing", "Breathing", [filledSlotView("breathing.evidence")]),
      section("nutrition", "Nutrition", [filledSlotView("nutrition.evidence")]),
      section("continence", "Continence", [emptySlotView("continence.evidence")]),
    ]);
    const sparser = view([
      section("breathing", "Breathing", [emptySlotView("breathing.evidence")]),
      section("nutrition", "Nutrition", [emptySlotView("nutrition.evidence")]),
      section("continence", "Continence", [emptySlotView("continence.evidence")]),
    ]);

    const richerSummary = computeArtifactSummary(richer);
    const sparserSummary = computeArtifactSummary(sparser);

    expect(richerSummary.sectionsWithEvidenceCount).not.toBe(sparserSummary.sectionsWithEvidenceCount);
    expect(richerSummary.domainsWithoutEvidence.length).not.toBe(
      sparserSummary.domainsWithoutEvidence.length,
    );
    expect(richerSummary.sectionsWithEvidenceCount).toBe(2);
    expect(sparserSummary.sectionsWithEvidenceCount).toBe(0);
    expect(richerSummary.domainsWithoutEvidence.length).toBe(1);
    expect(sparserSummary.domainsWithoutEvidence.length).toBe(3);
  });

  it("counts a section with no domain-keyed sections as having zero domains, never throwing", () => {
    const noDomains = view([section("purpose", "Why I am here", [filledSlotView("reason")])]);
    const summary = computeArtifactSummary(noDomains);
    expect(summary.totalDomainCount).toBe(0);
    expect(summary.domainsWithoutEvidence).toEqual([]);
  });

  it("counts the distinct disputed facts the pack's assertions cite, not the slots that render them", () => {
    const disputed = fact("furosemide", 1, { disputed: true });
    const settled = fact("amitriptyline", 2);

    // The disagreement lives in the prose slot's citations, and the dedicated
    // conflict slot is empty — exactly Margaret's CHC pack. The old
    // slot-counting definition read 0 here while the prose narrated one.
    const narratedInProse = view([
      section("drug_therapies", "Drug therapies", [
        emptySlotView("drug_therapies.conflicts", "conflict"),
        citingSlotView("drug_therapies.evidence", [disputed, settled]),
      ]),
    ]);
    expect(computeArtifactSummary(narratedInProse).disagreementCount).toBe(1);

    // No disputed fact cited anywhere ⇒ zero, even with a filled conflict slot.
    const nothingDisputed = view([
      section("drug_therapies", "Drug therapies", [
        citingSlotView("drug_therapies.conflicts", [settled]),
        citingSlotView("drug_therapies.evidence", [settled]),
      ]),
    ]);
    expect(computeArtifactSummary(nothingDisputed).disagreementCount).toBe(0);
  });

  it("de-duplicates by fact id — one disputed fact cited from three slots is one disagreement", () => {
    const disputed = fact("furosemide", 1, { disputed: true });
    const alsoDisputed = fact("warfarin", 3, { disputed: true });

    const citedThrice = view([
      section("drug_therapies", "Drug therapies", [
        citingSlotView("drug_therapies.conflicts", [disputed]),
        citingSlotView("drug_therapies.evidence", [disputed]),
      ]),
      section("cover", "Cover", [citingSlotView("cover.summary", [disputed])]),
    ]);
    expect(computeArtifactSummary(citedThrice).disagreementCount).toBe(1);

    // …and the count genuinely moves with the data.
    const twoDisputed = view([
      section("drug_therapies", "Drug therapies", [
        citingSlotView("drug_therapies.evidence", [disputed, alsoDisputed]),
      ]),
    ]);
    expect(computeArtifactSummary(twoDisputed).disagreementCount).toBe(2);
  });
});
