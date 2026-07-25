import { notFound } from "next/navigation";
import { TemplateKey } from "@/lib/contracts";
import { getActiveCaseId } from "@/components/data/activeCase";
import { artifactView, getCase, getTemplates } from "@/components/data/dal";
import { ArtefactDocument } from "@/components/artefacts/ArtefactDocument";

export default async function ArtefactPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const caseId = await getActiveCaseId();

  const parsed = TemplateKey.safeParse(key);
  if (!parsed.success) notFound();

  const templateKey = parsed.data;
  const hasTemplate = getTemplates().some((template) => template.key === templateKey);
  const hasArtifact = getCase(caseId).artifacts.some(
    (artifact) => artifact.template_key === templateKey,
  );
  if (!hasTemplate || !hasArtifact) notFound();

  const view = artifactView(templateKey, caseId);
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // S4 — the Attendance Allowance line belongs on the CHC pack only
  // (docs/user-journey.md 9.8). This is the one place that compares against
  // a template key literal: components/artefacts must never branch on one
  // (docs/design.md structural rule), and lib/copy/attendance_allowance.ts
  // exports no template key or applicability helper to key off instead. The
  // route already validated `templateKey` above, so deciding here is
  // page-level composition, not renderer branching.
  const showAttendanceAllowance = templateKey === "chc_dst_pack_v1";

  return (
    <ArtefactDocument
      view={view}
      todayLabel={todayLabel}
      showAttendanceAllowance={showAttendanceAllowance}
    />
  );
}
