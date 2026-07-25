import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_RECORD_ERRORS } from '@/app/api/people/_lib/newRecord';
import { PERSON_COOKIE_NAME } from '@/components/data/personCookie';

// Hoisted for the same reason lib/voice/__tests__/route.test.ts documents:
// vi.mock factories are lifted above the static import of the route below.
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const { getSessionUserId } = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock('@/components/data/careAccess', () => ({ getSessionUserId }));

import { POST } from '@/app/api/people/route';

const MEMBER_ID = '33333333-3333-3333-3333-333333333333';
const PERSON_ID = '11111111-1111-1111-1111-111111111111';

const BODY = {
  display_name: 'Margaret Ellis',
  dob: '1944-03-02',
  basis: 'person_consent',
  declared_name: 'Sarah Ellis',
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

type TableOutcome = { data?: unknown; error: unknown };

/**
 * A Supabase result builder is thenable AND chainable — the route awaits
 * `insert(...)` directly for the two child tables and `insert(...).select()
 * .single()` for the person. This mirrors both shapes off one result so a
 * test only states the outcome it cares about.
 */
function resultBuilder(outcome: TableOutcome) {
  const settled = Promise.resolve(outcome);
  return {
    select: () => ({ single: () => Promise.resolve(outcome) }),
    then: settled.then.bind(settled),
    catch: settled.catch.bind(settled),
    finally: settled.finally.bind(settled),
  };
}

const PERSON_ROW = {
  id: PERSON_ID,
  display_name: 'Margaret Ellis',
  dob: '1944-03-02',
  created_by: MEMBER_ID,
  created_at: '2026-07-26T09:00:00.000Z',
};

/**
 * Wire `createClient` to a client whose three tables can each be made to
 * fail independently, capturing every insert payload and the delete used
 * for cleanup. Defaults are the happy path.
 */
function installClient(opts?: {
  readonly people?: TableOutcome;
  readonly relationships?: TableOutcome;
  readonly consent?: TableOutcome;
}) {
  const peopleOutcome = opts?.people ?? { data: PERSON_ROW, error: null };
  const relationshipOutcome = opts?.relationships ?? { error: null };
  const consentOutcome = opts?.consent ?? { error: null };

  const inserts: Record<string, unknown[]> = {
    people: [],
    care_relationships: [],
    consent_records: [],
  };
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deletes = vi.fn().mockReturnValue({ eq: deleteEq });

  const from = vi.fn().mockImplementation((table: string) => ({
    insert: (payload: unknown) => {
      inserts[table]?.push(payload);
      if (table === 'people') return resultBuilder(peopleOutcome);
      if (table === 'care_relationships') return resultBuilder(relationshipOutcome);
      return resultBuilder(consentOutcome);
    },
    delete: deletes,
  }));

  createClient.mockReturnValue({ from });
  return { from, inserts, deletes, deleteEq };
}

describe('POST /api/people', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    createClient.mockReset();
    getSessionUserId.mockReset();
    getSessionUserId.mockResolvedValue(MEMBER_ID);
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('session', () => {
    it('401 without a session, and nothing is written', async () => {
      getSessionUserId.mockResolvedValue(null);
      const { from } = installClient();

      const res = await POST(request(BODY));

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Sign-in required. Nothing was saved.' });
      expect(from).not.toHaveBeenCalled();
      // The auth check runs before the client is even constructed.
      expect(createClient).not.toHaveBeenCalled();
    });

    it('a thrown session lookup denies rather than proceeding', async () => {
      getSessionUserId.mockRejectedValue(new Error('no request scope'));
      installClient();

      const res = await POST(request(BODY));

      expect(res.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('401 fires before the body is validated, so an unauthenticated caller learns nothing', async () => {
      getSessionUserId.mockResolvedValue(null);
      const res = await POST(request({ ...BODY, display_name: '' }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).not.toContain(NEW_RECORD_ERRORS.displayNameEmpty);
    });
  });

  describe('creation', () => {
    it('writes people, care_relationships and consent_records in one pass', async () => {
      const { inserts } = installClient();

      const res = await POST(request(BODY));

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.person).toEqual(PERSON_ROW);

      expect(inserts.people).toEqual([
        expect.objectContaining({
          display_name: 'Margaret Ellis',
          dob: '1944-03-02',
          created_by: MEMBER_ID,
        }),
      ]);

      // The grant is what every later write checks (components/data/careAccess.ts):
      // this member, this person, active.
      expect(inserts.care_relationships).toEqual([
        expect.objectContaining({
          member_id: MEMBER_ID,
          role: 'carer',
          access_basis: 'person_consent',
          declared_name: 'Sarah Ellis',
          revoked_at: null,
        }),
      ]);
      const grant = inserts.care_relationships[0] as { granted_at: unknown; person_id: unknown };
      expect(typeof grant.granted_at).toBe('string');
      expect(grant.person_id).toBe(PERSON_ID_OF(inserts.people[0]));

      expect(inserts.consent_records).toEqual([
        expect.objectContaining({
          member_id: MEMBER_ID,
          basis: 'person_consent',
          declared_name: 'Sarah Ellis',
        }),
      ]);
    });

    it('all three rows carry the same person id', async () => {
      const { inserts } = installClient();
      await POST(request(BODY));

      const ids = [
        PERSON_ID_OF(inserts.people[0]),
        (inserts.care_relationships[0] as { person_id: string }).person_id,
        (inserts.consent_records[0] as { person_id: string }).person_id,
      ];
      expect(new Set(ids).size).toBe(1);
    });

    it('sets the record cookie to the created person', async () => {
      installClient();
      const res = await POST(request(BODY));

      expect(res.cookies.get(PERSON_COOKIE_NAME)?.value).toBe(PERSON_ID);
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${PERSON_COOKIE_NAME}=${PERSON_ID}`);
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('HttpOnly');
    });

    it('stores a blank date of birth as null rather than an empty string', async () => {
      const { inserts } = installClient();
      await POST(request({ ...BODY, dob: '' }));

      expect(inserts.people[0]).toEqual(expect.objectContaining({ dob: null }));
    });
  });

  describe('validation', () => {
    it('400 with the shared copy when the name is empty, and nothing is written', async () => {
      const { from } = installClient();

      const res = await POST(request({ ...BODY, display_name: '   ' }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: NEW_RECORD_ERRORS.displayNameEmpty });
      expect(from).not.toHaveBeenCalled();
    });

    it('400 when the basis is not one a carer may declare', async () => {
      const { from } = installClient();

      const res = await POST(request({ ...BODY, basis: 'self' }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: NEW_RECORD_ERRORS.basisNotChosen });
      expect(from).not.toHaveBeenCalled();
    });

    it('400 when the declared name is not a full name', async () => {
      const res = await POST(request({ ...BODY, declared_name: 'Sarah' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: NEW_RECORD_ERRORS.declaredNameNotFull });
    });

    it('400 on a body that is not JSON, and on JSON of the wrong shape', async () => {
      installClient();

      const notJson = await POST(request('{['));
      expect(notJson.status).toBe(400);

      const wrongShape = await POST(request({ display_name: 'Margaret Ellis' }));
      expect(wrongShape.status).toBe(400);
    });
  });

  describe('failure and cleanup', () => {
    it('500 when the person insert fails, and no child rows are attempted', async () => {
      const { inserts } = installClient({
        people: { data: null, error: { message: 'insert failed' } },
      });

      const res = await POST(request(BODY));

      expect(res.status).toBe(500);
      expect(inserts.care_relationships).toHaveLength(0);
      expect(inserts.consent_records).toHaveLength(0);
    });

    it('deletes the person when the care_relationships insert fails', async () => {
      const { deletes, deleteEq, inserts } = installClient({
        relationships: { error: { message: 'grant failed' } },
      });

      const res = await POST(request(BODY));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'The record could not be created. Nothing was saved.',
      });
      // A person with no grant is unreachable by its own creator — unwind it.
      expect(deletes).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('id', PERSON_ID_OF(inserts.people[0]));
      expect(inserts.consent_records).toHaveLength(0);
    });

    it('deletes the person when the consent_records insert fails', async () => {
      const { deletes, deleteEq, inserts } = installClient({
        consent: { error: { message: 'consent failed' } },
      });

      const res = await POST(request(BODY));

      expect(res.status).toBe(500);
      expect(deletes).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('id', PERSON_ID_OF(inserts.people[0]));
    });

    it('never echoes an id in a failure body', async () => {
      installClient({ relationships: { error: { message: 'grant failed' } } });

      const res = await POST(request(BODY));
      const text = JSON.stringify(await res.json());

      expect(text).not.toContain(PERSON_ID);
      expect(text).not.toContain(MEMBER_ID);
    });

    it('500 without constructing a client when Supabase env is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      installClient();

      const res = await POST(request(BODY));

      expect(res.status).toBe(500);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('500 when the created row does not match the people table shape', async () => {
      const { deletes } = installClient({
        people: { data: { id: 'not-a-uuid' }, error: null },
      });

      const res = await POST(request(BODY));

      expect(res.status).toBe(500);
      expect(deletes).toHaveBeenCalled();
    });
  });
});

/** The route generates the id, so tests read it off the payload it sent
 *  rather than asserting a literal it does not control. */
function PERSON_ID_OF(payload: unknown): string {
  return (payload as { id: string }).id;
}
