/**
 * LetterModal is a read-only viewer for Lane C's `draftRequestLetter`
 * output (docs/lanes/lane-b-surface.md stretch S3). Lane B never authors
 * letter prose, so the letter-text assertions below compare rendered
 * output against `draftRequestLetter` called directly on the same fixture
 * data — never against hardcoded prose strings (journey 9.5/9.6).
 *
 * The letter is generated server-side (the gaps page drafts one per gap and
 * passes it down as a prop). Two levels are covered:
 *   - component level: LetterModal renders whatever RequestLetter it is given;
 *   - integration level: the gaps Server Component actually wires the real
 *     `draftRequestLetter` through GapCard into the modal (see the last test).
 */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GapCard } from "@/components/gaps/GapCard";
import { LetterModal } from "../LetterModal";
import { getCase, gapViews } from "@/components/data/dal";
import {
  draftRequestLetter,
  type LetterRecipient,
  type RequestLetter,
} from "@/lib/copy/request_letters";

// The gaps page resolves the active case from a cookie; pin it to Margaret so
// the Server Component can be rendered directly in the integration test.
vi.mock("@/components/data/activeCase", () => ({
  getActiveCaseId: async () => "margaret",
}));

// GapsPage transitively imports the mocked module (vi.mock is hoisted).
import GapsPage from "@/app/(app)/gaps/page";

// The renal-review gap from fixtures/margaret.json — journey 9.5.
const RENAL_GAP_ID = "9a000000-0000-4000-8000-000000000001";

const snapshot = getCase("margaret");
const renalGap = snapshot.gaps.find((gap) => gap.id === RENAL_GAP_ID);
if (renalGap === undefined) {
  throw new Error("fixture no longer contains the renal-review gap this test depends on");
}
const expectedLetter = draftRequestLetter(renalGap, snapshot.facts, snapshot.person);

const renalGapView = gapViews("margaret").find((gap) => gap.id === RENAL_GAP_ID);
if (renalGapView === undefined) {
  throw new Error("renal gap missing from gapViews");
}

const RECIPIENT_LABELS: Record<LetterRecipient, string> = {
  gp: "GP",
  provider: "Referring provider",
  records_holder: "Records holder",
  chc_coordinator: "CHC coordinator",
};

// Every member of the union, listed literally (no cast) so the array is typed
// `LetterRecipient[]` and a Lane C addition to the union leaves this stale in
// a way the exhaustiveness intent makes obvious.
const ALL_RECIPIENTS: LetterRecipient[] = [
  "gp",
  "provider",
  "records_holder",
  "chc_coordinator",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LetterModal", () => {
  it("opens from the GapCard button", () => {
    render(<GapCard gap={renalGapView} letter={expectedLetter} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Draft request letter" }));
    expect(screen.getByRole("dialog", { name: "Draft request letter" })).toBeInTheDocument();
  });

  it("renders letter text matching draftRequestLetter's output for the fixture (journey 9.5/9.6)", () => {
    render(<LetterModal letter={expectedLetter} onClose={() => {}} />);

    const letterText = screen.getByTestId("letter-text");
    expect(within(letterText).getByText(expectedLetter.salutation)).toBeInTheDocument();
    expect(within(letterText).getByText(expectedLetter.closing)).toBeInTheDocument();
    for (const paragraph of expectedLetter.body.split("\n\n")) {
      expect(within(letterText).getByText(paragraph)).toBeInTheDocument();
    }
    // Journey 9.5: the letter names Margaret and what was requested — proven
    // here by asserting equality with the generator's own output, not by
    // re-typing prose. The generator's opening line interpolates
    // person.display_name.
    expect(letterText.textContent).toContain(snapshot.person.display_name);
  });

  it("routes the renal gap to the recipient draftRequestLetter returns", () => {
    render(<LetterModal letter={expectedLetter} onClose={() => {}} />);
    expect(
      screen.getByText(`To: ${RECIPIENT_LABELS[expectedLetter.recipient]}`),
    ).toBeInTheDocument();
  });

  // Exhaustiveness guard for the recipient -> label map. The compile-time
  // guarantee is the `Record<LetterRecipient, string>` in LetterModal (a new
  // Lane C recipient fails typecheck there); this is the runtime belt-and-
  // suspenders that every variant renders a real, non-empty heading rather
  // than "undefined".
  it.each(ALL_RECIPIENTS)(
    "labels the %s recipient",
    (recipient) => {
      const letter: RequestLetter = {
        recipient,
        salutation: "Dear,",
        body: "Body.",
        closing: "Yours faithfully,",
      };
      render(<LetterModal letter={letter} onClose={() => {}} />);
      expect(screen.getByText(`To: ${RECIPIENT_LABELS[recipient]}`)).toBeInTheDocument();
    },
  );

  it("copies the concatenated letter to the clipboard and shows a confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.useFakeTimers();

    try {
      render(<LetterModal letter={expectedLetter} onClose={() => {}} />);
      const copyButton = screen.getByRole("button", { name: "Copy to clipboard" });

      await act(async () => {
        fireEvent.click(copyButton);
        // Flush the microtask queue so the mocked (resolved) writeText
        // promise settles and setCopied(true) runs before we assert.
        await Promise.resolve();
        await Promise.resolve();
      });

      const expectedText = `${expectedLetter.salutation}\n\n${expectedLetter.body}\n\n${expectedLetter.closing}`;
      expect(writeText).toHaveBeenCalledWith(expectedText);
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole("button", { name: "Copy to clipboard" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<GapCard gap={renalGapView} letter={expectedLetter} />);
    const trigger = screen.getByRole("button", { name: "Draft request letter" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Draft request letter" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the first control inside the dialog on open", () => {
    render(<LetterModal letter={expectedLetter} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Copy to clipboard" })).toHaveFocus();
  });

  it("renders no editing controls — read-only", () => {
    const { container } = render(<LetterModal letter={expectedLetter} onClose={() => {}} />);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  // Integration: the gaps Server Component drafts the letter with the real
  // generator and threads it through GapCard into the modal. Proves the app
  // renders the generator's exact output — not just that the modal renders
  // whatever prop it is handed.
  it("wires the gaps page through to draftRequestLetter's output (server-side generation)", async () => {
    const gapOrder = gapViews("margaret");
    const renalIndex = gapOrder.findIndex((gap) => gap.id === RENAL_GAP_ID);
    expect(renalIndex).toBeGreaterThanOrEqual(0);

    render(await GapsPage());

    const buttons = screen.getAllByRole("button", { name: "Draft request letter" });
    fireEvent.click(buttons[renalIndex]);

    const dialog = screen.getByRole("dialog", { name: "Draft request letter" });
    const letterText = within(dialog).getByTestId("letter-text");
    expect(within(letterText).getByText(expectedLetter.salutation)).toBeInTheDocument();
    expect(within(letterText).getByText(expectedLetter.closing)).toBeInTheDocument();
    for (const paragraph of expectedLetter.body.split("\n\n")) {
      expect(within(letterText).getByText(paragraph)).toBeInTheDocument();
    }
  });
});
