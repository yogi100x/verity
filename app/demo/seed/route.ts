/**
 * /demo/seed — full seeded state: person, sources, claims, facts,
 * conflicts, gaps, artifacts + assertions from fixtures/margaret.json, and
 * artifact_templates copied field-for-field from fixtures/templates.json
 * (never hand-written SQL — the JSON is the source of truth).
 *
 * Idempotent: every row upserts on its primary key, so seeding twice
 * converges to the same end state rather than duplicating rows.
 */

import type { NextResponse } from 'next/server';
import { seedPlan } from '../_lib/dal';
import { runDemoAction } from '../_lib/handler';

// Next.js requires segment config to be a literal in the route file itself —
// a re-export is not statically analysable and fails the build.
export const dynamic = 'force-dynamic';

async function handle(): Promise<NextResponse> {
  return runDemoAction('seed', (snapshot, templates, carer) =>
    seedPlan(snapshot, templates, carer),
  );
}

export const GET = handle;
export const POST = handle;
