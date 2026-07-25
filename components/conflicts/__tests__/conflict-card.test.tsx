/**
 * The money moment, tested — docs/design.md §6. jsdom has no
 * IntersectionObserver, so ConflictCard's scroll-into-view fallback shows
 * the card synchronously on mount, which is exactly what makes these
 * assertions possible without `waitFor`.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConflictCard } from "../ConflictCard";
import type { ConflictView } from "@/components/data/dal";

// jsdom has no IntersectionObserver, so ConflictCard's scroll-into-view
// fallback shows the card synchronously on mount. matchMedia (read by the
// institutional chips' <ProvenanceTag> to choose popover-vs-sheet) is
// polyfilled globally in vitest.setup.ts (see setupFiles in vitest.config.ts).

const conflict: ConflictView = {
  id: "c1000000-0000-4000-8000-000000000001",
  subject: "furosemide",
  generatedQuestion:
    "Three sources disagree about the water tablet (furosemide). Ask whether it should have been restarted.",
  chips: [
    {
      sourceName: "Discharge summary",
      sourceKind: "pdf",
      locatorLabel: "p.2 · c.512–620",
      dateLabel: "25 June 2026",
      quote: "Furosemide 40mg — STOPPED prior to discharge due to worsening renal function.",
      isPatient: false,
      sourceId: "50000000-0000-4000-8000-000000000001",
      sourceTitle: "Discharge summary",
      locator: { page: 2, char_start: 512, char_end: 620, ms_start: null, ms_end: null },
    },
    {
      sourceName: "Repeat prescription",
      sourceKind: "image",
      locatorLabel: "item 2",
      dateLabel: "3 July 2026",
      quote: "Furosemide 40mg tablets — 28 days",
      isPatient: false,
      sourceId: "50000000-0000-4000-8000-000000000002",
      sourceTitle: "Repeat prescription",
      locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
    },
    {
      sourceName: "Margaret's Juno history",
      sourceKind: "juno_conversation",
      locatorLabel: "evening",
      dateLabel: "3 July 2026",
      quote: "Still taking my water tablet at bedtime like always.",
      isPatient: true,
      sourceId: "50000000-0000-4000-8000-000000000003",
      sourceTitle: "Margaret's Juno history",
      locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
    },
  ],
};

describe("ConflictCard", () => {
  it("renders exactly three chips of equal structural weight", () => {
    render(<ConflictCard conflict={conflict} />);
    const chips = screen.getAllByTestId("conflict-chip");
    expect(chips).toHaveLength(3);
    // Equal weight: every chip is built from the same className string.
    const classNames = new Set(chips.map((chip) => chip.className));
    expect(classNames.size).toBe(1);
  });

  it("marks exactly one chip as the patient chip", () => {
    render(<ConflictCard conflict={conflict} />);
    const chips = screen.getAllByTestId("conflict-chip");
    const patientChips = chips.filter((chip) => chip.dataset.patient === "true");
    expect(patientChips).toHaveLength(1);
    expect(patientChips[0]).toHaveTextContent("Margaret's Juno history");
  });

  it("derives the header from subject and chip count, never hardcoded", () => {
    render(<ConflictCard conflict={conflict} />);
    expect(
      screen.getByRole("heading", { name: "Three sources disagree about the furosemide." }),
    ).toBeInTheDocument();
  });

  it("shows the resolution line and the generated question in a callout", () => {
    render(<ConflictCard conflict={conflict} />);
    expect(
      screen.getByText("This is now a question on the appointment brief:"),
    ).toBeInTheDocument();
    expect(screen.getByText(conflict.generatedQuestion)).toBeInTheDocument();
  });

  it("never renders an accept, reject, or resolve control", () => {
    render(<ConflictCard conflict={conflict} />);
    const buttons = screen.queryAllByRole("button");
    for (const button of buttons) {
      const text = (button.textContent ?? "").toLowerCase();
      expect(text).not.toMatch(/accept|reject|resolve/);
    }
  });

  it("makes each institutional chip open its own source in a popover", () => {
    render(<ConflictCard conflict={conflict} />);
    const chips = screen.getAllByTestId("conflict-chip");
    const institutionalChips = chips.filter((chip) => chip.dataset.patient !== "true");
    expect(institutionalChips).toHaveLength(2);

    for (const chip of institutionalChips) {
      // Each institutional chip carries exactly one ProvenanceTag citation
      // trigger — the "click opens its own source" control (journey 1.13).
      const trigger = within(chip).getByRole("button");
      expect(trigger).toHaveAttribute("data-source-id");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      // Enter toggles the popover open, revealing the source.
      fireEvent.keyDown(trigger, { key: "Enter" });
      expect(within(chip).getByRole("dialog")).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    }

    // The discharge popover (opened in the loop above) shows its verbatim
    // words — the quote a judge sees on click.
    const [discharge] = institutionalChips;
    const dischargeDialog = within(discharge).getByRole("dialog");
    expect(
      within(dischargeDialog).getByText(/STOPPED prior to discharge due to worsening renal function/),
    ).toBeInTheDocument();
  });

  it("shows the patient's own words and timestamp inline, with no popover", () => {
    render(<ConflictCard conflict={conflict} />);
    const chips = screen.getAllByTestId("conflict-chip");
    const patientChip = chips.find((chip) => chip.dataset.patient === "true");
    expect(patientChip).toBeDefined();
    if (patientChip === undefined) return;

    // Her actual words, verbatim, visible at rest.
    expect(within(patientChip).getByText(/Still taking my water tablet at bedtime/)).toBeInTheDocument();
    // Timestamped: the header line carries her date.
    expect(within(patientChip).getByText(/3 July 2026/)).toBeInTheDocument();
    // No source page to open ⇒ no popover trigger (mirrors userStated).
    expect(within(patientChip).queryByRole("button")).toBeNull();
  });
});
