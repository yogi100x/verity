/**
 * A single timeline row: date, title, optional superseded note, and exactly
 * one <ProvenanceTag>. This is the product's core invariant (user-journey
 * 1.11) — every event carries either a citation or an unverified badge,
 * never neither (docs/design.md §6, §10).
 *
 * Server component: ProvenanceTag owns its own "use client" boundary for the
 * popover/sheet interactivity, so nothing here needs to be a client module.
 */

import type { TimelineEvent } from "@/components/data/dal";
import { ProvenanceTag } from "@/components/provenance/ProvenanceTag";

/**
 * "furosemide" + "Continue 40mg daily" → "Furosemide: Continue 40mg daily".
 * The DAL exposes `fact` verbatim (subject + canonical_value); the DAL owns
 * date/provenance formatting, but the reading sentence for a fact is a
 * screen concern, so it lives here rather than being invented upstream.
 */
function eventTitle(fact: TimelineEvent["fact"]): string {
  const subject = fact.subject.charAt(0).toUpperCase() + fact.subject.slice(1);
  return `${subject}: ${fact.canonical_value}`;
}

export function TimelineEventRow({
  event,
  index,
}: {
  event: TimelineEvent;
  index: number;
}) {
  const { fact, dateLabel, isApproximate, superseded, supersededNote, provenance } = event;
  // A machine-readable <time datetime> must be a real point in time. An
  // approximate label ("around March 2024") has no such point, so it renders
  // as plain text — emitting a precise datetime would be a bogus claim of
  // precision the record does not support (docs/design.md §6).
  const isoDate = !isApproximate ? fact.valid_from : null;

  const dateClassName = `font-mono text-mono-s text-ink-secondary${
    isApproximate ? " underline decoration-dotted decoration-1 underline-offset-4" : ""
  }`;

  return (
    <div
      className="relative animate-timeline-entry"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span
        aria-hidden="true"
        className="absolute left-[calc(-1.5rem_-_5px)] top-2 h-[9px] w-[9px] rounded-full bg-brand"
      />

      {isoDate !== null ? (
        <time dateTime={isoDate} className={`block ${dateClassName}`}>
          {dateLabel}
        </time>
      ) : (
        <span className={`block ${dateClassName}`}>{dateLabel}</span>
      )}

      <p
        className={`mt-1 mb-2 text-body-l ${
          superseded ? "text-ink-secondary line-through" : "text-ink"
        }`}
      >
        {eventTitle(fact)}
      </p>

      {superseded && supersededNote !== undefined ? (
        <p className="mb-2 text-body-s italic text-ink-secondary">{supersededNote}</p>
      ) : null}

      <ProvenanceTag {...provenance} />
    </div>
  );
}
