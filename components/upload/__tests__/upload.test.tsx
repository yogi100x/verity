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
import { UploadView } from "@/components/upload/UploadView";
import { DICTATION_PROMPT, MIC_START_LABEL } from "@/lib/copy/dictation";

// The former default export of app/(app)/upload/page.tsx was a client
// component and could be rendered directly. It is now an async Server
// Component (it reads the active case to hand UploadView its personId
// prop) and RTL cannot render an async component. Exercising the client
// view directly with a stand-in id is the same seam review-gate.test.tsx
// uses for ReviewGate's personId prop.
const TEST_PERSON_ID = "11111111-1111-4111-8111-111111111111";

function UploadPage() {
  return <UploadView personId={TEST_PERSON_ID} />;
}

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
  it("offers dictation on the upload screen: the prompt and a mic button are present", () => {
    render(<UploadPage />);
    // The fixed dictation invitation and the mic entry point both render,
    // so voice is a first-class way to add a source, not a hidden feature.
    expect(screen.getByText(DICTATION_PROMPT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MIC_START_LABEL })).toBeInTheDocument();
  });

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
