import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NEW_RECORD_ERRORS } from "@/app/api/people/_lib/newRecord";
import { ACCESS_BASIS_LABELS } from "@/components/dashboard/AccessBasisBadge";
import { CARER_ACCESS_BASES } from "@/lib/safety/consent";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const { ensureAnonSession } = vi.hoisted(() => ({ ensureAnonSession: vi.fn() }));
vi.mock("@/components/data/supabaseBrowser", () => ({ ensureAnonSession }));

import { WelcomeForm } from "@/components/onboarding/WelcomeForm";

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

function okResponse(): Response {
  return {
    ok: true,
    status: 201,
    json: async () => ({ person: { id: PERSON_ID } }),
  } as unknown as Response;
}

function errorResponse(status: number, error: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error }),
  } as unknown as Response;
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Fills every required field with a valid answer. */
function fillValid() {
  type(/who are you caring for/i, "Margaret Ellis");
  fireEvent.click(screen.getByLabelText(ACCESS_BASIS_LABELS.person_consent));
  type(/your full name/i, "Sarah Ellis");
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create this record/i }));
}

describe("WelcomeForm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    ensureAnonSession.mockReset();
    ensureAnonSession.mockResolvedValue(true);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers exactly the four carer bases, labelled as they are elsewhere in the app", () => {
    render(<WelcomeForm />);

    for (const basis of CARER_ACCESS_BASES) {
      expect(screen.getByLabelText(ACCESS_BASIS_LABELS[basis])).not.toBeNull();
    }
    // 'self' is a real AccessBasis but never a carer's to declare.
    expect(screen.queryByLabelText(ACCESS_BASIS_LABELS.self)).toBeNull();
  });

  it("blocks an empty name with honest copy and posts nothing", async () => {
    render(<WelcomeForm />);

    submit();

    expect(await screen.findByText(NEW_RECORD_ERRORS.displayNameEmpty)).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("blocks a missing basis, then a missing declared name, in that order", async () => {
    render(<WelcomeForm />);

    type(/who are you caring for/i, "Margaret Ellis");
    submit();
    expect(await screen.findByText(NEW_RECORD_ERRORS.basisNotChosen)).not.toBeNull();

    fireEvent.click(screen.getByLabelText(ACCESS_BASIS_LABELS.person_consent));
    submit();
    expect(await screen.findByText(NEW_RECORD_ERRORS.declaredNameEmpty)).not.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the exact declaration sentence that will be recorded, and only once it is real", async () => {
    render(<WelcomeForm />);

    expect(screen.queryByText(/^Access basis:/)).toBeNull();

    fireEvent.click(screen.getByLabelText(ACCESS_BASIS_LABELS.lpa_health_welfare));
    type(/your full name/i, "Sarah Ellis");

    // The wording is Lane C's accessBadge, not a second copy written here.
    expect(
      await screen.findByText(
        "Access basis: Lasting Power of Attorney (health and welfare), declared by Sarah Ellis",
      ),
    ).not.toBeNull();
  });

  it("signs in, posts the declaration, and lands on the dashboard in live mode", async () => {
    render(<WelcomeForm />);

    fillValid();
    type(/date of birth/i, "1944-03-02");
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?mode=live"));

    expect(ensureAnonSession).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/people");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      display_name: "Margaret Ellis",
      dob: "1944-03-02",
      basis: "person_consent",
      declared_name: "Sarah Ellis",
    });
    // Server components must re-read the cookie the response just set.
    expect(refresh).toHaveBeenCalled();
  });

  it("reports a failed sign-in and posts nothing", async () => {
    ensureAnonSession.mockResolvedValue(false);
    render(<WelcomeForm />);

    fillValid();
    submit();

    expect(
      await screen.findByText("Could not start a session. Nothing was saved."),
    ).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces the server's own copy verbatim when the route refuses", async () => {
    fetchMock.mockResolvedValue(errorResponse(401, "Sign-in required. Nothing was saved."));
    render(<WelcomeForm />);

    fillValid();
    submit();

    expect(
      await screen.findByText("Sign-in required. Nothing was saved."),
    ).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("reports a network failure without navigating", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<WelcomeForm />);

    fillValid();
    submit();

    expect(
      await screen.findByText("The record could not be created. Nothing was saved."),
    ).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
