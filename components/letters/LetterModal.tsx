"use client";

/**
 * Read-only viewer for a Lane C request letter (stretch S3 — UI half,
 * docs/lanes/lane-b-surface.md). Lane B never authors letter prose: every
 * word rendered here comes straight out of `lib/copy/request_letters.ts`'s
 * `draftRequestLetter`. The letter is generated server-side (the gaps page
 * is a Server Component — it calls `draftRequestLetter` per gap and threads
 * the finished, serialisable `RequestLetter` down as a prop). This component
 * therefore never imports the data-access layer: it does no lookup, parses
 * no fixture, and pulls no snapshot into the client bundle. Its only job is
 * presentation — a dialog shell, copy-to-clipboard, print, and a11y wiring.
 *
 * No editing surface exists: no textarea, no contentEditable, no input.
 * That is deliberate and is asserted by the test suite.
 *
 * Responsive shell is pure CSS (base styles = bottom sheet, `sm:` = desktop
 * centered dialog) rather than the JS `matchMedia` split ProvenanceTag uses.
 * ProvenanceTag needs JS because mobile and desktop are different
 * *interaction* patterns (hover-popover vs tap-sheet). Here both breakpoints
 * share identical dialog semantics (open/close, focus trap, Escape) and
 * differ only in layout — a `sm:` variant is simpler and avoids a layout
 * flash on mount. Same token pair as ProvenanceTag's mobile sheet either
 * way: `rounded-t-cta` + `shadow-sheet` below 640px, `rounded-card` at
 * `sm:` (docs/design.md §4).
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  LetterRecipient,
  RequestLetter,
} from "@/lib/copy/request_letters";
import { Button } from "@/components/ui/Button";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const COPY_CONFIRMATION_MS = 2000;

// Exhaustive by type: `Record<LetterRecipient, string>` fails `pnpm
// typecheck` the moment Lane C adds a recipient to the union, so a new
// variant surfaces as a compile error here rather than an "undefined"
// heading at runtime.
const RECIPIENT_LABELS: Readonly<Record<LetterRecipient, string>> = {
  gp: "GP",
  provider: "Referring provider",
  records_holder: "Records holder",
  chc_coordinator: "CHC coordinator",
};

export type LetterModalProps = {
  letter: RequestLetter;
  onClose: () => void;
  /** Dialog heading. Defaults to "Draft request letter" so every existing
   *  GapCard call site is unchanged; the CHC clock passes "Draft chase
   *  letter" so the heading matches the letter it is actually showing. */
  title?: string;
};

export function LetterModal({
  letter,
  onClose,
  title = "Draft request letter",
}: LetterModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLDivElement>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const headingId = useId();

  const recipientLabel = RECIPIENT_LABELS[letter.recipient];
  const paragraphs = letter.body.split("\n\n");
  // Assembled from the exact same parts that are rendered below, so what a
  // user pastes is the whole letter as plain text with no HTML artifacts.
  const letterText = `${letter.salutation}\n\n${letter.body}\n\n${letter.closing}`;

  // Focus the first control inside the dialog on open (docs/design.md §9).
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, []);

  // Lock body scroll while the dialog is open; restore the prior value on
  // close so nothing leaks if some other surface had already set it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) clearTimeout(copyResetTimer.current);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (panel === null) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Manual-copy fallback for insecure contexts (http, older browsers) where
  // `navigator.clipboard` is undefined: select the letter so the user can
  // copy it with the keyboard. No hidden textarea — that would violate the
  // read-only guarantee this component asserts.
  function selectLetterText() {
    const node = letterRef.current;
    if (node === null) return;
    const selection = window.getSelection();
    if (selection === null) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function handleCopy() {
    if (typeof navigator.clipboard?.writeText !== "function") {
      selectLetterText();
      return;
    }
    await navigator.clipboard.writeText(letterText);
    setCopied(true);
    if (copyResetTimer.current !== null) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Decorative backdrop only — kept as a separate, aria-hidden sibling
          rather than a wrapper, so it never covers the dialog's subtree in
          the accessibility tree (aria-hidden on an ancestor hides its
          descendants too, which would make the dialog itself invisible to
          assistive tech and to role-based queries). */}
      <div className="fixed inset-0 z-40 bg-ink/40" onClick={onClose} aria-hidden="true" />

      {/* Scoped print treatment: the letter body is the sole thing printed.
          Per docs/lanes/lane-b-surface.md this stays inline here rather than
          in app/globals.css, which is out of this lane's S3 territory.

          The classic "hide everything, then re-reveal the target" trick.
          Crucially the print target is lifted to the top of the page
          (position: absolute; top/left: 0): the modal is rendered deep in
          the DOM, and although the ancestors above it are visibility:hidden,
          `visibility` still reserves their layout space — without this the
          letter would print below a page of blank reserved height and page
          one would come out empty. The shell/panel classes are stable
          because only one LetterModal is ever mounted at a time (GapCard
          renders it conditionally). */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .verity-letter-print-target,
          .verity-letter-print-target * { visibility: visible; }
          .verity-letter-shell,
          .verity-letter-panel {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: none !important;
            box-shadow: none !important;
            border: none !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .verity-letter-print-target {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div
        className="verity-letter-shell fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
          className="verity-letter-panel max-h-[85vh] w-full overflow-y-auto rounded-t-cta border border-hairline bg-surface p-5 shadow-sheet sm:max-w-[34rem] sm:rounded-card sm:p-8"
        >
          <div className="no-print">
            <h2 id={headingId} className="text-title font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-body-s text-ink-secondary">To: {recipientLabel}</p>
          </div>

          <div
            ref={letterRef}
            className="verity-letter-print-target mt-6 space-y-4 text-body text-ink"
            data-testid="letter-text"
          >
            <p>{letter.salutation}</p>
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <p>{letter.closing}</p>
          </div>

          <div className="no-print mt-8 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button variant="secondary" onClick={handlePrint}>
              Print
            </Button>
            <Button variant="tertiary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
