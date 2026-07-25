/**
 * Dashboard, rendered against the real DAL (fixtures/margaret.json under the
 * hood, never imported directly here — dal.ts is the only door in).
 *
 * The load-bearing assertions:
 *  - the header stats line reads the exact numbers off `stats`
 *    ("N claims extracted, M dropped for unverifiable quotes");
 *  - the access-basis badge renders informational text, not a claim;
 *  - there are exactly four source rows;
 *  - per-source counts are of *verified* claims only — the prescription
 *    (which carries the one dropped, unverifiable quote) shows 3, never 4 —
 *    and the visible per-source counts sum to extracted-minus-dropped.
 */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
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

describe("DashboardPage", () => {
  it("renders the exact stats line from the snapshot", () => {
    const { stats } = getCase();
    render(<DashboardPage />);

    expect(stats.claims_extracted).toBe(17);
    expect(stats.claims_dropped).toBe(1);
    expect(
      screen.getByText(/17 claims extracted, 1 dropped for unverifiable quotes/),
    ).toBeInTheDocument();
  });

  it("shows the access basis as informational text", () => {
    render(<DashboardPage />);
    // person_consent → the human-readable label, not a raw enum or a claim.
    expect(screen.getByText("Access given by consent")).toBeInTheDocument();
  });

  it("renders one row per source — four in total", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Discharge summary")).toBeInTheDocument();
    expect(screen.getByText("Repeat prescription")).toBeInTheDocument();
    expect(screen.getByText("Cardiology clinic letter")).toBeInTheDocument();
    expect(screen.getByText("Margaret's Juno history")).toBeInTheDocument();
  });

  it("counts verified claims only — the dropped quote never inflates a count", () => {
    render(<DashboardPage />);

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
    const { claims, stats } = getCase();
    const sources = getSources();
    const perSourceVerified = sources.map(
      (source) =>
        claims.filter((c) => c.source_id === source.id && c.verified_substring !== false).length,
    );
    const sum = perSourceVerified.reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.claims_extracted - stats.claims_dropped);
    expect(sum).toBe(16);
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
