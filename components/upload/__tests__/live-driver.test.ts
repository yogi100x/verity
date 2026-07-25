/**
 * createLiveDriver — the real live-mode UploadDriver, exercised directly
 * against a mocked global fetch (no rendering needed; the driver's contract
 * is `(file, report) => Promise<void>`, same as the simulated one).
 *
 * The load-bearing assertions:
 *  - happy path posts FormData {file, person_id} to /api/extract?mode=live
 *    and walks reading -> finding -> checking -> done, claimCount from the
 *    response's report claims length;
 *  - a degrade notice (persisted: null + a notice string) ends in the
 *    honest partial stage with that exact notice surfaced, never invented
 *    copy;
 *  - a 413 (or any non-2xx) ends in the existing honest failed label, with
 *    the server's own error string carried in partialNote, never inlined
 *    into statusLabel;
 *  - a network throw ends in the same failed label;
 *  - ensureDemoAccess() is awaited before the fetch, and a false result
 *    fails the item with a fixed note and never calls fetch at all — the
 *    live route 401s without a held session, so there is nothing to post.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveDriver } from "@/components/upload/liveDriver";
import { STAGE_LABELS, type UploadItem } from "@/components/upload/useUploadSimulation";

// vi.mock factories are hoisted above every import in this file, including
// the static import below, so the mock function must come from
// vi.hoisted() (see components/data/__tests__/supabase-browser.test.ts).
const { ensureDemoAccess } = vi.hoisted(() => ({ ensureDemoAccess: vi.fn() }));
vi.mock("@/components/data/supabaseBrowser", () => ({ ensureDemoAccess }));

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

type ReportPatch = Partial<Omit<UploadItem, "id" | "name" | "kind">>;

function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Default: a session is already held, so every existing happy/error-path
  // test below still exercises the network call unchanged.
  ensureDemoAccess.mockReset();
  ensureDemoAccess.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function file() {
  return new File(["x"], "discharge.pdf", { type: "application/pdf" });
}

describe("createLiveDriver", () => {
  it("posts FormData {file, person_id} to /api/extract?mode=live and walks reading -> finding -> checking -> done", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        mode: "live",
        reports: [{ claims: [{}, {}, {}], notice: null, degraded: false }],
        drops: 0,
        persisted: { source_id: "src-1", claims: 3, facts: 2 },
      }),
    );

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(url).toBe("/api/extract?mode=live");
    expect(init.method).toBe("POST");
    expect(init.body.get("file")).toBeInstanceOf(File);
    expect(init.body.get("person_id")).toBe(PERSON_ID);

    const stages = patches.map((p) => p.stage);
    expect(stages).toEqual(["reading", "finding", "checking", "done"]);

    const last = patches[patches.length - 1];
    expect(last?.claimCount).toBe(3);
    expect(last?.statusLabel).toBe(STAGE_LABELS.done(3));
  });

  it("ends in the honest partial stage with the API's own notice text when persistence is null", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        mode: "live",
        reports: [
          { claims: [{}, {}], notice: "We could not save this to the record.", degraded: true },
        ],
        drops: 0,
        persisted: null,
      }),
    );

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("partial");
    expect(last?.partialNote).toBe("We could not save this to the record.");
    expect(last?.statusLabel).toBe(
      STAGE_LABELS.partial("We could not save this to the record.", 2),
    );
    expect(last?.claimCount).toBe(2);
  });

  it("surfaces the route's real persist_notice field (persisted: null, persist_notice: string) — the actual shape app/api/extract/route.ts emits", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        mode: "live",
        reports: [{ claims: [{}, {}], notice: null, degraded: false }],
        drops: 0,
        persisted: null,
        persist_notice: "Extraction succeeded but was not stored: the claims could not be saved.",
      }),
    );

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("partial");
    expect(last?.partialNote).toBe(
      "Extraction succeeded but was not stored: the claims could not be saved.",
    );
    expect(last?.statusLabel).toBe(
      STAGE_LABELS.partial(
        "Extraction succeeded but was not stored: the claims could not be saved.",
        2,
      ),
    );
  });

  it("ends in the honest partial stage with a count-only label when persisted is null and no notice text exists anywhere", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        mode: "live",
        reports: [{ claims: [{}], notice: null, degraded: false }],
        drops: 0,
        persisted: null,
      }),
    );

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("partial");
    expect(last?.partialNote).toBeNull();
    expect(last?.statusLabel).toBe(STAGE_LABELS.partialCountOnly(1));
  });

  it("ends failed with the reused label and the server's error string in partialNote on a 413", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(413, { error: "discharge.pdf is over the 4MB upload limit." }),
    );

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("failed");
    expect(last?.statusLabel).toBe(STAGE_LABELS.failed);
    expect(last?.partialNote).toBe("discharge.pdf is over the 4MB upload limit.");
  });

  it("ends failed with the reused label on a network throw", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("failed");
    expect(last?.statusLabel).toBe(STAGE_LABELS.failed);
  });

  it("keeps per-file state isolated when one driver instance runs two files concurrently", async () => {
    // Each file gets its own claim count from the API; if the driver hoisted
    // formData/response/parsed to a shared scope, the two in-flight uploads
    // would clobber each other. Reusing a single driver instance for both
    // proves each invocation's state lives in its own closure.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "live",
          reports: [{ claims: [{}, {}, {}, {}, {}], notice: null, degraded: false }],
          drops: 0,
          persisted: { source_id: "src-a", claims: 5, facts: 1 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mode: "live",
          reports: [{ claims: [{}, {}], notice: null, degraded: false }],
          drops: 0,
          persisted: { source_id: "src-b", claims: 2, facts: 1 },
        }),
      );

    const driver = createLiveDriver(PERSON_ID);
    const patchesA: ReportPatch[] = [];
    const patchesB: ReportPatch[] = [];

    await Promise.all([
      driver(new File(["a"], "a.pdf", { type: "application/pdf" }), (p) => patchesA.push(p)),
      driver(new File(["b"], "b.pdf", { type: "application/pdf" }), (p) => patchesB.push(p)),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const lastA = patchesA[patchesA.length - 1];
    const lastB = patchesB[patchesB.length - 1];
    expect(lastA?.stage).toBe("done");
    expect(lastA?.claimCount).toBe(5);
    expect(lastA?.statusLabel).toBe(STAGE_LABELS.done(5));
    expect(lastB?.stage).toBe("done");
    expect(lastB?.claimCount).toBe(2);
    expect(lastB?.statusLabel).toBe(STAGE_LABELS.done(2));
  });

  it("awaits ensureDemoAccess() before the fetch on the happy path", async () => {
    const order: string[] = [];
    ensureDemoAccess.mockImplementation(async () => {
      order.push("ensureDemoAccess");
      return true;
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return jsonResponse(200, {
        mode: "live",
        reports: [{ claims: [{}], notice: null, degraded: false }],
        drops: 0,
        persisted: { source_id: "src-1", claims: 1, facts: 1 },
      });
    });

    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), () => {});

    expect(order).toEqual(["ensureDemoAccess", "fetch"]);
  });

  it("fails the item with a fixed note and never calls fetch when no session can be established", async () => {
    ensureDemoAccess.mockResolvedValue(false);

    const patches: ReportPatch[] = [];
    const driver = createLiveDriver(PERSON_ID);
    await driver(file(), (patch) => patches.push(patch));

    expect(fetchMock).not.toHaveBeenCalled();
    const last = patches[patches.length - 1];
    expect(last?.stage).toBe("failed");
    expect(last?.statusLabel).toBe(STAGE_LABELS.failed);
    expect(last?.partialNote).toBe("Could not sign in. Nothing was saved.");
  });
});
