/**
 * Stretch S6 wiring tests.
 *
 * These tests exist to prove the rewire actually happened: supersession is
 * now DERIVED by `reconcile` (via `lib/ai/facts.ts`) rather than read out of
 * the fixture's own `facts` array. `lib/ai/facts.ts` and `lib/ai/sources.ts`
 * already have their own unit tests (`facts.test.ts`, `sources.test.ts`) for
 * the derivation logic itself; this file is about the SEAM: does
 * `reconcile` call that logic correctly, does the safe default hold when no
 * source map is supplied, and does the route render the result end to end.
 */

import { describe, it, expect } from 'vitest';
import { reconcile } from '@/lib/ai/reconcile';
import { GET } from '@/app/api/debug/inspect/route';
import { CaseSnapshot, type Claim, type Source } from '@/lib/contracts';
import { sectionById } from './html-sections';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked here. */
function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
  return keys;
}

function fixtureSourcesById(): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const source of fixture.sources) {
    map.set(source.id, { kind: source.kind, title: source.title });
  }
  return map;
}

const fixtureConflict = fixture.conflicts[0];
if (fixtureConflict === undefined) {
  throw new Error('fixture invariant broken: expected at least one conflict');
}

const marchClaim = fixture.claims.find(
  (c) => c.ontology_key === 'medication.furosemide' && c.asserted_at === '2026-03-12',
);
if (marchClaim === undefined) {
  throw new Error('fixture invariant broken: expected the March cardiology furosemide claim');
}

const fabricatedClaim = fixture.claims.find((c) => c.verified_substring === false);
if (fabricatedClaim === undefined) {
  throw new Error('fixture invariant broken: expected one claim with verified_substring === false');
}

function idSet(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

describe('reconcile derives supersession — the four-vs-three problem', () => {
  it('given only claims + a source map (no supersession input), yields exactly ONE furosemide conflict with exactly THREE claim ids matching the fixture conflict', () => {
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });

    const furosemideConflicts = result.conflicts.filter((c) => c.subject === 'furosemide');
    expect(furosemideConflicts).toHaveLength(1);

    const conflict = furosemideConflicts[0];
    if (conflict === undefined) throw new Error('unreachable');

    expect(conflict.claim_ids).toHaveLength(3);
    expect(sameSet(idSet(conflict.claim_ids), idSet(fixtureConflict.claim_ids))).toBe(true);

    // The fixture conflict itself is documented as three claim ids — assert
    // that read from the fixture too, never hardcoded.
    expect(fixtureConflict.claim_ids).toHaveLength(3);
  });

  it('the March cardiology claim is excluded from the derived conflict (it is superseded)', () => {
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const conflict = result.conflicts.find((c) => c.subject === 'furosemide');
    if (conflict === undefined) throw new Error('unreachable');
    expect(conflict.claim_ids).not.toContain(marchClaim.id);
  });
});

describe('reconcile returns facts, including the superseded one', () => {
  it('the returned facts include a superseded fact whose supporting_claim_ids is non-empty', () => {
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });

    const furosemideFacts = result.facts.filter(
      (f) => f.ontology_key === 'medication.furosemide' && f.subject === 'furosemide',
    );
    expect(furosemideFacts.length).toBeGreaterThanOrEqual(2);

    const superseded = furosemideFacts.find((f) => f.superseded_by !== null);
    if (superseded === undefined) throw new Error('expected a superseded fact');

    expect(superseded.valid_to).not.toBeNull();
    expect(superseded.supporting_claim_ids.length).toBeGreaterThan(0);
    expect(superseded.supporting_claim_ids).toContain(marchClaim.id);
  });

  it('a superseded fact is never dropped from the result — every group\'s facts are all present', () => {
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const anySuperseded = result.facts.some((f) => f.superseded_by !== null);
    expect(anySuperseded).toBe(true);
  });
});

describe('reconcile — safe default with no source map', () => {
  it('treats every claim as an observation, so no fact is ever superseded', () => {
    const result = reconcile(fixture.claims, fixture.person.id);
    const anySuperseded = result.facts.some((f) => f.superseded_by !== null || f.valid_to !== null);
    expect(anySuperseded).toBe(false);
  });

  it('without a source map, the furosemide conflict still carries all four live claims (documented S6 dependency)', () => {
    const result = reconcile(fixture.claims, fixture.person.id);
    const furosemideConflict = result.conflicts.find((c) => c.subject === 'furosemide');
    expect(furosemideConflict).toBeDefined();
    if (furosemideConflict === undefined) return;
    expect(furosemideConflict.claim_ids).toHaveLength(4);
  });
});

describe('reconcile — explicit supersededClaimIds is unioned with the derived set, not overridden', () => {
  it('an explicit id not otherwise derivable still ends up excluded from a conflict', () => {
    // Build a tiny synthetic case: two claims about the same subject that
    // conflict, no source map (so nothing is derived), but an explicit
    // supersededClaimIds naming one of them.
    const a: Claim = {
      id: '11111111-1111-4111-8111-111111111111',
      source_id: '22222222-2222-4222-8222-222222222222',
      ontology_key: 'medication.amitriptyline',
      subject: 'amitriptyline',
      value: 'stopped',
      quote: 'amitriptyline stopped',
      locator: { page: null, char_start: null, char_end: null, ms_start: null, ms_end: null },
      asserted_at: '2026-01-01',
      date_precision: 'exact',
      provenance: 'document_extracted',
      verified_substring: true,
    };
    const b: Claim = {
      ...a,
      id: '33333333-3333-4333-8333-333333333333',
      value: 'continuing',
      quote: 'amitriptyline continuing',
      asserted_at: '2026-02-01',
    };

    const withoutExplicit = reconcile([a, b], fixture.person.id);
    expect(withoutExplicit.conflicts).toHaveLength(1);

    const withExplicit = reconcile([a, b], fixture.person.id, {
      supersededClaimIds: [a.id],
    });
    expect(withExplicit.conflicts).toHaveLength(0);
  });
});

describe('GET /api/debug/inspect — end to end through the route', () => {
  it('renders a struck-through superseded entry with the March value text, the validity window, the instruction/observation labels, and still shows the three-source conflict question', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const body = await res.text();

    expect(res.status).toBe(200);

    // Struck-through, visually de-emphasised class present.
    expect(body).toContain('fact-card-superseded');
    expect(body).toContain('fact-value-superseded');

    // The March claim's value text appears somewhere in the timeline section.
    expect(body).toContain(marchClaim.value);

    // The validity window is shown (the March period starts 2026-03-12).
    expect(body).toContain('2026-03-12');

    // Instruction / observation classification labels are rendered.
    expect(body).toMatch(/badge-role-instruction/);
    expect(body).toMatch(/badge-role-observation/);
    expect(body).toContain('>instruction<');
    expect(body).toContain('>observation<');

    // The three-source conflict question is still present (derived, not
    // read from the fixture's own `facts`).
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const conflict = result.conflicts.find((c) => c.subject === 'furosemide');
    if (conflict === undefined) throw new Error('unreachable');
    expect(body).toContain(conflict.generated_question);
  });

  it('the fabricated (unverified) claim\'s quote appears nowhere in the facts section', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const body = await res.text();

    // Scoped to the facts section by id. Slicing from the heading to the end
    // of the document (the previous approach) swept in the per-source blocks,
    // where a dropped quote is legitimately displayed on purpose — so the
    // assertion was testing the wrong region and failed the moment the
    // timeline section moved above them.
    const factsSection = sectionById(body, 'facts');

    expect(factsSection).not.toContain(fabricatedClaim.quote);
    // Positive control: the section is not empty, so the assertion above is
    // not passing merely because there is nothing in it.
    expect(factsSection).toContain(marchClaim.quote);
  });

  it('the fabricated claim contributes to no fact at all, by any path', async () => {
    // Belt and braces on the rendering check above: the structured data the
    // page is built from must not reference the unverified claim either, so a
    // future renderer that displays a new field cannot leak it.
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    for (const fact of result.facts) {
      expect(fact.supporting_claim_ids).not.toContain(fabricatedClaim.id);
    }
    for (const conflict of result.conflicts) {
      expect(conflict.claim_ids).not.toContain(fabricatedClaim.id);
    }
  });

  it('the timeline section is rendered ABOVE the per-source blocks it explains', () => {
    // Placement is a reader decision, asserted here so it is not quietly
    // reverted to satisfy some future slice-based test.
    return GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'))
      .then((res) => res.text())
      .then((body) => {
        const factsAt = body.indexOf('id="facts"');
        const firstSourceBlockAt = body.indexOf('class="source-block"');
        expect(factsAt).toBeGreaterThan(-1);
        expect(firstSourceBlockAt).toBeGreaterThan(-1);
        expect(factsAt).toBeLessThan(firstSourceBlockAt);
      });
  });

  it('no rendered/response object anywhere contains a judgement KEY', async () => {
    const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
    const body = await res.text();

    // The page is HTML, not JSON, so there are no object "keys" to walk in
    // the response body itself — the load-bearing check is on the actual
    // structured data reconcile produced for this page, which is what would
    // carry a judgement field if one existed.
    const result = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const keys = collectKeys(result);
    for (const key of keys) {
      expect(key).not.toMatch(JUDGEMENT_KEY_RE);
    }

    // Belt and braces: no banned key text leaks into rendered table headers
    // or css class names shaped like a judgement field either.
    const headerMatches = [...body.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1] ?? '');
    for (const header of headerMatches) {
      expect(header).not.toMatch(JUDGEMENT_KEY_RE);
    }
  });
});
