import { LinkButton } from "@/components/dashboard/LinkButton";

export function UploadSummary({
  fileCount,
  totalClaims,
}: {
  fileCount: number;
  totalClaims: number;
}) {
  return (
    <div className="flex flex-col items-start gap-4 border-t border-hairline pt-8">
      <p className="text-body-l text-ink">
        {fileCount} document{fileCount === 1 ? "" : "s"} added, {totalClaims} claim
        {totalClaims === 1 ? "" : "s"} found.
      </p>
      <LinkButton href="/timeline">See the timeline</LinkButton>
    </div>
  );
}
