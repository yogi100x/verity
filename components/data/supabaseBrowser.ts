"use client";

// Browser-side anonymous session bootstrap.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient | null {
  if (browserClient) {
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  // createBrowserClient stores the session in cookies (not localStorage) so
  // server routes can read it via components/data/careAccess.ts.
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}

// Coalesces concurrent callers onto a single in-flight sign-in. Two uploads
// firing at once (e.g. dictation + file upload) would otherwise each see "no
// session", each call signInAnonymously, and mint two anonymous users — the
// second clobbering the first's cookie, leaving an upload holding a uid whose
// care_relationships grant was seeded for the other uid (a spurious 403). We
// only ever cache the in-flight promise, never a resolved value, so once a
// session exists later invocations re-check getSession fresh.
let inFlight: Promise<boolean> | null = null;

export async function ensureAnonSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const client = getBrowserClient();
  if (!client) {
    return false;
  }

  if (inFlight) {
    return inFlight;
  }

  // Assigned synchronously (before any await) so concurrent callers observe
  // the same promise and cannot each start their own sign-in.
  inFlight = (async () => {
    try {
      const { data } = await client.auth.getSession();
      if (data.session) {
        return true;
      }

      // Supabase project has anonymous sign-ins enabled (see
      // scripts/db-push.sh), so this establishes a session without any
      // credentials from the user.
      const { error } = await client.auth.signInAnonymously();
      return !error;
    } catch {
      // A thrown getSession/sign-in error yields the same honest "failed"
      // result the callers already handle, rather than an uncaught rejection.
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
