/**
 * Shared glue for the three demo control-surface routes. Each route file
 * supplies only the plan it wants executed; this runs the production
 * guard, the env check, and the DAL call the same way every time so the
 * three routes can't drift in how they fail.
 */

import { NextResponse } from 'next/server';
import type { CaseSnapshot, ArtifactTemplate } from '@/lib/contracts';
import {
  checkEnv,
  demoCarer,
  isDemoRoutesAllowed,
  getServiceClient,
  executePlan,
  type CarerIdentity,
  type Plan,
} from './dal';
import { loadMargaretSnapshot, loadArtifactTemplates } from './fixtures';

export const dynamic = 'force-dynamic';

type PlanBuilder = (
  snapshot: CaseSnapshot,
  templates: ArtifactTemplate[],
  carer: CarerIdentity,
) => Plan;

export async function runDemoAction(
  action: string,
  buildPlan: PlanBuilder,
): Promise<NextResponse> {
  if (!isDemoRoutesAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Demo routes are disabled in production. Set DEMO_ROUTES_ENABLED=1 to allow them.',
      },
      { status: 403 },
    );
  }

  const env = checkEnv();
  if (!env.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Environment variables missing or unusable.',
        // Names only. The values — one of which is a service role key — never
        // appear in a response body.
        missing: env.missing,
        invalid: env.invalid,
      },
      { status: 503 },
    );
  }

  const snapshot = loadMargaretSnapshot();
  const templates = loadArtifactTemplates();
  const carer = demoCarer(snapshot.person.id, env.carerMemberId);
  const plan = buildPlan(snapshot, templates, carer);

  const client = getServiceClient(env);
  const result = await executePlan(client, plan);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    action,
    person_id: snapshot.person.id,
    operations: result.operations,
  });
}
