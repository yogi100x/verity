"use client";

/**
 * The upload processing state machine, plus a simulated driver.
 *
 * Lane A hasn't wired a real extraction endpoint yet, so this hook drives
 * each dropped file through the same NAMED stages a real pipeline would
 * report, on timeouts. The `UploadDriver` type is the one swap point — when
 * a real API lands, only `simulatedUploadDriver` gets replaced (mirrors the
 * DAL pattern in components/data/dal.ts: one file changes, nothing
 * downstream notices).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type UploadStage =
  | "queued"
  | "reading"
  | "finding"
  | "checking"
  | "done"
  | "partial"
  | "failed";

export type FileKind = "pdf" | "image" | "audio" | "other";

export type UploadItem = {
  id: string;
  name: string;
  kind: FileKind;
  stage: UploadStage;
  /** Always a named state — never rendered as a bare spinner. */
  statusLabel: string;
  claimCount: number | null;
  /** Set only for the honest partial-read state (docs/design.md §10). */
  partialNote: string | null;
};

type ReportPatch = Partial<Omit<UploadItem, "id" | "name" | "kind">>;

/** One swap point: a real driver reports the same stages from a real API. */
export type UploadDriver = (file: File, report: (patch: ReportPatch) => void) => Promise<void>;

const STAGE_DELAY_MS = 650;

export function classifyFile(file: File): FileKind {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(file.name)) return "image";
  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(file.name)) return "audio";
  return "other";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic stand-in for a real extraction count, so a demo run is
 * repeatable. A real driver reports the actual number instead of computing
 * one.
 */
function estimateClaimCount(file: File): number {
  const seed = (file.name.length * 7 + Math.round(file.size / 1024)) % 6;
  return 3 + seed;
}

export const simulatedUploadDriver: UploadDriver = async (file, report) => {
  report({ stage: "reading", statusLabel: `Reading ${file.name}…` });
  await wait(STAGE_DELAY_MS);

  report({ stage: "finding", statusLabel: "Finding what it says…" });
  await wait(STAGE_DELAY_MS);

  report({ stage: "checking", statusLabel: "Checking every quote against the page…" });
  await wait(STAGE_DELAY_MS);

  const claimCount = estimateClaimCount(file);

  if (classifyFile(file) === "image") {
    const partialNote =
      "We could read most of this page, but not the handwritten note in the margin.";
    report({
      stage: "partial",
      statusLabel: `${partialNote} ${claimCount} claim${claimCount === 1 ? "" : "s"} found.`,
      claimCount,
      partialNote,
    });
    return;
  }

  report({ stage: "done", statusLabel: `Done — ${claimCount} claims`, claimCount });
};

let nextId = 0;

export function useUploadSimulation(driver: UploadDriver = simulatedUploadDriver) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const driverRef = useRef(driver);
  driverRef.current = driver;

  // A driver's staged reports arrive behind awaited timers; if the screen
  // unmounts mid-processing (a real upload can outlive a navigation), a late
  // report must not call setState on the gone component. This is the only
  // post-unmount write path — the initial synchronous setItems in addFiles
  // always runs inside a mounted event handler.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const patchItem = useCallback((id: string, patch: ReportPatch) => {
    if (!mountedRef.current) return;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      const newItems: UploadItem[] = incoming.map((file) => ({
        id: `upload-${nextId++}`,
        name: file.name,
        kind: classifyFile(file),
        stage: "queued",
        statusLabel: "Queued…",
        claimCount: null,
        partialNote: null,
      }));

      setItems((current) => [...current, ...newItems]);

      newItems.forEach((item, index) => {
        const file = incoming[index];
        if (file === undefined) return;
        void driverRef.current(file, (patch) => patchItem(item.id, patch)).catch(() => {
          patchItem(item.id, {
            stage: "failed",
            statusLabel: "Couldn't process this file — nothing was kept from it.",
          });
        });
      });
    },
    [patchItem],
  );

  const terminalStages: UploadStage[] = ["done", "partial", "failed"];
  const allDone = items.length > 0 && items.every((item) => terminalStages.includes(item.stage));
  const totalClaims = items.reduce((sum, item) => sum + (item.claimCount ?? 0), 0);

  return { items, addFiles, allDone, totalClaims };
}
