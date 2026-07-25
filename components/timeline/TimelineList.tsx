/**
 * Ordered list of timeline events: left hairline rule, 8px brand dot per
 * event, 2rem vertical rhythm (docs/design.md §6). Server component — see
 * TimelineEventRow for why.
 */

import type { TimelineEvent } from "@/components/data/dal";
import { TimelineEventRow } from "./TimelineEventRow";

export function TimelineList({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative ml-2 mt-8 border-l border-hairline pl-6">
      {events.map((event, index) => (
        <li key={event.fact.id} className="pb-8 last:pb-0">
          <TimelineEventRow event={event} index={index} />
        </li>
      ))}
    </ol>
  );
}
