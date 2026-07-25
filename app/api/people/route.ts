/**
 * POST /api/people — create a care record the calling browser owns.
 *
 * This is Journey 0 for a real visitor: someone who has never been seeded,
 * holding nothing but an anonymous session, answers "who are you caring
 * for?" and gets an empty, writable record of their own. Three rows in one
 * pass, in dependency order:
 *
 *   people              the subject (created_by = the caller's uid)
 *   care_relationships  the caller's carer grant, active from now
 *   consent_records     the declared basis and the name that signed it
 *
 * The grant is what every later write checks: `checkCareAccess` looks for
 * exactly this row, so an upload to this person from this browser passes
 * the #25 IDOR guard legitimately rather than by any demo-surface
 * shortcut. Nothing here touches /demo/** and nothing here seeds fixtures.
 *
 * Session is required and checked first — before the body is even read.
 * Without a session there is no `member_id` to grant anything to, and
 * writing a `people` row nobody can reach would be worse than refusing.
 *
 * Error bodies carry copy and nothing else. A created id is never echoed
 * into a failure response: the only place a caller learns an id is a 201
 * they are authorised to receive.
 */

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSessionUserId } from '@/components/data/careAccess';
import {
  PERSON_COOKIE_MAX_AGE_SECONDS,
  PERSON_COOKIE_NAME,
} from '@/components/data/personCookie';
import { validateNewRecord } from './_lib/newRecord';

export const dynamic = 'force-dynamic';

/**
 * Wire shape only. Every field is accepted as `unknown`-tolerant text and
 * handed to the pure validator — this parse decides whether the request is
 * JSON of the right shape, never whether the record is acceptable.
 */
const RequestBody = z.object({
  display_name: z.string(),
  dob: z.string().nullish(),
  basis: z.string(),
  declared_name: z.string(),
});

/** The columns of `people` this route returns. Not a contract change:
 *  `lib/contracts.ts` has no Person schema, and the table shape comes from
 *  migration 0001 unmodified. */
const PersonRow = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  dob: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
});

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Best-effort unwind after a later insert fails, so a half-made record does
 * not linger. `people` cascades to both child tables on delete (migration
 * 0001), so removing the person is sufficient and is the only statement
 * needed — same orphan-cleanup discipline as the voice route's blob remove,
 * including that a failed cleanup is logged and never masks the original
 * failure the caller is told about.
 */
async function cleanUpPartialRecord(
  client: SupabaseClient,
  personId: string,
): Promise<void> {
  try {
    const { error } = await client.from('people').delete().eq('id', personId);
    if (error) {
      console.error('POST /api/people: partial-record cleanup failed', error);
    }
  } catch (err) {
    console.error('POST /api/people: partial-record cleanup threw', err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth first. `getSessionUserId` reads the request cookie jar and can
  // throw outside a request scope; a throw is indistinguishable from "no
  // session" here and must deny, never proceed.
  let memberId: string | null = null;
  try {
    memberId = await getSessionUserId();
  } catch {
    memberId = null;
  }
  if (memberId === null) {
    return errorResponse(401, 'Sign-in required. Nothing was saved.');
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, 'Request body could not be read as JSON.');
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      400,
      'Request body needs a name, a basis and the name of the person declaring it.',
    );
  }

  // The server re-runs the same validator the form ran. The client's copy is
  // a courtesy to the person typing; this one is the authority.
  const validated = validateNewRecord(
    {
      displayName: parsed.data.display_name,
      dob: parsed.data.dob ?? null,
      basis: parsed.data.basis,
      declaredName: parsed.data.declared_name,
    },
    { today: new Date().toISOString().slice(0, 10) },
  );
  if (!validated.ok) {
    return errorResponse(400, validated.error);
  }
  const record = validated.record;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      'POST /api/people: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    return errorResponse(500, 'Records are not configured. Nothing was saved.');
  }

  // Service-role client, same pattern as the voice route and
  // app/demo/_lib/dal.ts: RLS on `people` keys off an existing
  // care_relationships row, which by definition does not exist until the
  // second insert below. The authorisation decision is the session check
  // above, made in this route, not delegated to a policy that cannot see a
  // row it is about to create.
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const personId = randomUUID();
  const grantedAt = new Date().toISOString();

  try {
    const { data: personData, error: personError } = await client
      .from('people')
      .insert({
        id: personId,
        display_name: record.displayName,
        dob: record.dob,
        created_by: memberId,
      })
      .select()
      .single();

    if (personError || personData === null || personData === undefined) {
      console.error('POST /api/people: insert into people failed', personError);
      return errorResponse(500, 'The record could not be created. Nothing was saved.');
    }

    const { error: relationshipError } = await client.from('care_relationships').insert({
      person_id: personId,
      member_id: memberId,
      role: 'carer',
      access_basis: record.basis,
      declared_name: record.declaredName,
      granted_at: grantedAt,
      revoked_at: null,
    });

    if (relationshipError) {
      console.error(
        'POST /api/people: insert into care_relationships failed',
        relationshipError,
      );
      // A person with no grant is a record its own creator cannot read or
      // write. Unwind rather than leave it.
      await cleanUpPartialRecord(client, personId);
      return errorResponse(500, 'The record could not be created. Nothing was saved.');
    }

    const { error: consentError } = await client.from('consent_records').insert({
      person_id: personId,
      member_id: memberId,
      basis: record.basis,
      declared_name: record.declaredName,
    });

    if (consentError) {
      console.error('POST /api/people: insert into consent_records failed', consentError);
      // The declaration is the point of the screen, not a side effect. A
      // record whose consent row is missing is not a record we keep.
      await cleanUpPartialRecord(client, personId);
      return errorResponse(500, 'The record could not be created. Nothing was saved.');
    }

    let person: z.infer<typeof PersonRow>;
    try {
      person = PersonRow.parse(personData);
    } catch (err) {
      console.error('POST /api/people: created row failed validation', err);
      await cleanUpPartialRecord(client, personId);
      return errorResponse(500, 'The record was created but could not be read back.');
    }

    const response = NextResponse.json({ person }, { status: 201 });
    // Set here rather than client-side so the cookie and the rows land in the
    // same round trip: a browser can never end up pointed at a record the
    // request failed to create.
    response.cookies.set(PERSON_COOKIE_NAME, person.id, {
      path: '/',
      maxAge: PERSON_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      // Server-only: every reader (`getLivePersonId`) runs on the server, so
      // there is no reason to expose it to document.cookie.
      httpOnly: true,
    });
    return response;
  } catch (err) {
    console.error('POST /api/people failed', err);
    await cleanUpPartialRecord(client, personId);
    return errorResponse(500, 'The record could not be created. Nothing was saved.');
  }
}
