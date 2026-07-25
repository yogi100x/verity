"use client";

/**
 * The document's computed summary line — an audit finding (the pack read as
 * a mostly-empty prototype) fixed by naming, at the top, what is and is not
 * in it. Every count comes from `computeArtifactSummary`; nothing here is
 * pinned to a fixture or a template key.
 *
 * The disclosure is screen-only (`no-print` on the toggle button). The list
 * of empty domains itself stays in the DOM either way and is forced visible
 * under `@media print` (`print:block` beats the screen-only `hidden`, same
 * override pattern as `components/shell/AppNav.tsx`'s `flex md:hidden`) —
 * a pack handed to an assessor must be complete on paper even if it was
 * collapsed on screen.
 */

import { useId, useState } from "react";
import type { ArtifactView } from "@/components/data/dal";
import { computeArtifactSummary } from "./artifactSummary";

function countWord(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function ArtefactSummaryHeader({ view }: { view: ArtifactView }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const summary = computeArtifactSummary(view);
  const emptyDomainCount = summary.domainsWithoutEvidence.length;

  const clauses = [
    `${countWord(summary.sectionsWithEvidenceCount, "section")} contain${
      summary.sectionsWithEvidenceCount === 1 ? "s" : ""
    } evidence`,
  ];
  if (summary.totalDomainCount > 0) {
    clauses.push(
      `${countWord(emptyDomainCount, "domain")} currently ${
        emptyDomainCount === 1 ? "has" : "have"
      } no evidence`,
    );
  }
  clauses.push(
    `${countWord(summary.disagreementCount, "disagreement")} appear${
      summary.disagreementCount === 1 ? "s" : ""
    } in this pack`,
  );

  return (
    <div className="mb-8 rounded-card border border-hairline bg-surface p-6 print-avoid-break">
      <p className="text-body text-ink">{clauses.join(" · ")}.</p>

      {emptyDomainCount > 0 && (
        <div className="mt-4">
          <button
            type="button"
            className="no-print text-body-s font-semibold text-brand underline-offset-2 hover:underline"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide domains without evidence" : "Show domains without evidence"}
          </button>

          <ul
            id={listId}
            className={`${expanded ? "block" : "hidden"} mt-3 list-disc space-y-1 pl-5 text-body-s text-ink-secondary print:block`}
          >
            {summary.domainsWithoutEvidence.map((section) => (
              <li key={section.key}>{section.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
