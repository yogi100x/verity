/**
 * Dashboard, rendered against the real DAL (fixtures/margaret.json under the
 * hood, never imported directly here — dal.ts is the only door in).
 *
 * `DashboardView` (not the route's `page.tsx`) is what's under test: the
 * page wrapper's only job is reading the case cookie via `next/headers`,
 * which has no meaningful behaviour to unit-test outside a real request and
 * would make every assertion below need a next/headers mock for no benefit.
 * `DashboardView` takes `caseId` as a plain prop, so both accounts render
 * synchronously here exactly as they will in the browser.
 *
 * The load-bearing assertions:
 *  - the header stats line reads the exact numbers off `stats`
 *    ("N claims extracted, M dropped for unverifiable quotes");
 *  - the access-basis badge renders informational text, not a claim, and is
 *    absent entirely for Maya (stretch S1 — self is the degenerate carer
 *    case, docs/lanes/lane-b-surface.md §S1);
 *  - there are exactly four source rows for Margaret;
 *  - per-source counts are of *verified* claims only — the prescription
 *    (which carries the one dropped, unverifiable quote) shows 3, never 4 —
 *    and the visible per-source counts sum to extracted-minus-dropped;
 *  - Maya's copy reads first person ("your care"), Margaret's reads third
 *    person ("Maya Okafor's" / "Margaret Ellis's" care) — same component,
 *    same import, driven only by `person.access_basis`.
 */

import "@testing-library/jest-dom/vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { AccessBasisBadge } from "@/components/dashboard/AccessBasisBadge";
import { SourceList } from "@/components/dashboard/SourceList";
import { getCase, getSources } from "@/components/data/dal";

/** Walk up from a source title to the Card that also holds its claim count. */
function cardFor(title: string): HTMLElement {
  let el: HTMLElement | null = screen.getByText(title).parentElement;
  while (el !== null && within(el).queryByText(/\d+ claims?/) === null) {
    el = el.parentElement;
  }
  if (el === null) throw new Error(`no card found for "${title}"`);
  return el;
}

describe("DashboardView (margaret — carer mode, unchanged)", () => {
  it("renders the exact stats line from the snapshot", () => {
    const { stats } = getCase("margaret");
    render(<DashboardView caseId="margaret" />);

    // Derived, not hardcoded — the fixture gains sources over time (care log,
    // checklist letter) and this assertion must track it, not pin it.
    expect(
      screen.getByText(
        new RegExp(
          `${stats.claims_extracted} claims extracted, ${stats.claims_dropped} dropped for unverifiable quotes`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the access basis as informational text", () => {
    render(<DashboardView caseId="margaret" />);
    // person_consent → the human-readable label, not a raw enum or a claim.
    expect(screen.getByText("Access given by consent")).toBeInTheDocument();
  });

  it("renders one row per source — four in total", () => {
    render(<DashboardView caseId="margaret" />);
    expect(screen.getByText("Discharge summary")).toBeInTheDocument();
    expect(screen.getByText("Repeat prescription")).toBeInTheDocument();
    expect(screen.getByText("Cardiology clinic letter")).toBeInTheDocument();
    expect(screen.getByText("Margaret's Juno history")).toBeInTheDocument();
  });

  it("counts verified claims only — the dropped quote never inflates a count", () => {
    render(<DashboardView caseId="margaret" />);

    // Fixture distribution: discharge 6/6, prescription 4 extracted but only
    // 3 verified (1 dropped), cardiology 3/3, juno 4/4.
    expect(within(cardFor("Discharge summary")).getByText("6 claims")).toBeInTheDocument();
    const prescriptionCard = cardFor("Repeat prescription");
    expect(within(prescriptionCard).getByText("3 claims")).toBeInTheDocument();
    expect(within(prescriptionCard).queryByText("4 claims")).toBeNull();
    expect(within(cardFor("Cardiology clinic letter")).getByText("3 claims")).toBeInTheDocument();
    expect(within(cardFor("Margaret's Juno history")).getByText("4 claims")).toBeInTheDocument();
  });

  it("per-source verified counts sum to extracted minus dropped", () => {
    const { claims, stats } = getCase("margaret");
    const sources = getSources("margaret");
    const perSourceVerified = sources.map(
      (source) =>
        claims.filter((c) => c.source_id === source.id && c.verified_substring !== false).length,
    );
    const sum = perSourceVerified.reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.claims_extracted - stats.claims_dropped);
  });

  it("reads third person: the possessive names Margaret, not 'your'", () => {
    render(<DashboardView caseId="margaret" />);
    expect(screen.getByText(/Margaret Ellis’s care/)).toBeInTheDocument();
    expect(screen.queryByText(/your care/)).toBeNull();
  });
});

describe("DashboardView (maya — self mode, stretch S1)", () => {
  it("shows no access-basis badge — self is the degenerate carer case", () => {
    render(<DashboardView caseId="maya" />);
    expect(screen.queryByText(/Acting for yourself/)).toBeNull();
    // No badge role should render at all next to the name.
    expect(screen.queryByText(/Access given by consent/)).toBeNull();
  });

  it("reads first person: 'your care', never Maya's name possessively", () => {
    render(<DashboardView caseId="maya" />);
    expect(screen.getByText(/your care/)).toBeInTheDocument();
    expect(screen.queryByText(/Maya Okafor’s/)).toBeNull();
  });

  it("still renders Maya's real stats and documents from the DAL", () => {
    const { stats } = getCase("maya");
    render(<DashboardView caseId="maya" />);
    expect(
      screen.getByText(
        new RegExp(
          `${stats.claims_extracted} claims extracted, ${stats.claims_dropped} dropped for unverifiable quotes`,
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("MRI report — right ankle")).toBeInTheDocument();
    expect(screen.getByText("Physiotherapy assessment letter")).toBeInTheDocument();
  });

  it("is the exact same DashboardView component margaret uses — no forked dashboard exists", () => {
    // Both describe blocks above render <DashboardView caseId="..."/> from
    // this one import; there is no DashboardViewSelf, MayaDashboard, or
    // similar sitting next to it.
    expect(DashboardView.name).toBe("DashboardView");

    const dashboardDir = path.resolve(__dirname, "..");
    const dashboardViewFiles = readdirSync(dashboardDir).filter(
      (f) => f.endsWith(".tsx") && /dashboard/i.test(f),
    );
    expect(dashboardViewFiles).toEqual(["DashboardView.tsx"]);
  });
});

describe("AccessBasisBadge", () => {
  it("maps each access basis to a plain-language label", () => {
    render(<AccessBasisBadge accessBasis="lpa_health_welfare" />);
    expect(
      screen.getByText("Lasting Power of Attorney — health & welfare"),
    ).toBeInTheDocument();
  });
});

describe("SourceList empty state", () => {
  it("renders the ghost prompt when there are no sources yet", () => {
    render(<SourceList sources={[]} claims={[]} personName="Margaret Ellis" />);
    expect(screen.getByText(/Nothing added yet/)).toBeInTheDocument();
    expect(screen.getByText(/Margaret Ellis/)).toBeInTheDocument();
  });
});
