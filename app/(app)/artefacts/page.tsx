import type { Artifact, ArtifactTemplate } from "@/lib/contracts";
import { getCase, getTemplates } from "@/components/data/dal";
import { ArtefactCard } from "@/components/artefacts/ArtefactCard";

type ArtefactRow = { template: ArtifactTemplate; artifact: Artifact };

export default function ArtefactsPage() {
  const templates = getTemplates();
  const rows: ArtefactRow[] = getCase()
    .artifacts.map((artifact) => {
      const template = templates.find((candidate) => candidate.key === artifact.template_key);
      return template ? { template, artifact } : null;
    })
    .filter((row): row is ArtefactRow => row !== null);

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">Artefacts</h1>
      <p className="mt-2 text-body-s text-ink-secondary">
        Documents assembled from the record, ready to review and print.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map(({ template, artifact }) => (
          <ArtefactCard key={artifact.id} template={template} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
