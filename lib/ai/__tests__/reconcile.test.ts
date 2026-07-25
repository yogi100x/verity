import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import {
  reconcile,
  supersededClaimIdsFromFacts,
} from '@/lib/ai/reconcile';
import { GET } from '@/app/api/debug/inspect/route';
import { CaseSnapshot, type Claim, type Source } from '@/lib/contracts';
import { sectionById } from './html-sections';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

const furosemideClaims: Claim[] = fixture.claims.filter(
  (c) => c.ontology_key === 'medication.furosemide',
);

const marchClaim = furosemideClaims.find((c) => c.asserted_at === '2026-03-12');
if (marchClaim === undefined) {
  throw new Error('fixture invariant broken: expected a furosemide claim asserted 2026-03-12');
}

const fixtureConflict = fixture.conflicts[0];
if (fixtureConflict === undefined) {
  throw new Error('fixture invariant broken: expected at least one conflict');
}

const fabricatedClaim = fixture.claims.find((c) => c.verified_substring === false);
if (fabricatedClaim === undefined) {
  throw new Error('fixture invariant broken: expected one claim with verified_substring === false');
}

function fixtureSourcesById(): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const source of fixture.sources) map.set(source.id, { kind: source.kind, title: source.title });
  return map;
}

describe('reconcile — a disputed fact is linked to the conflict it is part of', () => {
  /** `Fact.conflict_id` was being left null on every path through `reconcile`,
   *  even for the fact whose own claims had just produced a conflict. The
   *  contract declares the field and the fixture sets it, so every consumer
   *  that joins a disputed fact to the question it raises — the artefact
   *  `conflict` renderer, Lane B's timeline — silently got nothing: the
   *  disagreement was detected and then discarded at the seam. */
  it('sets conflict_id on the live fact whose claims are in the conflict', () => {
    const { facts, conflicts } = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const conflict = conflicts[0];
    if (conflict === undefined) throw new Error('expected reconcile() to find a conflict');

    const linked = facts.filter((f) => f.conflict_id === conflict.id);
    expect(linked.length).toBeGreaterThan(0);

    for (const fact of linked) {
      // Linked by claim membership, and only claims the conflict actually cites.
      expect(fact.supporting_claim_ids.some((id) => conflict.claim_ids.includes(id))).toBe(true);
      // A resolved (superseded) disagreement must not come back as a current
      // question: superseded claims are excluded from conflict detection, so a
      // superseded fact is never linked.
      expect(fact.superseded_by).toBeNull();
    }

    // A fact with no claim in any conflict keeps conflict_id null.
    const unrelated = facts.filter(
      (f) => !f.supporting_claim_ids.some((id) => conflicts.some((c) => c.claim_ids.includes(id))),
    );
    expect(unrelated.length).toBeGreaterThan(0);
    for (const fact of unrelated) expect(fact.conflict_id).toBeNull();
  });

  it('links nothing when there is no conflict', () => {
    const single = fixture.claims.filter((c) => c.ontology_key === 'diagnosis.heart_failure');
    expect(single.length).toBeGreaterThan(0);
    const { facts, conflicts } = reconcile(single, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    expect(conflicts).toHaveLength(0);
    for (const fact of facts) expect(fact.conflict_id).toBeNull();
  });
});

function idSet(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: randomUUID(),
    source_id: randomUUID(),
    ontology_key: 'medication.furosemide',
    subject: 'furosemide',
    value: 'stopped',
    quote: 'furosemide 40mg was stopped',
    locator: { page: 1, char_start: 0, char_end: 10, ms_start: null, ms_end: null },
    asserted_at: '2026-06-25',
    date_precision: 'exact',
    provenance: 'document_extracted',
    verified_substring: true,
    ...overrides,
  };
}

describe('supersededClaimIdsFromFacts', () => {
  it('returns the March cardiology claim id, read from the fixture facts', () => {
    const ids = supersededClaimIdsFromFacts(fixture.facts);
    expect(ids).toContain(marchClaim.id);
  });

  it('only collects ids from facts with superseded_by or valid_to set', () => {
    const unaffectedFact = fixture.facts.find(
      (f) => f.superseded_by === null && f.valid_to === null && f.supporting_claim_ids.length > 0,
    );
    if (unaffectedFact === undefined) throw new Error('unreachable');
    const ids = supersededClaimIdsFromFacts(fixture.facts);
    for (const claimId of unaffectedFact.supporting_claim_ids) {
      expect(ids).not.toContain(claimId);
    }
  });
});

describe('reconcile — the demo beat: three sources disagree about furosemide', () => {
  it('with supersession from the fixture facts, produces exactly ONE conflict matching the fixture conflict claim_ids', () => {
    const superseded = supersededClaimIdsFromFacts(fixture.facts);
    const result = reconcile(fixture.claims, fixture.person.id, {
      supersededClaimIds: superseded,
    });

    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    if (conflict === undefined) throw new Error('unreachable');

    expect(sameSet(idSet(conflict.claim_ids), idSet(fixtureConflict.claim_ids))).toBe(true);
    expect(conflict.claim_ids).toHaveLength(3);
  });

  it('without supersession, yields a conflict containing all four furosemide claims (documented S6 dependency)', () => {
    const result = reconcile(fixture.claims, fixture.person.id);

    const furosemideConflict = result.conflicts.find((c) => c.subject === 'furosemide');
    expect(furosemideConflict).toBeDefined();
    if (furosemideConflict === undefined) return;

    expect(furosemideConflict.claim_ids).toHaveLength(4);
    expect(
      sameSet(idSet(furosemideConflict.claim_ids), idSet(furosemideClaims.map((c) => c.id))),
    ).toBe(true);
  });

  it('unverified claims never reach a group or a conflict', () => {
    const result = reconcile(fixture.claims, fixture.person.id);

    const allGroupedIds = result.groups.flatMap((g) => g.claims.map((c) => c.id));
    const allConflictIds = result.conflicts.flatMap((c) => c.claim_ids);

    const unverifiedIds = fixture.claims
      .filter((c) => c.verified_substring !== true)
      .map((c) => c.id);

    for (const id of unverifiedIds) {
      expect(allGroupedIds).not.toContain(id);
      expect(allConflictIds).not.toContain(id);
    }
  });

  it('claim_ids match the fixture conflict in ORDER, not merely as a set', () => {
    // Claim ids are preserved through extraction now, so this can assert the
    // exact ordered array rather than an order-insensitive set: sorted by
    // asserted_at ascending then id, which is the order the fixture records.
    const superseded = supersededClaimIdsFromFacts(fixture.facts);
    const result = reconcile(fixture.claims, fixture.person.id, {
      supersededClaimIds: superseded,
    });

    expect(result.conflicts[0]?.claim_ids).toEqual(fixtureConflict.claim_ids);
  });

  // `detectConflicts` assigns each Conflict a fresh `randomUUID()` id on every
  // call, by design — conflicts are not persisted or looked up by id here, and
  // unlike a claim id there is no prior identity to preserve. Determinism is
  // therefore checked on everything EXCEPT `id`: ontology_key, subject,
  // claim_ids (order included), generated_question, and resolution. Claim ids
  // themselves ARE now compared exactly, above and inside `withoutId`.
  function withoutId(conflict: { readonly id: string; [k: string]: unknown }) {
    const { id: _id, ...rest } = conflict;
    return rest;
  }

  it('is deterministic under shuffled input', () => {
    const shuffled = [...fixture.claims].reverse();
    const superseded = supersededClaimIdsFromFacts(fixture.facts);

    const a = reconcile(fixture.claims, fixture.person.id, { supersededClaimIds: superseded });
    const b = reconcile(shuffled, fixture.person.id, { supersededClaimIds: superseded });

    expect(b.groups).toEqual(a.groups);
    expect(b.conflicts.map(withoutId)).toEqual(a.conflicts.map(withoutId));
    expect(b.unmatched).toEqual(a.unmatched);
  });

  it('is deterministic under a differently-rotated shuffle', () => {
    const rotated = [...fixture.claims.slice(5), ...fixture.claims.slice(0, 5)];
    const superseded = supersededClaimIdsFromFacts(fixture.facts);

    const a = reconcile(fixture.claims, fixture.person.id, { supersededClaimIds: superseded });
    const c = reconcile(rotated, fixture.person.id, { supersededClaimIds: superseded });

    expect(c.conflicts.map(withoutId)).toEqual(a.conflicts.map(withoutId));
  });

  it('with hand-built claims: a single-claim group appears in unmatched', () => {
    const lonely = makeClaim({ ontology_key: 'medication.amitriptyline', subject: 'amitriptyline' });
    const result = reconcile([lonely], randomUUID());
    expect(result.unmatched).toEqual(['amitriptyline']);
    expect(result.conflicts).toEqual([]);
  });
});

describe('GET /api/debug/inspect — conflicts rendered end-to-end', () => {
  it('renders the generated question and the "Disagreements between sources" heading', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const bodyText = await res.text();

    // The page computes its own conflict via `reconcile`, so the question it
    // renders is whatever `generateQuestion` produces today — not
    // necessarily byte-identical to the hand-authored `generated_question`
    // stored on the fixture's own Conflict row. Derive the expected text the
    // same way the route does, rather than hardcoding either string.
    const superseded = supersededClaimIdsFromFacts(fixture.facts);
    const { conflicts } = reconcile(fixture.claims, fixture.person.id, {
      supersededClaimIds: superseded,
    });
    const expectedConflict = conflicts[0];
    if (expectedConflict === undefined) throw new Error('unreachable');

    expect(bodyText).toContain('Disagreements between sources');
    expect(bodyText).toContain(expectedConflict.generated_question);
  });

  it('never renders the fabricated quote from the unverified claim, anywhere in the conflicts section', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const bodyText = await res.text();

    // Scoped by section id, not sliced between a heading and an unrelated
    // marker: see `./html-sections.ts` for why that mattered.
    const conflictsSectionHtml = sectionById(bodyText, 'conflicts');

    expect(conflictsSectionHtml).not.toContain(fabricatedClaim.quote);
  });

  it('shows a conflict count of 1 for the fixture', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const bodyText = await res.text();

    expect(bodyText).toMatch(/<span class="summary-number summary-number-conflict">1<\/span>/);
  });

  it('the rendered conflict names exactly the THREE live sources, not four', async () => {
    // The demo beat, asserted on the page a reviewer actually looks at. A
    // regression that regenerates claim ids, or loses the supersession read,
    // makes this four rows and puts the cardiology letter back in — which is
    // exactly the bug this replaced.
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const bodyText = await res.text();

    const section = sectionById(bodyText, 'conflicts');

    // One header row plus one row per live claim.
    expect((section.match(/<tr>/g) ?? []).length).toBe(4);

    expect(section).toContain('Discharge summary');
    expect(section).toContain('Repeat prescription');
    expect(section).toContain('Juno history');
    expect(section).not.toContain('Cardiology clinic letter');

    // ...and the superseded March claim's quote is absent from the section.
    expect(section).not.toContain(marchClaim.quote);
  });

  it('renders the resolution as unresolved and never picks a winner', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const bodyText = await res.text();

    expect(bodyText).toContain('resolution: unresolved');
    expect(bodyText).not.toMatch(/most recent wins|likely correct|best evidence|confidence/i);
  });
});
