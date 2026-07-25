/**
 * Wiring tests for artefact rendering on `/api/debug/inspect`.
 *
 * `buildArtifact` (`lib/ai/artifacts.ts`) already has its own unit tests
 * (`artifacts.test.ts`) for the resolution rules themselves. This file is
 * about the SEAM: does the route actually call it, for both templates, from
 * the reconciled (superseded-included) fact set, and does the rendered page
 * honour the two invariants a reviewer must be able to SEE — an unfillable
 * slot degrades to an honest gap prompt, never invented prose, and a
 * superseded record never appears as current evidence.
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/debug/inspect/route';
import { reconcile } from '@/lib/ai/reconcile';
import { buildArtifact } from '@/lib/ai/artifacts';
import { loadTemplates, templateByKey, slotsOf } from '@/lib/ai/templates';
import { renderInspectPage, type InspectArtifactView, type InspectReportView } from '@/lib/ai/inspect-html';
import { CaseSnapshot, type Source } from '@/lib/contracts';
import { sectionById } from './html-sections';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

const JUDGEMENT_KEY_RE = /severity|urgency|priority|rank|risk|score/i;

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked —
 *  matching the convention in artifacts.test.ts / supersession-wiring.test.ts. */
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

const continenceSlot = slotsOf(templateByKey('chc_dst_pack_v1'))
  .map((s) => s.slot)
  .find((s) => s.key === 'continence.evidence');
if (continenceSlot === undefined || continenceSlot.gap_prompt === null) {
  throw new Error('fixture invariant broken: expected continence.evidence with a non-null gap_prompt');
}
const continenceGapPrompt = continenceSlot.gap_prompt;

async function getArtifactsSection(): Promise<string> {
  const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
  const body = await res.text();
  expect(res.status).toBe(200);
  return sectionById(body, 'artifacts');
}

describe('GET /api/debug/inspect — artefacts section renders both templates', () => {
  it('contains both templates, and their section-title sets differ (templates are data)', async () => {
    const artifactsSection = await getArtifactsSection();

    const [chcTemplate, gpTemplate] = loadTemplates();
    if (chcTemplate === undefined || gpTemplate === undefined) {
      throw new Error('expected both phase-1 templates to be loaded');
    }

    expect(artifactsSection).toContain(chcTemplate.title);
    expect(artifactsSection).toContain(gpTemplate.title);

    const chcSectionTitles = new Set(chcTemplate.sections.map((s) => s.title));
    const gpSectionTitles = new Set(gpTemplate.sections.map((s) => s.title));
    expect(chcSectionTitles).not.toEqual(gpSectionTitles);

    // A section title unique to each template actually shows up on the page.
    const chcOnly = [...chcSectionTitles].find((t) => !gpSectionTitles.has(t));
    const gpOnly = [...gpSectionTitles].find((t) => !chcSectionTitles.has(t));
    if (chcOnly === undefined || gpOnly === undefined) {
      throw new Error('expected each template to have at least one section title the other lacks');
    }
    expect(artifactsSection).toContain(chcOnly);
    expect(artifactsSection).toContain(gpOnly);
  });

  it('the continence.evidence gap prompt appears verbatim, read from the frozen template, not hardcoded', async () => {
    const artifactsSection = await getArtifactsSection();
    expect(artifactsSection).toContain(continenceGapPrompt);
  });
});

describe('GET /api/debug/inspect — a superseded record cannot appear as current', () => {
  it('the March cardiology claim’s quote and value are absent from the artefacts section, with a positive control present', async () => {
    const artifactsSection = await getArtifactsSection();

    // Load-bearing: the March period is superseded by the June discharge
    // instruction, so it must never be composed into a "current" slot.
    expect(artifactsSection).not.toContain(marchClaim.quote);
    expect(artifactsSection).not.toContain(marchClaim.value);

    // Positive control, derived (not hardcoded): the SAME reconciliation the
    // route itself runs still has a LIVE furosemide fact — the disputed one —
    // and its composed value must be visible somewhere in the section. If it
    // is not, the assertions above would be passing vacuously (an empty or
    // broken section trivially contains neither banned string either).
    const { facts } = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const liveFurosemide = facts.find(
      (f) =>
        f.ontology_key === 'medication.furosemide' &&
        f.subject === 'furosemide' &&
        f.superseded_by === null &&
        f.valid_to === null,
    );
    if (liveFurosemide === undefined) {
      throw new Error('expected a live (non-superseded) furosemide fact from reconcile()');
    }
    expect(artifactsSection).toContain(liveFurosemide.canonical_value);
  });
});

describe('GET /api/debug/inspect — the fabricated quote never reaches an artefact', () => {
  it('the unverified claim’s quote appears nowhere in the artefacts section', async () => {
    const artifactsSection = await getArtifactsSection();
    expect(artifactsSection).not.toContain(fabricatedClaim.quote);
  });
});

describe('GET /api/debug/inspect — every evidence-backed slot actually carries evidence', () => {
  it('no slot is rendered filled (state="filled") with zero citations — mirrors the DB constraint', async () => {
    const artifactsSection = await getArtifactsSection();
    const matches = [
      ...artifactsSection.matchAll(/data-state="([^"]+)" data-citations="(\d+)"/g),
    ];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      const [, state, countStr] = match;
      if (state === 'filled') {
        expect(Number(countStr)).toBeGreaterThan(0);
      }
    }
  });
});

describe('GET /api/debug/inspect — counts add up for both templates', () => {
  it('filled + verbatim_copy + gap_prompted + omitted === slots_total, read off the rendered data attributes', async () => {
    const artifactsSection = await getArtifactsSection();
    const cards = [
      ...artifactsSection.matchAll(
        /data-slots-total="(\d+)" data-filled="(\d+)" data-verbatim-copy="(\d+)" data-gap-prompted="(\d+)" data-omitted="(\d+)"/g,
      ),
    ];
    expect(cards).toHaveLength(2);
    for (const [, slotsTotalStr, filledStr, verbatimCopyStr, gapPromptedStr, omittedStr] of cards) {
      const slotsTotal = Number(slotsTotalStr);
      const filled = Number(filledStr);
      const verbatimCopy = Number(verbatimCopyStr);
      const gapPrompted = Number(gapPromptedStr);
      const omitted = Number(omittedStr);
      expect(filled + verbatimCopy + gapPrompted + omitted).toBe(slotsTotal);
      expect(slotsTotal).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/debug/inspect — the structural slots the route now fills are rendered as verbatim copy, not omitted', () => {
  /** The reviewed defect: the CHC pack's cover subject, cover scope and method
   *  provenance slots produced no assertion and vanished behind a bare
   *  "3 omitted", so a reviewer could not tell three missing structural pages
   *  from three empty clinical domains. The route now supplies `person` and
   *  `assembledOn` on every request (see `GET`, `app/api/debug/inspect/route.ts`),
   *  so these slots are no longer omitted at all — they render as fixed,
   *  verbatim copy (`state="verbatim_copy"`), distinguishable from both
   *  evidence-backed and gap-prompted slots. `lib/ai/__tests__/projections-wiring.test.ts`
   *  covers the exact copy each one renders; this file only checks that the
   *  route wires the inputs through so none of them fall back to omission.
   *  Derived from the frozen template — no slot key is listed here. */
  it('every structural (verbatim-copy) slot renders filled, by label, never as an omission', async () => {
    const artifactsSection = await getArtifactsSection();
    const structural = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .filter((s) => !s.citation_required && s.gap_prompt === null);

    expect(structural.length).toBeGreaterThan(0);
    for (const slot of structural) {
      expect(
        artifactsSection,
        `slot ${slot.key} was left out of the pack instead of filling from copy`,
      ).toContain(`data-slot-key="${slot.key}" data-renderer="${slot.renderer}" data-state="verbatim_copy"`);
      expect(artifactsSection).toContain(slot.label);
      expect(artifactsSection).not.toContain(`data-omitted-slot-key="${slot.key}"`);
    }
    // The one omission reason these three slots used to carry, when Lane A
    // had no person/assembledOn to supply, no longer appears anywhere on the
    // page — every awaiting_fixed_copy slot template-wide is now filled.
    expect(artifactsSection).not.toContain('data-omission-reason="awaiting_fixed_copy"');
  });

  it('the named omissions on each card match its own omitted count', async () => {
    const artifactsSection = await getArtifactsSection();
    const cards = artifactsSection.split('<div class="artifact-card"').slice(1);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const omittedMatch = /data-omitted="(\d+)"/.exec(card);
      expect(omittedMatch).not.toBeNull();
      const omitted = Number(omittedMatch?.[1]);
      const named = [...card.matchAll(/data-omitted-slot-key="/g)].length;
      expect(named).toBe(omitted);
    }
  });

  it('the persistent banner and provenance footer now render legitimately, verbatim, not paraphrased', async () => {
    // `prd.md` §8.5 fixes this disclaimer wording verbatim and it belongs to
    // Lane C's lib/copy/**. Before this PR wired `person`/`assembledOn` into
    // the route, these slots stayed omitted and this exact copy could never
    // legitimately appear — Lane A paraphrasing it would have been the
    // failure. Now that the route supplies real inputs, the SAME strings are
    // the correct, intended output: Lane C's own copy, rendered unaltered.
    const artifactsSection = await getArtifactsSection();
    expect(artifactsSection).toContain('not a clinical record');
    expect(artifactsSection).toContain('not a clinical summary');
    expect(artifactsSection).toContain('has not been reviewed by a clinician');
  });
});

describe('GET /api/debug/inspect — the slot renderer is honoured, not ignored', () => {
  it('a table slot renders a table, a list slot a list, and a conflict slot leads with the question', async () => {
    const artifactsSection = await getArtifactsSection();

    // Which renderers are in play is read off the frozen templates, not
    // asserted from a hardcoded slot list.
    const renderersInPlay = new Set(
      loadTemplates().flatMap((t) => slotsOf(t).map((s) => s.slot.renderer)),
    );
    expect(renderersInPlay.has('table')).toBe(true);
    expect(renderersInPlay.has('list')).toBe(true);
    expect(renderersInPlay.has('conflict')).toBe(true);

    // Every rendered slot declares its renderer, and at least one FILLED slot
    // of a non-prose renderer produced that renderer's own markup.
    const filledTable = /data-renderer="table" data-state="filled"/.test(artifactsSection);
    expect(filledTable, 'expected at least one filled table slot').toBe(true);
    expect(artifactsSection).toContain('<table class="artifact-slot-table">');
    expect(artifactsSection).toContain('<ul class="artifact-slot-list">');

    // The conflict renderer leads with the generated question — the same
    // question the Disagreements section shows — rather than flattening the
    // disputed fact into a one-line "Disputed — N sources" statement.
    const { conflicts } = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const question = conflicts[0]?.generated_question;
    if (question === undefined) throw new Error('expected reconcile() to find a conflict');
    expect(artifactsSection).toContain('artifact-slot-conflict-question');
    expect(artifactsSection).toContain(question);
  });
});

describe('GET /api/debug/inspect — no judgement key anywhere in the built artefacts', () => {
  it('walks both real Artifact objects the route builds and finds no banned key', () => {
    // Built directly against the pipeline (not the view), the same way
    // artifacts.test.ts and supersession-wiring.test.ts already do — the
    // route's own view builder is not exported, and the underlying Artifact
    // objects are what would carry a judgement field if one ever leaked in.
    const { facts } = reconcile(fixture.claims, fixture.person.id, {
      sourcesById: fixtureSourcesById(),
    });
    const claimsById = new Map(
      fixture.claims.map((c) => [c.id, { verified_substring: c.verified_substring, quote: c.quote }]),
    );

    const keys = new Set<string>();
    for (const template of loadTemplates()) {
      const result = buildArtifact({
        template,
        facts,
        claimsById,
        personId: fixture.person.id,
        createdAt: '2026-07-25T00:00:00.000Z',
      });
      collectKeys(result, keys);
    }
    for (const key of keys) {
      expect(JUDGEMENT_KEY_RE.test(key), `banned key "${key}"`).toBe(false);
    }
  });
});

describe('renderInspectPage — artefacts escaping', () => {
  it('a hostile citation quote and gap-prompt-adjacent text cannot inject a raw <script> into the artefacts section', () => {
    const hostileArtifact: InspectArtifactView = {
      template_key: 'chc_dst_pack_v1',
      title: '<script>alert(1)</script> Evidence Pack',
      audience: '<img src=x onerror=alert(1)>',
      sections: [
        {
          key: 'breathing',
          title: 'Breathing',
          slots: [
            {
              slot_key: 'breathing.evidence',
              label: '<script>alert(2)</script>',
              renderer: 'prose',
              text: '<script>alert(3)</script>',
              gap_prompt: null,
              values: [
                {
                  subject: '<script>alert(7)</script>',
                  value: '<script>alert(8)</script>',
                  valid_from: '<script>alert(9)</script>',
                  status: '<script>alert(10)</script>',
                },
              ],
              conflict_questions: ['<script>alert(11)</script>'],
              form_invalid_levels: ['<script>alert(12)</script>'],
              citation_verified: true,
              citations: [
                {
                  quote: '<script>alert(4)</script> the patient said',
                  source_title: '<script>alert(5)</script>',
                },
              ],
              state: 'filled',
              verbatim_attribution: null,
              verbatim_source: null,
              suppression: null,
            },
            {
              slot_key: 'breathing.suggested_level',
              label: 'Suggested level',
              renderer: 'prose',
              text: '',
              gap_prompt: '<script>alert(6)</script> not enough evidence',
              values: [],
              conflict_questions: [],
              form_invalid_levels: [],
              citation_verified: false,
              citations: [],
              state: 'gap_prompt',
              verbatim_attribution: null,
              verbatim_source: null,
              // The suppression note is the only thing that distinguishes a
              // withheld slot from an empty one, and every field it
              // interpolates — including `filterOutput`'s own reported term —
              // must be escaped like everything else on this page.
              suppression: {
                reason: '<script>alert(18)</script>',
                withheld_fact_count: 2,
                filter_reason: '<script>alert(19)</script>',
                filter_term: '<script>alert(20)</script>',
              },
            },
            {
              slot_key: 'breathing.verbatim',
              label: '<script>alert(15)</script>',
              renderer: 'quote',
              text: '<script>alert(16)</script> fixed wording',
              gap_prompt: null,
              values: [],
              conflict_questions: [],
              form_invalid_levels: [],
              citation_verified: false,
              citations: [],
              state: 'verbatim_copy',
              verbatim_attribution: '<script>alert(17)</script> ref',
              verbatim_source: 'framework_citation',
              suppression: null,
            },
          ],
        },
      ],
      counts: { slots_total: 4, filled: 1, verbatim_copy: 1, gap_prompted: 1, omitted: 1, suppressed: 1 },
      omissions: [
        {
          slot_key: 'breathing.hostile',
          label: '<script>alert(13)</script>',
          section_title: '<script>alert(14)</script>',
          reason: 'awaiting_fixed_copy',
        },
      ],
    };

    // A non-empty `reports` list is required: `renderInspectPage` short-circuits
    // to an "empty page" branch when `reports` is empty, which never renders
    // the artefacts section at all. This minimal report exists only to keep
    // the page on its normal render path.
    const minimalReport: InspectReportView = {
      source: { id: 'src-1', title: 'Placeholder source', kind: 'pdf' },
      transcript: 'placeholder transcript',
      kept: [],
      dropped: [],
      stats: { claims_extracted: 0, claims_dropped: 0 },
      usage: null,
      mode: 'fixtures',
      retried: false,
      notice: null,
    };

    const html = renderInspectPage([minimalReport], null, [], [], [hostileArtifact]);
    const artifactsSection = sectionById(html, 'artifacts');

    expect(artifactsSection).not.toContain('<script>');
    expect(artifactsSection).not.toContain('</script>');
    expect(artifactsSection).not.toContain('<img src=x onerror=alert(1)>');
    // Every hostile payload above — including the ones only the new
    // renderer-aware, verbatim-copy and omission code paths can reach — must
    // be escaped, so no alert() number may survive unescaped.
    for (let n = 1; n <= 20; n += 1) {
      expect(artifactsSection).not.toContain(`<script>alert(${n})`);
    }
    // The escaped form must still be present, proving the value was rendered
    // (escaped), not silently dropped.
    expect(artifactsSection).toContain('&lt;script&gt;');
  });
});
