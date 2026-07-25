/**
 * The case-selection cookie name, shared between the server-only reader
 * (`activeCase.ts`, which imports `next/headers`) and the client-side
 * account switcher (`components/dashboard/CaseSwitcher.tsx`, a "use client"
 * component that must never import `next/headers`). Splitting the constant
 * out into this next/headers-free module is what makes that safe — both
 * sides import the name from here so it can never drift between them.
 */
export const CASE_COOKIE_NAME = "verity_case";
