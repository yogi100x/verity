/**
 * Regression: resolveFactProvenance must resolve facts from EVERY seeded
 * case, not just the default. The original implementation cached
 * timelineEvents() for Margaret only, so switching to Maya (stretch S1) and
 * opening any artefact crashed on the first cited fact — the fail-loud
 * guard fired on correct data because the lookup map was single-case.
 */

import { describe, it, expect } from 'vitest';
import { Fact } from '@/lib/contracts';
import { getCase, ALL_CASE_IDS } from '@/components/data/dal';
import { resolveFactProvenance } from '../factProvenance';

describe('resolveFactProvenance — case coverage', () => {
  it('resolves every artefact-cited fact in every seeded case', () => {
    for (const caseId of ALL_CASE_IDS) {
      const snap = getCase(caseId);
      const factsById = new Map(snap.facts.map((f) => [f.id, f]));
      const citedIds = snap.artifacts.flatMap((a) =>
        a.assertions.flatMap((assertion) => assertion.fact_ids),
      );
      expect(citedIds.length).toBeGreaterThan(0);
      for (const id of citedIds) {
        const fact = factsById.get(id);
        expect(fact, `${caseId}: cited fact ${id} missing from snapshot`).toBeDefined();
        if (fact === undefined) continue;
        const provenance = resolveFactProvenance(fact);
        expect('citation' in provenance || 'userStated' in provenance).toBe(true);
      }
    }
  });

  it('still fails loud on a fact no case knows', () => {
    const ghost = Fact.parse({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      person_id: 'ffffffff-ffff-4fff-8fff-fffffffffffe',
      ontology_key: 'observation.ghost',
      subject: 'ghost',
      canonical_value: 'not in any fixture',
      provenance: 'document_extracted',
      status: 'confirmed',
      valid_from: null,
      valid_to: null,
      supporting_claim_ids: ['ffffffff-ffff-4fff-8fff-fffffffffffd'],
      conflict_id: null,
      superseded_by: null,
    });
    expect(() => resolveFactProvenance(ghost)).toThrow(/no resolvable provenance/);
  });
});
