/**
 * Server-only reader for the live-record cookie. Server Components and
 * route handlers only — `next/headers` is unavailable in the browser, the
 * same constraint `activeCase.ts` documents.
 *
 * Returns null when the browser has never created a record, which every
 * caller treats as "fall back to the seeded fixture case" — so every screen
 * that shipped before /welcome renders exactly as it did before.
 */

import { cookies } from "next/headers";
import { PERSON_COOKIE_NAME } from "@/components/data/personCookie";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getLivePersonId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(PERSON_COOKIE_NAME)?.value;
  // Shape-checked before it reaches a query: an arbitrary cookie value is
  // attacker-controlled text, and a person id is a uuid or it is nothing.
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value;
}
