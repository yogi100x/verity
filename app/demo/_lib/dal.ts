/**
 * Demo control surface — data access layer.
 *
 * Route handlers under app/demo/** contain zero query code. Everything that
 * touches the database (or decides what *would* touch the database) lives
 * here, split along one seam:
 *
 *   - PLANNING (pure, no I/O): seedPlan / deletePlan / resetPlan / revokePlan
 *     turn a CaseSnapshot + templates into an ordered list of table
 *     operations. Same input -> identical plan, always. Fully testable
 *     without a database or network.
 *
 *   - EXECUTION (I/O): getServiceClient / executePlan run a Plan against
 *     Supabase using @supabase/supabase-js operations only — no raw SQL
 *     strings anywhere in this file.
 *
 * Idempotence rests on the planning half: every upsert targets a stable
 * primary key (fixture ids, or a deterministic id derived from the person
 * id for rows the fixture doesn't name), so running the same plan twice
 * converges rather than duplicating.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type {
  AccessBasis,
  ArtifactTemplate,
  Artifact,
  Assertion,
  CaseSnapshot,
  Claim,
  Conflict,
  Fact,
  Gap,
  Source,
} from '@/lib/contracts';

/* ========================= table row shapes ========================= */
/* Mirrors supabase/migrations/0001_init.sql — one row shape per table
 * this DAL writes to. Reusing the contract types directly (rather than a
 * generic Json bag) keeps every plan fully typed end to end. */

export type ArtifactTemplateRow = Pick<
  ArtifactTemplate,
  'key' | 'title' | 'audience' | 'sections'
>;

export type PersonRow = {
  readonly id: string;
  readonly display_name: string;
  readonly dob: string | null;
  readonly created_by: string;
  readonly created_at: string;
};

export type CareRelationshipRow = {
  readonly id: string;
  readonly person_id: string;
  readonly member_id: string;
  readonly role: string;
  readonly access_basis: AccessBasis;
  readonly declared_name: string | null;
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
};

export type SourceRow = Source;
export type ClaimRow = Claim & { readonly person_id: string };
export type FactRow = Fact;
export type ConflictRow = Conflict;
export type GapRow = Gap;
export type ArtifactRow = Omit<Artifact, 'assertions'>;
export type AssertionRow = Assertion;

export type ConsentRecordRow = {
  readonly id: string;
  readonly person_id: string;
  readonly member_id: string;
  readonly basis: AccessBasis;
  readonly declared_name: string;
  readonly accepted_at: string;
};

export interface TableRowMap {
  artifact_templates: ArtifactTemplateRow;
  people: PersonRow;
  care_relationships: CareRelationshipRow;
  consent_records: ConsentRecordRow;
  sources: SourceRow;
  claims: ClaimRow;
  facts: FactRow;
  claim_conflicts: ConflictRow;
  gaps: GapRow;
  artifacts: ArtifactRow;
  assertions: AssertionRow;
}

export type TableName = keyof TableRowMap;

const TABLE_PRIMARY_KEY: { readonly [K in TableName]: string } = {
  artifact_templates: 'key',
  people: 'id',
  care_relationships: 'id',
  consent_records: 'id',
  sources: 'id',
  claims: 'id',
  facts: 'id',
  claim_conflicts: 'id',
  gaps: 'id',
  artifacts: 'id',
  assertions: 'id',
};

/** Parents before children, exactly as the FK declarations in
 *  supabase/migrations/0001_init.sql require. Seed plans walk this order;
 *  delete plans walk it backwards. */
export const TABLE_INSERT_ORDER = [
  'artifact_templates',
  'people',
  'care_relationships',
  'consent_records',
  'sources',
  'claims',
  'claim_conflicts',
  'facts',
  'gaps',
  'artifacts',
  'assertions',
] as const satisfies readonly TableName[];

/* ============================ plan shape ============================ */

export type PlainValue = string | number | boolean | null;

export type Match<T> = {
  readonly [K in keyof T]?: PlainValue | readonly PlainValue[];
};

export type UpsertOp<T extends TableName = TableName> = {
  readonly kind: 'upsert';
  readonly table: T;
  readonly onConflict: string;
  readonly rows: readonly TableRowMap[T][];
};

export type UpdateOp<T extends TableName = TableName> = {
  readonly kind: 'update';
  readonly table: T;
  readonly match: Match<TableRowMap[T]>;
  readonly patch: Partial<TableRowMap[T]>;
};

export type DeleteOp<T extends TableName = TableName> = {
  readonly kind: 'delete';
  readonly table: T;
  readonly match: Match<TableRowMap[T]>;
};

type AnyUpsertOp = { [K in TableName]: UpsertOp<K> }[TableName];
type AnyUpdateOp = { [K in TableName]: UpdateOp<K> }[TableName];
type AnyDeleteOp = { [K in TableName]: DeleteOp<K> }[TableName];

export type PlanOp = AnyUpsertOp | AnyUpdateOp | AnyDeleteOp;
export type Plan = readonly PlanOp[];

function upsert<T extends TableName>(
  table: T,
  rows: readonly TableRowMap[T][],
): UpsertOp<T> {
  return { kind: 'upsert', table, onConflict: TABLE_PRIMARY_KEY[table], rows };
}

function update<T extends TableName>(
  table: T,
  match: Match<TableRowMap[T]>,
  patch: Partial<TableRowMap[T]>,
): UpdateOp<T> {
  return { kind: 'update', table, match, patch };
}

function del<T extends TableName>(
  table: T,
  match: Match<TableRowMap[T]>,
): DeleteOp<T> {
  return { kind: 'delete', table, match };
}

/* ===================== deterministic id derivation ==================== */

/** Stable uuid-v4-shaped id from a namespace plus a key. Pure: same input
 *  -> same id, always, no I/O. Used for the rows the fixture does not name
 *  (the care relationship, the carer's member id, the consent record) so
 *  every run upserts onto the same row instead of accumulating duplicates. */
function deriveDemoUuid(namespace: string, key: string): string {
  const hex = createHash('sha256')
    .update(namespace + ':' + key)
    .digest('hex');
  const variantNibble = ((parseInt(hex[16] ?? '8', 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    variantNibble + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** care_relationships has no id in the fixture — the person only carries an
 *  access_basis, not a relationship row. */
export function deriveCareRelationshipId(personId: string): string {
  return deriveDemoUuid('care_relationship', personId);
}

/** consent_records likewise: the declaration is implied by the fixture's
 *  access_basis, never spelled out as a row. */
export function deriveConsentRecordId(personId: string): string {
  return deriveDemoUuid('consent_record', personId);
}

/* ========================= the demo carer ========================= */

/**
 * WHO HOLDS ACCESS. Margaret never uses an interface (prd §4a) and has no
 * account; her daughter Sarah operates the app under a declared legal
 * basis. The fixture's `access_basis: 'person_consent'` is therefore *the
 * carer's* basis, not Margaret's own — 'self' is explicitly excluded from
 * the carer bases (lib/safety/consent.ts CARER_ACCESS_BASES).
 *
 * So the seeded care_relationships row is the CARER's: role 'carer',
 * member_id = Sarah's member id, and it is that row whose `revoked_at`
 * Journey 4.4 flips to empty the carer's view through RLS (prd §8.4).
 * A row with role 'self' would be the degenerate self-serve case
 * (member_id = person_id, basis 'self', prd §11 phase 3) and revoking it
 * would empty nobody's view.
 */
export const DEMO_CARER_DECLARED_NAME = 'Sarah Ellis';

export type CarerIdentity = {
  /** Must equal the viewer's `auth.uid()` for RLS to admit them — the app
   *  signs in anonymously, so the real uid is only knowable at demo time
   *  and is supplied via DEMO_CARER_MEMBER_ID. The derived default keeps
   *  planning pure and the seed self-consistent when it is unset. */
  readonly memberId: string;
  readonly declaredName: string;
};

export function demoCarer(personId: string, memberIdOverride?: string): CarerIdentity {
  return {
    memberId: memberIdOverride ?? deriveDemoUuid('carer_member', personId),
    declaredName: DEMO_CARER_DECLARED_NAME,
  };
}

/** 'self' is the degenerate carer case (schema comment, prd §11): the
 *  person is their own member. Any other basis is a carer relationship. */
function relationshipRole(snapshot: CaseSnapshot): 'self' | 'carer' {
  return snapshot.person.access_basis === 'self' ? 'self' : 'carer';
}

/* ============================ pure planning ============================ */

/** Fixed, not `new Date()` — planning must be deterministic: identical
 *  input produces an identical plan, every time it's called. */
const SEED_TIMESTAMP = '2026-07-20T09:00:00.000Z' as const;

/**
 * BASELINE — Margaret's starting state: who she is, who may see her record,
 * and the reference templates. No sources, no claims, nothing derived.
 *
 * This is what `/demo/reset` restores (docs/user-journey.md step 0.4: "Return
 * to dashboard shows zero sources"), and what `/demo/seed` builds the full
 * seeded state on top of. Reset that re-seeded every document would make
 * `/demo/seed` — "full seeded state including Juno history", the one thing
 * lane-d-integrator.md §5 says distinguishes it — indistinguishable from it,
 * and would leave Journey 1.1 with three documents already uploaded.
 *
 * Ordered parents-before-children per the FK declarations: people <- (
 * care_relationships, consent_records ). Templates first because
 * artifacts.template_key references artifact_templates(key).
 */
export function baselinePlan(
  snapshot: CaseSnapshot,
  templates: readonly ArtifactTemplate[],
  carer: CarerIdentity,
): Plan {
  const personId = snapshot.person.id;
  const role = relationshipRole(snapshot);
  const isSelf = role === 'self';
  const memberId = isSelf ? personId : carer.memberId;
  const declaredName = isSelf ? snapshot.person.display_name : carer.declaredName;

  const ops: PlanOp[] = [
    upsert(
      'artifact_templates',
      templates.map((t) => ({
        key: t.key,
        title: t.title,
        audience: t.audience,
        sections: t.sections,
      })),
    ),
    upsert('people', [
      {
        id: personId,
        display_name: snapshot.person.display_name,
        dob: null,
        // Sarah created the record; Margaret has no account of her own.
        created_by: memberId,
        created_at: SEED_TIMESTAMP,
      },
    ]),
    upsert('care_relationships', [
      {
        id: deriveCareRelationshipId(personId),
        person_id: personId,
        member_id: memberId,
        role,
        access_basis: snapshot.person.access_basis,
        declared_name: declaredName,
        granted_at: SEED_TIMESTAMP,
        // Always null: re-running the baseline is what undoes a revoke.
        revoked_at: null,
      },
    ]),
  ];

  // A self-serve account declares nothing — there is no carer to record.
  if (!isSelf) {
    ops.push(
      upsert('consent_records', [
        {
          id: deriveConsentRecordId(personId),
          person_id: personId,
          member_id: memberId,
          basis: snapshot.person.access_basis,
          declared_name: declaredName,
          accepted_at: SEED_TIMESTAMP,
        },
      ]),
    );
  }

  return ops;
}

/** Full seed: the baseline plus every derived row in the snapshot — sources,
 *  claims, conflicts, facts, gaps, artifacts + assertions. The template rows
 *  are copied field-for-field from `templates` — never hand-written — so
 *  `fixtures/templates.json` stays the single source of truth for
 *  `artifact_templates`.
 *
 *  Order follows the FKs: sources <- claims; artifacts <- assertions.
 *  claim_conflicts precedes facts because facts.conflict_id points at a
 *  conflict (no FK declared, but the direction is facts -> conflicts, so a
 *  later `references` addition would not reorder this plan). */
export function seedPlan(
  snapshot: CaseSnapshot,
  templates: readonly ArtifactTemplate[],
  carer: CarerIdentity = demoCarer(snapshot.person.id),
): Plan {
  const personId = snapshot.person.id;

  return [
    ...baselinePlan(snapshot, templates, carer),
    upsert('sources', snapshot.sources),
    upsert(
      'claims',
      snapshot.claims.map((c) => ({ ...c, person_id: personId })),
    ),
    upsert('claim_conflicts', snapshot.conflicts),
    upsert('facts', snapshot.facts),
    upsert('gaps', snapshot.gaps),
    upsert(
      'artifacts',
      snapshot.artifacts.map(({ assertions: _assertions, ...rest }) => rest),
    ),
    upsert(
      'assertions',
      snapshot.artifacts.flatMap((a) => a.assertions),
    ),
  ];
}

/** Margaret's DERIVED rows only — sources, claims, facts, conflicts, gaps,
 *  artifacts and their assertions, in reverse FK order (children first).
 *  Identity (people) and consent (care_relationships, consent_records) are
 *  not deleted here: the baseline re-upserts them, which also undoes any
 *  revoke by resetting revoked_at to null. */
export function deletePlan(snapshot: CaseSnapshot): Plan {
  const personId = snapshot.person.id;
  const artifactIds = snapshot.artifacts.map((a) => a.id);

  const ops: PlanOp[] = [];
  if (artifactIds.length > 0) {
    ops.push(del('assertions', { artifact_id: artifactIds }));
  }
  ops.push(
    del('artifacts', { person_id: personId }),
    del('gaps', { person_id: personId }),
    del('facts', { person_id: personId }),
    del('claim_conflicts', { person_id: personId }),
    del('claims', { person_id: personId }),
    del('sources', { person_id: personId }),
  );
  return ops;
}

/** Reset = wipe every derived row, then restore the baseline. Margaret ends
 *  up as she starts the demo: identity and consent intact, zero sources
 *  (step 0.4), and any prior revoke undone (the baseline always writes
 *  revoked_at: null). */
export function resetPlan(
  snapshot: CaseSnapshot,
  templates: readonly ArtifactTemplate[],
  carer: CarerIdentity = demoCarer(snapshot.person.id),
): Plan {
  return [...deletePlan(snapshot), ...baselinePlan(snapshot, templates, carer)];
}

/** Journey 4.4: consent revocation. Flips ONLY `revoked_at` on the CARER's
 *  care-relationship row, which is what empties the carer's view through
 *  has_care_access() — nothing is touched, deleted, or regenerated. Matches
 *  on role rather than on the derived id so a relationship the app itself
 *  created (Journey 4.1) is revoked too. `revokedAt` is passed in rather
 *  than read from the clock so the function stays pure and testable. */
export function revokePlan(snapshot: CaseSnapshot, revokedAt: string): Plan {
  return [
    update(
      'care_relationships',
      { person_id: snapshot.person.id, role: relationshipRole(snapshot) },
      { revoked_at: revokedAt },
    ),
  ];
}

/* ===================== pure plan simulation (tests) ===================== */

export type EndState = {
  readonly [table: string]: { readonly [id: string]: Record<string, unknown> };
};

function matchesRow(
  row: Record<string, unknown>,
  match: Record<string, PlainValue | readonly PlainValue[]>,
): boolean {
  return Object.entries(match).every(([key, value]) => {
    const actual = row[key];
    if (Array.isArray(value)) return value.some((v) => v === actual);
    return actual === value;
  });
}

/** Simulates applying a Plan in order and returns the resulting per-table,
 *  per-row state — entirely in memory, no database. This is what makes
 *  idempotence and the reset/seed merge provable without I/O: run a plan
 *  (or a concatenation of plans) twice and compare the two end states. */
export function describeEndState(plan: Plan): EndState {
  const state: { [table: string]: { [id: string]: Record<string, unknown> } } = {};

  for (const op of plan) {
    const bucket = state[op.table] ?? (state[op.table] = {});

    if (op.kind === 'upsert') {
      const pk = TABLE_PRIMARY_KEY[op.table];
      for (const row of op.rows) {
        const record: Record<string, unknown> = { ...row };
        bucket[String(record[pk])] = record;
      }
    } else if (op.kind === 'update') {
      const match: Record<string, PlainValue | readonly PlainValue[]> = {
        ...op.match,
      };
      const patch: Record<string, unknown> = { ...op.patch };
      for (const id of Object.keys(bucket)) {
        const row = bucket[id];
        if (row !== undefined && matchesRow(row, match)) {
          bucket[id] = { ...row, ...patch };
        }
      }
    } else {
      const match: Record<string, PlainValue | readonly PlainValue[]> = {
        ...op.match,
      };
      for (const id of Object.keys(bucket)) {
        const row = bucket[id];
        if (row !== undefined && matchesRow(row, match)) {
          delete bucket[id];
        }
      }
    }
  }

  return state;
}

/* ============================ env + guard ============================ */

export type EnvCheck =
  | {
      readonly ok: true;
      readonly url: string;
      /** Server-only. Deliberately NOT a NEXT_PUBLIC_ var — a service role
       *  key in the client bundle is a full RLS bypass shipped to every
       *  visitor. Only the URL is public. */
      readonly serviceRoleKey: string;
      /** Optional override for the carer's member id (see CarerIdentity). */
      readonly carerMemberId?: string;
    }
  | {
      readonly ok: false;
      readonly missing: readonly string[];
      /** Vars that are set but unusable. Names only — never the value. */
      readonly invalid: readonly string[];
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never throws, and never puts an env VALUE in its result: callers get back
 *  the names that are missing or unusable, not a stack trace and not a
 *  secret. */
export function checkEnv(env: Partial<NodeJS.ProcessEnv> = process.env): EnvCheck {
  const missing: string[] = [];
  const invalid: string[] = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const carerMemberId = env.DEMO_CARER_MEMBER_ID;

  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  // Absent is fine (a derived default is used); present-but-not-a-uuid is
  // not — it would make every seeded row invisible under RLS.
  if (carerMemberId !== undefined && !UUID_RE.test(carerMemberId)) {
    invalid.push('DEMO_CARER_MEMBER_ID');
  }

  if (missing.length > 0 || invalid.length > 0 || !url || !serviceRoleKey) {
    return { ok: false, missing, invalid };
  }
  return carerMemberId === undefined
    ? { ok: true, url, serviceRoleKey }
    : { ok: true, url, serviceRoleKey, carerMemberId };
}

/** These are demo tooling, not product. Refuse in production unless
 *  explicitly turned on. */
export function isDemoRoutesAllowed(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return env.DEMO_ROUTES_ENABLED === '1';
}

/* ============================ execution (I/O) ============================ */

export function getServiceClient(env: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ExecResult =
  | { readonly ok: true; readonly operations: number }
  | { readonly ok: false; readonly error: string };

/** Postgres's own message plus the failing operation — enough to diagnose a
 *  schema drift at 3am. Deliberately drops PostgrestError.details and .hint:
 *  a check-constraint violation puts "Failing row contains (...)" in
 *  `details`, which would echo fixture content into an HTTP response. */
function describeFailure(op: PlanOp, message: string): string {
  return `${op.kind} ${op.table} failed: ${message}`;
}

/** Strips a row down to a plain Record<string, unknown> before it reaches
 *  supabase-js. Plan rows are typed as a union across every table
 *  (ArtifactTemplateRow | PersonRow | ... ) so a single upsert/update call
 *  can't accept them generically — Object.entries/fromEntries normalises
 *  any one row to a concrete shape with no cast. */
function toPlainRow(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row));
}

/** Runs a Plan against Supabase using supabase-js client operations only —
 *  no raw SQL strings. Route handlers call this and nothing lower-level. */
export async function executePlan(
  client: SupabaseClient,
  plan: Plan,
): Promise<ExecResult> {
  let completed = 0;

  for (const op of plan) {
    if (op.kind === 'upsert') {
      if (op.rows.length === 0) {
        completed += 1;
        continue;
      }
      const plainRows = op.rows.map(toPlainRow);
      const { error } = await client
        .from(op.table)
        .upsert(plainRows, { onConflict: op.onConflict });
      if (error) return { ok: false, error: describeFailure(op, error.message) };
    } else if (op.kind === 'update') {
      let query = client.from(op.table).update(toPlainRow(op.patch));
      // (patch stays a single object; only rows needed the array form above)
      for (const [key, value] of Object.entries(op.match)) {
        if (value === undefined) continue;
        query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
      }
      const { error } = await query;
      if (error) return { ok: false, error: describeFailure(op, error.message) };
    } else {
      let query = client.from(op.table).delete();
      for (const [key, value] of Object.entries(op.match)) {
        if (value === undefined) continue;
        query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
      }
      const { error } = await query;
      if (error) return { ok: false, error: describeFailure(op, error.message) };
    }
    completed += 1;
  }

  return { ok: true, operations: completed };
}
