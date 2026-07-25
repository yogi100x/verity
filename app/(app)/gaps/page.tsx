import { gapViews } from "@/components/data/dal";
import { GapCard } from "@/components/gaps/GapCard";
import { GhostCard } from "@/components/ui/GhostCard";

export default function GapsPage() {
  const gaps = gapViews();

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">Gaps</h1>
      <p className="mt-2 max-w-[38rem] text-body-s text-ink-secondary">
        Statements about what the record shows — and what it doesn&#8217;t. Nothing
        here is advice about what to do next.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {gaps.length === 0 ? (
          <GhostCard>No gaps found in the record yet.</GhostCard>
        ) : (
          gaps.map((gap) => <GapCard key={gap.id} gap={gap} />)
        )}
      </div>
    </div>
  );
}
