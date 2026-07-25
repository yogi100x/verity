/**
 * Renders the timeline against the real DAL (fixtures/margaret.json under
 * the hood, never imported directly here — dal.ts is the only door in).
 *
 * Covers the product's core invariant (user-journey 1.11): every timeline
 * row carries exactly one provenance tag, never zero, never two.
 */

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { timelineEvents, type TimelineEvent } from "@/components/data/dal";
import { TimelineEventRow } from "../TimelineEventRow";
import { TimelineList } from "../TimelineList";

// matchMedia is polyfilled globally in vitest.setup.ts (see setupFiles in
// vitest.config.ts) — ProvenanceTag (components/provenance, outside this
// lane's territory) reads it to choose the popover/sheet split.

describe("Timeline", () => {
  const events = timelineEvents();

  it("renders one list item per DAL event, each with exactly one provenance tag", () => {
    render(<TimelineList events={events} />);

    const items = screen.getAllByRole("listitem");
    // (b) event count matches timelineEvents().length
    expect(items).toHaveLength(events.length);
    expect(events.length).toBeGreaterThan(0);

    for (const item of items) {
      // (a) exactly one provenance tag per row — a citation chip is a
      // <button>, an unverified badge is undecorated text with no role.
      const citationChips = within(item).queryAllByRole("button");
      const unverifiedBadges = within(item).queryAllByText(
        "You told us this — not from a document.",
      );
      expect(citationChips.length + unverifiedBadges.length).toBe(1);
    }
  });

  it("strikes through the superseded event, shows its replacement note, and keeps the citation chip live", () => {
    const supersededEvent = events.find((event) => event.superseded);
    if (supersededEvent === undefined || supersededEvent.supersededNote === undefined) {
      throw new Error("fixture no longer has a superseded event with a note — see fixtures/margaret.json");
    }

    render(<TimelineList events={events} />);

    // (c) superseded event has line-through styling and its note
    const note = screen.getByText(supersededEvent.supersededNote);
    expect(note).toHaveClass("italic");

    const item = note.closest("li");
    expect(item).not.toBeNull();
    const title = item?.querySelector("p");
    expect(title).toHaveClass("line-through");
    expect(title).toHaveClass("text-ink-secondary");

    // Superseded evidence is still evidence — never hidden, chip stays live.
    expect(within(item as HTMLElement).getAllByRole("button")).toHaveLength(1);
  });

  it("gives an approximate-dated event a dotted underline and a spelled-out label, never a bare asterisk", () => {
    // The current fixture has no approximate-precision fact (verified via
    // dal.timelineEvents() — every claim in fixtures/margaret.json is
    // 'exact'), so this exercises the rendering rule directly against a
    // real TimelineEvent shape rather than a fixture import. dal.test.ts
    // covers the dateLabel/isApproximate derivation itself.
    const approximateEvent: TimelineEvent = {
      ...events[0],
      dateLabel: "around March 2024",
      isApproximate: true,
      superseded: false,
      supersededNote: undefined,
    };

    render(<TimelineEventRow event={approximateEvent} index={0} />);

    const dateEl = screen.getByText("around March 2024");
    expect(dateEl.textContent).not.toContain("*");
    expect(dateEl).toHaveClass("decoration-dotted");
    // An approximate label must not emit a machine-readable <time datetime>:
    // there is no precise instant to assert. It renders as plain text.
    expect(dateEl.tagName).toBe("SPAN");
    expect(dateEl.closest("time")).toBeNull();
  });
});
