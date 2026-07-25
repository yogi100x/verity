/**
 * Timeline screen — chronological facts, one idea per screen. Every event
 * carries exactly one ProvenanceTag (docs/design.md §6, user-journey 1.11).
 * Server component: data comes straight from the DAL at render time, no
 * client state needed at the page level.
 */

import { getActiveCaseId } from "@/components/data/activeCase";
import { timelineEvents } from "@/components/data/dal";
import { TimelineFilters } from "@/components/timeline/TimelineFilters";

// Unique per-route title (NHS service manual: every page names itself so
// screen-reader users and tab-jugglers know where they are).
export const metadata = { title: "Timeline — Verity" };

export default async function TimelinePage() {
  const caseId = await getActiveCaseId();
  const events = timelineEvents(caseId);

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">Timeline</h1>
      <TimelineFilters events={events} />
    </div>
  );
}
