"use client";

/**
 * Renders the CHC Checklist-to-decision clock (lib/detectors/chc_clock.ts)
 * plus a "Prepare follow-up letter" button that opens the existing S3 LetterModal
 * with the pre-generated chase letter (docs/lanes/lane-b-surface.md).
 *
 * Mirrors GapCard's structure exactly: client component, solid <Card>
 * (distinct from the gap card's dashed border — this is a record statement,
 * not a gap), secondary Button, isLetterOpen state, conditional LetterModal
 * render, focus-return-to-trigger via useId.
 *
 * Both `statement` and `letter` arrive from `chcDeadlines`, computed
 * server-side on the gaps page — this component authors no prose of its
 * own and does no lookup, so no data-access import is pulled into the
 * client bundle (same discipline as GapCard/LetterModal).
 *
 * No urgency styling: `days_elapsed` is never read by this component at
 * all (it isn't even a prop) — only the finished `statement` string is
 * rendered, as one plain prose block. The card's markup and classes are
 * therefore identical whether the underlying deadline is a day old or a
 * year old; there is nowhere in this file a day count could branch on,
 * which is the point (lib/detectors/chc_clock.ts's own header comment).
 */

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LetterModal } from "@/components/letters/LetterModal";
import type { RequestLetter } from "@/lib/copy/request_letters";

export type ClockCardProps = {
  /** Verbatim from `ChcDeadline.statement` — rendered as-is, never recomposed. */
  statement: string;
  /** Verbatim from `ChcDeadline.chase_letter` — handed straight to LetterModal. */
  letter: RequestLetter;
};

export function ClockCard({ statement, letter }: ClockCardProps) {
  const [isLetterOpen, setIsLetterOpen] = useState(false);
  const triggerId = useId();

  function closeLetter() {
    setIsLetterOpen(false);
    document.getElementById(triggerId)?.focus();
  }

  return (
    <Card>
      <p className="text-body-l text-ink">{statement}</p>

      <div className="mt-4">
        <Button id={triggerId} variant="secondary" onClick={() => setIsLetterOpen(true)}>
          Prepare follow-up letter
        </Button>
      </div>

      {isLetterOpen && (
        <LetterModal letter={letter} onClose={closeLetter} title="Prepare follow-up letter" />
      )}
    </Card>
  );
}
