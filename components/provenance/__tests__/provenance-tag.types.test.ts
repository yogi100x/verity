/**
 * Type-level test for the ProvenanceTag invariant: a sourceless fact must be
 * unrepresentable. No JSX here on purpose — this file only exercises the
 * exported prop type, so it stays a .ts file and the @ts-expect-error
 * comments are checked by `tsc --noEmit` (the file is covered by
 * tsconfig.json's `**\/*.ts` include).
 */

import { describe, expect, it } from "vitest";
import type { ProvenanceCitation, ProvenanceTagProps } from "../ProvenanceTag";
import type { Locator } from "@/lib/contracts";

const locator: Locator = {
  page: 2,
  char_start: null,
  char_end: null,
  ms_start: null,
  ms_end: null,
};

const citation: ProvenanceCitation = {
  sourceTitle: "Discharge summary",
  locator,
  quote: "Furosemide 40mg — STOPPED prior to discharge",
  sourceId: "50000000-0000-4000-8000-000000000001",
};

describe("ProvenanceTagProps", () => {
  it("accepts a citation-only prop set", () => {
    const props: ProvenanceTagProps = { citation };
    expect(props.citation).toBe(citation);
  });

  it("accepts a userStated-only prop set", () => {
    const props: ProvenanceTagProps = { userStated: true };
    expect(props.userStated).toBe(true);
  });

  it("rejects neither prop and rejects both props at compile time", () => {
    // @ts-expect-error — a sourceless fact must be unrepresentable: neither
    // `citation` nor `userStated` is supplied.
    const neither: ProvenanceTagProps = {};

    // @ts-expect-error — `citation` and `userStated` are mutually exclusive;
    // supplying both must not type-check.
    const both: ProvenanceTagProps = { citation, userStated: true };

    // Runtime assertions exist only so this file has something to execute;
    // the load-bearing check is the two @ts-expect-error comments above,
    // enforced by `pnpm typecheck`.
    expect(neither).toEqual({});
    expect(both.userStated).toBe(true);
  });
});
