/**
 * S4 — the Attendance Allowance line at the end of the CHC pack.
 *
 * Never hardcodes the rate or the wording: everything is checked against
 * Lane C's exported copy (lib/copy/attendance_allowance.ts) directly, so a
 * rate refresh there never has to touch this test.
 */

import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { artifactView } from "@/components/data/dal";
import { AA_CHECK_URL, attendanceAllowanceLine } from "@/lib/copy/attendance_allowance";
import { ArtefactDocument } from "../ArtefactDocument";
import { AttendanceAllowanceLine } from "../AttendanceAllowanceLine";

const TODAY_LABEL = "25 July 2026";

describe("Attendance Allowance line", () => {
  it("renders on the CHC pack with text identical to Lane C's exported copy", () => {
    const view = artifactView("chc_dst_pack_v1");
    const { container } = render(
      <ArtefactDocument view={view} todayLabel={TODAY_LABEL} showAttendanceAllowance />,
    );

    const link = screen.getByRole("link", { name: AA_CHECK_URL });
    const paragraph = link.closest("p");
    expect(paragraph).not.toBeNull();

    // Reconstructed from the DOM (plain text either side of the <a> plus the
    // link's own text) so this only passes if the rendered line is
    // byte-identical to what Lane C's function returns for this person —
    // the rate and every word come from there, never retyped here.
    expect(paragraph?.textContent).toBe(attendanceAllowanceLine(view.person.display_name));
    expect(container.textContent).toContain(view.person.display_name);
  });

  it("carries a working, new-tab, noopener gov.uk link", () => {
    const view = artifactView("chc_dst_pack_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} showAttendanceAllowance />);

    const link = screen.getByRole("link", { name: AA_CHECK_URL });
    expect(link).toHaveAttribute("href", AA_CHECK_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("never renders on the GP brief", () => {
    const view = artifactView("gp_brief_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

    expect(screen.queryByRole("link", { name: AA_CHECK_URL })).not.toBeInTheDocument();
    expect(screen.queryByText(/Attendance Allowance/)).not.toBeInTheDocument();
  });

  it("does not render even on the CHC pack unless the caller opts in", () => {
    // Guards the default: ArtefactDocument must not show the line unless a
    // caller explicitly passes showAttendanceAllowance — the flag defaults
    // to false, matching every pre-existing call site.
    const view = artifactView("chc_dst_pack_v1");
    render(<ArtefactDocument view={view} todayLabel={TODAY_LABEL} />);

    expect(screen.queryByRole("link", { name: AA_CHECK_URL })).not.toBeInTheDocument();
  });

  it("degrades to the exact string with no link if Lane C's line ever omits the URL", () => {
    // The copy module always appends AA_CHECK_URL today, so this branch is
    // unreachable through real callers — inject a URL-less line to prove the
    // component renders it verbatim rather than crashing or dropping text.
    const injected = "Maya Okafor may be eligible for Attendance Allowance.";
    const { container } = render(
      <AttendanceAllowanceLine personName="Maya Okafor" line={injected} />,
    );

    expect(container.textContent).toBe(injected);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links only the first URL and stays byte-identical if the URL appears twice", () => {
    const injected = `See ${AA_CHECK_URL} or again ${AA_CHECK_URL} for details.`;
    const { container } = render(
      <AttendanceAllowanceLine personName="Margaret Thompson" line={injected} />,
    );

    // Reconstruction is a mathematical identity, so the visible text must
    // still equal the input exactly; only the first occurrence is a link.
    expect(container.textContent).toBe(injected);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", AA_CHECK_URL);
  });

  it("has no template-key literal anywhere in components/artefacts source (the structural rule)", () => {
    // Recursive scan (unlike the top-level scan in artefact-view.test.tsx)
    // so it also covers this new AttendanceAllowanceLine.tsx file. The
    // template-key comparison for S4 lives one layer up, at the page
    // (app/(app)/artefacts/[key]/page.tsx), which already holds the
    // validated `key` route param — page-level composition, not renderer
    // branching.
    const root = path.join(__dirname, "..");
    let filesChecked = 0;

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__") continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        const contents = readFileSync(full, "utf8");
        expect(contents).not.toContain("chc_dst_pack_v1");
        expect(contents).not.toContain("gp_brief_v1");
        filesChecked += 1;
      }
    };

    walk(root);
    expect(filesChecked).toBeGreaterThan(0);
  });
});
