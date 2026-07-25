/**
 * GET /api/debug/inspect — Lane A's visual proof.
 *
 * The orchestrator cannot read code; this page is how the substring kill
 * switch (`lib/ai/verify.ts`) is SEEN working. It must render with no
 * `ANTHROPIC_API_KEY` and no database, because `fixtures` is the default
 * mode — that is the whole point of the mode seam, `callModel` in `@/lib/modes`.
 *
 * Never crashes into a Next.js error overlay: every failure mode below is
 * caught and turned into a readable HTML page instead, because a stack
 * trace is useless to a non-coder reviewer.
 */

import { resolveMode, type Mode } from '@/lib/modes';
import { extractAll, type ExtractionReport } from '@/lib/ai/extract';
import {
  renderInspectPage,
  escapeHtml,
  type InspectConflictView,
  type InspectFactView,
  type InspectArtifactView,
} from '@/lib/ai/inspect-html';
import { reconcile } from '@/lib/ai/reconcile';
import { periodDecisionFor } from '@/lib/ai/facts';
import { buildArtifact } from '@/lib/ai/artifacts';
import { projectAll } from '@/lib/ai/projections';
import { detectGaps } from '@/lib/detectors/gaps';
import { loadTemplates, slotsOf, levelsNotAvailableInDomain } from '@/lib/ai/templates';
import type { Artifact, ArtifactTemplate, Claim, Conflict, Fact, Source } from '@/lib/contracts';
import { CaseSnapshot } from '@/lib/contracts';
import type { BackingClaim, SlotOmission, StructuralAssertion } from '@/lib/ai/artifacts';
import fixtureRaw from '@/fixtures/margaret.json';

export const dynamic = 'force-dynamic';

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: HTML_HEADERS });
}

function problemPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verity — extraction inspector</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #FAF7F2; color: #1C1B1A; padding: 3rem 2rem; }
  .box { max-width: 42rem; margin: 0 auto; background: white; border: 1px solid #E7E1D8; border-radius: 12px; padding: 2rem; }
  h1 { color: #14453D; font-size: 1.4rem; margin-top: 0; }
  p { line-height: 1.6; }
  code { background: #E4EFEC; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
</head>
<body>
  <div class="box">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

const fixture = CaseSnapshot.parse(fixtureRaw);

/**
 * Reconciliation output the page needs: the conflict views and the fact
 * (timeline) views, built from a set of extraction reports.
 *
 * Gathers every kept (verified) claim across all reports, joins claim ids
 * back to their claims and source titles, and calls `reconcile`. A dropped
 * claim never reaches this function — it is not present in `report.kept` —
 * so neither view built here can ever display a claim that failed
 * verification.
 *
 * Every mode is treated identically: reconciliation always runs over the kept
 * claims of the reports it was handed. Supersession is now DERIVED, not read
 * from a fixture: `sourcesById` is built from the reports' own source
 * metadata (id, kind, title) and handed to `reconcile`, which runs
 * `buildFacts` + `applySupersession` (`lib/ai/facts.ts`) per claim group
 * itself. This is what turns the four live furosemide claims into the
 * documented THREE-claim conflict on a live extraction, not only on the
 * committed fixture: the March cardiology letter classifies as an
 * `instruction` (`lib/ai/sources.ts`), the June discharge summary is a later
 * `instruction` for the same subject, so `buildFacts` opens a new period at
 * the discharge summary and `applySupersession` closes the March period
 * against it — no read of `fixture.facts` involved.
 *
 * There is no fixtures special case here — there was one, and it was in the
 * wrong layer: it made this route know about `fixtures/margaret.json` in
 * order to work around `extractFromFixtures` regenerating claim ids. That is
 * fixed at the source now (see `extractFromFixtures`), so `report.kept` ids
 * are stable and this function needs no branch.
 */
interface ReconcileViews {
  readonly conflicts: InspectConflictView[];
  /** The real `Conflict[]` `reconcile()` produced — what `projectAll` needs
   *  to build `conflict.*` facts. `InspectConflictView` above is a rendering
   *  projection of the same data and cannot round-trip back into a `Conflict`. */
  readonly rawConflicts: readonly Conflict[];
  readonly facts: InspectFactView[];
  /** The raw derived facts (superseded ones included) — what `buildArtifact`
   *  needs, since it filters to live facts internally. */
  readonly rawFacts: readonly Fact[];
  readonly claimById: ReadonlyMap<string, Claim>;
  readonly sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>;
}

function reconcileViewsFor(reports: readonly ExtractionReport[]): ReconcileViews {
  const sourcesById = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const report of reports) {
    sourcesById.set(report.source.id, { kind: report.source.kind, title: report.source.title });
  }

  // `kept` carries verified claims only — a claim that failed the substring
  // check is in `dropped` and cannot be reached from here — so no fabricated
  // quote can enter either view by this path.
  const allKept: Claim[] = reports.flatMap((r) => r.kept);

  // `fixture.person.id` is a stand-in: no person/source registry is
  // persisted anywhere in this lane yet, so the fixture's own person id is
  // the only one available regardless of mode. Replace this once sources and
  // persons are actually stored (out of scope for S6).
  const { conflicts, facts } = reconcile(allKept, fixture.person.id, { sourcesById });

  const claimById = new Map(allKept.map((c) => [c.id, c] as const));

  const conflictViews: InspectConflictView[] = conflicts.map((conflict) => ({
    id: conflict.id,
    ontology_key: conflict.ontology_key,
    subject: conflict.subject,
    generated_question: conflict.generated_question,
    resolution: conflict.resolution,
    claims: conflict.claim_ids
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is Claim => claim !== undefined)
      .map((claim) => ({
        id: claim.id,
        value: claim.value,
        quote: claim.quote,
        source_title: sourcesById.get(claim.source_id)?.title ?? claim.source_id,
        asserted_at: claim.asserted_at,
      })),
  }));

  const factViews: InspectFactView[] = facts.map((fact: Fact) => ({
    id: fact.id,
    ontology_key: fact.ontology_key,
    subject: fact.subject,
    canonical_value: fact.canonical_value,
    status: fact.status,
    valid_from: fact.valid_from,
    valid_to: fact.valid_to,
    superseded: fact.superseded_by !== null,
    supporting: fact.supporting_claim_ids
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is Claim => claim !== undefined)
      .map((claim) => {
        // `periodDecisionFor`, not `classifySource`: the page must show the
        // decision the pipeline ACTUALLY made about this claim, which
        // includes refusing an instruction a validity period because its date
        // cannot anchor one. Rendering the bare source role instead would
        // label such a claim "instruction" with no hint that it opened no
        // period — the silent downgrade `lib/ai/facts.ts` exists to avoid.
        const source = sourcesById.get(claim.source_id);
        const decision =
          source === undefined
            ? { role: 'observation' as const, reason: 'source metadata unavailable' }
            : periodDecisionFor(claim, source);
        return {
          quote: claim.quote,
          source_title: source?.title ?? claim.source_id,
          role: decision.role,
          role_reason: decision.reason,
        };
      }),
  }));

  return { conflicts: conflictViews, rawConflicts: conflicts, facts: factViews, rawFacts: facts, claimById, sourcesById };
}

/**
 * Every verified citation backing a slot's resolved facts: joins each
 * `fact_id` back to the fact, then each of ITS `supporting_claim_ids` back to
 * a claim — but only claims with `verified_substring === true` are shown as
 * evidence. `isVerifiedBacked` (`lib/ai/artifacts.ts`) only requires ONE
 * verified supporting claim to let a fact back a slot; a fact's other
 * supporting claims may be unverified, and those must never be rendered as
 * if they were evidence.
 */
function citationsForFactIds(
  factIds: readonly string[],
  factsById: ReadonlyMap<string, Fact>,
  claimById: ReadonlyMap<string, Claim>,
  sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>,
): Array<{ quote: string; source_title: string }> {
  const citations: Array<{ quote: string; source_title: string }> = [];
  for (const factId of factIds) {
    const fact = factsById.get(factId);
    if (fact === undefined) continue;
    for (const claimId of fact.supporting_claim_ids) {
      const claim = claimById.get(claimId);
      if (claim === undefined || claim.verified_substring !== true) continue;
      citations.push({
        quote: claim.quote,
        source_title: sourcesById.get(claim.source_id)?.title ?? claim.source_id,
      });
    }
  }
  return citations;
}

/**
 * Build one `InspectArtifactView` from a real `Artifact` + the `ArtifactTemplate`
 * that produced it: joins each assertion back to its slot's section/label/renderer
 * (from the template) and each assertion's `fact_ids` back to citations (via
 * `citationsForFactIds`).
 *
 * A slot the template defines but that produced no assertion is absent from
 * the sections — but it is NOT absent from the page: `buildArtifact` returns
 * every omission named, with a reason, and they are carried through on
 * `omissions` and rendered. The count and the named list are cross-checked
 * against each other below, so a slot cannot go missing silently again.
 */
type ArtifactSlotValue = InspectArtifactView['sections'][number]['slots'][number]['values'][number];

/** `Conflict.generated_question` for every resolved fact that belongs to a
 *  disagreement, de-duplicated and in fact order. Derived from the FACTS the
 *  slot resolved to — which are live-only — never from `Conflict.claim_ids`,
 *  which can still reference claims belonging to a superseded fact. */
function conflictQuestionsFor(
  facts: readonly Fact[],
  questionByConflictId: ReadonlyMap<string, string>,
): string[] {
  const questions: string[] = [];
  for (const fact of facts) {
    const conflictId = fact.conflict_id;
    if (conflictId === null) continue;
    const question = questionByConflictId.get(conflictId);
    if (question === undefined || questions.includes(question)) continue;
    questions.push(question);
  }
  return questions;
}

function artifactViewFor(
  template: ArtifactTemplate,
  artifact: Artifact,
  omissions: readonly SlotOmission[],
  structuralAssertions: readonly StructuralAssertion[],
  factsById: ReadonlyMap<string, Fact>,
  claimById: ReadonlyMap<string, Claim>,
  sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>,
  questionByConflictId: ReadonlyMap<string, string>,
): InspectArtifactView {
  const assertionBySlotKey = new Map(artifact.assertions.map((a) => [a.slot_key, a] as const));
  const structuralBySlotKey = new Map(structuralAssertions.map((s) => [s.slot_key, s] as const));
  const slotsTotal = slotsOf(template).length;

  interface SectionBucket {
    readonly key: string;
    readonly title: string;
    readonly slots: InspectArtifactView['sections'][number]['slots'][number][];
  }
  const sectionsByKey = new Map<string, SectionBucket>();
  const sectionOrder: string[] = [];

  for (const { section, slot } of slotsOf(template)) {
    const assertion = assertionBySlotKey.get(slot.key);
    if (assertion === undefined) continue; // omitted — counted, never rendered

    let bucket = sectionsByKey.get(section.key);
    if (bucket === undefined) {
      bucket = { key: section.key, title: section.title, slots: [] };
      sectionsByKey.set(section.key, bucket);
      sectionOrder.push(section.key);
    }

    // Live facts only: `assertion.fact_ids` is produced by `buildArtifact`,
    // which resolves through `liveFacts`, so a superseded fact cannot be here
    // and this join cannot reintroduce one.
    const resolvedFacts = assertion.fact_ids
      .map((id) => factsById.get(id))
      .filter((fact): fact is Fact => fact !== undefined);

    const values: ArtifactSlotValue[] = resolvedFacts.map((fact) => ({
      subject: fact.subject,
      value: fact.canonical_value,
      valid_from: fact.valid_from,
      status: fact.status,
    }));

    // A slot named in `structuralAssertions` is verbatim copy — Lane C's
    // fixed wording, or a verbatim framework citation — never evidence and
    // never a plain gap. It must never be confused with either: it carries
    // no `fact_ids` (so `citation_verified` is false, same as a gap-prompt
    // assertion), but its text is real, non-empty, shipped-verbatim copy.
    const structural = structuralBySlotKey.get(slot.key);
    const state: 'filled' | 'verbatim_copy' | 'gap_prompt' =
      structural !== undefined ? 'verbatim_copy' : assertion.citation_verified ? 'filled' : 'gap_prompt';

    bucket.slots.push({
      slot_key: slot.key,
      label: slot.label,
      renderer: slot.renderer,
      text: assertion.text,
      // Read live from the frozen template, not from the stored assertion:
      // `Assertion.text` is empty for a gap-prompted slot by design, so this
      // copy can never go stale inside a persisted artefact.
      gap_prompt: slot.gap_prompt,
      values,
      conflict_questions: conflictQuestionsFor(resolvedFacts, questionByConflictId),
      form_invalid_levels: levelsNotAvailableInDomain(
        section.key,
        values.map((v) => v.value),
      ),
      citation_verified: assertion.citation_verified,
      citations: citationsForFactIds(assertion.fact_ids, factsById, claimById, sourcesById),
      state,
      verbatim_attribution: structural?.attribution ?? null,
    });
  }

  const structuralKeys = new Set(structuralAssertions.map((s) => s.slot_key));
  const verbatimCopy = artifact.assertions.filter((a) => structuralKeys.has(a.slot_key)).length;
  const filled = artifact.assertions.filter((a) => a.citation_verified).length;
  const gapPrompted = artifact.assertions.length - filled - verbatimCopy;
  const omitted = slotsTotal - artifact.assertions.length;

  const sections = sectionOrder.map((key) => {
    const bucket = sectionsByKey.get(key);
    if (bucket === undefined) throw new Error('unreachable: section vanished from its own map');
    return { key: bucket.key, title: bucket.title, slots: bucket.slots };
  });

  if (omitted !== omissions.length) {
    throw new Error(
      `omission accounting is wrong for ${template.key}: ${omitted} slots produced no assertion but ${omissions.length} were named`,
    );
  }

  return {
    template_key: template.key,
    title: template.title,
    audience: template.audience,
    sections,
    counts: { slots_total: slotsTotal, filled, verbatim_copy: verbatimCopy, gap_prompted: gapPrompted, omitted },
    omissions: omissions.map((o) => ({
      slot_key: o.slot_key,
      label: o.label,
      section_title: o.section_title,
      reason: o.reason,
    })),
  };
}

/**
 * Both phase-1 templates, built from the SAME reconciled fact set — the
 * "templates are data" proof made visible: `chc_dst_pack_v1` and `gp_brief_v1`
 * render different sections from one shared pool of facts, with no
 * template-specific code anywhere in this route. Facts are passed WHOLE
 * (superseded ones included); `buildArtifact` filters to live facts itself
 * (`liveFacts` in `lib/ai/facts.ts`), so a superseded record can never fill a
 * slot — this route does not pre-filter and must not duplicate that rule.
 */
function artifactsFor(
  rawFacts: readonly Fact[],
  claimById: ReadonlyMap<string, Claim>,
  sourcesById: ReadonlyMap<string, Pick<Source, 'kind' | 'title'>>,
  personId: string,
  conflicts: readonly InspectConflictView[],
  createdAt: string,
  person: { readonly display_name: string },
  assembledOn: string,
): InspectArtifactView[] {
  // `quote` is required alongside `verified_substring` now: `citedSpansFor`
  // (lib/ai/artifacts.ts) needs the verbatim quote behind a fact's supporting
  // claim to tell `filterOutput` a composed condition name is genuinely
  // cited — passing an empty list used to make every condition name read as
  // uncited, which is how Margaret's own heart-failure diagnosis was being
  // suppressed from her GP brief.
  const claimsById = new Map<string, BackingClaim>();
  for (const [id, claim] of claimById) {
    claimsById.set(id, { verified_substring: claim.verified_substring, quote: claim.quote });
  }

  const factsById = new Map(rawFacts.map((f) => [f.id, f] as const));
  const questionByConflictId = new Map(conflicts.map((c) => [c.id, c.generated_question] as const));

  return loadTemplates().map((template) => {
    const { artifact, omissions, structuralAssertions } = buildArtifact({
      template,
      facts: rawFacts,
      claimsById,
      personId,
      createdAt,
      person,
      assembledOn,
    });
    return artifactViewFor(
      template,
      artifact,
      omissions,
      structuralAssertions,
      factsById,
      claimById,
      sourcesById,
      questionByConflictId,
    );
  });
}

async function reportsFor(mode: Mode): Promise<{ reports: ExtractionReport[]; note: string | null }> {
  if (mode !== 'live') {
    return { reports: await extractAll(mode), note: null };
  }

  // No uploaded-sources registry exists yet in this lane — live extraction
  // needs sources to extract from, and this page has no upload flow. Rather
  // than crash, fall back to the fixtures reports and say so plainly. This is
  // true regardless of whether ANTHROPIC_API_KEY is set: `callModel` would
  // degrade to a fixture lookup on a missing key too (never an error), but
  // there is no source to send it in the first place here.
  return {
    reports: await extractAll('fixtures'),
    note:
      'Live mode requested, but this inspector page has no upload flow, so there ' +
      'is no source to extract live from — showing the fixtures reports instead. ' +
      '(POST a document to /api/extract?mode=live, with ANTHROPIC_API_KEY set in ' +
      '.env.local, to see a real extraction; without the key that call would ' +
      'degrade to a fixture lookup too, never error.)',
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode: Mode = resolveMode({ searchParam: new URL(request.url).searchParams.get('mode') });

  // This route owns the clock. `lib/ai/**` (`buildArtifact`, `projectAll`)
  // and `lib/detectors/gaps.ts` are pure and take a `Date`/ISO string as an
  // explicit argument rather than reading `new Date()` themselves — that is
  // what makes two builds of identical evidence comparable, and what keeps
  // gap detection's elapsed-deadline reasoning deterministic given the same
  // inputs. One `now` is constructed here, per request, and threaded down.
  const now = new Date();
  const createdAt = now.toISOString();
  const assembledOn = now.toISOString().slice(0, 10);

  try {
    const { reports, note } = await reportsFor(mode);
    const { conflicts, rawConflicts, facts, rawFacts, claimById, sourcesById } = reconcileViewsFor(reports);

    // `fixture.sources` is a stand-in for the same reason `fixture.person.id`
    // already is above: no source registry is persisted anywhere in this
    // lane yet, so the fixture's own sources are the only ones available
    // regardless of mode. `referencedDocumentAbsent` (lib/detectors/gaps.ts)
    // needs each source's full transcript, which `ExtractionReport.source`
    // does not carry (it is a `Pick<Source, 'id'|'title'|'kind'>`).
    const gaps = detectGaps(rawFacts, fixture.sources, now);

    // Four ontology namespaces the templates declare but no Fact producer
    // fills (`conflict.*`, `gap.*`, `source.inventory`, `person.identity`)
    // are projected into ordinary Facts here and concatenated with the
    // reconciled set below — slot resolution needs no special case for them.
    // `fixture.person.display_name` is a stand-in until a person registry
    // exists, the same as `fixture.person.id` elsewhere in this route.
    const projected = projectAll({
      personId: fixture.person.id,
      person: { display_name: fixture.person.display_name },
      conflicts: rawConflicts,
      gaps,
      sources: fixture.sources,
    });

    const artifacts = artifactsFor(
      [...rawFacts, ...projected],
      claimById,
      sourcesById,
      fixture.person.id,
      conflicts,
      createdAt,
      { display_name: fixture.person.display_name },
      assembledOn,
    );
    return html(renderInspectPage(reports, note, conflicts, facts, artifacts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return html(problemPage('Extraction inspector failed', `Something went wrong while building this page: ${message}`));
  }
}
