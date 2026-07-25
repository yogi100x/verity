/**
 * A gap is a statement about the record, never advice — docs/design.md §6.
 * Dashed hairline border (distinct from the solid-border <Card>), 12px
 * radius, surface fill. No warning icons anywhere: gaps are informational,
 * never alarming, and colour is never the only signal (icons + text are
 * for the citation/unverified tags below, not for the gap's own framing).
 */

import { ProvenanceTag } from "@/components/provenance/ProvenanceTag";
import type { GapView } from "@/components/data/dal";

export function GapCard({ gap }: { gap: GapView }) {
  return (
    <div className="rounded-card border border-dashed border-hairline bg-surface p-6 md:p-8">
      <p className="text-body-l text-ink">{gap.statement}</p>

      {gap.citations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {gap.citations.map((citation, index) => (
            <ProvenanceTag key={`${citation.sourceId}-${index}`} citation={citation} />
          ))}
        </div>
      )}

      {gap.suggestedNextDocument !== null && (
        <p className="mt-4 text-body-s text-ink-secondary">
          What would settle it: {gap.suggestedNextDocument}
        </p>
      )}

      {/* The "Draft request letter" secondary button is stretch S3
          (docs/lanes/lane-b-surface.md) — it appears when Lane C's letter
          generation lands, not before. Until then there is nothing honest a
          disabled control could say, so no control renders at all. */}
    </div>
  );
}
