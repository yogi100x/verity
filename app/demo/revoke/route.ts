/**
 * /demo/revoke — consent revocation for Journey 4.
 *
 * Flips ONLY the carer's care-relationship access state
 * (care_relationships.revoked_at), which is what empties the carer's view
 * through RLS (prd §8.4) — nothing else in the record changes, nothing is
 * deleted. /demo/reset undoes it.
 */

import type { NextResponse } from 'next/server';
import { revokePlan } from '../_lib/dal';
import { runDemoAction } from '../_lib/handler';

// Next.js requires segment config to be a literal in the route file itself —
// a re-export is not statically analysable and fails the build.
export const dynamic = 'force-dynamic';

async function handle(): Promise<NextResponse> {
  return runDemoAction('revoke', (snapshot) => revokePlan(snapshot, new Date().toISOString()));
}

export const GET = handle;
export const POST = handle;
