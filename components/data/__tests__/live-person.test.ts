import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSON_COOKIE_NAME } from "@/components/data/personCookie";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

import { getLivePersonId } from "@/components/data/livePerson";

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

function jarHolding(value: string | undefined) {
  return {
    get: (name: string) =>
      name === PERSON_COOKIE_NAME && value !== undefined ? { name, value } : undefined,
  };
}

describe("getLivePersonId", () => {
  beforeEach(() => {
    cookies.mockReset();
  });

  it("returns the id when the cookie holds a uuid", async () => {
    cookies.mockResolvedValue(jarHolding(PERSON_ID));
    await expect(getLivePersonId()).resolves.toBe(PERSON_ID);
  });

  it("returns null when no record has been created", async () => {
    cookies.mockResolvedValue(jarHolding(undefined));
    await expect(getLivePersonId()).resolves.toBeNull();
  });

  it("rejects a cookie value that is not a uuid rather than passing it to a query", async () => {
    for (const value of ["margaret", "", "1; drop table people", `${PERSON_ID}x`]) {
      cookies.mockResolvedValue(jarHolding(value));
      await expect(getLivePersonId()).resolves.toBeNull();
    }
  });
});
