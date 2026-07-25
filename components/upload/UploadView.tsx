"use client";

import { MicButton } from "@/components/dictation/MicButton";
import { DropZone } from "@/components/upload/DropZone";
import { FileProgressList } from "@/components/upload/FileProgressList";
import { UploadSummary } from "@/components/upload/UploadSummary";
import { useUploadSimulation } from "@/components/upload/useUploadSimulation";
import { useVoice } from "@/components/voice/VoiceProvider";
import { DICTATION_PROMPT } from "@/lib/copy/dictation";

/**
 * Add a document. Lane A hasn't wired real extraction yet, so processing is
 * simulated (mode: fixtures) behind `useUploadSimulation` — the one place a
 * real driver swaps in later. Nothing else on this screen changes when it
 * does.
 *
 * A client component, so it cannot read the case cookie or call the DAL
 * itself (that would pull every fixture into the browser bundle). It takes
 * the active person's name and voice from `VoiceProvider` (resolved once in
 * `app/(app)/layout.tsx`) same as before, plus `personId` — the one field
 * `VoiceProvider` doesn't carry — as a prop from its server parent,
 * `app/(app)/upload/page.tsx`.
 */
export function UploadView({ personId }: { personId: string }) {
  const { voice, displayName } = useVoice();
  const { items, addFiles, allDone, totalClaims } = useUploadSimulation();

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">Add a document</h1>
        <p className="max-w-[38rem] text-body-l text-ink-secondary">
          Drop in a discharge summary, a prescription, a clinic letter, or a
          recording. Verity reads it and shows exactly which page every fact
          came from.
        </p>
      </header>

      <DropZone personName={displayName} voice={voice} onFilesSelected={addFiles} />

      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-[32rem] text-body-s text-ink-secondary">{DICTATION_PROMPT}</p>
        <MicButton personId={personId} variant="primary" />
      </div>

      {items.length > 0 && <FileProgressList items={items} />}

      {allDone && <UploadSummary fileCount={items.length} totalClaims={totalClaims} />}
    </div>
  );
}
