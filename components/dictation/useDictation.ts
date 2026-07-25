"use client";

/**
 * The MediaRecorder lifecycle for browser mic capture (prd.md §4c, rung 1 of
 * docs/lanes/lane-e-voice.md). Capture only — no playback, no transcription
 * promise. A finished recording becomes a POST to /api/voice/upload; whatever
 * happens to it after that (transcription, extraction) is later pipeline.
 *
 * States are a discriminated union, not a pile of booleans — see the status
 * literal on every branch. `recording` carries `elapsedSeconds`, ticked by an
 * interval that is always cleared (stop, unmount, or a fresh start) so there
 * is no timer leak. `error` carries a `kind` so the caller can render the
 * exact copy from lib/copy/dictation without re-deriving it.
 *
 * The microphone is always released (`track.stop()` on every track) once
 * recording ends, success or failure — otherwise the browser's recording
 * indicator stays lit after the user believes capture is over.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Source } from "@/lib/contracts";
import type { Mode } from "@/lib/modes";
import { ensureAnonSession } from "@/components/data/supabaseBrowser";

export type DictationErrorKind = "unsupported" | "denied" | "failed";

export type DictationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "recording"; elapsedSeconds: number }
  | { status: "uploading" }
  | { status: "saved"; source: Source; notice?: string }
  | { status: "error"; kind: DictationErrorKind };

export type UseDictationOptions = {
  personId: string;
  title?: string;
  /**
   * When provided, threaded onto the upload URL as `?mode=<mode>` so the
   * voice route resolves the same mode as the screen it was recorded from
   * (see app/api/voice/upload/route.ts). Omitted call sites (e.g. ReviewGate)
   * keep today's behaviour unchanged: a bare URL, mode resolved server-side
   * from NEXT_PUBLIC_DEFAULT_MODE.
   */
  mode?: Mode;
  onSaved?: (source: Source) => void;
};

const UploadResponse = z.object({
  mode: z.string(),
  source: Source,
  notice: z.string().optional(),
});

/** Preference order tried via `MediaRecorder.isTypeSupported`; falls back to
 *  the browser's recorder default (`undefined` mimeType) if none match. */
const MIME_PREFERENCES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function isDictationSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== "undefined";
}

function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return undefined;
  const isTypeSupported = window.MediaRecorder.isTypeSupported;
  if (typeof isTypeSupported !== "function") return undefined;
  return MIME_PREFERENCES.find((type) => isTypeSupported(type));
}

/** `getUserMedia` rejects with a real `DOMException` in browsers, but the
 *  catch clause type is `unknown` under strict mode — narrow via `in` rather
 *  than an `as` cast (the pattern InstallPrompt.tsx uses for its event). */
function isNotAllowedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

export function useDictation({ personId, title, mode, onSaved }: UseDictationOptions) {
  // Always start `idle` — a deterministic value that renders identically on
  // the server (no window) and on the client, so hydration never mismatches.
  // `isDictationSupported()` reads `window`/`navigator`, which are absent
  // during SSR; running it in the initializer would render `unsupported` on
  // the server and `idle` on the client for every capable browser. The real
  // support check runs once on mount below (the InstallPrompt precedent).
  const [state, setState] = useState<DictationState>({ status: "idle" });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const personIdRef = useRef(personId);
  const titleRef = useRef(title);
  const modeRef = useRef(mode);
  const onSavedRef = useRef(onSaved);
  personIdRef.current = personId;
  titleRef.current = title;
  modeRef.current = mode;
  onSavedRef.current = onSaved;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Client-only support check, run once after mount so the server and the
  // first client render agree on `idle`. Only demotes an untouched `idle`
  // state to `unsupported`; never clobbers a recording already in flight.
  useEffect(() => {
    if (!isDictationSupported()) {
      setState((current) =>
        current.status === "idle" ? { status: "error", kind: "unsupported" } : current,
      );
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Belt and braces: if the component unmounts mid-recording, stop the
  // timer and release the mic rather than leaving either running past the
  // component's lifetime.
  useEffect(() => {
    return () => {
      clearTimer();
      releaseMic();
    };
  }, [clearTimer, releaseMic]);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      setState((current) => {
        if (current.status !== "recording") return current;
        return { status: "recording", elapsedSeconds: current.elapsedSeconds + 1 };
      });
    }, 1000);
  }, [clearTimer]);

  const uploadRecording = useCallback(async (mimeType: string | undefined) => {
    const blob = new Blob(chunksRef.current, mimeType ? { type: mimeType } : undefined);
    chunksRef.current = [];

    if (!mountedRef.current) return;
    setState({ status: "uploading" });

    // The upload route now requires a held Supabase session (401 without
    // one, see components/data/careAccess.ts) — establish/reuse it before
    // the network call. A false result reuses the same honest "failed"
    // state as any other upload failure; the copy comes from
    // lib/copy/dictation via the caller, not re-typed here.
    const signedIn = await ensureAnonSession();
    if (!signedIn) {
      if (mountedRef.current) setState({ status: "error", kind: "failed" });
      return;
    }

    const extension = mimeType?.includes("mp4") ? "m4a" : "webm";
    const formData = new FormData();
    formData.append("audio", blob, `dictation.${extension}`);
    formData.append("person_id", personIdRef.current);
    if (titleRef.current) formData.append("title", titleRef.current);

    const url = modeRef.current
      ? `/api/voice/upload?mode=${encodeURIComponent(modeRef.current)}`
      : "/api/voice/upload";

    try {
      const response = await fetch(url, { method: "POST", body: formData });
      if (!response.ok) {
        if (mountedRef.current) setState({ status: "error", kind: "failed" });
        return;
      }

      const json: unknown = await response.json();
      const parsed = UploadResponse.safeParse(json);
      if (!parsed.success) {
        if (mountedRef.current) setState({ status: "error", kind: "failed" });
        return;
      }

      if (!mountedRef.current) return;
      setState({ status: "saved", source: parsed.data.source, notice: parsed.data.notice });
      onSavedRef.current?.(parsed.data.source);
    } catch {
      if (mountedRef.current) setState({ status: "error", kind: "failed" });
    }
  }, []);

  const start = useCallback(async () => {
    if (!isDictationSupported()) {
      setState({ status: "error", kind: "unsupported" });
      return;
    }

    setState({ status: "requesting" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (mountedRef.current) {
        setState({ status: "error", kind: isNotAllowedError(error) ? "denied" : "failed" });
      }
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      releaseMic();
      // Prefer the recorder's *actual* mime type over the one we asked for:
      // when pickMimeType() found no match and fell back to the browser
      // default, `mimeType` is undefined and the blob would upload with no
      // type — which the route rejects with 415. `recorder.mimeType` reports
      // what was really recorded (e.g. "audio/ogg;codecs=opus"), and the
      // route strips codec parameters before matching its allow-list.
      void uploadRecording(recorder.mimeType || mimeType);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    startTimer();
    setState({ status: "recording", elapsedSeconds: 0 });
  }, [releaseMic, startTimer, uploadRecording]);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearTimer]);

  return { state, start, stop };
}
