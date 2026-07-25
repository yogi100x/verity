"use client";

import { MicButton } from "@/components/dictation/MicButton";
import { DropZone } from "@/components/upload/DropZone";
import { FileProgressList } from "@/components/upload/FileProgressList";
import { createLiveDriver } from "@/components/upload/liveDriver";
import { UploadSummary } from "@/components/upload/UploadSummary";
import { simulatedUploadDriver, useUploadSimulation } from "@/components/upload/useUploadSimulation";
import { useVoice } from "@/components/voice/VoiceProvider";
import { DICTATION_PROMPT } from "@/lib/copy/dictation";
import type { Mode } from "@/lib/modes";

/**
 * Add a document. `mode` is resolved server-side in `app/(app)/upload/page.tsx`
 * (`?mode=` > `NEXT_PUBLIC_DEFAULT_MODE` > 'fixtures') and handed down here as
 * a plain prop, same reason `personId` is: a client component must not read
 * env/searchParams itself and re-derive a value its server parent already
 * settled.
 *
 * `mode === 'live'` is the only branch: it swaps in `createLiveDriver`, which
 * POSTs the real file to `/api/extract?mode=live` and renders the real report
 * through this same screen. Every other value (`'fixtures'`, `'replay'`,
 * `undefined`) keeps the untouched `simulatedUploadDriver` — the one place a
 * real driver swaps in, per `useUploadSimulation`'s doc comment. Nothing else
 * on this screen changes either way.
 *
 * A client component, so it cannot read the case cookie or call the DAL
 * itself (that would pull every fixture into the browser bundle). It takes
 * the active person's name and voice from `VoiceProvider` (resolved once in
 * `app/(app)/layout.tsx`) same as before, plus `personId` — the one field
 * `VoiceProvider` doesn't carry — as a prop from its server parent,
 * `app/(app)/upload/page.tsx`.
 */
export function UploadView({ personId, mode }: { personId: string; mode?: Mode }) {
  const { voice, displayName } = useVoice();
  const driver = mode === "live" ? createLiveDriver(personId) : simulatedUploadDriver;
  const { items, addFiles, allDone, totalClaims } = useUploadSimulation(driver);

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
        <MicButton personId={personId} variant="primary" mode={mode} />
      </div>

      {items.length > 0 && <FileProgressList items={items} />}

      {allDone && <UploadSummary fileCount={items.length} totalClaims={totalClaims} />}
    </div>
  );
}
