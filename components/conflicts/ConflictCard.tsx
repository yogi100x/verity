"use client";

/**
 * The money moment — docs/design.md §6. Full-width, amber wash, Fraunces
 * header (one of exactly four places the serif appears), three equal-weight
 * source chips, then a deliberate 400ms beat before the resolving question.
 *
 * No accept/reject/resolve control anywhere: conflicts are surfaced, never
 * resolved by the product (docs/design.md, docs/lanes/lane-b-surface.md).
 */

import { useEffect, useRef, useState } from "react";
import type { ConflictView } from "@/components/data/dal";
import { SourceChip } from "./SourceChip";

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

function numberWord(n: number): string {
  const word = NUMBER_WORDS[n];
  return word ?? String(n);
}

function capitalize(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word;
}

export function ConflictCard({ conflict }: { conflict: ConflictView }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (node === null) return;

    // jsdom (unit tests) and very old browsers have no IntersectionObserver
    // — fall back to showing the card at once rather than leaving it
    // permanently invisible.
    if (typeof IntersectionObserver === "undefined") {
      setHasEntered(true);
      return;
    }

    // Fail-safe: information is never gated on motion. If the observer has
    // not fired shortly after mount (e.g. an unforeseen viewport/threshold
    // interaction), the card shows anyway and only the entrance flourish is
    // lost.
    const failSafe = window.setTimeout(() => setHasEntered(true), 700);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasEntered(true);
            observer.disconnect();
          }
        }
      },
      // threshold 0, not 0.2: on a small phone the stacked card is taller
      // than the viewport, so 20% of it may never be visible at once and a
      // higher threshold leaves the money moment permanently invisible.
      { threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(failSafe);
    };
  }, []);

  const headline = `${capitalize(numberWord(conflict.chips.length))} sources disagree about the ${conflict.subject}.`;

  return (
    <div
      ref={cardRef}
      className={[
        // conflict-surface: print-safe grey override hook (app/globals.css)
        "conflict-surface rounded-card border border-conflict-border p-10",
        "bg-[color-mix(in_srgb,var(--color-conflict-fill)_55%,var(--color-surface))]",
        hasEntered ? "animate-conflict-entry" : "opacity-0",
      ].join(" ")}
    >
      <h2 className="font-display text-display-m font-[560] text-ink">{headline}</h2>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {conflict.chips.map((chip, index) => (
          <SourceChip key={`${chip.sourceName}-${index}`} chip={chip} />
        ))}
      </div>

      <p className="mt-6 text-[0.9375rem] font-bold text-ink">
        This is now a question on the appointment brief:
      </p>
      <div
        role="group"
        aria-label="The resolving question for the appointment brief"
        className={[
          "mt-3 rounded-[8px] border border-brand bg-surface p-5 text-body-l text-ink",
          hasEntered ? "animate-question-beat" : "opacity-0",
        ].join(" ")}
      >
        {conflict.generatedQuestion}
      </div>
    </div>
  );
}
