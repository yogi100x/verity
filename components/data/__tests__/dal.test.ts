import { describe, expect, it } from "vitest";
import {
  artifactView,
  conflictViews,
  gapViews,
  getCase,
  getSource,
  getSources,
  getTemplates,
  resolveProvenance,
  timelineEvents,
} from "../dal";
import type { Fact } from "@/lib/contracts";

describe("dal", () => {
  it("getCase parses the fixture against the contract", () => {
    const snap = getCase();
    expect(snap.person.display_name).toBe("Margaret Ellis");
    expect(snap.claims.length).toBeGreaterThan(0);
    expect(snap.stats.claims_extracted).toBe(snap.claims.length);
  });

  it("getTemplates parses both phase-1 templates", () => {
    const templates = getTemplates();
    expect(templates.map((t) => t.key)).toEqual(
      expect.arrayContaining(["chc_dst_pack_v1", "gp_brief_v1"]),
    );
  });

  it("getSources/getSource resolve against the same snapshot", () => {
    const sources = getSources();
    expect(sources.length).toBeGreaterThan(0);
    const first = sources[0];
    expect(getSource(first.id)).toEqual(first);
    expect(getSource("does-not-exist")).toBeUndefined();
  });

  it("every timeline event resolves to exactly one provenance shape", () => {
    const events = timelineEvents();
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      const hasCitation = "citation" in event.provenance;
      const hasUserStated = "userStated" in event.provenance;
      // Exactly one — never both, never neither.
      expect(hasCitation).toBe(!hasUserStated);
      expect(hasCitation || hasUserStated).toBe(true);
    }
  });

  it("timeline excludes facts with status 'unknown'", () => {
    const snap = getCase();
    const unknownIds = new Set(
      snap.facts.filter((f) => f.status === "unknown").map((f) => f.id),
    );
    expect(unknownIds.size).toBeGreaterThan(0); // the fixture exercises this path

    const events = timelineEvents();
    for (const event of events) {
      expect(unknownIds.has(event.fact.id)).toBe(false);
    }
  });

  it("a superseded fact carries a supersession note and stays cited", () => {
    const events = timelineEvents();
    const superseded = events.filter((e) => e.superseded);
    expect(superseded.length).toBeGreaterThan(0);
    for (const event of superseded) {
      expect(event.supersededNote).toBeTruthy();
      // Superseded evidence is still evidence — the citation chip stays live.
      expect("citation" in event.provenance || "userStated" in event.provenance).toBe(true);
    }
  });

  it("passes the source quote through verbatim — no trimming or normalising", () => {
    const snap = getCase();
    const claimsById = new Map(snap.claims.map((c) => [c.id, c]));
    const events = timelineEvents();
    const cited = events.filter((e) => "citation" in e.provenance);
    // The fixture has document-sourced facts on the timeline.
    expect(cited.length).toBeGreaterThan(0);

    for (const event of cited) {
      const claim = claimsById.get(event.fact.supporting_claim_ids[0]);
      expect(claim).toBeDefined();
      if (claim !== undefined && "citation" in event.provenance) {
        // Strict equality proves the quote is the source's bytes unchanged —
        // verbatim is the product, so a single trimmed space is a defect.
        expect(event.provenance.citation.quote).toBe(claim.quote);
      }
    }
  });

  it("resolveProvenance fails loud on a fact with neither a citation nor user-stated provenance", () => {
    const snap = getCase();
    const base = snap.facts.find((f) => f.status !== "unknown");
    expect(base).toBeDefined();
    if (base === undefined) return;

    // A sourceless fact: document-provenance but zero supporting claims. It
    // must crash rather than silently render a bare statement (design.md §10).
    const doctored: Fact = {
      ...base,
      provenance: "document_extracted",
      supporting_claim_ids: [],
    };
    expect(() => resolveProvenance(doctored, undefined)).toThrow(/refusing to render/);
  });

  it("conflictViews()[0] has exactly three chips, exactly one from the patient", () => {
    const views = conflictViews();
    expect(views.length).toBeGreaterThan(0);

    const chips = views[0].chips;
    expect(chips).toHaveLength(3);
    expect(chips.filter((c) => c.isPatient)).toHaveLength(1);
    expect(views[0].generatedQuestion.length).toBeGreaterThan(0);
  });

  it("conflict chips carry the raw material a ProvenanceTag popover needs", () => {
    const chips = conflictViews()[0].chips;
    for (const chip of chips) {
      // Additive fields: a real source id, its title, and the raw Locator so
      // each institutional chip can open its own source (journey 1.13).
      expect(chip.sourceId.length).toBeGreaterThan(0);
      expect(chip.sourceTitle.length).toBeGreaterThan(0);
      expect(chip.locator).toBeDefined();
      expect(chip.locator).toHaveProperty("page");
    }
  });

  it("gapViews() resolves every gap's citations", () => {
    const views = gapViews();
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.citations.length).toBeGreaterThan(0);
      for (const citation of view.citations) {
        expect(citation.sourceTitle.length).toBeGreaterThan(0);
        expect(citation.quote.length).toBeGreaterThan(0);
      }
    }
  });

  it("artifactView('chc_dst_pack_v1') surfaces the empty continence slot as a gap prompt", () => {
    const view = artifactView("chc_dst_pack_v1");
    const continenceSection = view.sections.find((s) => s.key === "continence");
    expect(continenceSection).toBeDefined();

    const evidenceSlot = continenceSection?.slots.find(
      (s) => s.slot.key === "continence.evidence",
    );
    expect(evidenceSlot).toBeDefined();
    expect(evidenceSlot?.hasContent).toBe(false);
    expect(evidenceSlot?.slot.gap_prompt).toBeTruthy();

    // At least one gap_prompt-eligible slot across the whole pack surfaces one.
    const anyGap = view.sections
      .flatMap((s) => s.slots)
      .some((s) => !s.hasContent && s.slot.gap_prompt !== null);
    expect(anyGap).toBe(true);
  });

  it("artifactView('gp_brief_v1') returns sections built from the template", () => {
    const view = artifactView("gp_brief_v1");
    expect(view.sections.length).toBeGreaterThan(0);
    expect(view.sections.map((s) => s.key)).toContain("purpose");
    expect(view.person.display_name).toBe("Margaret Ellis");
  });
});

describe("dal (case selection — stretch S1)", () => {
  // Every selector takes an optional trailing caseId defaulting to
  // 'margaret'. The tests above call every selector with zero arguments and
  // must keep passing unchanged — that IS the "no breaking changes when the
  // cookie is absent" contract. These tests cover the explicit-caseId path.
  it("getCase('maya') resolves the self-serve account, distinct from margaret", () => {
    const maya = getCase("maya");
    expect(maya.person.display_name).toBe("Maya Okafor");
    expect(maya.person.access_basis).toBe("self");
    expect(maya.conflicts).toHaveLength(0);

    const margaret = getCase("margaret");
    expect(margaret.person.display_name).toBe("Margaret Ellis");
    expect(margaret.person.id).not.toBe(maya.person.id);
  });

  it("getCase() with no argument still defaults to margaret", () => {
    expect(getCase().person.display_name).toBe("Margaret Ellis");
  });

  it("getSources/getSource resolve within maya's case, not margaret's", () => {
    const mayaSources = getSources("maya");
    expect(mayaSources.length).toBeGreaterThan(0);
    const first = mayaSources[0];
    expect(getSource(first.id, "maya")).toEqual(first);
    // A margaret-scoped lookup of a maya-only source id must not resolve.
    expect(getSource(first.id, "margaret")).toBeUndefined();
  });

  it("timelineEvents('maya') resolves every event to exactly one provenance shape", () => {
    const events = timelineEvents("maya");
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const hasCitation = "citation" in event.provenance;
      const hasUserStated = "userStated" in event.provenance;
      expect(hasCitation).toBe(!hasUserStated);
    }
  });

  it("gapViews('maya') resolves maya's referral-without-outcome gap", () => {
    const views = gapViews("maya");
    expect(views.length).toBeGreaterThan(0);
    expect(views.some((v) => v.detector === "referral_without_outcome")).toBe(true);
  });

  it("artifactView('gp_brief_v1', 'maya') renders maya's own facts, not margaret's", () => {
    const view = artifactView("gp_brief_v1", "maya");
    expect(view.person.display_name).toBe("Maya Okafor");
    const reasonSlot = view.sections
      .flatMap((s) => s.slots)
      .find((s) => s.slot.key === "reason");
    expect(reasonSlot?.hasContent).toBe(true);
  });
});
