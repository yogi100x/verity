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
import { renderInspectPage, escapeHtml } from '@/lib/ai/inspect-html';

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
    return html(renderInspectPage(reports, note));
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
