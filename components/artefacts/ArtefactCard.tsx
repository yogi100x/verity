/**
 * One row on the artefact index. Title and audience come straight from the
 * template data — never hand-typed — so a third gatekeeper template needs
 * no change here either.
 */

import Link from "next/link";
import type { Artifact, ArtifactTemplate } from "@/lib/contracts";
import { Card } from "@/components/ui/Card";

type ArtefactCardProps = {
  template: ArtifactTemplate;
  artifact: Artifact;
};

export function ArtefactCard({ template, artifact }: ArtefactCardProps) {
  const totalSlots = template.sections.reduce((sum, section) => sum + section.slots.length, 0);
  // "Entries", not "sections" — this counts individual slots (one per row of
  // template.sections[].slots), each requiring a verified citation, not the
  // sections that contain them. The label below must name what this counts.
  const filledSlots = artifact.assertions.filter(
    (assertion) => assertion.text.trim().length > 0 && assertion.citation_verified,
  ).length;

  return (
    <Link href={`/artefacts/${template.key}`} className="block">
      <Card className="transition-colors duration-[120ms] ease-out hover:border-brand">
        <h2 className="text-title font-semibold text-ink">{template.title}</h2>
        <p className="mt-1 text-body-s text-ink-secondary">{template.audience}</p>
        <p className="mt-4 text-body-s text-ink-secondary">
          {filledSlots} of {totalSlots} entries have evidence recorded
        </p>
      </Card>
    </Link>
  );
}
