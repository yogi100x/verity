/**
 * Persistent, informational chip stating the legal basis Sarah has for
 * viewing Margaret's records. This is administrative context, not a claim
 * about the world — it must never borrow the citation or unverified
 * palettes, both of which are reserved for provenance (docs/design.md §3).
 */

import type { AccessBasis } from "@/lib/contracts";

/** Exported so the onboarding form (components/onboarding/WelcomeForm.tsx)
 *  labels its four options with the words already on screen elsewhere,
 *  rather than a second set that could drift from this badge's. */
export const ACCESS_BASIS_LABELS: Record<AccessBasis, string> = {
  self: "Acting for yourself",
  person_consent: "Access given by consent",
  lpa_health_welfare: "Lasting Power of Attorney — health & welfare",
  court_deputy: "Court-appointed deputy",
  best_interests_declared: "Best interests decision",
};

export function AccessBasisBadge({ accessBasis }: { accessBasis: AccessBasis }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-chip border border-hairline px-2.5 py-1 text-label text-ink-secondary">
      {ACCESS_BASIS_LABELS[accessBasis]}
    </span>
  );
}
