"use client";

/**
 * Live-mode upload driver (Job 2 of live upload persistence). POSTs the real
 * file to /api/extract?mode=live and drives the exact same named stages the
 * simulated driver reports — the STAGE_LABELS constants in
 * useUploadSimulation.ts — so switching drivers changes nothing about what
 * the screen says, only where the words come from. This is the one swap
 * point `UploadView` uses when the resolved mode is 'live'; fixtures mode
 * never imports this file's network path (see UploadView.tsx).
 *
 * Response contract (app/api/extract/route.ts, owned by a concurrent PR):
 * 200 live = { mode, reports: [wireReport], drops, persisted: { source_id,
 * claims, facts } | null, persist_notice? } — `persist_notice` appears only
 * when `persisted` is null, explaining why nothing was stored. wireReport
 * itself carries .claims (array), .notice (string | null) and .degraded
 * (boolean) for the extraction step. Parsed with zod over `unknown` — never
 * `as` — and every field is optional/nullable-tolerant beyond what's pinned
 * above: this driver still checks `report.notice` and a bare top-level
 * `notice` too, in case a future revision moves the text, but the field this
 * route actually emits today is `persist_notice`. Any string notice found —
 * on the report or at the top level, under either name — is surfaced
 * verbatim; none is invented.
 */

import { z } from "zod";
import { STAGE_LABELS, type UploadDriver } from "@/components/upload/useUploadSimulation";
import { ensureAnonSession } from "@/components/data/supabaseBrowser";

const WireReport = z.object({
  claims: z.array(z.unknown()).optional(),
  notice: z.string().nullable().optional(),
  degraded: z.boolean().optional(),
});

const PersistedResult = z
  .object({
    source_id: z.string().optional(),
    claims: z.number().optional(),
    facts: z.number().optional(),
  })
  .nullable()
  .optional();

/**
 * Every field optional/nullable: this is a 200 response and different modes
 * of "not quite done" (a degrade notice, a null persisted result, neither)
 * are distinguished below, never rejected as malformed.
 */
const ExtractSuccessBody = z.object({
  reports: z.array(WireReport).optional(),
  notice: z.string().nullable().optional(),
  /** The field the route actually emits when `persisted` is null. */
  persist_notice: z.string().nullable().optional(),
  persisted: PersistedResult,
});

const ErrorBody = z.object({
  error: z.string().optional(),
});

/** First non-empty string in the list, or null — never a fabricated one. */
function firstNoticeText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export function createLiveDriver(personId: string): UploadDriver {
  return async (file, report) => {
    report({ stage: "reading", statusLabel: STAGE_LABELS.reading(file.name) });

    // A live upload needs a held Supabase session — /api/extract?mode=live
    // 401s without one and 403s without a care_relationships grant for it
    // (see components/data/careAccess.ts). Establishing/reusing the session
    // is the browser's job, done here rather than left to the fetch to fail
    // on; a false result means no session could be created, so nothing is
    // posted and nothing is silently lost.
    const signedIn = await ensureAnonSession();
    if (!signedIn) {
      report({
        stage: "failed",
        statusLabel: STAGE_LABELS.failed,
        partialNote: "Could not sign in. Nothing was saved.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("person_id", personId);

    let response: Response;
    try {
      report({ stage: "finding", statusLabel: STAGE_LABELS.finding });
      response = await fetch("/api/extract?mode=live", { method: "POST", body: formData });
    } catch {
      report({ stage: "failed", statusLabel: STAGE_LABELS.failed });
      return;
    }

    report({ stage: "checking", statusLabel: STAGE_LABELS.checking });

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      report({ stage: "failed", statusLabel: STAGE_LABELS.failed });
      return;
    }

    if (!response.ok) {
      // Copy discipline: the visible label stays the one honest, reused
      // failed string. The server's own error text (already user-safe copy
      // from the route — see 413/415 bodies in app/api/extract/route.ts)
      // goes in partialNote, not into statusLabel.
      const parsedError = ErrorBody.safeParse(json);
      report({
        stage: "failed",
        statusLabel: STAGE_LABELS.failed,
        partialNote: parsedError.success ? (parsedError.data.error ?? null) : null,
      });
      return;
    }

    const parsed = ExtractSuccessBody.safeParse(json);
    if (!parsed.success) {
      report({ stage: "failed", statusLabel: STAGE_LABELS.failed });
      return;
    }

    const data = parsed.data;
    const firstReport = data.reports?.[0];
    const claimCount = firstReport?.claims?.length ?? 0;
    const noticeText = firstNoticeText(firstReport?.notice, data.persist_notice, data.notice);

    if (noticeText !== null) {
      report({
        stage: "partial",
        statusLabel: STAGE_LABELS.partial(noticeText, claimCount),
        claimCount,
        partialNote: noticeText,
      });
      return;
    }

    if (data.persisted === null) {
      // Extraction worked but nothing was kept in storage, and the API gave
      // no notice text to explain why — surface the honest count, invent
      // nothing further.
      report({
        stage: "partial",
        statusLabel: STAGE_LABELS.partialCountOnly(claimCount),
        claimCount,
        partialNote: null,
      });
      return;
    }

    report({ stage: "done", statusLabel: STAGE_LABELS.done(claimCount), claimCount });
  };
}
