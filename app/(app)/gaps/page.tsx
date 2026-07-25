import { getActiveCaseId } from "@/components/data/activeCase";
import { gapViews, getCase } from "@/components/data/dal";
import { draftRequestLetter, type RequestLetter } from "@/lib/copy/request_letters";
import { GapCard } from "@/components/gaps/GapCard";
import { GhostCard } from "@/components/ui/GhostCard";

export default async function GapsPage() {
  const caseId = await getActiveCaseId();
  const gaps = gapViews(caseId);

  // Letters are pure functions of fixture data, so we draft one per gap here,
  // on the server (four gaps — cheap), and pass each finished RequestLetter
  // down to its GapCard. This keeps LetterModal a pure display component and
  // keeps the data-access layer — which parses every fixture at module load —
  // out of the client bundle entirely. Generating server-side also means the
  // letter travels the same path Lane A's real extraction will (fixture ->
  // getCase -> draftRequestLetter), not a client-only shortcut.
  const snapshot = getCase(caseId);
  const letters = new Map(
    snapshot.gaps.map((gap): [string, RequestLetter] => [
      gap.id,
      draftRequestLetter(gap, snapshot.facts, snapshot.person),
    ]),
  );

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
          gaps.map((gap) => {
            const letter = letters.get(gap.id);
            if (letter === undefined) {
              // Unreachable: `letters` is keyed off the same snapshot `gaps`
              // that `gapViews` derives from. Fail loud rather than render a
              // card whose letter would be missing.
              throw new Error(`gaps page: no letter generated for gap ${gap.id}`);
            }
            return <GapCard key={gap.id} gap={gap} letter={letter} />;
          })
        )}
      </div>
    </div>
  );
}
