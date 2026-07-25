/**
 * /demo/attach — grant the calling browser session access to the seeded
 * demo person, without reseeding anything.
 *
 * Fixes the seed-from-a-terminal footgun: the seed grants whichever member
 * id ran it, so a browser holding a *different* anonymous session 403s on
 * every live write. The client bootstrap (ensureDemoAccess in
 * components/data/supabaseBrowser.ts) calls this once after signing in, so
 * any browser that opens the app can write to Margaret's demo record no
 * matter who seeded. Additive and idempotent — see attachPlan.
 *
 * Requires a session: with no cookie-resolved user there is nobody to
 * attach, and silently granting the env/derived uid again would be the
 * exact footgun this route exists to remove.
 */

import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/components/data/careAccess';
import { attachPlan } from '../_lib/dal';
import { runDemoAction } from '../_lib/handler';

// Next.js requires segment config to be a literal in the route file itself —
// a re-export is not statically analysable and fails the build.
export const dynamic = 'force-dynamic';

async function handle(): Promise<NextResponse> {
  let sessionUserId: string | null = null;
  try {
    sessionUserId = await getSessionUserId();
  } catch {
    sessionUserId = null;
  }
  if (!sessionUserId) {
    return NextResponse.json(
      { ok: false, error: 'No session held. Sign in (anonymously) before attaching.' },
      { status: 401 },
    );
  }
  // runDemoAction resolves the carer identity session-first, so the plan is
  // built for the same uid we just verified exists.
  return runDemoAction('attach', (snapshot, _templates, carer) => attachPlan(snapshot, carer));
}

export const GET = handle;
export const POST = handle;
