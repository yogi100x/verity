/**
 * Shared glue for the three demo control-surface routes. Each route file
 * supplies only the plan it wants executed; this runs the production
 * guard, the env check, and the DAL call the same way every time so the
 * three routes can't drift in how they fail.
 */

import { NextResponse } from 'next/server';
import type { CaseSnapshot, ArtifactTemplate } from '@/lib/contracts';
import { getSessionUserId } from '@/components/data/careAccess';
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

/**
 * Precedence for the carer's member id: the CURRENT session's uid (the
 * anonymous session the browser holds when it calls this route) beats the
 * `DEMO_CARER_MEMBER_ID` env override, which beats the deterministic
 * default `demoCarer()` derives on its own when neither is given (see the
 * `CarerIdentity` comment in ./dal). Seeding while holding a session is the
 * sanctioned way that session's uid gets a `care_relationships` grant, so a
 * live upload from the same browser afterwards passes the 403 check in
 * components/data/careAccess.ts.
 *
 * `getSessionUserId()` reads cookies via `next/headers`, which throws when
 * called with no real Next.js request scope (e.g. this handler invoked
 * directly, outside routing — as unit tests do). That is indistinguishable
 * from "no session" for this purpose, so it is caught and treated the same
 * as a null result rather than failing the whole demo action.
 */
async function resolveCarerMemberId(
  envCarerMemberId: string | undefined,
): Promise<string | undefined> {
  try {
    const sessionMemberId = await getSessionUserId();
    if (sessionMemberId) return sessionMemberId;
  } catch {
    // No request-scoped session available — fall through to env/derived.
  }
  return envCarerMemberId;
}

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
  const carerMemberId = await resolveCarerMemberId(env.carerMemberId);
  const carer = demoCarer(snapshot.person.id, carerMemberId);
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
