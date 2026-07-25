// Server-side care-access check. Called from route handlers only — it reads
// the Next.js request cookie jar via `next/headers`, which is unavailable in
// the browser.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export type CareAccessResult =
  | { kind: "unconfigured" }
  | { kind: "no_session" }
  | { kind: "no_access" }
  | { kind: "granted"; memberId: string };

/**
 * Resolves the signed-in user's id from the request's Supabase auth cookies,
 * or null if unconfigured / no session. Shared by checkCareAccess below.
 */
async function resolveSessionUser(): Promise<{ id: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();
  // setAll is a deliberate no-op: this helper only reads the caller's
  // existing session for an API route response; it never refreshes tokens
  // or writes Set-Cookie headers back to the client.
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return { id: data.user.id };
  } catch {
    // A *thrown* auth error (e.g. a network failure while server-verifying
    // the JWT) is treated identically to a *returned* error: no verified
    // session, so deny. Never let a throw here become a granted session.
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const user = await resolveSessionUser();
  return user ? user.id : null;
}

export async function checkCareAccess(
  personId: string,
): Promise<CareAccessResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { kind: "unconfigured" };
  }

  const user = await resolveSessionUser();
  if (!user) {
    return { kind: "no_session" };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { kind: "unconfigured" };
  }

  // Service-role client, same pattern as app/api/voice/upload/route.ts: the
  // access check is authoritative and must bypass RLS rather than depend on
  // policies matching this exact rule.
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await serviceClient
      .from("care_relationships")
      .select("id")
      .eq("person_id", personId)
      .eq("member_id", user.id)
      .not("granted_at", "is", null)
      .is("revoked_at", null)
      .limit(1);

    if (error) {
      // A query error is not a verdict, but failing open (treating it as
      // granted) is worse than failing closed. Deny on transient DB errors.
      return { kind: "no_access" };
    }

    // `data` is `{ id: string }[] | null`; guard the null so a malformed
    // (non-error) response denies rather than throwing on `.length`.
    if (data && data.length >= 1) {
      return { kind: "granted", memberId: user.id };
    }
    return { kind: "no_access" };
  } catch {
    // A *thrown* query error (network, client construction) is not a
    // verdict either. Fail closed to no_access rather than letting the
    // route surface an opaque 500 with a potential stack leak.
    return { kind: "no_access" };
  }
}
