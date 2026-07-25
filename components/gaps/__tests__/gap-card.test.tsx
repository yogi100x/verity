/**
 * Gaps are statements about the record, never advice, and never alarming —
 * docs/design.md §6. No warning iconography is asserted here by omission:
 * GapCard renders only ProvenanceTag (document/speech-bubble icons). The
 * "Draft request letter" button is stretch S3 and does not render until the
 * letter generation behind it exists.
 */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GapCard } from "../GapCard";
import type { GapView } from "@/components/data/dal";

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

describe("GapCard", () => {
  it("renders the statement verbatim", () => {
    render(<GapCard gap={gap} />);
    expect(screen.getByText(gap.statement)).toBeInTheDocument();
  });

  it("renders a ProvenanceTag for each supporting citation", () => {
    render(<GapCard gap={gap} />);
    expect(screen.getByText("Discharge summary")).toBeInTheDocument();
  });

  it("renders the suggested next document when present", () => {
    render(<GapCard gap={gap} />);
    expect(
      screen.getByText(`What would settle it: ${gap.suggestedNextDocument}`),
    ).toBeInTheDocument();
  });

  it("renders no draft-letter control before stretch S3 lands", () => {
    render(<GapCard gap={gap} />);
    expect(
      screen.queryByRole("button", { name: "Draft request letter" }),
    ).not.toBeInTheDocument();
  });

  it("omits the suggested-document line when null", () => {
    render(<GapCard gap={{ ...gap, suggestedNextDocument: null }} />);
    expect(screen.queryByText(/What would settle it/)).not.toBeInTheDocument();
  });
});
