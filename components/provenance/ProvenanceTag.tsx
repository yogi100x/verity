"use client";

/**
 * The signature component. A judge should be able to tell, from across a
 * room, which parts of the screen came from a document and which came from
 * a person — this is the entire visual thesis (docs/design.md §5).
 *
 * Type-level invariant: either `citation` or `userStated: true`, never both,
 * never neither. A sourceless fact must be unrepresentable in the type
 * system, not merely discouraged.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Locator } from "@/lib/contracts";
import { formatLocator } from "@/components/data/dal";
import { DocumentIcon, SpeechBubbleIcon } from "@/components/ui/icons";

const POPOVER_DELAY_MS = 320;
const MOBILE_QUERY = "(max-width: 639px)";

export type ProvenanceCitation = {
  sourceTitle: string;
  locator: Locator;
  quote: string;
  sourceId: string;
};

export type ProvenanceTagProps =
  | { citation: ProvenanceCitation; userStated?: never }
  | { userStated: true; citation?: never };

/** The citation deep link — GET /api/sources/[id]/open 302s to the document
 *  (signed URL in live, demo asset otherwise) and carries `?page=` through
 *  as a `#page=N` fragment on the target, which native PDF viewers honour. */
function openSourceHref(citation: ProvenanceCitation): string {
  const base = `/api/sources/${encodeURIComponent(citation.sourceId)}/open`;
  return citation.locator.page !== null ? `${base}?page=${citation.locator.page}` : base;
}

function shortSourceName(title: string): string {
  // Keeps the chip compact; the full title always appears in the
  // popover/sheet, so nothing is lost by truncating here.
  const words = title.split(" ");
  return words.length > 3 ? `${words.slice(0, 3).join(" ")}…` : title;
}

export function ProvenanceTag(props: ProvenanceTagProps) {
  if (props.userStated) {
    return <UnverifiedTag />;
  }
  return <CitationTag citation={props.citation} />;
}

function UnverifiedTag() {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-chip border border-unverified-border bg-unverified-fill px-2.5 py-1 text-label text-unverified-text">
      <SpeechBubbleIcon />
      You told us this — not from a document.
    </span>
  );
}

function CitationTag({ citation }: { citation: ProvenanceCitation }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set just before we programmatically return focus to the chip on Escape,
  // so the resulting focus event does NOT re-schedule the popover
  // open. Cleared on real blur in case the chip was already focused (keyboard
  // path), where .focus() fires no event and never consumes the flag.
  const skipRefocusOpen = useRef(false);
  const popoverId = useId();

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearOpenTimer();
    openTimer.current = setTimeout(() => setIsOpen(true), POPOVER_DELAY_MS);
  }, [clearOpenTimer]);

  const close = useCallback(() => {
    clearOpenTimer();
    setIsOpen(false);
  }, [clearOpenTimer]);

  // Escape closes AND returns focus to the chip (docs/design.md §9). The flag
  // is set first so the incoming focus event is swallowed rather than
  // re-opening the popover.
  const closeAndReturnFocus = useCallback(() => {
    close();
    skipRefocusOpen.current = true;
    triggerRef.current?.focus();
  }, [close]);

  useEffect(() => clearOpenTimer, [clearOpenTimer]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeAndReturnFocus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeAndReturnFocus]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen((open) => !open);
    }
  }

  const locatorLabel = formatLocator(citation.locator);
  const pageLabel = citation.locator.page !== null ? `page ${citation.locator.page}` : "the original";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => {
        if (!isMobile) scheduleOpen();
      }}
      onMouseLeave={() => {
        if (!isMobile) close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        data-source-id={citation.sourceId}
        onClick={() => {
          if (isMobile) setIsOpen((open) => !open);
        }}
        onFocus={() => {
          if (skipRefocusOpen.current) {
            skipRefocusOpen.current = false;
            return;
          }
          if (!isMobile) scheduleOpen();
        }}
        onBlur={() => {
          skipRefocusOpen.current = false;
          if (!isMobile) close();
        }}
        onKeyDown={handleTriggerKeyDown}
        className="chip-citation inline-flex min-h-8 items-center gap-1.5 rounded-chip border border-cite-border bg-cite-fill px-2.5 py-1 text-label text-cite-text transition-colors duration-[120ms] ease-out"
      >
        <DocumentIcon />
        <span>{shortSourceName(citation.sourceTitle)}</span>
        <span className="font-mono text-mono-s text-cite-text/80">{locatorLabel}</span>
      </button>

      {isOpen && !isMobile && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={`Source: ${citation.sourceTitle}`}
          className="absolute left-0 top-full z-20 mt-2 w-[26rem] max-w-[26rem] rounded-card border border-hairline bg-surface p-4 shadow-sheet"
        >
          <PopoverContent citation={citation} pageLabel={pageLabel} locatorLabel={locatorLabel} />
        </div>
      )}

      {isOpen && isMobile && (
        <MobileSheet
          citation={citation}
          pageLabel={pageLabel}
          locatorLabel={locatorLabel}
          onClose={close}
          popoverId={popoverId}
        />
      )}
    </div>
  );
}

function PopoverContent({
  citation,
  pageLabel,
  locatorLabel,
}: {
  citation: ProvenanceCitation;
  pageLabel: string;
  locatorLabel: string;
}) {
  return (
    <div>
      <p className="border-l-[3px] border-brand pl-3 font-mono text-mono text-ink">
        &#8220;{citation.quote}&#8221;
      </p>
      <p className="mt-3 text-body-s text-ink-secondary">
        {citation.sourceTitle} · {locatorLabel}
      </p>
      <a
        href={openSourceHref(citation)}
        target="_blank"
        rel="noopener noreferrer"
        data-source-id={citation.sourceId}
        className="mt-3 inline-block text-body-s font-medium text-brand hover:underline"
      >
        Open {pageLabel} →
      </a>
    </div>
  );
}

function MobileSheet({
  citation,
  pageLabel,
  locatorLabel,
  onClose,
  popoverId,
}: {
  citation: ProvenanceCitation;
  pageLabel: string;
  locatorLabel: string;
  onClose: () => void;
  popoverId: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        id={popoverId}
        role="dialog"
        aria-label={`Source: ${citation.sourceTitle}`}
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-cta border border-hairline bg-surface p-5 shadow-sheet"
      >
        <PopoverContent citation={citation} pageLabel={pageLabel} locatorLabel={locatorLabel} />
        <a
          href={openSourceHref(citation)}
          target="_blank"
          rel="noopener noreferrer"
          data-source-id={citation.sourceId}
          className="mt-4 flex h-[48px] w-full items-center justify-center rounded-card border border-hairline bg-surface text-body font-medium text-ink"
        >
          Open the original
        </a>
      </div>
    </>
  );
}
