/**
 * Timeline screen — chronological facts, one idea per screen. Every event
 * carries exactly one ProvenanceTag (docs/design.md §6, user-journey 1.11).
 * Server component: data comes straight from the DAL at render time, no
 * client state needed at the page level.
 */

import { timelineEvents } from "@/components/data/dal";
import { TimelineList } from "@/components/timeline/TimelineList";

export default function TimelinePage() {
  const events = timelineEvents();

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">Timeline</h1>
      <TimelineList events={events} />
    </div>
  );
}
