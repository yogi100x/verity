/**
 * Pins the label and the computation to the same source: the label names
 * "entries" and the count is derived from the same `template`/`artifact`
 * props the component receives, not a literal pinned expectation, so a
 * fixture change can't silently desync the two.
 */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCase, getTemplates } from "@/components/data/dal";
import { ArtefactCard } from "../ArtefactCard";

function expectedEntryCount(
  artifact: ReturnType<typeof getCase>["artifacts"][number],
): number {
  return artifact.assertions.filter(
    (assertion) => assertion.text.trim().length > 0 && assertion.citation_verified,
  ).length;
}

describe("ArtefactCard", () => {
  it("labels the count it actually renders as entries, matching the computation, for every seeded artefact", () => {
    const templates = getTemplates();
    const { artifacts } = getCase();
    expect(artifacts.length).toBeGreaterThan(0);

    for (const artifact of artifacts) {
      const template = templates.find((candidate) => candidate.key === artifact.template_key);
      expect(template).toBeDefined();
      if (template === undefined) continue;

      const totalSlots = template.sections.reduce(
        (sum, section) => sum + section.slots.length,
        0,
      );
      const expectedFilled = expectedEntryCount(artifact);

      const { unmount } = render(<ArtefactCard template={template} artifact={artifact} />);
      expect(
        screen.getByText(`${expectedFilled} of ${totalSlots} entries have evidence recorded`),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
