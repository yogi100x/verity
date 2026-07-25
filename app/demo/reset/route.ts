/**
 * /demo/reset — restore Margaret to her seeded starting state.
 *
 * Idempotent: deletes her derived rows (sources, claims, facts, conflicts,
 * gaps, artifacts, assertions) then restores the baseline — identity,
 * consent and templates only. She ends with ZERO sources, per
 * docs/user-journey.md step 0.4; the full seeded state is /demo/seed.
 * Restoring the baseline also undoes any prior /demo/revoke.
 *
 * GET so the orchestrator can trigger it by visiting the URL; POST works
 * identically for programmatic callers.
 */

import type { NextResponse } from 'next/server';
import { resetPlan } from '../_lib/dal';
import { runDemoAction } from '../_lib/handler';

// Next.js requires segment config to be a literal in the route file itself —
// a re-export is not statically analysable and fails the build.
export const dynamic = 'force-dynamic';

async function handle(): Promise<NextResponse> {
  return runDemoAction('reset', (snapshot, templates, carer) =>
    resetPlan(snapshot, templates, carer),
  );
}

export const GET = handle;
export const POST = handle;
