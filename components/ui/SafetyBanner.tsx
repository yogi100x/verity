"use client";

/**
 * Permanent, on every screen, identical for every user, never conditional on
 * input. A conditional symptom-triggered alert is exactly the "indication of
 * seriousness" output that MHRA classes as a device function.
 *
 * Copy is sourced from lib/copy/safety.ts (Lane C), verbatim from prd.md
 * §8.5. The first sentence is split out purely for bold styling — the
 * rendered text is byte-identical to PERSISTENT_BANNER.
 *
 * Emergency palette is legal here and in the 999 halt card, nowhere else.
 *
 * Mobile compaction (below `md:`): the banner otherwise eats roughly a
 * quarter of a phone's first viewport. Below `md:` it collapses to one
 * visual line with a "Show more" control; `md:` and up render exactly as
 * before, no toggle, full text.
 *
 * Accessibility pattern, chosen deliberately: the full lead+body string is
 * ALWAYS present in a single paragraph — collapsing only applies
 * `line-clamp-1`, a purely visual CSS clip (`overflow` + `-webkit-line-
 * clamp`), never `hidden`/`display:none`/`aria-hidden`. This is the
 * "content present but visually clamped" option, not a disclosure pattern,
 * because a disclosure pattern would gate this specific text — safety
 * signposting to NHS 111 / 999 — behind an extra interaction for
 * screen-reader users while sighted users merely see it truncated. Given
 * what this banner exists to say, screen readers must always get the whole
 * thing regardless of the visual (`expanded`) state; `aria-expanded` on the
 * button describes the control's own state, not a gate on the content.
 */

import { useId, useState } from "react";
import { PERSISTENT_BANNER } from "@/lib/copy/safety";

const SENTENCE_BREAK = ". ";
const breakIndex = PERSISTENT_BANNER.indexOf(SENTENCE_BREAK);
const BANNER_LEAD = PERSISTENT_BANNER.slice(0, breakIndex + 1);
const BANNER_BODY = PERSISTENT_BANNER.slice(breakIndex + SENTENCE_BREAK.length);

export function SafetyBanner() {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();

  return (
    <aside
      aria-label="Safety information"
      className="no-print bg-emergency-fill text-emergency border-b border-emergency-border px-4 py-3 text-body-s md:px-6 md:text-center"
    >
      <div className="mx-auto flex max-w-[70rem] items-baseline gap-3 md:block">
        <p
          id={textId}
          className={`min-w-0 flex-1 text-left md:flex-none md:text-center md:line-clamp-none ${
            expanded ? "" : "line-clamp-1"
          }`}
        >
          <strong className="font-bold">{BANNER_LEAD}</strong> {BANNER_BODY}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={textId}
          className="shrink-0 whitespace-nowrap text-label font-semibold underline underline-offset-2 md:hidden"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      </div>
    </aside>
  );
}
