/**
 * Gaps are statements about the record, never advice, and never alarming —
 * docs/design.md §6. No warning iconography is asserted here by omission:
 * GapCard renders ProvenanceTag (document/speech-bubble icons) plus, as of
 * stretch S3, a secondary "Draft request letter" button. The letter's own
 * content/interaction is covered by components/letters/__tests__ — here we
 * only assert the button exists and opens the modal.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GapCard } from "../GapCard";
import type { GapView } from "@/components/data/dal";
import type { RequestLetter } from "@/lib/copy/request_letters";

// matchMedia is polyfilled globally in vitest.setup.ts (see setupFiles in
// vitest.config.ts) — ProvenanceTag (components/provenance, outside this
// lane's territory) reads it to choose the popover/sheet split.

const gap: GapView = {
  id: "9a000000-0000-4000-8000-000000000001",
  detector: "instruction_without_result",
  statement:
    "The discharge summary asks for a review of renal function within 7 days of 25 June 2026. No result is recorded after that date.",
  suggestedNextDocument: "Blood test result from Elmfield Surgery, after 25 June 2026",
  citations: [
    {
      sourceTitle: "Discharge summary",
      locator: { page: 2, char_start: 24, char_end: 40, ms_start: null, ms_end: null },
      quote: "Review renal function within 7 days.",
      sourceId: "50000000-0000-4000-8000-000000000001",
    },
  ],
};

// GapCard is a pure display component: the letter is generated server-side
// and handed down as a prop. These tests don't inspect letter content (that
// is covered in components/letters/__tests__), so a fixed stub suffices.
const letter: RequestLetter = {
  recipient: "gp",
  salutation: "Dear Doctor,",
  body: "Margaret Okonkwo's record includes the following.",
  closing: "Yours faithfully,",
};

describe("GapCard", () => {
  it("renders the statement verbatim", () => {
    render(<GapCard gap={gap} letter={letter} />);
    expect(screen.getByText(gap.statement)).toBeInTheDocument();
  });

  it("renders a ProvenanceTag for each supporting citation", () => {
    render(<GapCard gap={gap} letter={letter} />);
    expect(screen.getByText("Discharge summary")).toBeInTheDocument();
  });

  it("renders the suggested next document when present", () => {
    render(<GapCard gap={gap} letter={letter} />);
    expect(
      screen.getByText(`What would settle it: ${gap.suggestedNextDocument}`),
    ).toBeInTheDocument();
  });

  it("renders a Draft request letter button", () => {
    render(<GapCard gap={gap} letter={letter} />);
    expect(screen.getByRole("button", { name: "Draft request letter" })).toBeInTheDocument();
  });

  it("opens the letter modal on click", () => {
    render(<GapCard gap={gap} letter={letter} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft request letter" }));
    expect(screen.getByRole("dialog", { name: "Draft request letter" })).toBeInTheDocument();
  });

  it("omits the suggested-document line when null", () => {
    render(<GapCard gap={{ ...gap, suggestedNextDocument: null }} letter={letter} />);
    expect(screen.queryByText(/What would settle it/)).not.toBeInTheDocument();
  });
});
