/**
 * One template section, rendered generically from `section.slots` — never a
 * hardcoded list of domains or slot keys. Section title is one of the four
 * permitted Fraunces places (docs/design.md §2): "section dividers".
 */

import type { ArtifactSectionView } from "@/components/data/dal";
import { SlotContent } from "./SlotContent";

export function ArtefactSection({ section }: { section: ArtifactSectionView }) {
  const headingId = `artefact-section-${section.key}`;

  return (
    <section aria-labelledby={headingId} className="print-avoid-break">
      <h2
        id={headingId}
        className="border-b border-hairline pb-2 font-display text-title font-[560] text-ink"
      >
        {section.title}
      </h2>

      <div className="mt-4 space-y-6">
        {section.slots.map((slotView) => (
          <div key={slotView.slot.key} className="print-avoid-break">
            <h3 className="text-label font-semibold uppercase tracking-wide text-ink-secondary">
              {slotView.slot.label}
            </h3>
            <div className="mt-2">
              <SlotContent slotView={slotView} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
