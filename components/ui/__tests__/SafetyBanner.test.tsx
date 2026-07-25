/**
 * Regression guard for the "never rewrite, never partially inline" rule in
 * lib/copy/safety.ts: every rendered character of the banner must trace
 * back to PERSISTENT_BANNER, in both the collapsed (mobile) and expanded
 * state. The lead/body split (SENTENCE_BREAK) is a display-only artefact —
 * concatenating what's rendered must reproduce the import byte-for-byte.
 *
 * jsdom has no real viewport, so "mobile" here means "before the user
 * clicks the expand control" (the collapsed default state), not an actual
 * narrow-viewport render — the `md:` CSS split itself is a manual/visual
 * check, same as the rest of the design system's breakpoints.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafetyBanner } from "../SafetyBanner";
import { PERSISTENT_BANNER } from "@/lib/copy/safety";

// No normalisation: the rendered paragraph's textContent must equal the
// import character for character. The lead/body split is derived from
// PERSISTENT_BANNER itself (a single `indexOf`), and the JSX re-inserts the
// one space it removed, so anything other than exact equality means somebody
// retyped, reflowed or partially inlined the copy.
function rendered(text: string | null | undefined): string {
  return text ?? "";
}

/** Every .ts/.tsx file under app/ and components/ — the whole UI surface the
 *  "never inline the banner" rule applies to. */
// vitest runs from the repo root (where vitest.config.ts lives); import.meta
// carries an http URL under the jsdom environment, so cwd is the reliable
// anchor here.
const REPO_ROOT = process.cwd();

function uiSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(join(REPO_ROOT, "app"));
  walk(join(REPO_ROOT, "components"));
  return out;
}

describe("the banner copy is never inlined", () => {
  it("no file under app/ or components/ contains a fragment of PERSISTENT_BANNER as source text", () => {
    // The only legal way to render this copy is the import from
    // lib/copy/safety.ts. Any four consecutive banner words appearing as
    // source text anywhere in the UI tree means somebody typed it out —
    // whether as a string literal, a JSX text node, or a comment quoting it
    // (which is how a retyped, drifted copy usually starts).
    const words = PERSISTENT_BANNER.split(/\s+/);
    const windows: string[] = [];
    for (let i = 0; i + 4 <= words.length; i += 1) {
      windows.push(words.slice(i, i + 4).join(" "));
    }
    expect(windows.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of uiSourceFiles()) {
      const source = readFileSync(file, "utf8");
      if (windows.some((window) => source.includes(window))) {
        offenders.push(relative(REPO_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("SafetyBanner", () => {
  it("renders the aside with the required label and emergency styling hooks intact", () => {
    render(<SafetyBanner />);
    const aside = screen.getByRole("complementary", { name: "Safety information" });
    expect(aside.className).toContain("no-print");
    expect(aside.className).toContain("bg-emergency-fill");
  });

  it("the rendered text is byte-identical to PERSISTENT_BANNER (never rewritten, never partially inlined)", () => {
    render(<SafetyBanner />);
    const aside = screen.getByRole("complementary", { name: "Safety information" });
    const paragraph = aside.querySelector("p");
    expect(rendered(paragraph?.textContent)).toBe(PERSISTENT_BANNER);
  });

  it("collapsed state exposes an expand control with correct aria-expanded, pointing at the text", () => {
    render(<SafetyBanner />);
    const button = screen.getByRole("button", { name: /Show more/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const controlledId = button.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId as string)).not.toBeNull();
  });

  it("collapsed state does not remove the text from the accessibility tree — only line-clamp visually clips it", () => {
    render(<SafetyBanner />);
    const aside = screen.getByRole("complementary", { name: "Safety information" });
    const paragraph = aside.querySelector("p");
    // No hidden/display:none/aria-hidden gate on the content itself.
    expect(paragraph).not.toHaveAttribute("aria-hidden");
    expect(paragraph).not.toHaveAttribute("hidden");
    expect(paragraph?.className).toContain("line-clamp-1");
    // The full string is still there for assistive tech even while clamped.
    expect(rendered(paragraph?.textContent)).toBe(PERSISTENT_BANNER);
  });

  it("expanding flips aria-expanded and the label, and the text remains byte-identical", () => {
    render(<SafetyBanner />);
    const button = screen.getByRole("button", { name: /Show more/ });
    fireEvent.click(button);

    const expandedButton = screen.getByRole("button", { name: /Show less/ });
    expect(expandedButton).toHaveAttribute("aria-expanded", "true");

    const aside = screen.getByRole("complementary", { name: "Safety information" });
    const paragraph = aside.querySelector("p");
    expect(paragraph?.className).not.toContain("line-clamp-1");
    expect(rendered(paragraph?.textContent)).toBe(PERSISTENT_BANNER);
  });
});
