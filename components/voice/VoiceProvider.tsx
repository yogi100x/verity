"use client";

/**
 * Voice, resolved ONCE at `app/(app)/layout.tsx` (a Server Component that
 * reads the case cookie via `components/data/activeCase.ts`) and handed
 * down through context from here. This provider exists for the client
 * subtree only — Server Component pages (dashboard, timeline, gaps,
 * conflicts, artefacts) cannot call `useContext`, so they independently
 * resolve the same cookie via `getActiveCaseId()` and derive voice with the
 * same pure `voiceFromAccessBasis` helper. Both paths are one function
 * call deep from the single source of truth: the cookie plus
 * `person.access_basis`. Nothing here decides voice on its own.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { CaseId } from "@/components/data/dal";
import type { Voice } from "@/components/voice/voice";

export type VoiceContextValue = {
  voice: Voice;
  caseId: CaseId;
  displayName: string;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({
  value,
  children,
}: {
  value: VoiceContextValue;
  children: ReactNode;
}) {
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

/** Falls back to the pre-S1 default (margaret, third person) if a client
 *  component ever renders outside the provider — keeps this additive. */
export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (ctx !== null) return ctx;
  return { voice: "third", caseId: "margaret", displayName: "Margaret Ellis" };
}
