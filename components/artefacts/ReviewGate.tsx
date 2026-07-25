"use client";

/**
 * The print gate. A controlled component: the reviewer's name is owned by
 * the parent (the footer disclaimer needs it too), the checkbox state is
 * owned by the parent for the same reason. This component just renders the
 * two controls plus the print button and enforces the unlock rule.
 *
 * The gate itself never appears in print (docs/design.md §8) — reviewing is
 * a screen-only step.
 */

import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { MicButton } from "@/components/dictation/MicButton";

const DISABLED_REASON = "Review to unlock printing";

type ReviewGateProps = {
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
  reviewerName: string;
  onReviewerNameChange: (name: string) => void;
  /** The active person's uuid, for the dictation mic beside the free-text
   *  field below — threaded from the server page via ArtefactDocument's
   *  `view.person.id` (already resolved there; no new server fetch). */
  personId: string;
};

export function ReviewGate({
  reviewed,
  onReviewedChange,
  reviewerName,
  onReviewerNameChange,
  personId,
}: ReviewGateProps) {
  const nameId = useId();
  const checkboxId = useId();
  const canPrint = reviewed && reviewerName.trim().length > 0;

  return (
    <div className="no-print mb-8 rounded-card border border-hairline bg-surface p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-label font-semibold text-ink">
              Your name
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                id={nameId}
                type="text"
                value={reviewerName}
                onChange={(event) => onReviewerNameChange(event.target.value)}
                placeholder="Type your name"
                className="h-12 w-64 max-w-full rounded-card border border-hairline bg-paper px-3 text-body text-ink"
              />
              {/*
                Dictation here saves a new audio Source, it does not fill
                the name field: nothing has transcribed the recording yet
                (see DICTATION_STATES.saved), so writing its title into
                `reviewerName` would put non-name text where a typed name
                belongs. MicButton's own "saved" line is the confirmation.
                No `title` prop: the recording is not a reviewer name, so
                the honest default ("Voice note — <date>", from
                lib/voice/audio.ts) titles the Source instead.
              */}
              <MicButton personId={personId} variant="compact" />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              id={checkboxId}
              type="checkbox"
              checked={reviewed}
              onChange={(event) => onReviewedChange(event.target.checked)}
              className="h-5 w-5 rounded-[4px] border border-hairline"
            />
            <label htmlFor={checkboxId} className="text-body text-ink">
              I have reviewed every line of this document
            </label>
          </div>
        </div>

        {canPrint ? (
          <Button variant="primary" onClick={() => window.print()}>
            Print
          </Button>
        ) : (
          <Button variant="primary" disabled disabledReason={DISABLED_REASON}>
            Print
          </Button>
        )}
      </div>
    </div>
  );
}
