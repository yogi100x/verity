/**
 * Lane-brief structural checks that don't belong to any single feature's
 * __tests__ dir — docs/lanes/lane-b-surface.md §Tests items 6 and 8.
 *
 * These are static scans of source files, not renders: they encode rules
 * from docs/design.md §10 ("Do not") that are cheap to break by accident
 * (paste a colour, paste a fixed width) and expensive to notice by eye.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["components", "app"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);

function collectFiles(startDir: string): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
        walk(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
        files.push(full);
      }
    }
  }
  walk(startDir);
  return files;
}

function allSourceFiles(): string[] {
  return SCAN_DIRS.flatMap((dir) => collectFiles(path.join(REPO_ROOT, dir)));
}

describe("emergency red is scoped to exactly one component (lane brief test 6)", () => {
  // docs/design.md §10: "Use emergency red anywhere but the 999 card and
  // banner" is a do-not. The only component that currently renders the
  // banner is SafetyBanner; app/globals.css owns the token definition and
  // the print rule that hides the banner. Everything else must be clean.
  //
  // We match the design-token *usage* (Tailwind utility classes generated
  // from --color-emergency, and the raw hex it resolves to) rather than the
  // bare word "emergency", so an explanatory comment ("never the emergency
  // palette") doesn't register as a false violation — see
  // components/upload/FileProgressRow.tsx.
  const ALLOWED = new Set(
    ["components/ui/SafetyBanner.tsx", "app/globals.css"].map((p) => path.join(REPO_ROOT, p)),
  );

  const TOKEN_PATTERN = /(?:^|[^-\w])(bg|text|border)-emergency(?:-fill|-border)?\b|--color-emergency\b|#b3261e/i;

  it("uses the emergency token only in SafetyBanner.tsx and globals.css", () => {
    const offenders: { file: string; lines: number[] }[] = [];

    for (const file of allSourceFiles()) {
      if (ALLOWED.has(file)) continue;
      const content = readFileSync(file, "utf8");
      const matchingLines: number[] = [];
      content.split("\n").forEach((line, index) => {
        if (TOKEN_PATTERN.test(line)) matchingLines.push(index + 1);
      });
      if (matchingLines.length > 0) {
        offenders.push({ file: path.relative(REPO_ROOT, file), lines: matchingLines });
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("SafetyBanner.tsx and globals.css do carry the token (sanity check the scanner isn't vacuous)", () => {
    for (const file of ALLOWED) {
      const content = readFileSync(file, "utf8");
      expect(TOKEN_PATTERN.test(content), `expected ${path.relative(REPO_ROOT, file)} to use the emergency token`).toBe(
        true,
      );
    }
  });
});

describe("no fixed pixel width wider than the 320px minimum viewport (lane brief test 8)", () => {
  // jsdom cannot lay out real CSS, so this cannot replace a manual check at
  // 320px / 200% zoom (docs/user-journey.md 7.1) — that step stays manual.
  // What we *can* catch mechanically is the common regression: a
  // Tailwind arbitrary-value width baked in px that would force horizontal
  // scroll on the smallest supported viewport. Widths expressed in rem
  // (e.g. the citation popover's w-[26rem]) are exempt — they scale with
  // the root font size and are a deliberate desktop-only affordance guarded
  // by the isMobile split in ProvenanceTag.
  const PX_WIDTH_PATTERN = /\b(?:w|min-w|max-w)-\[(\d+)px\]/g;
  const MAX_ALLOWED_PX = 320;

  it("has no w-[NNNpx] / min-w-[NNNpx] / max-w-[NNNpx] over 320px in any className", () => {
    const offenders: { file: string; match: string }[] = [];

    for (const file of allSourceFiles()) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(PX_WIDTH_PATTERN)) {
        const px = Number(match[1]);
        if (px > MAX_ALLOWED_PX) {
          offenders.push({ file: path.relative(REPO_ROOT, file), match: match[0] });
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
