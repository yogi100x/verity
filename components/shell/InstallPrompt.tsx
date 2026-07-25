"use client";

/**
 * Tasteful PWA install prompt. Never on first visit, shown at most once
 * ever, dismissible. Sits above the mobile bottom nav. Hand-rolled rather
 * than using <Card> because it carries the sheet shadow (the one legal
 * shadow — floating sheets/modals only, docs/design.md §4), which Card
 * deliberately never has.
 */

import { useCallback, useEffect, useState } from "react";

const VISIT_KEY = "verity:visit-count";
const SHOWN_KEY = "verity:install-prompt-shown";

// One visit == one page load. A module-level flag makes the increment
// idempotent across React StrictMode's dev-only double-invoke, so the count
// never inflates and eligibility stays honest.
let visitCounted = false;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isBeforeInstallPromptEvent(
  event: Event,
): event is BeforeInstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    try {
      let visitCount = Number(window.localStorage.getItem(VISIT_KEY) ?? "0");
      if (!visitCounted) {
        visitCounted = true;
        visitCount += 1;
        window.localStorage.setItem(VISIT_KEY, String(visitCount));
      }
      setEligible(
        visitCount >= 2 && window.localStorage.getItem(SHOWN_KEY) !== "1",
      );
    } catch {
      // localStorage unavailable — never show the prompt.
    }

    const handler = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event)) return;
      event.preventDefault();
      setDeferredPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const markShown = useCallback(() => {
    try {
      window.localStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const handleDismiss = useCallback(() => {
    markShown();
    setDismissed(true);
  }, [markShown]);

  const handleInstall = () => {
    void deferredPrompt?.prompt();
    markShown();
    setDismissed(true);
  };

  const showing = eligible && !dismissed && deferredPrompt !== null;

  useEffect(() => {
    if (!showing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showing, handleDismiss]);

  if (!showing) {
    return null;
  }

  return (
    <div className="no-print fixed inset-x-0 bottom-16 z-30 flex justify-center px-4 md:bottom-6">
      <div
        role="dialog"
        aria-label="Install Verity"
        className="w-full max-w-sm rounded-card border border-hairline bg-surface p-5 shadow-sheet"
      >
        <p className="text-body font-semibold text-ink">Add Verity to your home screen</p>
        <p className="mt-1 text-body-s text-ink-secondary">
          Opens instantly, like an app, straight from your phone.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={handleInstall}
            className="flex h-[48px] items-center justify-center rounded-card border border-hairline bg-surface px-5 text-body-s font-semibold text-ink transition-[filter] duration-[120ms] ease-out hover:brightness-[0.97]"
          >
            Add to home screen
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-body-s font-semibold text-brand hover:underline"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
