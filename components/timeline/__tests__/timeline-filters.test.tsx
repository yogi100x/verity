/**
 * TimelineFilters — item 4's chip interactivity, rendered against the real
 * DAL (fixtures/margaret.json under the hood via timelineEvents(), never a
 * hand-built events array). Covers: default "everything" state, toggling a
 * chip narrows the list, counts come from the entries, multiple active
 * chips OR together, clear-all restores the full list, the empty-result
 * state, the zero-count chip's zero-state, and the print honesty rule (a
 * printed timeline never silently omits filtered-out rows).
 */

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { timelineEvents, type TimelineEvent } from "@/components/data/dal";
import { categoriesForEvent } from "../categories";
import { TimelineFilters } from "../TimelineFilters";

afterEach(cleanup);

function eventTitleText(fact: TimelineEvent["fact"]) {
  const subject = fact.subject.charAt(0).toUpperCase() + fact.subject.slice(1);
  return `${subject}: ${fact.canonical_value}`;
}

/**
 * The rows the user actually sees. While a filter is active the document
 * holds two lists — the on-screen filtered one and a print-only complete one
 * (so paper never gets a silently narrowed timeline; see TimelineFilters) —
 * and jsdom applies no stylesheet, so a bare getAllByRole("listitem") would
 * count both. The print-only list is the one inside the `print:block`
 * wrapper; everything else is on screen. Returns [] when the screen shows
 * the empty state instead of a list.
 */
function screenRows(): HTMLElement[] {
  const lists = Array.from(document.querySelectorAll("ol"));
  const screenList = lists.find((list) => list.closest(".print\\:block") === null);
  return Array.from(screenList?.querySelectorAll("li") ?? []);
}

describe("TimelineFilters", () => {
  it("shows every entry by default with no chip active, and states the default", () => {
    const events = timelineEvents();
    render(<TimelineFilters events={events} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(events.length);
    expect(screen.getByText("No filters applied — showing every entry.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("computes chip counts from the entries, never a pinned number", () => {
    const events = timelineEvents();
    const expectedMedicineCount = events.filter((event) =>
      categoriesForEvent(event).includes("medicines"),
    ).length;
    expect(expectedMedicineCount).toBeGreaterThan(0);

    render(<TimelineFilters events={events} />);
    expect(
      screen.getByRole("button", { name: `Medicines · ${expectedMedicineCount}` }),
    ).toBeInTheDocument();
  });

  it("filters to a single active chip's matching rows only", () => {
    const events = timelineEvents();
    const medicineEvents = events.filter((event) =>
      categoriesForEvent(event).includes("medicines"),
    );
    const nonMedicineEvent = events.find(
      (event) => !categoriesForEvent(event).includes("medicines"),
    );
    expect(medicineEvents.length).toBeGreaterThan(0);
    expect(nonMedicineEvent).toBeDefined();

    render(<TimelineFilters events={events} />);
    fireEvent.click(screen.getByRole("button", { name: /^Medicines/ }));

    // Scoped to the on-screen rows: the print-only complete list also holds
    // the non-matching entries, by design, so presence in the document is not
    // the question — presence on screen is.
    expect(screenRows()).toHaveLength(medicineEvents.length);
    const screenText = screenRows()
      .map((row) => row.textContent ?? "")
      .join("\n");
    for (const event of medicineEvents) {
      expect(screenText).toContain(eventTitleText(event.fact));
    }
    expect(screenText).not.toContain(eventTitleText(nonMedicineEvent!.fact));
  });

  it("ORs multiple active chips together rather than intersecting them", () => {
    const events = timelineEvents();
    const medicineOrAppointment = events.filter((event) => {
      const categories = categoriesForEvent(event);
      return categories.includes("medicines") || categories.includes("appointments");
    });

    render(<TimelineFilters events={events} />);
    fireEvent.click(screen.getByRole("button", { name: /^Medicines/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Appointments/ }));

    expect(screenRows()).toHaveLength(medicineOrAppointment.length);
  });

  it("clear-all restores the full list and the default copy", () => {
    const events = timelineEvents();
    render(<TimelineFilters events={events} />);

    fireEvent.click(screen.getByRole("button", { name: /^Medicines/ }));
    expect(screenRows().length).toBeLessThan(events.length);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screenRows()).toHaveLength(events.length);
    expect(screen.getByText("No filters applied — showing every entry.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows an honest empty state with a clear-all affordance when a chip matches nothing", () => {
    // The fixture's uncategorised entries (see categories.test.ts) match no
    // chip at all, so an events array of just those has zero matches for any
    // chip — the true empty-result path.
    const events = timelineEvents();
    const uncategorisedOnly = events.filter(
      (event) => categoriesForEvent(event).length === 0,
    );
    expect(uncategorisedOnly.length).toBeGreaterThan(0);

    render(<TimelineFilters events={uncategorisedOnly} />);
    fireEvent.click(screen.getByRole("button", { name: /^Medicines/ }));

    expect(screen.getByText("No entries match these filters.")).toBeInTheDocument();
    expect(screenRows()).toHaveLength(0);
    // Two clear-all affordances exist while filtered-empty: the chip bar's
    // and the empty state's own.
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screenRows()).toHaveLength(uncategorisedOnly.length);
  });

  it("renders a zero-count chip in the muted zero-state, still pressable, still telling the truth", () => {
    // Hospital stays maps encounter.* only, and this record holds no
    // encounter fact — so the chip must read 0 rather than borrow diagnoses
    // or blood results to look populated. The count is derived, so this
    // asserts against categoriesForEvent, not against the literal 0.
    const events = timelineEvents();
    const expected = events.filter((event) =>
      categoriesForEvent(event).includes("hospital_stays"),
    ).length;

    render(<TimelineFilters events={events} />);
    const chip = screen.getByRole("button", { name: `Hospital stays · ${expected}` });
    expect(chip).toBeInTheDocument();
    expect(chip).not.toBeDisabled();

    if (expected === 0) {
      // Zero-state styling, not the resting style, so an empty chip does not
      // imply there is something behind it.
      expect(chip.className).toContain("text-ink-secondary");
      expect(chip.className).not.toContain("text-ink ");

      fireEvent.click(chip);
      expect(screen.getByText("No entries match these filters.")).toBeInTheDocument();
    }
  });

  it("keeps the chip bar and the filter status line off the printed page", () => {
    const events = timelineEvents();
    const { container } = render(<TimelineFilters events={events} />);

    const group = screen.getByRole("group", { name: "Filter timeline" });
    expect(group).toHaveClass("no-print");

    const status = screen.getByText("No filters applied — showing every entry.");
    expect(status).toHaveClass("no-print");

    // Unfiltered: exactly one list, and it is not suppressed in print.
    const lists = container.querySelectorAll("ol");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.closest(".no-print")).toBeNull();
  });

  it("prints every entry while a filter is active — paper never gets the narrowed list", () => {
    const events = timelineEvents();
    const { container } = render(<TimelineFilters events={events} />);

    fireEvent.click(screen.getByRole("button", { name: /^Medicines/ }));

    const lists = Array.from(container.querySelectorAll("ol"));
    expect(lists).toHaveLength(2);

    // The screen list is the filtered subset and is suppressed in print.
    expect(screenRows().length).toBeLessThan(events.length);
    const screenList = lists.find((list) => list.closest(".print\\:block") === null);
    expect(screenList?.closest(".no-print")).not.toBeNull();

    // The print-only list is complete and is hidden on screen only.
    const printList = lists.find((list) => list.closest(".print\\:block") !== null);
    expect(printList).toBeDefined();
    expect(printList!.querySelectorAll("li")).toHaveLength(events.length);
    expect(printList!.closest(".hidden")).not.toBeNull();
  });
});
