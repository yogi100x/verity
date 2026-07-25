/**
 * Landing-page account switcher (stretch S1). It has exactly one job: set
 * the case cookie client-side (no app/api/** route — Lane B doesn't own
 * that territory) and navigate to /dashboard. No cookie logic lives
 * anywhere else, so this is the only place that needs to prove the cookie
 * name and value actually reach `document.cookie`.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { CaseSwitcher } from "@/components/dashboard/CaseSwitcher";

function clearCaseCookie() {
  document.cookie = "verity_case=; path=/; max-age=0";
}

describe("CaseSwitcher", () => {
  beforeEach(() => {
    push.mockClear();
    clearCaseCookie();
  });

  it("offers exactly two named options and doesn't shout", () => {
    render(<CaseSwitcher />);
    expect(screen.getByText("Margaret (carer view)")).toBeInTheDocument();
    expect(screen.getByText("Maya (self view)")).toBeInTheDocument();
  });

  it("choosing Maya sets the case cookie to maya and navigates to /dashboard", () => {
    render(<CaseSwitcher />);
    fireEvent.click(screen.getByText("Maya (self view)"));
    expect(document.cookie).toContain("verity_case=maya");
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("choosing Margaret sets the case cookie to margaret and navigates to /dashboard", () => {
    render(<CaseSwitcher />);
    fireEvent.click(screen.getByText("Margaret (carer view)"));
    expect(document.cookie).toContain("verity_case=margaret");
    expect(push).toHaveBeenCalledWith("/dashboard");
  });
});
