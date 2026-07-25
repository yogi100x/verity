/**
 * Mobile-nav completeness (audit finding, this lane's item 3a): before this
 * change NAV_ITEMS — the bottom bar rendered below `md:` — had no way to
 * reach Home (/dashboard) or Add (/upload), so a phone user landing
 * anywhere but Home could never get back to it, and could never start a
 * new upload, without the browser back button.
 *
 * jsdom has no real viewport/media-query layout engine, so these tests
 * assert on the rendered component tree (hrefs, labels, item count), not on
 * pixel truncation or wrap behaviour at 320px — that stays a manual check
 * per docs/user-journey.md 7.1.
 */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/timeline",
}));

import { BottomNav, NAV_ITEMS, TopNav } from "../AppNav";

describe("NAV_ITEMS (mobile bottom bar)", () => {
  it("includes Home and Add alongside the four core screens", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual([
      "/dashboard",
      "/timeline",
      "/conflicts",
      "/gaps",
      "/artefacts",
      "/upload",
    ]);
  });

  it("puts Home first", () => {
    expect(NAV_ITEMS[0].label).toBe("Home");
    expect(NAV_ITEMS[0].href).toBe("/dashboard");
  });

  it("puts Add last, pointing at the upload screen", () => {
    const last = NAV_ITEMS[NAV_ITEMS.length - 1];
    expect(last.label).toBe("Add");
    expect(last.href).toBe("/upload");
  });
});

describe("BottomNav", () => {
  it("renders a link for every nav item, including Home and Add", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(6);

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Add/ })).toHaveAttribute("href", "/upload");
  });

  it("keeps every item as a shrinkable flex child so six items don't overflow a 320px bar", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const link of nav.querySelectorAll("a")) {
      expect(link.className).toContain("min-w-0");
      expect(link.className).toContain("flex-1");
      const label = link.querySelector("span:last-child");
      expect(label?.className).toContain("truncate");
    }
  });
});

describe("TopNav", () => {
  it("does not duplicate Home/Add — Dashboard covers Home, upload is reached via the dashboard CTA", () => {
    render(<TopNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["Timeline", "Conflicts", "Gaps", "Artefacts", "Dashboard"]);
    expect(labels).not.toContain("Add");
  });
});
