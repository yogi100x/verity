"use client";

/**
 * Mic capture control. Sits on the upload screen (`variant="primary"`) and
 * beside every free-text field (`variant="compact"`) — see
 * docs/lanes/lane-e-voice.md rung 1 and the mic-button brief.
 *
 * Every user-facing string comes from lib/copy/dictation — this file holds
 * zero hardcoded copy. The state line is always real text, never a bare
 * spinner (docs/design.md §6): requesting/uploading render as the Button's
 * own `disabledReason` (the same "a disabled button that doesn't say why is
 * a bug" convention every other disabled control in the app follows), and
 * recording renders its named line plus a separate mono-font elapsed-time
 * span — two elements, never one sentence mixing prose and a measurement.
 *
 * Two structural rules keep the control accessible across state swaps:
 *
 * 1. One stable root. Every state renders inside the same wrapper `div`
 *    with the Button first, so React updates the existing nodes instead of
 *    remounting a different tree shape per state.
 * 2. One persistent live region. A single visually-hidden `role="status"`
 *    span outlives every state and has its text swapped in place — the only
 *    live-region pattern screen readers announce reliably. Per-state
 *    mounted `aria-live` nodes (and the Button's disabledReason span, which
 *    has no live semantics) are announced by it, not by themselves.
 *
 * Focus: entering `requesting`/`uploading` disables the button, and the
 * browser drops focus to `body` — no ref plumbing can prevent that. So when
 * a busy state resolves into an interactive one, focus is politely restored
 * to the button, but only if it is still on `body` (never stolen from a
 * field the user has moved to in the meantime).
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AudioIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import {
  DICTATION_ERRORS,
  DICTATION_STATES,
  MIC_START_LABEL,
  MIC_STOP_LABEL,
} from "@/lib/copy/dictation";
import type { Source } from "@/lib/contracts";
import { useDictation } from "./useDictation";
import type { DictationState } from "./useDictation";

type MicButtonProps = {
  personId: string;
  title?: string;
  onSaved?: (source: Source) => void;
  variant?: "primary" | "compact";
};

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The one line the persistent live region announces for each state. Empty
 * for `idle` (nothing is happening) and `unsupported` (a static condition
 * present from mount, already named by the button's visible disabledReason —
 * announcing it as a change would be noise).
 */
function liveTextFor(state: DictationState): string {
  switch (state.status) {
    case "requesting":
      return DICTATION_STATES.requesting;
    case "recording":
      return DICTATION_STATES.recording;
    case "uploading":
      return DICTATION_STATES.uploading;
    case "saved":
      return `${DICTATION_STATES.saved} ${state.source.title}`;
    case "error":
      return state.kind === "unsupported" ? "" : DICTATION_ERRORS[state.kind];
    default:
      return "";
  }
}

export function MicButton({ personId, title, onSaved, variant = "primary" }: MicButtonProps) {
  const { state, start, stop } = useDictation({ personId, title, onSaved });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonVariant = variant === "primary" ? "primary" : "secondary";
  const gapClass = variant === "primary" ? "gap-2.5" : "gap-1.5";

  // Polite focus restoration (see file comment). Keyed on `status` alone so
  // the per-second `elapsedSeconds` tick never re-runs it mid-recording.
  const status = state.status;
  useEffect(() => {
    if (status !== "recording" && status !== "saved" && status !== "error") return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    wrapperRef.current?.querySelector("button")?.focus();
  }, [status]);

  let control: ReactNode;
  let detail: ReactNode = null;

  if (state.status === "error" && state.kind === "unsupported") {
    control = (
      <Button variant={buttonVariant} disabled disabledReason={DICTATION_ERRORS.unsupported}>
        <AudioIcon />
        {MIC_START_LABEL}
      </Button>
    );
  } else if (state.status === "idle") {
    control = (
      <Button
        variant={buttonVariant}
        onClick={() => void start()}
        aria-pressed={false}
        aria-label={MIC_START_LABEL}
      >
        <AudioIcon />
        {MIC_START_LABEL}
      </Button>
    );
  } else if (state.status === "requesting") {
    control = (
      <Button variant={buttonVariant} disabled disabledReason={DICTATION_STATES.requesting}>
        <AudioIcon />
        {MIC_START_LABEL}
      </Button>
    );
  } else if (state.status === "recording") {
    control = (
      <Button
        variant={buttonVariant}
        onClick={stop}
        aria-pressed={true}
        aria-label={MIC_STOP_LABEL}
      >
        <AudioIcon />
        {MIC_STOP_LABEL}
      </Button>
    );
    detail = (
      <>
        <p className="text-body-s text-ink-secondary">{DICTATION_STATES.recording}</p>
        <p className="font-mono text-mono-s text-ink-secondary">
          {formatElapsed(state.elapsedSeconds)}
        </p>
      </>
    );
  } else if (state.status === "uploading") {
    control = (
      <Button variant={buttonVariant} disabled disabledReason={DICTATION_STATES.uploading}>
        <AudioIcon />
        {MIC_STOP_LABEL}
      </Button>
    );
  } else if (state.status === "saved") {
    control = (
      <Button variant={buttonVariant} onClick={() => void start()} aria-label={MIC_START_LABEL}>
        <AudioIcon />
        {MIC_START_LABEL}
      </Button>
    );
    detail = (
      <>
        <p className="text-body-s text-ink">
          {DICTATION_STATES.saved} <span className="font-medium">{state.source.title}</span>
        </p>
        {state.notice !== undefined && (
          <p className="text-body-s italic text-ink-secondary">{state.notice}</p>
        )}
      </>
    );
  } else {
    // state.status === "error" with kind "denied" | "failed"
    control = (
      <Button variant={buttonVariant} onClick={() => void start()} aria-label={MIC_START_LABEL}>
        <AudioIcon />
        {MIC_START_LABEL}
      </Button>
    );
    detail = <p className="text-body-s text-ink-secondary">{DICTATION_ERRORS[state.kind]}</p>;
  }

  return (
    <div ref={wrapperRef} className={`flex flex-col items-start ${gapClass}`}>
      {control}
      {detail}
      <span role="status" aria-live="polite" className="sr-only">
        {liveTextFor(state)}
      </span>
    </div>
  );
}
