/**
 * Voice is a copy flag, not a UI fork (docs/design.md §9). Self-serve mode
 * (stretch S1) is the degenerate carer case: `person.access_basis ===
 * 'self'` is the ONLY thing that decides it. No component branches on it —
 * screens ask these two pure helpers for the words, and render the exact
 * same tree either way.
 *
 * The 'first'|'third' enum names follow the lane brief (docs/lanes/
 * lane-b-surface.md §S1). In practice the self voice renders as direct
 * second-person address — "your care", "you've gathered" — which stays
 * coherent with the surrounding fixed copy and never names the patient in
 * the third person; the carer voice names them possessively ("Margaret's
 * care"). See the per-function JSDoc below for the exact strings. Never
 * mixed within a sentence.
 */

import type { AccessBasis } from "@/lib/contracts";

export type Voice = "first" | "third";

/** The single rule the whole feature rests on. */
export function voiceFromAccessBasis(accessBasis: AccessBasis): Voice {
  return accessBasis === "self" ? "first" : "third";
}

/**
 * "your" in first person, "Margaret's" in third — the possessive that
 * precedes a noun ("...about {subjectPossessive} care").
 */
export function subjectPossessive(voice: Voice, displayName: string): string {
  return voice === "first" ? "your" : `${displayName}’s`;
}

/**
 * "you" in first person, "Margaret" in third — the bare subject noun, for
 * copy that names the person directly rather than possessively.
 */
export function subjectName(voice: Voice, displayName: string): string {
  return voice === "first" ? "you" : displayName;
}
