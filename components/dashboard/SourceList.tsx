/**
 * Renders the source list, or the empty state when there is nothing yet.
 * Per-source claim counts are derived here from `getCase().claims` — the DAL
 * exposes no per-source count selector, and adding one is out of scope for
 * this lane's territory, so it is a plain filter over DAL-returned data.
 *
 * The count is of *verified* claims only (`verified_substring !== false`). A
 * dropped claim never surfaces anywhere in the app, so counting it here would
 * promise a row the reader can never open. The one dropped claim is already
 * accounted for honestly in the header stats line ("N extracted, 1 dropped
 * for unverifiable quotes"); per-source counts show what actually surfaced.
 */

import type { Claim, Source } from "@/lib/contracts";
import { GhostCard } from "@/components/ui/GhostCard";
import { SourceCard } from "@/components/dashboard/SourceCard";
import { subjectPossessive, type Voice } from "@/components/voice/voice";

export function SourceList({
  sources,
  claims,
  personName,
  voice = "third",
}: {
  sources: Source[];
  claims: Claim[];
  personName: string;
  voice?: Voice;
}) {
  if (sources.length === 0) {
    return (
      <GhostCard>
        Nothing added yet. Bring in a discharge summary, a prescription, a clinic
        letter, or a recording — anything with {subjectPossessive(voice, personName)}{" "}
        care on it — and Verity will find what it says and check every quote
        against the page.
      </GhostCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          claimCount={
            claims.filter(
              (claim) => claim.source_id === source.id && claim.verified_substring !== false,
            ).length
          }
        />
      ))}
    </div>
  );
}
