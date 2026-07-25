import { describe, expect, it } from 'vitest';
import { demoCarer, seedPlan, type Plan } from '../dal';
import { loadArtifactTemplates, loadMargaretSnapshot } from '../fixtures';

function rowsFor(plan: Plan, table: string): readonly unknown[] {
  const op = plan.find((o) => o.table === table && o.kind === 'upsert');
  if (!op || op.kind !== 'upsert') throw new Error(`no upsert op for ${table}`);
  return op.rows;
}

describe('seedPlan', () => {
  const snapshot = loadMargaretSnapshot();
  const templates = loadArtifactTemplates();

  it('derives every table row count from the fixture (no hand-typed counts)', () => {
    const plan = seedPlan(snapshot, templates);
    expect(rowsFor(plan, 'sources').length).toBe(snapshot.sources.length);
    expect(rowsFor(plan, 'claims').length).toBe(snapshot.claims.length);
    expect(rowsFor(plan, 'facts').length).toBe(snapshot.facts.length);
    expect(rowsFor(plan, 'claim_conflicts').length).toBe(snapshot.conflicts.length);
    expect(rowsFor(plan, 'gaps').length).toBe(snapshot.gaps.length);
    expect(rowsFor(plan, 'artifacts').length).toBe(snapshot.artifacts.length);
    expect(rowsFor(plan, 'assertions').length).toBe(
      snapshot.artifacts.flatMap((a) => a.assertions).length,
    );
    expect(rowsFor(plan, 'people').length).toBe(1);
    expect(rowsFor(plan, 'care_relationships').length).toBe(1);
  });

  // Deliberate drift alarm: pinned counts force a human decision on every
  // fixture change. Updated 25 Jul by the orchestrator after seeding the CHC
  // Checklist letter (source 06 + its claim + the chc.checklist_date fact).
  it('matches the real fixture as of today: 6 sources, 18 claims, 11 facts, 1 conflict, 4 gaps, 2 artifacts', () => {
    const plan = seedPlan(snapshot, templates);
    expect(rowsFor(plan, 'sources').length).toBe(6);
    expect(rowsFor(plan, 'claims').length).toBe(18);
    expect(rowsFor(plan, 'facts').length).toBe(11);
    expect(rowsFor(plan, 'claim_conflicts').length).toBe(1);
    expect(rowsFor(plan, 'gaps').length).toBe(4);
    expect(rowsFor(plan, 'artifacts').length).toBe(2);
  });

  it('claims gain person_id, which the Claim contract itself does not carry', () => {
    const plan = seedPlan(snapshot, templates);
    for (const row of rowsFor(plan, 'claims')) {
      const record: Record<string, unknown> = Object.fromEntries(Object.entries(row ?? {}));
      expect(record.person_id).toBe(snapshot.person.id);
    }
  });

  it('templates plan is copied from fixtures/templates.json, never hand-written', () => {
    const plan = seedPlan(snapshot, templates);
    const templateRows = rowsFor(plan, 'artifact_templates');

    expect(templateRows.length).toBe(templates.length);

    // A real slot_key from the JSON must survive into the plan unmodified.
    const serialised = JSON.stringify(templateRows);
    expect(serialised).toContain('drug_therapies.evidence');
    expect(serialised).toContain('chc_dst_pack_v1');
  });

  it('no SQL strings anywhere in the plan — supabase client ops only', () => {
    const plan = seedPlan(snapshot, templates);
    const serialised = JSON.stringify(plan);
    expect(serialised).not.toMatch(/\bSELECT\b|\bINSERT INTO\b|\bDROP TABLE\b|\bDELETE FROM\b/i);
  });

  it('is deterministic: same input produces an identical plan', () => {
    const planA = seedPlan(snapshot, templates);
    const planB = seedPlan(snapshot, templates);
    expect(planA).toEqual(planB);
  });

  it("seeds the CARER's relationship, not a self one — the basis is person_consent", () => {
    const carer = demoCarer(snapshot.person.id);
    const plan = seedPlan(snapshot, templates, carer);
    const rows = rowsFor(plan, 'care_relationships');
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(rows[0] ?? {}));

    expect(snapshot.person.access_basis).toBe('person_consent');
    expect(row.role).toBe('carer');
    expect(row.member_id).toBe(carer.memberId);
    // A self relationship is member_id === person_id; this must not be one.
    expect(row.member_id).not.toBe(snapshot.person.id);
    expect(row.access_basis).toBe('person_consent');
    expect(row.declared_name).toBe(carer.declaredName);
    expect(row.granted_at).not.toBeNull();
    expect(row.revoked_at).toBeNull();
  });

  it('records the declaration in consent_records with the typed full name', () => {
    const carer = demoCarer(snapshot.person.id);
    const rows = rowsFor(seedPlan(snapshot, templates, carer), 'consent_records');
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(rows[0] ?? {}));
    expect(rows.length).toBe(1);
    expect(row.basis).toBe(snapshot.person.access_basis);
    expect(row.member_id).toBe(carer.memberId);
    expect(String(row.declared_name).split(/\s+/).length).toBeGreaterThanOrEqual(2);
  });

  it('honours a DEMO_CARER_MEMBER_ID override so RLS can admit the real auth.uid()', () => {
    const uid = '11111111-2222-4333-8444-555555555555';
    const plan = seedPlan(snapshot, templates, demoCarer(snapshot.person.id, uid));
    const rel: Record<string, unknown> = Object.fromEntries(
      Object.entries(rowsFor(plan, 'care_relationships')[0] ?? {}),
    );
    const person: Record<string, unknown> = Object.fromEntries(
      Object.entries(rowsFor(plan, 'people')[0] ?? {}),
    );
    expect(rel.member_id).toBe(uid);
    expect(person.created_by).toBe(uid);
  });

  it('care_relationships id is a pure function of the person id', () => {
    const planA = seedPlan(snapshot, templates);
    const planB = seedPlan(snapshot, templates);
    const rowA: Record<string, unknown> = Object.fromEntries(
      Object.entries(rowsFor(planA, 'care_relationships')[0] ?? {}),
    );
    const rowB: Record<string, unknown> = Object.fromEntries(
      Object.entries(rowsFor(planB, 'care_relationships')[0] ?? {}),
    );
    expect(rowA.id).toBe(rowB.id);
    expect(String(rowA.id)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
