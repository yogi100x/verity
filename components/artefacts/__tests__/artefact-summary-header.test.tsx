/**
 * The header text is asserted by building it from computeArtifactSummary
 * itself (the same function the component calls), never a pinned literal —
 * so this test fails if the component's wording and its counts ever drift
 * apart, without knowing in advance what either number is.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { artifactView } from "@/components/data/dal";
import { computeArtifactSummary } from "../artifactSummary";
import { ArtefactSummaryHeader } from "../ArtefactSummaryHeader";

function expectedLine(view: ReturnType<typeof artifactView>): string {
  const summary = computeArtifactSummary(view);
  const clauses = [
    `${summary.sectionsWithEvidenceCount} section${
      summary.sectionsWithEvidenceCount === 1 ? "" : "s"
    } contain${summary.sectionsWithEvidenceCount === 1 ? "s" : ""} evidence`,
  ];
  if (summary.totalDomainCount > 0) {
    const count = summary.domainsWithoutEvidence.length;
    clauses.push(
      `${count} domain${count === 1 ? "" : "s"} currently ${count === 1 ? "has" : "have"} no evidence`,
    );
  }
  clauses.push(
    `${summary.disagreementCount} disagreement${
      summary.disagreementCount === 1 ? "" : "s"
    } appear${summary.disagreementCount === 1 ? "s" : ""} in this pack`,
  );
  return `${clauses.join(" · ")}.`;
}

describe("ArtefactSummaryHeader", () => {
  it("renders the derived line for the CHC pack, matching computeArtifactSummary exactly", () => {
    const view = artifactView("chc_dst_pack_v1");
    render(<ArtefactSummaryHeader view={view} />);
    expect(screen.getByText(expectedLine(view))).toBeInTheDocument();
  });

  it("renders a different derived line for gp_brief_v1 — the two templates produce two different headers, neither hardcoded", () => {
    const chcView = artifactView("chc_dst_pack_v1");
    const gpView = artifactView("gp_brief_v1");

    const { unmount } = render(<ArtefactSummaryHeader view={chcView} />);
    const chcLine = expectedLine(chcView);
    expect(screen.getByText(chcLine)).toBeInTheDocument();
    unmount();

    render(<ArtefactSummaryHeader view={gpView} />);
    const gpLine = expectedLine(gpView);
    expect(screen.getByText(gpLine)).toBeInTheDocument();

    // The two lines are not equal, and neither test pins a literal number —
    // both come from computeArtifactSummary applied to the real view.
    expect(chcLine).not.toBe(gpLine);
  });

  it("reports the disagreement the pack actually cites — derived from the record's disputed facts, never from slot layout", () => {
    // The audit defect: Margaret's CHC pack narrates the three-source
    // furosemide disagreement in its drug_therapies prose while the dedicated
    // conflict slot is empty, so counting filled conflict slots printed
    // "0 disagreements appear in this pack" directly above that prose. The
    // count is now the distinct disputed facts the pack's assertions cite,
    // computed here independently from the same view.
    const view = artifactView("chc_dst_pack_v1");
    const citedDisputedFactIds = new Set(
      view.sections
        .flatMap((section) => section.slots)
        .flatMap((slotView) => slotView.facts)
        .filter((fact) => fact.conflict_id !== null || fact.status === "disputed")
        .map((fact) => fact.id),
    );
    expect(citedDisputedFactIds.size).toBeGreaterThan(0);
    expect(computeArtifactSummary(view).disagreementCount).toBe(citedDisputedFactIds.size);

    render(<ArtefactSummaryHeader view={view} />);
    expect(screen.getByText(expectedLine(view))).toBeInTheDocument();
    // Whatever the wording, it cannot read as none while the pack cites one.
    expect(expectedLine(view)).not.toContain("0 disagreement");
  });

  it("omits the domain clause entirely for a template with no domain-keyed sections", () => {
    const gpView = artifactView("gp_brief_v1");
    const summary = computeArtifactSummary(gpView);
    expect(summary.totalDomainCount).toBe(0);

    render(<ArtefactSummaryHeader view={gpView} />);
    expect(screen.queryByText(/domain/)).not.toBeInTheDocument();
  });

  it("the empty-domains disclosure starts collapsed and expands on click, listing exactly the empty domains", () => {
    const view = artifactView("chc_dst_pack_v1");
    const summary = computeArtifactSummary(view);
    expect(summary.domainsWithoutEvidence.length).toBeGreaterThan(0);

    const { container } = render(<ArtefactSummaryHeader view={view} />);
    const toggle = screen.getByRole("button", { name: "Show domains without evidence" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const list = container.querySelector("ul");
    expect(list).toHaveClass("hidden");
    for (const section of summary.domainsWithoutEvidence) {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    }

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Hide domains without evidence" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(list).not.toHaveClass("hidden");
    expect(list).toHaveClass("block");
  });

  it("the disclosure toggle is screen-only (no-print); the empty-domain list itself is not", () => {
    const view = artifactView("chc_dst_pack_v1");
    const { container } = render(<ArtefactSummaryHeader view={view} />);
    const toggle = screen.getByRole("button", { name: "Show domains without evidence" });
    expect(toggle).toHaveClass("no-print");

    const list = container.querySelector("ul");
    expect(list).not.toHaveClass("no-print");
    expect(list).toHaveClass("print:block");
  });
});
