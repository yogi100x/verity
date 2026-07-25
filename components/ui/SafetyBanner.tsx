/**
 * Permanent, on every screen, identical for every user, never conditional on
 * input. A conditional symptom-triggered alert is exactly the "indication of
 * seriousness" output that MHRA classes as a device function.
 *
 * Copy is verbatim from prd.md §8.5. When Lane C lands lib/copy/safety.ts,
 * swap this constant for that import (noted in PR description — lib/copy is
 * Lane C territory).
 *
 * Emergency palette is legal here and in the 999 halt card, nowhere else.
 */

const BANNER_COPY = {
  lead: "This tool organises evidence you already have.",
  body: "It does not assess symptoms, diagnose, or tell you how urgent something is. If you need to know how urgent something is, use NHS 111 online. If someone's life is at risk, call 999.",
} as const;

export function SafetyBanner() {
  return (
    <aside
      aria-label="Safety information"
      className="no-print bg-emergency-fill text-emergency border-b border-emergency-border px-6 py-3 text-center text-body-s"
    >
      <strong className="font-bold">{BANNER_COPY.lead}</strong>{" "}
      {BANNER_COPY.body}
    </aside>
  );
}
