/**
 * The one place that reads the case-selection cookie (stretch S1 — Maya
 * coda). Server Components only: `next/headers` cannot be imported into a
 * "use client" module, which is exactly why the client-side upload flow
 * gets its case id from `components/voice/VoiceProvider.tsx` (resolved once
 * in `app/(app)/layout.tsx` and threaded through context) instead of
 * calling this function directly.
 *
 * Absent or unrecognised cookie => 'margaret' — the existing default, so
 * every route that shipped before this stretch renders exactly as it did
 * before it.
 */

import { cookies } from "next/headers";
import { DEFAULT_CASE_ID, type CaseId } from "@/components/data/dal";
import { CASE_COOKIE_NAME } from "@/components/data/caseCookie";

export async function getActiveCaseId(): Promise<CaseId> {
  const jar = await cookies();
  const value = jar.get(CASE_COOKIE_NAME)?.value;
  return value === "maya" ? "maya" : DEFAULT_CASE_ID;
}
