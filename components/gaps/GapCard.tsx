"use client";

/**
 * A gap is a statement about the record, never advice — docs/design.md §6.
 * Dashed hairline border (distinct from the solid-border <Card>), 12px
 * radius, surface fill. No warning icons anywhere: gaps are informational,
 * never alarming, and colour is never the only signal (icons + text are
 * for the citation/unverified tags below, not for the gap's own framing).
 *
 * Stretch S3 (UI half): a secondary "Draft request letter" button opens
 * `LetterModal`, which renders Lane C's `draftRequestLetter` output
 * read-only (docs/lanes/lane-b-surface.md). The letter itself is generated
 * server-side by the gaps page and arrives here as a finished, serialisable
 * `RequestLetter` prop — this component neither generates nor mutates it, so
 * no snapshot or data-access import is pulled into the client bundle. The
 * button carries an `id` (not a ref — <Button> is a plain function
 * component, not `forwardRef`) so the close handler can return focus to it
 * without reaching into <Button>'s internals. `useId` makes the id unique
 * per card, so focus returns to the button that opened the dialog.
 */

import { useId, useState } from "react";
import { ProvenanceTag } from "@/components/provenance/ProvenanceTag";
import { Button } from "@/components/ui/Button";
import { LetterModal } from "@/components/letters/LetterModal";
import type { GapView } from "@/components/data/dal";
import type { RequestLetter } from "@/lib/copy/request_letters";

export function GapCard({ gap, letter }: { gap: GapView; letter: RequestLetter }) {
  const [isLetterOpen, setIsLetterOpen] = useState(false);
  const triggerId = useId();

  function closeLetter() {
    setIsLetterOpen(false);
    document.getElementById(triggerId)?.focus();
  }

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

      <div className="mt-4">
        <Button id={triggerId} variant="secondary" onClick={() => setIsLetterOpen(true)}>
          Draft request letter
        </Button>
      </div>

      {isLetterOpen && <LetterModal letter={letter} onClose={closeLetter} />}
    </div>
  );
}
