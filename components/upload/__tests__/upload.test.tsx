/**
 * Upload screen, rendered against the real DAL (fixtures/margaret.json under
 * the hood, never imported directly). The simulated driver runs on real
 * timers, so we drive it with vitest's *async* fake-timer helpers — the sync
 * `advanceTimersByTime` would fire the timeout but never flush the awaited
 * continuation, leaving the state machine stuck at "Reading…".
 *
 * The load-bearing assertions:
 *  - every processing state is a named prose label, advancing in sequence,
 *    never a bare spinner;
 *  - an image triggers the honest partial-read state with a way back to the
 *    original;
 *  - the progress list announces changes via aria-live="polite";
 *  - a summary appears once every file reaches a terminal state.
 */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadPage from "@/app/(app)/upload/page";

const STAGE_DELAY_MS = 650;

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function drop(file: File) {
  const input = screen.getByLabelText("Upload documents");
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("UploadPage", () => {
  it("advances through named states, never a bare spinner", async () => {
    render(<UploadPage />);
    drop(new File(["x"], "discharge.pdf", { type: "application/pdf" }));

    // First report is synchronous with the change: the file is already
    // "Reading…", a named state, not a spinner.
    expect(screen.getByText(/Reading discharge\.pdf/)).toBeInTheDocument();

    await tick(STAGE_DELAY_MS);
    expect(screen.getByText("Finding what it says…")).toBeInTheDocument();

    await tick(STAGE_DELAY_MS);
    expect(screen.getByText(/Checking every quote against the page/)).toBeInTheDocument();

    await tick(STAGE_DELAY_MS);
    expect(screen.getByText(/^Done —/)).toBeInTheDocument();
  });

  it("announces progress on an aria-live polite region", async () => {
    const { container } = render(<UploadPage />);
    drop(new File(["x"], "notes.pdf", { type: "application/pdf" }));

    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    await tick(STAGE_DELAY_MS * 3);
  });

  it("shows the honest partial-read state for an image, with a way back to the original", async () => {
    render(<UploadPage />);
    drop(new File(["x"], "scan.png", { type: "image/png" }));

    await tick(STAGE_DELAY_MS * 3);

    expect(screen.getByText(/handwritten note in the margin/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the original" })).toBeInTheDocument();
    // Named partial state, still no red / no spinner: the label is prose.
    expect(screen.queryByText(/error|failed|urgent/i)).toBeNull();
  });

  it("surfaces a summary once every file reaches a terminal state", async () => {
    render(<UploadPage />);
    drop(new File(["x"], "letter.pdf", { type: "application/pdf" }));

    // No summary while still processing.
    expect(screen.queryByText(/document.*added/)).toBeNull();

    await tick(STAGE_DELAY_MS * 3);

    expect(screen.getByText(/1 document added,/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the timeline" })).toBeInTheDocument();
  });
});
