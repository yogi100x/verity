/**
 * ClockCard renders the CHC 28-day clock statement (lib/detectors/chc_clock.ts)
 * plus a "Prepare follow-up letter" button that opens the existing S3 LetterModal
 * with the pre-generated chase letter. Mirrors gap-card.test.tsx /
 * letter-modal.test.tsx: the card authors no prose of its own, so every
 * assertion below compares rendered output against `chcDeadlines`'s own
 * output — never a hardcoded string (journey-test discipline, same as
 * letter-modal.test.tsx's comment on hardcoded prose).
 *
 * No urgency styling (docs/lanes/lane-b-clock brief, and chc_clock.ts's own
 * header comment): the card's markup must be identical regardless of
 * `days_elapsed`, so one test renders the same synthetic fact at day 2 and
 * at day 300 and diffs the class lists.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClockCard } from "../ClockCard";
import { chcDeadlines } from "@/lib/detectors/chc_clock";
import { Fact } from "@/lib/contracts";

// The gaps page resolves the active case from a cookie; pin it to Margaret,
// same fixture-selection mock letter-modal.test.tsx uses, so the Server
// Component can be rendered directly below.
vi.mock("@/components/data/activeCase", () => ({
  getActiveCaseId: async () => "margaret",
}));

/** Flips the DAL mock below between the real fixture and a synthetic
 *  zero-deadline facts array. `vi.hoisted` so the (hoisted) mock factory can
 *  close over it. Reset in `afterEach`. */
const dalControl = vi.hoisted(() => ({ syntheticFacts: false }));

// Pass-through mock of the data-access layer: every export is the real one,
// but `getCase` can swap the facts array for a synthetic, checklist-free one
// so the zero-deadline path can be exercised through the real page without
// depending on what fixtures/margaret.json happens to contain (it gained a
// `chc.checklist_date` fact on 25 Jul — see
// lib/detectors/__tests__/chc_clock.test.ts, which pins exactly one).
vi.mock("@/components/data/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/data/dal")>();
  return {
    ...actual,
    getCase: (...args: Parameters<typeof actual.getCase>) => {
      const snapshot = actual.getCase(...args);
      if (!dalControl.syntheticFacts) return snapshot;
      // One synthetic non-checklist fact, built through the Zod schema.
      // draftRequestLetter tolerates facts that match no gap (empty body
      // rather than throwing — lib/copy/request_letters.ts header), so the
      // page's gap letters still generate.
      return {
        ...snapshot,
        facts: [
          checklistFact({
            ontology_key: "observation.weight",
            subject: "weight",
            canonical_value: "82.4 kg",
          }),
        ],
      };
    },
  };
});

// GapsPage transitively imports both mocked modules above (vi.mock is
// hoisted). With `dalControl.syntheticFacts` unset it renders from the real
// fixture, which now carries one `chc.checklist_date` fact.
import GapsPage from "@/app/(app)/gaps/page";
import { getCase } from "@/components/data/dal";

const PERSON_ID = crypto.randomUUID();

/** Same synthetic-fact shape as lib/detectors/__tests__/chc_clock.test.ts —
 *  a `chc.checklist_date` fact, built through the Zod schema so it can never
 *  drift from the frozen contract. */
function checklistFact(overrides: Partial<z.input<typeof Fact>> = {}) {
  return Fact.parse({
    id: crypto.randomUUID(),
    person_id: PERSON_ID,
    ontology_key: "chc.checklist_date",
    subject: "CHC Checklist",
    canonical_value: "2026-07-03",
    provenance: "document_extracted",
    status: "confirmed",
    valid_from: "2026-07-03",
    valid_to: null,
    supporting_claim_ids: [],
    conflict_id: null,
    superseded_by: null,
    ...overrides,
  });
}

/** Urgency vocabulary that must never appear anywhere ClockCard renders,
 *  however large `days_elapsed` grows — same sweep chc_clock.test.ts runs
 *  against the generator itself; here it runs against the rendered DOM. */
const URGENCY_SWEEP =
  /\b(urgent|overdue|late|immediately|as soon as possible|deadline)\b/i;
const BANNED_LABEL_WORDS =
  /\b(urgent|immediately|likely|suggests|consistent with|probably|triage)\b/i;

describe("ClockCard", () => {
  it("renders the statement verbatim from chcDeadlines", () => {
    const now = new Date("2026-07-25T00:00:00.000Z"); // day 22
    const [deadline] = chcDeadlines([checklistFact()], now);
    render(<ClockCard statement={deadline!.statement} letter={deadline!.chase_letter} />);
    expect(screen.getByText(deadline!.statement)).toBeInTheDocument();
  });

  it('renders a "Prepare follow-up letter" button whose label is free of banned vocabulary', () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    const [deadline] = chcDeadlines([checklistFact()], now);
    render(<ClockCard statement={deadline!.statement} letter={deadline!.chase_letter} />);
    const button = screen.getByRole("button", { name: "Prepare follow-up letter" });
    expect(button).toBeInTheDocument();
    expect(button.textContent ?? "").not.toMatch(BANNED_LABEL_WORDS);
  });

  it("opens the letter modal on click, showing the chase letter body verbatim, and onClose closes it", () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    const [deadline] = chcDeadlines([checklistFact()], now);
    render(<ClockCard statement={deadline!.statement} letter={deadline!.chase_letter} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prepare follow-up letter" }));

    // LetterModal takes an optional `title` (default "Draft request letter",
    // preserved for every GapCard call site). ClockCard passes "Draft chase
    // letter" so the heading matches the chase letter it is actually showing,
    // not the request-letter default.
    const dialog = screen.getByRole("dialog", { name: "Prepare follow-up letter" });
    expect(dialog).toBeInTheDocument();

    const letterText = screen.getByTestId("letter-text");
    for (const paragraph of deadline!.chase_letter.body.split("\n\n")) {
      expect(letterText.textContent).toContain(paragraph);
    }
    expect(letterText.textContent).toContain(deadline!.chase_letter.salutation);
    expect(letterText.textContent).toContain(deadline!.chase_letter.closing);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger button after the modal closes", () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    const [deadline] = chcDeadlines([checklistFact()], now);
    render(<ClockCard statement={deadline!.statement} letter={deadline!.chase_letter} />);

    const trigger = screen.getByRole("button", { name: "Prepare follow-up letter" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(trigger).toHaveFocus();
  });

  it("renders no urgency vocabulary at a large days_elapsed", () => {
    const now = new Date("2027-05-01T00:00:00.000Z"); // ~day 302
    const [deadline] = chcDeadlines([checklistFact()], now);
    expect(deadline!.days_elapsed).toBeGreaterThan(28);

    const { container } = render(
      <ClockCard statement={deadline!.statement} letter={deadline!.chase_letter} />,
    );
    expect(container.textContent ?? "").not.toMatch(URGENCY_SWEEP);
  });

  it("renders identical markup at day 2 and day 300 — no styling driven by days_elapsed", () => {
    const dayTwo = chcDeadlines([checklistFact()], new Date("2026-07-05T00:00:00.000Z"))[0]!;
    const dayThreeHundred = chcDeadlines(
      [checklistFact()],
      new Date("2027-04-29T00:00:00.000Z"),
    )[0]!;
    expect(dayTwo.days_elapsed).toBe(2);
    expect(dayThreeHundred.days_elapsed).toBeGreaterThanOrEqual(300);

    const early = render(
      <ClockCard statement={dayTwo.statement} letter={dayTwo.chase_letter} />,
    );
    const earlyCardClasses = early.container.firstElementChild?.className;
    // The statement paragraph is the one place a day-count could be regexed
    // back out of the string and turned into urgency styling — compare its
    // classes too, not just the card shell and the button.
    const earlyStatementClasses = early.container.querySelector("p")?.className;
    const earlyButtonClasses = screen.getByRole("button", {
      name: "Prepare follow-up letter",
    }).className;
    early.unmount();

    const late = render(
      <ClockCard statement={dayThreeHundred.statement} letter={dayThreeHundred.chase_letter} />,
    );
    const lateCardClasses = late.container.firstElementChild?.className;
    const lateStatementClasses = late.container.querySelector("p")?.className;
    const lateButtonClasses = screen.getByRole("button", {
      name: "Prepare follow-up letter",
    }).className;
    late.unmount();

    expect(lateCardClasses).toBe(earlyCardClasses);
    expect(lateStatementClasses).toBe(earlyStatementClasses);
    expect(lateButtonClasses).toBe(earlyButtonClasses);
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("GapsPage clock section", () => {
  afterEach(() => {
    dalControl.syntheticFacts = false;
  });

  it("renders a clock card whose statement is chcDeadlines' own output for the live fixture", async () => {
    // Derived through the generator, never hardcoded prose. The page calls
    // chcDeadlines(facts, new Date()) with the real wall clock, so the one
    // run-dependent token in the statement is the day count ("Day N today.");
    // pin every other character by generating at a fixed `now` and leaving
    // only that day number flexible. Deterministic at any date the suite runs.
    const facts = getCase("margaret").facts;
    const reference = chcDeadlines(facts, new Date("2026-07-25T00:00:00.000Z"));
    expect(reference).toHaveLength(1);
    expect(reference[0]!.statement).toMatch(/Day \d+ today\.$/);
    const prefix = reference[0]!.statement.replace(/Day \d+ today\.$/, "");
    const pattern = new RegExp(`^${escapeRegExp(prefix)}Day \\d+ today\\.$`);

    render(await GapsPage());

    // The statement paragraph renders the generator's string verbatim…
    expect(screen.getByText(pattern)).toBeInTheDocument();
    // …with its chase-letter trigger, and the gap list still renders below.
    expect(screen.getByRole("button", { name: "Prepare follow-up letter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gaps" })).toBeInTheDocument();
  });

  it("renders without crashing and adds no clock card when the facts hold no chc.checklist_date", async () => {
    dalControl.syntheticFacts = true;
    render(await GapsPage());

    // The gaps heading still renders — the page did not throw.
    expect(screen.getByRole("heading", { name: "Gaps" })).toBeInTheDocument();
    // No "Prepare follow-up letter" button anywhere: the synthetic facts yield
    // zero ChcDeadline entries, so ClockCard never mounts. (The gap cards'
    // own "Draft request letter" buttons are unaffected and out of scope
    // here — covered by letter-modal.test.tsx.)
    expect(screen.queryByRole("button", { name: "Prepare follow-up letter" })).not.toBeInTheDocument();
  });
});
