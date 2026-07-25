"use client";

/**
 * The onboarding form: "who are you caring for?", answered by a visitor who
 * has been seeded nothing. It creates a real, empty record owned by this
 * browser (POST /api/people) and then lands on the dashboard in live mode.
 *
 * This is a consent declaration, not a form with a checkbox on it — same
 * seriousness as the print gate: the basis is chosen explicitly, the
 * declarer types their own full name, and the exact sentence that will be
 * recorded is shown before they commit to it. That sentence comes from Lane
 * C's `accessBadge`, and the option labels from the badge already rendered
 * on the dashboard, so no consent wording is retyped here.
 *
 * Validation is `validateNewRecord` — the same pure function the route runs
 * server-side. The copy a person reads while typing and the copy the server
 * would answer with cannot disagree, because they are one function.
 *
 * An anonymous Supabase session is established before posting: the route
 * 401s without one, and there would be no member id to grant the record to.
 */

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ACCESS_BASIS_LABELS } from "@/components/dashboard/AccessBasisBadge";
import { ensureAnonSession } from "@/components/data/supabaseBrowser";
import {
  validateNewRecord,
  type NewRecordField,
} from "@/app/api/people/_lib/newRecord";
import { CARER_ACCESS_BASES, accessBadge, type CarerAccessBasis } from "@/lib/safety/consent";

type Status =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "failed"; message: string; field: NewRecordField | null };

const SIGN_IN_FAILED = "Could not start a session. Nothing was saved.";
const UNREADABLE_RESPONSE = "The record could not be created. Nothing was saved.";

export function WelcomeForm() {
  const router = useRouter();
  const nameId = useId();
  const dobId = useId();
  const declaredNameId = useId();
  const basisGroupId = useId();

  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [basis, setBasis] = useState<CarerAccessBasis | "">("");
  const [declaredName, setDeclaredName] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "editing" });

  const failedField = status.kind === "failed" ? status.field : null;

  // Shown only once there is something real to show. Never a placeholder
  // sentence with a stand-in name in it — a person should read the exact
  // words that will be recorded, or none.
  const declarationPreview =
    basis !== "" && declaredName.trim().length > 0
      ? accessBadge(basis, declaredName.trim())
      : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "saving") return;

    const validated = validateNewRecord(
      { displayName, dob, basis, declaredName },
      { today: new Date().toISOString().slice(0, 10) },
    );
    if (!validated.ok) {
      setStatus({ kind: "failed", message: validated.error, field: validated.field });
      return;
    }

    setStatus({ kind: "saving" });

    const signedIn = await ensureAnonSession();
    if (!signedIn) {
      setStatus({ kind: "failed", message: SIGN_IN_FAILED, field: null });
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: validated.record.displayName,
          dob: validated.record.dob,
          basis: validated.record.basis,
          declared_name: validated.record.declaredName,
        }),
      });
    } catch {
      setStatus({ kind: "failed", message: UNREADABLE_RESPONSE, field: null });
      return;
    }

    if (!response.ok) {
      // The route's own copy is already the honest, person-facing sentence
      // (it validates with the same function this form does), so it is shown
      // verbatim rather than replaced with a generic one.
      let message = UNREADABLE_RESPONSE;
      try {
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
        ) {
          message = (body as { error: string }).error;
        }
      } catch {
        // Keep the fallback message; an unreadable body is not extra information.
      }
      setStatus({ kind: "failed", message, field: null });
      return;
    }

    // The record's cookie came back on the response. `refresh()` makes the
    // server components re-read it rather than serving the pre-creation render.
    router.refresh();
    router.push("/dashboard?mode=live");
  }

  return (
    <form onSubmit={submit} className="flex max-w-[34rem] flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-label font-semibold text-ink">
          Who are you caring for?
        </label>
        <p className="text-body-s text-ink-secondary">
          Their name as it appears on their letters.
        </p>
        <input
          id={nameId}
          name="display_name"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={failedField === "display_name"}
          className="h-12 rounded-card border border-hairline bg-paper px-3 text-body text-ink"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={dobId} className="text-label font-semibold text-ink">
          Date of birth
        </label>
        <p className="text-body-s text-ink-secondary">
          Optional. It helps match documents to the right person.
        </p>
        <input
          id={dobId}
          name="dob"
          type="date"
          value={dob}
          onChange={(event) => setDob(event.target.value)}
          aria-invalid={failedField === "dob"}
          className="h-12 w-56 max-w-full rounded-card border border-hairline bg-paper px-3 text-body text-ink"
        />
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={basisGroupId}>
        <legend className="text-label font-semibold text-ink">
          On what basis do you hold their records?
        </legend>
        <p id={basisGroupId} className="text-body-s text-ink-secondary">
          We record what you tell us here. We do not check it, and we never
          assess anyone&rsquo;s capacity to decide.
        </p>
        <div className="flex flex-col gap-2.5">
          {CARER_ACCESS_BASES.map((option) => (
            <label key={option} className="flex items-center gap-2.5 text-body text-ink">
              <input
                type="radio"
                name="basis"
                value={option}
                checked={basis === option}
                onChange={() => setBasis(option)}
                aria-invalid={failedField === "basis"}
                className="h-5 w-5 border border-hairline"
              />
              {ACCESS_BASIS_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={declaredNameId} className="text-label font-semibold text-ink">
          Your full name
        </label>
        <p className="text-body-s text-ink-secondary">
          Typed, not ticked. It is recorded with the basis you chose and shown
          on the record from then on.
        </p>
        <input
          id={declaredNameId}
          name="declared_name"
          type="text"
          value={declaredName}
          onChange={(event) => setDeclaredName(event.target.value)}
          aria-invalid={failedField === "declared_name"}
          className="h-12 rounded-card border border-hairline bg-paper px-3 text-body text-ink"
        />
      </div>

      {declarationPreview !== null && (
        <p className="rounded-card border border-hairline bg-surface p-4 font-mono text-body-s text-ink">
          {declarationPreview}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div aria-live="polite" className="min-h-6">
          {status.kind === "failed" && (
            <p className="text-body-s text-ink">{status.message}</p>
          )}
        </div>

        {status.kind === "saving" ? (
          <Button variant="primary" type="submit" disabled disabledReason="Creating the record…">
            Create this record
          </Button>
        ) : (
          <Button variant="primary" type="submit">
            Create this record
          </Button>
        )}
      </div>
    </form>
  );
}
