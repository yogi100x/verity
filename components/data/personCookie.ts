/**
 * The live-record cookie: the uuid of a `people` row this browser created
 * through /welcome (POST /api/people sets it on the creation response).
 *
 * Deliberately NOT the existing `verity_case` cookie. That one selects
 * between the two seeded fixture accounts and its value is a `CaseId` union
 * member declared in `components/data/dal.ts` — a uuid is not one, and
 * widening that union is Lane B's file to change, not this one's. Two
 * cookies, two questions: `verity_case` asks which seeded demo account is
 * on screen, `verity_person` asks whether this browser owns a real record.
 *
 * Split into its own next/headers-free module for the same reason
 * `caseCookie.ts` is: the server reader (`livePerson.ts`) and any client
 * caller must share one constant that can never drift.
 */
export const PERSON_COOKIE_NAME = "verity_person";

/** One year, root path — same lifetime as the case cookie. */
export const PERSON_COOKIE_MAX_AGE_SECONDS = 31536000;
