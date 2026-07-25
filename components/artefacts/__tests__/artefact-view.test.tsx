/**
 * Exercises ArtefactDocument against the real DAL/fixture — no mocking.
 * Both phase-1 templates render through the identical component; the
 * structural rule (never branch on a template key) is checked with a
 * grep-style scan of the component source files themselves.
 */

import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { artifactView, getTemplates } from "@/components/data/dal";
import { resolveFactProvenance } from "../factProvenance";
import { ArtefactDocument } from "../ArtefactDocument";

// matchMedia is polyfilled globally in vitest.setup.ts (see setupFiles in
// vitest.config.ts) — ProvenanceTag (components/provenance, outside this
// lane chunk's territory) reads it to choose the popover/sheet split.

const TODAY_LABEL = "25 July 2026";

describe("ArtefactDocument", () => {
  it("renders every CHC domain section under its official template title", () => {
    const view = artifactView("chc_dst_pack_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

    const template = getTemplates().find((candidate) => candidate.key === "chc_dst_pack_v1");
    expect(template).toBeDefined();
    expect(template?.sections.length).toBeGreaterThanOrEqual(12);

    for (const section of template?.sections ?? []) {
      expect(screen.getByRole("heading", { name: section.title })).toBeInTheDocument();
    }
  });

  it("renders the empty continence slot's gap_prompt — never blank, never invented text", () => {
    const view = artifactView("chc_dst_pack_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

    const continenceSection = view.sections.find((section) => section.key === "continence");
    const evidenceSlot = continenceSection?.slots.find(
      (slot) => slot.slot.key === "continence.evidence",
    );
    expect(evidenceSlot).toBeDefined();
    expect(evidenceSlot?.hasContent).toBe(false);
    expect(evidenceSlot?.slot.gap_prompt).toBeTruthy();

    const gapPrompt = evidenceSlot?.slot.gap_prompt;
    if (gapPrompt !== null && gapPrompt !== undefined) {
      expect(screen.getByText(gapPrompt)).toBeInTheDocument();
    }
  });

  it("renders gp_brief_v1 with a different section structure, through the same component", () => {
    const view = artifactView("gp_brief_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

    expect(screen.getByRole("heading", { level: 1, name: view.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Why I am here" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Breathing" })).not.toBeInTheDocument();
  });

  it("renders the footer disclaimer and review gate for both templates, unchanged component", () => {
    for (const templateKey of ["chc_dst_pack_v1", "gp_brief_v1"] as const) {
      const view = artifactView(templateKey);
      const { unmount } = render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

      expect(
        screen.getByText(/This is not a clinical record, not a clinical summary/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Assembled by/)).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "I have reviewed every line of this document" }),
      ).toBeInTheDocument();

      unmount();
    }
  });

  it("resolves provenance for every fact cited by every assertion in both artefacts", () => {
    // A fact rendered on an artefact must always carry a source chip — a
    // sourceless fact must never reach the UI (docs/design.md §10). This
    // iterates every cited fact across both phase-1 templates and asserts the
    // provenance map resolves it to a citation or an explicit user-stated tag.
    let checked = 0;
    for (const templateKey of ["chc_dst_pack_v1", "gp_brief_v1"] as const) {
      const view = artifactView(templateKey);
      for (const section of view.sections) {
        for (const slotView of section.slots) {
          for (const fact of slotView.facts) {
            const provenance = resolveFactProvenance(fact);
            expect("citation" in provenance || "userStated" in provenance).toBe(true);
            checked += 1;
          }
        }
      }
    }
    // Guard against a silently-empty loop passing vacuously.
    expect(checked).toBeGreaterThan(0);
  });

  it("has no template-key branch anywhere in components/artefacts source (the structural rule)", () => {
    const dir = path.join(__dirname, "..");
    const files = readdirSync(dir).filter(
      (name) => name.endsWith(".tsx") || name.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(path.join(dir, file), "utf8");
      expect(contents).not.toContain("chc_dst_pack_v1");
      expect(contents).not.toContain("gp_brief_v1");
    }
  });
});
