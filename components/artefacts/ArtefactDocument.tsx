"use client";

/**
 * The artefact document itself: masthead, review gate, template-driven
 * sections, footer disclaimer. This is the ONE component both phase-1
 * templates render through — never a per-template component.
 *
 * `print-columns` / `print-avoid-break` hook the print stylesheet already
 * defined in app/globals.css (not edited here). The sections wrapper stays
 * a plain block element (no flex) because CSS multi-column layout only
 * applies to block-level containers.
 */

import { useState } from "react";
import { footer } from "@/lib/copy/safety";
import type { ArtifactView } from "@/components/data/dal";
import { ArtefactSection } from "./ArtefactSection";
import { AttendanceAllowanceLine } from "./AttendanceAllowanceLine";
import { ReviewGate } from "./ReviewGate";

type ArtefactDocumentProps = {
  view: ArtifactView;
  /** Pre-formatted en-GB date string, computed by the server page so the
   *  client component never depends on the reader's clock or locale. */
  todayLabel: string;
  /**
   * S4 — whether to render the Attendance Allowance line after the last
   * section. This component never branches on a template key itself (the
   * structural rule in docs/design.md — components/artefacts must not know
   * template keys); the caller decides. lib/copy/attendance_allowance.ts
   * exports no template key or applicability helper to key off, so the
   * least-bad seam is the page: app/(app)/artefacts/[key]/page.tsx already
   * holds the validated `templateKey` param and passes this boolean down.
   * Page-level composition, not renderer branching.
   */
  showAttendanceAllowance?: boolean;
};

export function ArtefactDocument({
  view,
  todayLabel,
  showAttendanceAllowance = false,
}: ArtefactDocumentProps) {
  const [reviewed, setReviewed] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const displayName = reviewerName.trim();

  return (
    <article>
      <header className="mb-10 print-avoid-break">
        <h1 className="print-masthead font-display text-display-l font-[560] text-ink">
          {view.title}
        </h1>
        <p className="mt-2 text-body-s text-ink-secondary">{view.audience}</p>
      </header>

      <ReviewGate
        reviewed={reviewed}
        onReviewedChange={setReviewed}
        reviewerName={reviewerName}
        onReviewerNameChange={setReviewerName}
        personId={view.person.id}
      />

      <div className="print-columns space-y-12">
        {view.sections.map((section) => (
          <ArtefactSection key={section.key} section={section} />
        ))}
      </div>

      {showAttendanceAllowance && (
        <AttendanceAllowanceLine personName={view.person.display_name} />
      )}

      <footer className="print-footer print-avoid-break mt-12 border-t border-hairline pt-6 text-body-s text-ink-secondary">
        {/* Slot-filled from lib/copy/safety.ts — Lane C pins this template
            byte-for-byte against prd.md §8.5. Never retype it here. */}
        <p>{footer(displayName.length > 0 ? displayName : "—", todayLabel)}</p>
      </footer>
    </article>
  );
}
