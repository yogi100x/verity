/**
 * attachPlan — the additive session grant (see app/demo/attach/route.ts).
 * Planning is pure, so everything here runs without a database.
 */

import { describe, expect, it } from 'vitest';
import { CaseSnapshot } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import {
  attachPlan,
  demoCarer,
  deriveAttachedRelationshipId,
  deriveCareRelationshipId,
} from '../dal';

const snapshot = CaseSnapshot.parse(fixtureRaw);
const SESSION_UID = '99999999-9999-4999-8999-999999999999';

describe('attachPlan', () => {
  it('grants the given member a relationship and a consent record, nothing else', () => {
    const plan = attachPlan(snapshot, demoCarer(snapshot.person.id, SESSION_UID));
    expect(plan.map((op) => [op.kind, op.table])).toEqual([
      ['upsert', 'care_relationships'],
      ['upsert', 'consent_records'],
    ]);
    for (const op of plan) {
      expect(op.kind).toBe('upsert');
      if (op.kind !== 'upsert') continue;
      expect(op.rows).toHaveLength(1);
      expect(op.rows[0]).toMatchObject({
        person_id: snapshot.person.id,
        member_id: SESSION_UID,
      });
    }
  });

  it('is deterministic and keyed on (person, member) — never the seeded row', () => {
    const a = attachPlan(snapshot, demoCarer(snapshot.person.id, SESSION_UID));
    const b = attachPlan(snapshot, demoCarer(snapshot.person.id, SESSION_UID));
    expect(a).toEqual(b);

    const attachedId = deriveAttachedRelationshipId(snapshot.person.id, SESSION_UID);
    // The seeded relationship row (keyed on person alone) must never be
    // overwritten by an attach — attaching is additive.
    expect(attachedId).not.toBe(deriveCareRelationshipId(snapshot.person.id));

    const relOp = a[0];
    if (relOp?.kind === 'upsert') {
      expect(relOp.rows[0]).toMatchObject({ id: attachedId, revoked_at: null });
    }
  });

  it('two different sessions get two different rows', () => {
    const other = '88888888-8888-4888-8888-888888888888';
    const idA = deriveAttachedRelationshipId(snapshot.person.id, SESSION_UID);
    const idB = deriveAttachedRelationshipId(snapshot.person.id, other);
    expect(idA).not.toBe(idB);
  });

  it("a 'self' case has no carer to attach — empty plan", () => {
    const selfSnapshot = CaseSnapshot.parse({
      ...fixtureRaw,
      person: { ...snapshot.person, access_basis: 'self' },
    });
    expect(attachPlan(selfSnapshot, demoCarer(selfSnapshot.person.id, SESSION_UID))).toEqual([]);
  });
});
