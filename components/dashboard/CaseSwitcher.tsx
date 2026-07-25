"use client";

/**
 * Landing-page account switcher (stretch S1 — Maya coda). Quiet and
 * secondary by design: it sets the case-selection cookie client-side (no
 * app/api/** route needed — Lane B doesn't own that territory) and
 * navigates to /dashboard. The primary CTA ("Start with one document")
 * stays a plain, untouched Link — it keeps the existing default-margaret
 * behaviour exactly as it was before this stretch.
 */

import { useRouter } from "next/navigation";
import type { CaseId } from "@/components/data/dal";
import { CASE_COOKIE_NAME } from "@/components/data/caseCookie";

const OPTIONS: Array<{ id: CaseId; label: string }> = [
  { id: "margaret", label: "Margaret (carer view)" },
  { id: "maya", label: "Maya (self view)" },
];

export function CaseSwitcher() {
  const router = useRouter();

  function chooseCase(id: CaseId) {
    // One year, root path — same lifetime pattern as a typical session
    // preference cookie. `samesite=lax` keeps it off cross-site requests.
    document.cookie = `${CASE_COOKIE_NAME}=${id}; path=/; max-age=31536000; samesite=lax`;
    router.push("/dashboard");
  }

  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-label text-ink-secondary">Try it as:</span>
      {OPTIONS.map((option, index) => (
        <span key={option.id} className="flex items-center gap-5">
          {index > 0 && <span aria-hidden="true" className="text-ink-secondary">·</span>}
          <button
            type="button"
            onClick={() => chooseCase(option.id)}
            className="text-label font-medium text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  );
}
