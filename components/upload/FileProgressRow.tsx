/**
 * One file's row in the progress list. Always shows a named state in prose
 * — never a spinner. The honest partial-read state gets its own thumbnail
 * placeholder and a tertiary link out to the original (docs/design.md §10).
 * Failures use ink-secondary and plain words, never the emergency palette,
 * which is reserved for the safety banner and the 999 card.
 */

import type { ReactNode } from "react";
import { AudioIcon, DocumentIcon, ImageIcon } from "@/components/ui/icons";
import type { FileKind, UploadItem } from "@/components/upload/useUploadSimulation";

const KIND_ICON: Record<FileKind, (props: { className?: string }) => ReactNode> = {
  pdf: DocumentIcon,
  image: ImageIcon,
  audio: AudioIcon,
  other: DocumentIcon,
};

export function FileProgressRow({ item }: { item: UploadItem }) {
  const Icon = KIND_ICON[item.kind];

  return (
    <li className="flex items-start gap-4 rounded-card border border-hairline bg-surface p-4 md:p-5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip border border-hairline bg-paper text-ink-secondary"
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{item.name}</p>
        <p className="mt-1 text-body-s text-ink-secondary">{item.statusLabel}</p>

        {/*
         * A failed row's `statusLabel` is the one reused, honest failure line;
         * any server-provided reason (a 413/415 body, a persist notice) lives
         * in `partialNote`, which would otherwise never reach the screen. Show
         * it as a muted secondary line — the copy is the server's own
         * user-safe string, never invented here. Only on `failed`: on
         * `partial`, the note is already inside `statusLabel`, so rendering it
         * again would duplicate the text (and double-match the partial tests).
         */}
        {item.stage === "failed" && item.partialNote && (
          <p className="mt-1 text-body-s text-ink-secondary">{item.partialNote}</p>
        )}

        {item.stage === "partial" && (
          <div className="mt-3 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card border border-hairline bg-hairline/40 text-ink-secondary"
            >
              <ImageIcon />
            </span>
            <a
              href="#"
              className="text-body-s font-medium text-brand hover:underline underline-offset-4"
            >
              View the original
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
