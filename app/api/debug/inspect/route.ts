/**
 * GET /api/debug/inspect — Lane A's visual proof.
 *
 * The orchestrator cannot read code; this page is how the substring kill
 * switch (`lib/ai/verify.ts`) is SEEN working. It must render with no
 * `ANTHROPIC_API_KEY` and no database, because `fixtures` is the default
 * mode — that is the whole point of the modes seam in `lib/ai/modes.ts`.
 *
 * Never crashes into a Next.js error overlay: every failure mode below is
 * caught and turned into a readable HTML page instead, because a stack
 * trace is useless to a non-coder reviewer.
 */

import { resolveMode, anthropicFor, MissingCredentialsError, type Mode } from '@/lib/ai/modes';
import { extractAll, type ExtractionReport } from '@/lib/ai/extract';
import { renderInspectPage, escapeHtml, type InspectConflictView } from '@/lib/ai/inspect-html';
import { reconcile, supersededClaimIdsFromFacts } from '@/lib/ai/reconcile';
import type { Claim } from '@/lib/contracts';
import { CaseSnapshot } from '@/lib/contracts';
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
 * Build the conflict views for the page from a set of extraction reports.
 *
 * Gathers every kept (verified) claim across all reports, joins claim ids
 * back to their claims and source titles, and calls `reconcile`. A dropped
 * claim never reaches this function — it is not present in `report.kept` —
 * so a conflict built here can never display a claim that failed
 * verification.
 *
 * Every mode is treated identically: reconciliation always runs over the kept
 * claims of the reports it was handed, and supersession always comes from the
 * only Fact registry that exists today. There is no fixtures special case here
 * — there was one, and it was in the wrong layer: it made this route know about
 * `fixtures/margaret.json` in order to work around `extractFromFixtures`
 * regenerating claim ids. That is fixed at the source now (see
 * `extractFromFixtures`), so `report.kept` ids line up with the ids
 * `fixture.facts` reference and this function needs no branch.
 *
 * Supersession read from `fixture.facts` is what turns the four live furosemide
 * claims into the documented THREE-claim conflict: the March cardiology claim
 * supports a fact with `valid_to` set (superseded by the June discharge fact),
 * so `supersededClaimIdsFromFacts` picks it up and `reconcile` excludes it as
 * no longer live.
 *
 * The honest limitation: this is the ONLY Fact registry in the codebase. The
 * supersession pass itself is stretch S6 and is not built, and there is no
 * persisted `facts` table read here yet, so a genuine live extraction of
 * unrelated documents finds no matching ids and treats every verified claim in
 * a group as live — a four-claim conflict rather than three. That is a
 * dependency on unbuilt work, stated rather than hidden, and it is uniform
 * across modes rather than branched on.
 */
function conflictViewsFor(reports: readonly ExtractionReport[]): InspectConflictView[] {
  const titleBySourceId = new Map<string, string>();
  for (const report of reports) {
    titleBySourceId.set(report.source.id, report.source.title);
  }

  // `kept` carries verified claims only — a claim that failed the substring
  // check is in `dropped` and cannot be reached from here — so no fabricated
  // quote can enter the conflicts section by this path.
  const allKept: Claim[] = reports.flatMap((r) => r.kept);

  const { conflicts } = reconcile(allKept, fixture.person.id, {
    supersededClaimIds: supersededClaimIdsFromFacts(fixture.facts),
  });

  const claimById = new Map(allKept.map((c) => [c.id, c] as const));

  return conflicts.map((conflict) => ({
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
        source_title: titleBySourceId.get(claim.source_id) ?? claim.source_id,
        asserted_at: claim.asserted_at,
      })),
  }));
}

async function reportsFor(mode: Mode): Promise<{ reports: ExtractionReport[]; note: string | null }> {
  if (mode !== 'live') {
    return { reports: await extractAll(mode), note: null };
  }

  // Validates credentials for the requested mode. Throws
  // MissingCredentialsError when the key is absent; the caller's catch turns
  // that into a readable page. Returns non-null for 'live' by contract.
  anthropicFor(mode);

  // No uploaded-sources registry exists yet in this lane — live extraction
  // needs sources to extract from. Rather than crash, fall back to the
  // fixtures reports and say so plainly.
  return {
    reports: await extractAll('fixtures'),
    note: 'Live mode requested, but no sources have been uploaded yet in this session — showing the fixtures reports instead.',
  };
}

export async function GET(request: Request): Promise<Response> {
  let mode: Mode;
  try {
    mode = resolveMode(new URL(request.url));
  } catch (err) {
    return html(
      problemPage('Could not read the request', err instanceof Error ? err.message : String(err)),
    );
  }

  try {
    const { reports, note } = await reportsFor(mode);
    const conflicts = conflictViewsFor(reports);
    return html(renderInspectPage(reports, note, conflicts));
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return html(
        problemPage(
          'Live mode needs an API key',
          `${err.message} Nothing crashed — this page just cannot show live extraction until ANTHROPIC_API_KEY is set in .env.local. Visit this page with ?mode=fixtures (the default) to see the pipeline working with no key and no network.`,
        ),
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return html(problemPage('Extraction inspector failed', `Something went wrong while building this page: ${message}`));
  }
}
