/**
 * The one place a Supabase Storage signed URL is minted.
 *
 * Isolated from the route on purpose. `docs/stack-freeze.md` fixes one client
 * pattern per role; this is the *admin* role (service key, no cookies, no
 * session), which must never be the `@supabase/ssr` request-scoped client and
 * must never be constructed inline in a handler where a later edit could
 * quietly widen what it is used for. Everything Supabase-shaped in the
 * citation seam lives here.
 *
 * Two hard properties:
 *
 *  - **Never throws.** A missing env var, a wrong bucket, a network failure, a
 *    thrown SDK error — all return `null`, and the caller degrades to the
 *    local asset. This mirrors `lib/modes/call-model.ts`, where a live failure
 *    is indistinguishable from a fixtures run to the caller.
 *  - **Never surfaces a credential or a Supabase error string.** Errors are
 *    swallowed, not returned, wrapped, or re-thrown. The only value that ever
 *    escapes is a signed URL the caller is about to redirect the browser to.
 */

import { DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from './storage';

/**
 * Read the admin credentials.
 *
 * The service-role key is read from `SUPABASE_SERVICE_ROLE_KEY` — a
 * server-only name. It must never be read from a `NEXT_PUBLIC_`-prefixed var:
 * Next.js inlines those into the client bundle, which would publish the key to
 * every visitor. Static property access, not dynamic indexing, so the Next
 * compiler can see what is being read.
 */
function readCredentials(): { readonly url: string; readonly serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || url.length === 0) return null;
  if (serviceKey === undefined || serviceKey.length === 0) return null;
  return { url, serviceKey };
}

/**
 * Mint a signed URL valid for exactly `SIGNED_URL_TTL_SECONDS`, or null on any
 * failure whatsoever. The import is dynamic so that a route in fixtures or
 * replay mode never even loads the Supabase SDK.
 */
export async function mintSignedUrl(storagePath: string): Promise<string | null> {
  const credentials = readCredentials();
  if (credentials === null) return null;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(credentials.url, credentials.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    // `error` carries a Supabase message; it is read for control flow only and
    // deliberately never returned to the caller or logged.
    if (error !== null || data === null) return null;
    const signedUrl: unknown = data.signedUrl;
    if (typeof signedUrl !== 'string' || signedUrl.length === 0) return null;
    return signedUrl;
  } catch {
    return null;
  }
}
