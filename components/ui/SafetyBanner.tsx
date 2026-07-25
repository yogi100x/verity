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
 */

import { PERSISTENT_BANNER } from "@/lib/copy/safety";

const SENTENCE_BREAK = ". ";
const breakIndex = PERSISTENT_BANNER.indexOf(SENTENCE_BREAK);
const BANNER_LEAD = PERSISTENT_BANNER.slice(0, breakIndex + 1);
const BANNER_BODY = PERSISTENT_BANNER.slice(breakIndex + SENTENCE_BREAK.length);

export function SafetyBanner() {
  return (
    <aside
      aria-label="Safety information"
      className="no-print bg-emergency-fill text-emergency border-b border-emergency-border px-6 py-3 text-center text-body-s"
    >
      <strong className="font-bold">{BANNER_LEAD}</strong>{" "}
      {BANNER_BODY}
    </aside>
  );
}
