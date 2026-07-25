/**
 * Wiring tests for the four projected namespaces (`conflict.*`, `gap.*`,
 * `source.inventory`, `person.identity`) that `lib/ai/projections.ts`
 * produces and `app/api/debug/inspect/route.ts`'s `GET` handler now
 * concatenates with the reconciled fact set before calling `buildArtifact`.
 *
 * `artifacts-wiring.test.ts` already covers the evidence-backed slots and
 * the general omission/escaping invariants. This file is specifically about
 * the SEAM the orchestrator's brief called out: slots that were declared by
 * the templates from hour 0 but had no Fact producer until this PR, and the
 * headline defect — `gp_brief_v1.questions` used to say "ask for a document"
 * while the furosemide question already existed, unrendered.
 *
 * Driven against the real `GET` handler with a constructed `Request` (no
 * server), scoped to `id="artifacts"` via `sectionById` so nothing here can
 * pass by matching text that legitimately belongs to the timeline or the
 * per-source appendix instead.
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/debug/inspect/route';
import { reconcile } from '@/lib/ai/reconcile';
import { detectGaps } from '@/lib/detectors/gaps';
import { projectAll } from '@/lib/ai/projections';
import { buildArtifact, type BackingClaim } from '@/lib/ai/artifacts';
import { templateByKey, slotsOf } from '@/lib/ai/templates';
import { escapeHtml } from '@/lib/ai/inspect-html';
import { PERSISTENT_BANNER, footer } from '@/lib/copy/safety';
import { FRAMEWORK_CITATIONS } from '@/lib/detectors/well_managed';
import { CaseSnapshot, type Source } from '@/lib/contracts';
import { sectionById } from './html-sections';
import fixtureRaw from '@/fixtures/margaret.json';

const fixture = CaseSnapshot.parse(fixtureRaw);

function fixtureSourcesById(): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const source of fixture.sources) map.set(source.id, { kind: source.kind, title: source.title });
  return map;
}

/** The reconciled fact set the route itself builds — used here only to
 *  independently derive what `detectGaps` / `projectAll` SHOULD produce, so
 *  assertions below compare against real, freshly-derived data rather than
 *  a hand-copied literal. */
function reconciledFacts() {
  return reconcile(fixture.claims, fixture.person.id, { sourcesById: fixtureSourcesById() }).facts;
}

async function getArtifactsSection(): Promise<string> {
  const res = await GET(new Request('http://localhost/api/debug/inspect?mode=fixtures'));
  const body = await res.text();
  expect(res.status).toBe(200);
  return sectionById(body, 'artifacts');
}

const conflict = fixture.conflicts[0];
if (conflict === undefined) {
  throw new Error('fixture invariant broken: expected at least one conflict');
}

describe('GET /api/debug/inspect — THE HEADLINE: the furosemide question reaches the GP brief', () => {
  it('gp_brief_v1\'s "questions" slot renders the fixture\'s conflicts[0].generated_question verbatim', async () => {
    const artifactsSection = await getArtifactsSection();
    // This is the slot that used to say "ask for a document" while the
    // question already existed, unrendered — the single most important
    // assertion in this PR.
    expect(artifactsSection).toContain(conflict.generated_question);
    expect(artifactsSection).toContain('data-slot-key="questions"');
  });
});

describe('GET /api/debug/inspect — projected gap facts reach the pack\'s gap slots', () => {
  it('the detected gap statements appear in the artefacts section, verbatim', async () => {
    const artifactsSection = await getArtifactsSection();
    const now = new Date();
    const gaps = detectGaps(reconciledFacts(), fixture.sources, now);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(artifactsSection, `gap statement for ${gap.detector} missing from the page`).toContain(
        gap.statement,
      );
    }
  });
});

describe('GET /api/debug/inspect — the source inventory: the fixture\'s document titles reach the artefacts section', () => {
  it('projectSourceInventory itself joins every source title into one canonical_value, verbatim', () => {
    // `source.inventory` (`cover.sources` / `documents`) declares
    // `citation_required: false`, but `factsForSlot` (lib/ai/artifacts.ts)
    // applies its central verified-backing rule to EVERY slot regardless of
    // `citation_required` — and `projectSourceInventory` correctly gives the
    // inventory fact NO supporting claims (there is nothing in the record to
    // cite for "here is the list of documents"; DB constraint:
    // `status = 'unknown' or supporting_claim_ids non-empty`). The
    // consequence is that the dedicated `cover.sources` / `documents` slots
    // can never resolve to this fact and always render their gap_prompt —
    // proven below alongside the positive result: the SAME titles are still
    // visible in the artefacts section, via the evidence citations on every
    // slot that draws on those documents.
    const projected = projectAll({
      personId: fixture.person.id,
      person: { display_name: fixture.person.display_name },
      conflicts: fixture.conflicts,
      gaps: [],
      sources: fixture.sources,
    });
    const inventory = projected.find((f) => f.ontology_key === 'source.inventory');
    expect(inventory).toBeDefined();
    for (const source of fixture.sources) {
      expect(inventory?.canonical_value).toContain(source.title);
    }
  });

  it('cover.sources and documents render their gap_prompt — the inventory fact has no citable claim to back them', async () => {
    const artifactsSection = await getArtifactsSection();
    const chcSourcesSlot = slotsOf(templateByKey('chc_dst_pack_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'cover.sources');
    const gpDocumentsSlot = slotsOf(templateByKey('gp_brief_v1'))
      .map((s) => s.slot)
      .find((s) => s.key === 'documents');
    if (chcSourcesSlot === undefined || gpDocumentsSlot === undefined) {
      throw new Error('expected both cover.sources and documents slots to exist');
    }
    expect(artifactsSection).toContain('data-slot-key="cover.sources" data-renderer="list" data-state="gap_prompt"');
    expect(artifactsSection).toContain('data-slot-key="documents" data-renderer="list" data-state="gap_prompt"');
  });

  it('several fixture document titles are still visible in the artefacts section, via the evidence citations of the slots that draw on them — an incidental byproduct, not a guarantee for every source', async () => {
    const artifactsSection = await getArtifactsSection();
    const visible = fixture.sources.filter((source) => artifactsSection.includes(escapeHtml(source.title)));
    // Every source cited as evidence somewhere in either template shows its
    // title next to its quote. That is not the same guarantee as the
    // dedicated inventory slots above would give (a source cited nowhere as
    // evidence — e.g. one whose only relevant claims land in a domain with
    // no evidence-backed slot in either template — will not appear here),
    // so this is a real but partial mitigation, not a substitute for fixing
    // cover.sources / documents.
    expect(visible.length).toBeGreaterThan(0);
    expect(visible).toContainEqual(expect.objectContaining({ title: 'Discharge summary' }));
  });
});

describe('GET /api/debug/inspect — cover.scope renders PERSISTENT_BANNER verbatim, unconditionally', () => {
  it('the route\'s own output matches PERSISTENT_BANNER exactly — catches paraphrase', async () => {
    const artifactsSection = await getArtifactsSection();
    // Rendered through `escapeHtml` like every other interpolated value on
    // this page (PERSISTENT_BANNER's own apostrophe becomes `&#39;`) — the
    // comparison is still against the imported constant, not a retyped
    // literal, so a paraphrase upstream still fails this.
    expect(artifactsSection).toContain(escapeHtml(PERSISTENT_BANNER));
  });

  it('renders even when no person is supplied at all, proven directly against buildArtifact', () => {
    // The route always supplies a person (a stand-in until a person registry
    // exists), so this precedence case — a pack missing its scope statement
    // is misleading about what it is, so it must never depend on `person`
    // being supplied — is proven directly against the pipeline the route
    // calls, not through the route itself.
    const { artifact, omissions } = buildArtifact({
      template: templateByKey('chc_dst_pack_v1'),
      facts: [],
      claimsById: new Map(),
      personId: fixture.person.id,
      createdAt: '2026-07-25T00:00:00.000Z',
    });
    expect(artifact.assertions.find((a) => a.slot_key === 'cover.scope')?.text).toBe(PERSISTENT_BANNER);
    expect(omissions.some((o) => o.slot_key === 'cover.scope')).toBe(false);
  });
});

describe('GET /api/debug/inspect — method.provenance renders footer(name, assembledOn) verbatim', () => {
  it('the rendered provenance text matches footer() applied to the fixture person and the route\'s own assembled date', async () => {
    const artifactsSection = await getArtifactsSection();
    const name = fixture.person.display_name;
    // The route derives `assembledOn` from its own request-time clock
    // (`new Date().toISOString().slice(0, 10)`) — this test cannot predict
    // that value, so it extracts what the route actually rendered and
    // checks the WHOLE provenance sentence is exactly `footer()`'s output
    // for that date, not a paraphrase or a drifted format.
    const match = /Assembled by (.+?) using Verity on (\d{4}-\d{2}-\d{2}) from documents/.exec(
      artifactsSection,
    );
    if (match === null) {
      throw new Error('expected method.provenance text to be present and match the footer() shape');
    }
    const renderedName = match[1];
    const renderedDate = match[2];
    if (renderedName === undefined || renderedDate === undefined) {
      throw new Error('expected both footer() capture groups to match');
    }
    expect(renderedName).toBe(name);
    expect(artifactsSection).toContain(footer(name, renderedDate));
  });
});

describe('GET /api/debug/inspect — drug_therapies.framework_note renders the framework citation verbatim, with attribution', () => {
  it('FRAMEWORK_CITATIONS.pg_23_2.text and .ref both appear', async () => {
    const artifactsSection = await getArtifactsSection();
    expect(artifactsSection).toContain(FRAMEWORK_CITATIONS.pg_23_2.text);
    expect(artifactsSection).toContain(FRAMEWORK_CITATIONS.pg_23_2.ref);
    expect(artifactsSection).toContain('data-slot-key="drug_therapies.framework_note"');
    expect(artifactsSection).toContain('data-state="verbatim_copy"');
  });
});

describe('GET /api/debug/inspect — cover.subject precedence: structural copy wins, the projected fact never double-fills it', () => {
  it('cover.subject is the person\'s display name via structural copy, exactly once', async () => {
    const artifactsSection = await getArtifactsSection();
    const matches = artifactsSection.match(/data-slot-key="cover\.subject"/g) ?? [];
    // Exactly one slot element for cover.subject — the ordinary evidence
    // path (person.identity) never ALSO produces an assertion for it, which
    // is what `buildArtifact`'s `continue` after a successful structural
    // fill guarantees (lib/ai/artifacts.ts).
    expect(matches).toHaveLength(1);
    expect(artifactsSection).toContain(fixture.person.display_name);
  });

  it('proven directly: with a person supplied, the projected person.identity fact is present in the input facts but never independently fills cover.subject', () => {
    const now = new Date('2026-07-25T00:00:00.000Z');
    const facts = reconciledFacts();
    const gaps = detectGaps(facts, fixture.sources, now);
    const projected = projectAll({
      personId: fixture.person.id,
      person: { display_name: fixture.person.display_name },
      conflicts: fixture.conflicts,
      gaps,
      sources: fixture.sources,
    });
    const personIdentityFact = projected.find((f) => f.ontology_key === 'person.identity');
    expect(personIdentityFact).toBeDefined();

    const claimsById = new Map<string, BackingClaim>();
    for (const claim of fixture.claims) claimsById.set(claim.id, { verified_substring: claim.verified_substring, quote: claim.quote });

    const { artifact, structuralAssertions } = buildArtifact({
      template: templateByKey('chc_dst_pack_v1'),
      facts: [...facts, ...projected],
      claimsById,
      personId: fixture.person.id,
      createdAt: '2026-07-25T00:00:00.000Z',
      person: { display_name: fixture.person.display_name },
      assembledOn: '2026-07-25',
    });

    const coverSubjectAssertions = artifact.assertions.filter((a) => a.slot_key === 'cover.subject');
    expect(coverSubjectAssertions).toHaveLength(1);
    expect(coverSubjectAssertions[0]?.text).toBe(fixture.person.display_name);
    expect(structuralAssertions.some((s) => s.slot_key === 'cover.subject' && s.source === 'lane_c_copy')).toBe(
      true,
    );
  });
});

describe('GET /api/debug/inspect — the superseded March cardiology value still does not appear as current evidence', () => {
  it('is absent from the artefacts section, with a positive control so the check cannot pass vacuously', async () => {
    const artifactsSection = await getArtifactsSection();
    const marchClaim = fixture.claims.find(
      (c) => c.ontology_key === 'medication.furosemide' && c.asserted_at === '2026-03-12',
    );
    if (marchClaim === undefined) {
      throw new Error('fixture invariant broken: expected the March cardiology furosemide claim');
    }
    expect(artifactsSection).not.toContain(marchClaim.quote);

    // Positive control: the live (disputed) furosemide fact from the SAME
    // reconciliation must actually be visible somewhere in the section, so
    // the assertion above is not passing because the section is empty or
    // broken.
    const facts = reconciledFacts();
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

describe('GET /api/debug/inspect — the fabricated quote never reaches an artefact, even with projections wired in', () => {
  it('the unverified claim\'s quote appears nowhere in the artefacts section', async () => {
    const artifactsSection = await getArtifactsSection();
    const fabricatedClaim = fixture.claims.find((c) => c.verified_substring === false);
    if (fabricatedClaim === undefined) {
      throw new Error('fixture invariant broken: expected one claim with verified_substring === false');
    }
    expect(artifactsSection).not.toContain(fabricatedClaim.quote);
  });
});

describe('GET /api/debug/inspect — counts still add up for both templates with projections engaged', () => {
  it('filled + verbatim_copy + gap_prompted + omitted === slots_total', async () => {
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

describe('GET /api/debug/inspect — a hostile value from a projected fact cannot inject a raw <script>', () => {
  it('the artefacts section contains no unescaped <script> tag', async () => {
    const artifactsSection = await getArtifactsSection();
    expect(artifactsSection).not.toContain('<script>');
    expect(artifactsSection).not.toContain('</script>');
  });
});
