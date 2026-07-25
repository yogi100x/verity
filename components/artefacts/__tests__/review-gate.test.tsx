/**
 * ReviewGate is a controlled component — the reviewer name and checked
 * state live in the parent (ArtefactDocument, so the footer can read the
 * name too). This harness reproduces that wiring with local state so the
 * gate can be exercised the same way a real page would drive it.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewGate } from "../ReviewGate";

const TEST_PERSON_ID = "11111111-1111-4111-8111-111111111111";

function Harness() {
  const [reviewed, setReviewed] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  return (
    <ReviewGate
      reviewed={reviewed}
      onReviewedChange={setReviewed}
      reviewerName={reviewerName}
      onReviewerNameChange={setReviewerName}
      personId={TEST_PERSON_ID}
    />
  );
}

describe("ReviewGate", () => {
  beforeEach(() => {
    vi.stubGlobal("print", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables the print button initially, with the unlock reason visible", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    expect(screen.getByText("Review to unlock printing")).toBeInTheDocument();
  });

  it("stays disabled with only the checkbox ticked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("I have reviewed every line of this document"));
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    expect(screen.getByText("Review to unlock printing")).toBeInTheDocument();
  });

  it("stays disabled with only a name typed", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Diane Okafor" } });
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
  });

  it("enables the print button once checked and named, and calls window.print on click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("I have reviewed every line of this document"));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Diane Okafor" } });

    const printButton = screen.getByRole("button", { name: "Print" });
    expect(printButton).not.toBeDisabled();
    expect(screen.queryByText("Review to unlock printing")).not.toBeInTheDocument();

    fireEvent.click(printButton);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("the gate carries the no-print class — it never appears on a printed page", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".no-print")).toBeInTheDocument();
  });
});
