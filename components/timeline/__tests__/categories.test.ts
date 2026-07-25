/**
 * categoriesForEvent maps every fixture ontology key exactly as documented
 * in components/timeline/categories.ts. Runs against the real DAL output
 * (timelineEvents()) so a fixture change surfaces here, never against a
 * hand-typed shape.
 */

import { describe, expect, it } from "vitest";
import { timelineEvents, type TimelineEvent } from "@/components/data/dal";
import { categoriesForEvent, TIMELINE_CATEGORIES, type TimelineCategoryKey } from "../categories";

function categoriesFor(ontologyKey: string): TimelineCategoryKey[] {
  const events = timelineEvents();
  const event = events.find((e) => e.fact.ontology_key === ontologyKey);
  if (event === undefined) {
    throw new Error(`fixture no longer has a ${ontologyKey} timeline event`);
  }
  return categoriesForEvent(event);
}

describe("TIMELINE_CATEGORIES", () => {
  it("lists exactly the four documented chips", () => {
    expect(TIMELINE_CATEGORIES.map((c) => c.key)).toEqual([
      "medicines",
      "appointments",
      "hospital_stays",
      "personal_notes",
    ]);
    expect(TIMELINE_CATEGORIES.map((c) => c.label)).toEqual([
      "Medicines",
      "Appointments",
      "Hospital stays",
      "Personal notes",
    ]);
  });
});

describe("categoriesForEvent — fixture ontology-key mapping", () => {
  it("maps medication.* to medicines", () => {
    expect(categoriesFor("medication.furosemide")).toEqual(["medicines"]);
    expect(categoriesFor("medication.amitriptyline")).toEqual(["medicines"]);
  });

  it("maps instruction.* to appointments", () => {
    expect(categoriesFor("instruction.renal_review")).toEqual(["appointments"]);
    expect(categoriesFor("instruction.cardiology_review")).toEqual(["appointments"]);
  });

  it("maps encounter.* — and only encounter.* — to hospital_stays", () => {
    // The fixture has no encounter.* fact, so the mapping is proved on a real
    // event with its ontology key swapped: same shape the DAL produces, one
    // field changed, so this asserts the rule rather than the fixture.
    const [sample] = timelineEvents();
    const asEncounter: TimelineEvent = {
      ...sample!,
      fact: { ...sample!.fact, ontology_key: "encounter.admission" },
    };
    expect(categoriesForEvent(asEncounter)).toContain("hospital_stays");
  });

  it("never files a diagnosis or a blood result under hospital_stays", () => {
    // A diagnosis can be recorded in a GP letter and a creatinine result is
    // not an admission — filing either under "Hospital stays" would make the
    // chip claim something the record never says. An honest zero beats it.
    expect(categoriesFor("diagnosis.heart_failure")).toEqual([]);
    expect(categoriesFor("result.creatinine")).toEqual([]);

    const events = timelineEvents();
    const hospitalStays = events.filter((event) =>
      categoriesForEvent(event).includes("hospital_stays"),
    );
    expect(hospitalStays).toEqual([]);
  });

  it("maps user-stated facts to personal_notes regardless of ontology key", () => {
    expect(categoriesFor("chc.mobility")).toEqual(["personal_notes"]);
    expect(categoriesFor("chc.drug_therapies")).toEqual(["personal_notes"]);
  });

  it("honestly returns no category for a key that fits none — chc.checklist_date", () => {
    // Documented in categories.ts: not a medication, not a review/referral
    // instruction, not an encounter, and document_extracted rather than
    // user-stated. Forcing it into the nearest-sounding chip would be the
    // dishonest mapping the brief warns against, so it stays uncategorised
    // and is reachable only via the all-filters-off default.
    expect(categoriesFor("chc.checklist_date")).toEqual([]);
  });

  it("every fixture timeline event is accounted for — categorised or one of the three documented misses", () => {
    const events = timelineEvents();
    const uncategorised = events.filter((event) => categoriesForEvent(event).length === 0);
    expect([...uncategorised.map((event) => event.fact.ontology_key)].sort()).toEqual([
      "chc.checklist_date",
      "diagnosis.heart_failure",
      "result.creatinine",
    ]);
  });
});
