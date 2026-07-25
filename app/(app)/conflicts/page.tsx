import { getActiveCaseId } from "@/components/data/activeCase";
import { conflictViews } from "@/components/data/dal";
import { ConflictCard } from "@/components/conflicts/ConflictCard";
import { GhostCard } from "@/components/ui/GhostCard";

export default async function ConflictsPage() {
  const caseId = await getActiveCaseId();
  const conflicts = conflictViews(caseId);

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">Conflicts</h1>
      <p className="mt-2 max-w-[38rem] text-body-s text-ink-secondary">
        Where your sources disagree with each other. We don&#8217;t decide who&#8217;s
        right — we put the disagreement in front of the person who can settle it.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {conflicts.length === 0 ? (
          <GhostCard>No disagreements found across your sources yet.</GhostCard>
        ) : (
          conflicts.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} />)
        )}
      </div>
    </div>
  );
}
