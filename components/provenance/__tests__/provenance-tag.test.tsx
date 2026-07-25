/**
 * Render-level coverage for <ProvenanceTag>'s citation popover — lane brief
 * test 3 (docs/lanes/lane-b-surface.md §Tests): "Citation popover shows the
 * quote verbatim, unmodified." The type-level invariant (either/or/never
 * both/never neither) is covered separately in provenance-tag.types.test.ts.
 *
 * The quote here is deliberately hostile to any string transform a naive
 * implementation might apply: double spaces, curly quotes, and an em dash.
 * If the component trimmed, collapsed whitespace, or re-quoted the string,
 * this test would catch it. JSX text nodes don't collapse whitespace in the
 * DOM (only CSS does, visually) so textContent is the right assertion.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProvenanceTag, type ProvenanceCitation } from "../ProvenanceTag";

// matchMedia is polyfilled globally in vitest.setup.ts.

const HOSTILE_QUOTE =
  'Furosemide 40mg  — STOPPED prior to discharge due to "worsening" renal   function.';

const citation: ProvenanceCitation = {
  sourceTitle: "Discharge summary",
  locator: { page: 2, char_start: 512, char_end: 620, ms_start: null, ms_end: null },
  quote: HOSTILE_QUOTE,
  sourceId: "50000000-0000-4000-8000-000000000001",
};

describe("ProvenanceTag citation popover", () => {
  it("shows the quote verbatim, unmodified", () => {
    render(<ProvenanceTag citation={citation} />);

    // Desktop opens via hover/focus (320ms delay) or the Enter/Space
    // keyboard path (docs/design.md §9); Enter is immediate and avoids
    // fake timers.
    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "Enter" });

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(HOSTILE_QUOTE);
  });

  it("opens with Enter and closes with Escape (docs/design.md §9)", () => {
    render(<ProvenanceTag citation={citation} />);

    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("wraps the quote in real quotation marks without altering the quoted text itself", () => {
    render(<ProvenanceTag citation={citation} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });

    const dialog = screen.getByRole("dialog");
    // The left-border quote block is the one whose text is the citation
    // itself, not the source title/locator line below it.
    const quoteEl = dialog.querySelector(".border-l-\\[3px\\]");
    expect(quoteEl).not.toBeNull();
    expect(quoteEl?.textContent).toBe(`“${HOSTILE_QUOTE}”`);
  });
});
