/**
 * Presentation-only category mapping for the timeline filter chips
 * (item 4). Derives a chip category from data already on a `TimelineEvent`
 * — `fact.ontology_key` prefix and `provenance` — never from a new field,
 * never from the DAL, detectors, or fact derivation. Nothing here mutates
 * or re-derives a fact; it only reads what's already there.
 *
 * The mapping is honest, not exhaustive: an ontology key that doesn't
 * genuinely say "medication", "instruction", "encounter", or carry
 * user-stated provenance gets zero categories rather than being forced into
 * the nearest-sounding one.
 *
 * `fixtures/margaret.json` has three such keys today, and all three are
 * uncategorised for the same reason — the record does not say what the chip
 * would claim:
 *
 * - `chc.checklist_date` — the CHC Checklist completion date, document
 *   extracted. Not a medicine, not a referral/review instruction, not an
 *   encounter, and not user-stated.
 * - `diagnosis.heart_failure` — a diagnosis carried in a discharge summary.
 *   A diagnosis is not a hospital stay: it can be recorded in a GP letter,
 *   a clinic note or a referral with no admission anywhere near it.
 * - `result.creatinine` — a blood result. Same reasoning: "Creatinine: 164
 *   µmol/L" is not a hospital stay, and filing it under one would make the
 *   chip say something the record never says.
 *
 * `hospital_stays` therefore matches `encounter.*` and nothing else. Against
 * this fixture that chip counts zero, and it is meant to: an empty chip that
 * tells the truth beats a full one that lies. Live extraction does produce
 * `encounter.*` facts, so the chip fills in on real data with no change here.
 *
 * Uncategorised entries stay reachable the way the "no active chips" default
 * already requires: with every chip off they render like any other entry; the
 * moment a chip is switched on they drop out of the filtered view along with
 * everything else that entry's category doesn't match. See
 * `components/timeline/TimelineFilters.tsx` for how the default, and a
 * zero-count chip, are presented so neither is left ambiguous in the UI.
 */

import type { TimelineEvent } from "@/components/data/dal";

export type TimelineCategoryKey =
  | "medicines"
  | "appointments"
  | "hospital_stays"
  | "personal_notes";

export const TIMELINE_CATEGORIES: readonly { key: TimelineCategoryKey; label: string }[] = [
  { key: "medicines", label: "Medicines" },
  { key: "appointments", label: "Appointments" },
  { key: "hospital_stays", label: "Hospital stays" },
  { key: "personal_notes", label: "Personal notes" },
];

/**
 * Zero or more categories per event — a fact can honestly belong to more
 * than one (e.g. a user-stated note about a medicine would carry both
 * "medicines" and "personal notes"), and, as above, can belong to none.
 *
 * - medicines: `ontology_key` starts with `medication.`
 * - appointments: `ontology_key` starts with `instruction.` — the fixture's
 *   review/referral instructions (`instruction.renal_review`,
 *   `instruction.cardiology_review`) are the closest thing this record has
 *   to a scheduled appointment.
 * - hospital stays: `ontology_key` starts with `encounter.` — an admission
 *   or attendance the record actually names as one. Diagnoses and results
 *   are deliberately NOT folded in here (see the note above): they are
 *   findings that may or may not have come out of an admission, and the
 *   record does not say which.
 * - personal notes: the event's resolved provenance is user-stated
 *   (`"userStated" in event.provenance`) — this is already the exact signal
 *   the DAL uses to distinguish Margaret's own words (via her Juno
 *   conversation) from a document citation, so it is reused rather than
 *   re-derived from source kind.
 */
export function categoriesForEvent(event: TimelineEvent): TimelineCategoryKey[] {
  const categories: TimelineCategoryKey[] = [];
  const key = event.fact.ontology_key;

  if (key.startsWith("medication.")) categories.push("medicines");
  if (key.startsWith("instruction.")) categories.push("appointments");
  if (key.startsWith("encounter.")) categories.push("hospital_stays");
  if ("userStated" in event.provenance) categories.push("personal_notes");

  return categories;
}
