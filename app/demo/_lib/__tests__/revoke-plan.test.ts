import { describe, expect, it } from 'vitest';
import { describeEndState, revokePlan, seedPlan } from '../dal';
import { loadArtifactTemplates, loadMargaretSnapshot } from '../fixtures';

describe('revokePlan', () => {
  const snapshot = loadMargaretSnapshot();
  const templates = loadArtifactTemplates();

  it('touches exactly one table: care_relationships', () => {
    const plan = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    expect(plan.length).toBe(1);
    expect(plan.every((op) => op.table === 'care_relationships')).toBe(true);
  });

  it('is an update, not an upsert or delete — no row is removed or created', () => {
    const plan = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    expect(plan.every((op) => op.kind === 'update')).toBe(true);
  });

  it("targets the CARER's relationship, not a role='self' row", () => {
    // Margaret's access_basis is 'person_consent' — a basis only a carer can
    // declare (lib/safety/consent.ts). Revoking a role='self' row would empty
    // nobody's view; Journey 4.4 requires the carer's view to empty.
    const plan = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    for (const op of plan) {
      if (op.kind !== 'update') continue;
      expect(op.match).toEqual({ person_id: snapshot.person.id, role: 'carer' });
    }
  });

  it('the patch sets only revoked_at', () => {
    const plan = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    for (const op of plan) {
      if (op.kind !== 'update') continue;
      expect(Object.keys(op.patch)).toEqual(['revoked_at']);
    }
  });

  it('flips revoked_at without touching any other seeded table', () => {
    const seeded = describeEndState(seedPlan(snapshot, templates));
    const revoked = describeEndState([
      ...seedPlan(snapshot, templates),
      ...revokePlan(snapshot, '2026-07-25T12:00:00.000Z'),
    ]);

    for (const table of Object.keys(seeded)) {
      if (table === 'care_relationships') continue;
      expect(revoked[table]).toEqual(seeded[table]);
    }

    const relId = Object.keys(seeded.care_relationships ?? {})[0] ?? '';
    expect(seeded.care_relationships?.[relId]?.revoked_at).toBeNull();
    expect(revoked.care_relationships?.[relId]?.revoked_at).toBe('2026-07-25T12:00:00.000Z');
  });

  it('is deterministic given the same revokedAt input', () => {
    const a = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    const b = revokePlan(snapshot, '2026-07-25T12:00:00.000Z');
    expect(a).toEqual(b);
  });
});
