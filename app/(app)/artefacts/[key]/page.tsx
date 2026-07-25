import { notFound } from "next/navigation";
import { TemplateKey } from "@/lib/contracts";
import { artifactView, getCase, getTemplates } from "@/components/data/dal";
import { ArtefactDocument } from "@/components/artefacts/ArtefactDocument";

export default async function ArtefactPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const parsed = TemplateKey.safeParse(key);
  if (!parsed.success) notFound();

  const templateKey = parsed.data;
  const hasTemplate = getTemplates().some((template) => template.key === templateKey);
  const hasArtifact = getCase().artifacts.some((artifact) => artifact.template_key === templateKey);
  if (!hasTemplate || !hasArtifact) notFound();

  const view = artifactView(templateKey);
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return <ArtefactDocument view={view} todayLabel={todayLabel} />;
}
