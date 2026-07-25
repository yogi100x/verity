"use client";

import { DropZone } from "@/components/upload/DropZone";
import { FileProgressList } from "@/components/upload/FileProgressList";
import { UploadSummary } from "@/components/upload/UploadSummary";
import { useUploadSimulation } from "@/components/upload/useUploadSimulation";
import { useVoice } from "@/components/voice/VoiceProvider";

/**
 * Add a document. Lane A hasn't wired real extraction yet, so processing is
 * simulated (mode: fixtures) behind `useUploadSimulation` — the one place a
 * real driver swaps in later. Nothing else on this screen changes when it
 * does.
 *
 * A client component, so it cannot read the case cookie itself — it takes
 * the active person's name and voice from `VoiceProvider`, resolved once in
 * `app/(app)/layout.tsx`.
 */
export default function UploadPage() {
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

      {items.length > 0 && <FileProgressList items={items} />}

      {allDone && <UploadSummary fileCount={items.length} totalClaims={totalClaims} />}
    </div>
  );
}
