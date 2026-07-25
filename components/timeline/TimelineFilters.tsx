"use client";

/**
 * Item 4 — filter chips above the timeline (medicines / appointments /
 * hospital stays / personal notes). This is the client boundary the page
 * needs for chip interactivity; `TimelineList` and `TimelineEventRow`
 * underneath are untouched — same server-renderable list, same single
 * `<ProvenanceTag>` per row invariant, just handed a filtered subset of the
 * events it was already given.
 *
 * Filtering is presentation only: every chip category is derived from
 * `categoriesForEvent` (ontology_key prefix + provenance already on the
 * entry — see components/timeline/categories.ts), nothing here calls the
 * DAL, a detector, or re-derives a fact.
 *
 * Chip semantics: chips toggle, multiple can be active at once, and with
 * every chip off the list shows everything — stated explicitly in the copy
 * below so the default is never left ambiguous. An entry whose category set
 * is empty (the fixture has three — see categories.ts) is still reachable:
 * it renders like any other row when no chips are active, exactly the
 * "all-off" path the default already guarantees.
 *
 * Zero-count chips stay visible and stay pressable, in the muted zero-state
 * style rather than the resting one. A chip that counts zero is a true
 * statement about the record — "Hospital stays · 0" says this record holds no
 * admission the timeline can show — so hiding it would hide a fact, and
 * showing it in the resting style would imply there is something behind it.
 * Pressing it lands on the honest empty state below.
 *
 * Print: the chips and the filter status line are `no-print`, and a printed
 * timeline always contains EVERY entry, never the filtered subset. A sheet of
 * paper carries no chip bar to explain what was left out, so silently
 * printing a narrowed list would hand someone an incomplete record that
 * looks complete. While filters are active the on-screen list is suppressed
 * in print and a print-only full list takes its place.
 */

import { useMemo, useState } from "react";
import type { TimelineEvent } from "@/components/data/dal";
import { Button } from "@/components/ui/Button";
import { TIMELINE_CATEGORIES, categoriesForEvent, type TimelineCategoryKey } from "./categories";
import { TimelineList } from "./TimelineList";

export function TimelineFilters({ events }: { events: TimelineEvent[] }) {
  const [activeChips, setActiveChips] = useState<readonly TimelineCategoryKey[]>([]);

  const categorized = useMemo(
    () => events.map((event) => ({ event, categories: categoriesForEvent(event) })),
    [events],
  );

  // Computed from the entries every render — never pinned — so a fixture or
  // API change changes the numbers with no edit here.
  const counts = useMemo(() => {
    const initial: Record<TimelineCategoryKey, number> = {
      medicines: 0,
      appointments: 0,
      hospital_stays: 0,
      personal_notes: 0,
    };
    return categorized.reduce((acc, { categories }) => {
      for (const category of categories) acc[category] += 1;
      return acc;
    }, initial);
  }, [categorized]);

  const filteredEvents = useMemo(() => {
    if (activeChips.length === 0) return events;
    return categorized
      .filter(({ categories }) => categories.some((category) => activeChips.includes(category)))
      .map(({ event }) => event);
  }, [categorized, activeChips, events]);

  function toggleChip(key: TimelineCategoryKey) {
    setActiveChips((prev) =>
      prev.includes(key) ? prev.filter((active) => active !== key) : [...prev, key],
    );
  }

  function clearFilters() {
    setActiveChips([]);
  }

  const hasActiveFilters = activeChips.length > 0;

  return (
    <div>
      <div
        role="group"
        aria-label="Filter timeline"
        className="no-print mt-6 flex flex-wrap items-center gap-2"
      >
        {TIMELINE_CATEGORIES.map(({ key, label }) => {
          const pressed = activeChips.includes(key);
          const empty = counts[key] === 0;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggleChip(key)}
              className={[
                "rounded-chip px-3 py-1.5 text-body-s font-medium transition-[filter] duration-[120ms] ease-out",
                pressed
                  ? "border border-transparent bg-brand text-white"
                  : empty
                    ? "border border-hairline bg-paper text-ink-secondary hover:brightness-[0.97]"
                    : "border border-hairline bg-surface text-ink hover:brightness-[0.97]",
              ].join(" ")}
            >
              {label} · {counts[key]}
            </button>
          );
        })}
        {hasActiveFilters && (
          <Button variant="tertiary" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <p className="no-print mt-2 text-body-s text-ink-secondary">
        {hasActiveFilters
          ? `Showing entries matching ${activeChips.length} of ${TIMELINE_CATEGORIES.length} filters.`
          : "No filters applied — showing every entry."}
      </p>

      {/* Screen view: the filtered subset. Suppressed in print whenever it is
          a subset, so paper never shows a narrowed list without saying so. */}
      <div className={hasActiveFilters ? "no-print" : undefined}>
        {filteredEvents.length > 0 ? (
          <TimelineList events={filteredEvents} />
        ) : (
          <div className="mt-8">
            <p className="text-body text-ink-secondary">No entries match these filters.</p>
            <div className="mt-3">
              <Button variant="tertiary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Print view: every entry, unfiltered. Only rendered while filters are
          active, so there is exactly one list in the document either way. */}
      {hasActiveFilters && (
        <div className="hidden print:block">
          <TimelineList events={events} />
        </div>
      )}
    </div>
  );
}
