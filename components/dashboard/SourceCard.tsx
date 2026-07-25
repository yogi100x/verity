/**
 * One row per source on the dashboard. Deliberately neutral — no citation
 * teal, no provenance chip — this is a document in a list, not a claim on
 * the page; the citation palette is reserved for `<ProvenanceTag>`
 * (docs/design.md §3).
 */

import type { ReactNode } from "react";
import { formatDateLabel } from "@/components/data/dal";
import type { Source, SourceKind } from "@/lib/contracts";
import { AudioIcon, DocumentIcon, ImageIcon, SpeechBubbleIcon } from "@/components/ui/icons";
import { Card } from "@/components/ui/Card";

const KIND_ICON: Record<SourceKind, (props: { className?: string }) => ReactNode> = {
  pdf: DocumentIcon,
  text: DocumentIcon,
  image: ImageIcon,
  audio: AudioIcon,
  juno_conversation: SpeechBubbleIcon,
};

export function SourceCard({ source, claimCount }: { source: Source; claimCount: number }) {
  const Icon = KIND_ICON[source.kind];
  const dateLabel = formatDateLabel(source.created_at.slice(0, 10), "exact");

  return (
    <Card className="flex items-center gap-4 p-4 md:p-5">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip border border-hairline bg-paper text-ink-secondary"
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{source.title}</p>
        <p className="text-body-s text-ink-secondary">{dateLabel}</p>
      </div>
      <span className="shrink-0 text-body-s text-ink-secondary">
        {claimCount} claim{claimCount === 1 ? "" : "s"}
      </span>
    </Card>
  );
}
