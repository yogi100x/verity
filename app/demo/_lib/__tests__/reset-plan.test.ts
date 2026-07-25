import { describe, expect, it } from 'vitest';
import { baselinePlan, deletePlan, describeEndState, resetPlan, seedPlan } from '../dal';
import { demoCarer, revokePlan } from '../dal';
import { loadArtifactTemplates, loadMargaretSnapshot } from '../fixtures';

describe('resetPlan', () => {
  const snapshot = loadMargaretSnapshot();
  const templates = loadArtifactTemplates();

  it('is the derived-row deletion set followed by the baseline — not the full seed', () => {
    const plan = resetPlan(snapshot, templates);
    const del = deletePlan(snapshot);
    const baseline = baselinePlan(snapshot, templates, demoCarer(snapshot.person.id));

    expect(plan.slice(0, del.length)).toEqual(del);
    expect(plan.slice(del.length)).toEqual(baseline);
  });

  it('leaves Margaret with ZERO sources — user-journey step 0.4', () => {
    // /demo/reset restores her STARTING state. Re-seeding all five documents
    // would make step 1.1 ("from a clean reset, drag the discharge summary")
    // impossible and would make /demo/seed redundant.
    const state = describeEndState(resetPlan(snapshot, templates));
    expect(Object.keys(state.sources ?? {})).toEqual([]);
    expect(Object.keys(state.claims ?? {})).toEqual([]);
    expect(Object.keys(state.facts ?? {})).toEqual([]);
    expect(Object.keys(state.artifacts ?? {})).toEqual([]);
    expect(Object.keys(state.assertions ?? {})).toEqual([]);
    expect(Object.keys(state.gaps ?? {})).toEqual([]);
    expect(Object.keys(state.claim_conflicts ?? {})).toEqual([]);
  });

  it('keeps identity, consent and templates — nothing about WHO is deleted', () => {
    const state = describeEndState(resetPlan(snapshot, templates));
    expect(state.people?.[snapshot.person.id]).toBeDefined();
    expect(Object.keys(state.care_relationships ?? {}).length).toBe(1);
    expect(Object.keys(state.consent_records ?? {}).length).toBe(1);
    expect(Object.keys(state.artifact_templates ?? {}).length).toBe(templates.length);
  });

  it('deletes only derived rows — never people, consent or templates', () => {
    const del = deletePlan(snapshot);
    const tables = new Set(del.map((op) => op.table));
    expect(tables.has('people')).toBe(false);
    expect(tables.has('care_relationships')).toBe(false);
    expect(tables.has('consent_records')).toBe(false);
    expect(tables.has('artifact_templates')).toBe(false);
  });

  it('reset after a full seed still ends with zero sources (seed then reset)', () => {
    const state = describeEndState([
      ...seedPlan(snapshot, templates),
      ...resetPlan(snapshot, templates),
    ]);
    expect(Object.keys(state.sources ?? {})).toEqual([]);
    expect(state.people?.[snapshot.person.id]).toBeDefined();
  });

  it('running the reset plan twice converges to the same end state', () => {
    const once = describeEndState(resetPlan(snapshot, templates));
    const twice = describeEndState([
      ...resetPlan(snapshot, templates),
      ...resetPlan(snapshot, templates),
    ]);
    expect(twice).toEqual(once);
  });

  it('seeding twice converges to the same end state (idempotence)', () => {
    const once = describeEndState(seedPlan(snapshot, templates));
    const twice = describeEndState([
      ...seedPlan(snapshot, templates),
      ...seedPlan(snapshot, templates),
    ]);
    expect(twice).toEqual(once);
  });

  it('end state after seeding contains every claim and every source by id', () => {
    const state = describeEndState(seedPlan(snapshot, templates));
    for (const source of snapshot.sources) {
      expect(state.sources?.[source.id]).toBeDefined();
    }
    for (const claim of snapshot.claims) {
      expect(state.claims?.[claim.id]).toBeDefined();
    }
  });

  it('reset undoes a prior revoke: care_relationships.revoked_at ends null', () => {
    const revokedAt = '2026-07-25T12:00:00.000Z';
    const revokePlanOps = revokePlan(snapshot, revokedAt);

    const afterRevoke = describeEndState([...seedPlan(snapshot, templates), ...revokePlanOps]);
    const relId = Object.keys(afterRevoke.care_relationships ?? {})[0];
    expect(afterRevoke.care_relationships?.[relId ?? '']?.revoked_at).toBe(revokedAt);

    const afterReset = describeEndState([
      ...seedPlan(snapshot, templates),
      ...revokePlanOps,
      ...resetPlan(snapshot, templates),
    ]);
    expect(afterReset.care_relationships?.[relId ?? '']?.revoked_at).toBeNull();
  });
});
