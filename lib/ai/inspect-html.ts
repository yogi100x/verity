/**
 * /api/debug/inspect renderer.
 *
 * Lane A has no UI, and the person reviewing this work cannot read code. This
 * module renders the only page that lets a non-coder SEE the substring kill
 * switch working: every kept claim next to its verbatim quote, locator, and a
 * PASS marker; every dropped claim in its own red-tinted section with the
 * reason it was dropped. A dropped claim is never shown to a user anywhere
 * else in the product — this page is where it is allowed to be visible, so
 * the reviewer can confirm the drop actually happened.
 *
 * Everything interpolated into the HTML below is untrusted: transcripts and
 * quotes come from user-uploaded documents. `escapeHtml` is applied at every
 * single interpolation site, with no exceptions.
 */

import type { Conflict, Fact } from '@/lib/contracts';

/** A structural view of an extraction report — deliberately independent of
 *  `lib/ai/extract.ts` (owned by a concurrent agent) so this file has no
 *  compile-time dependency on it. Satisfied structurally by the real
 *  ExtractionReport type. */
export interface InspectReportView {
  readonly source: { readonly id: string; readonly title: string; readonly kind: string };
  readonly transcript: string;
  readonly kept: ReadonlyArray<{
    readonly id: string;
    readonly ontology_key: string;
    readonly subject: string;
    readonly value: string;
    readonly quote: string;
    readonly locator: { readonly page: number | null; readonly char_start: number | null; readonly char_end: number | null };
    readonly verified_substring: boolean;
  }>;
  readonly dropped: ReadonlyArray<{
    readonly claim: { readonly subject: string; readonly value: string; readonly quote: string; readonly page: number | null };
    readonly reason: string;
  }>;
  readonly stats: { readonly claims_extracted: number; readonly claims_dropped: number };
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number } | null;
  readonly mode: string;
  readonly retried: boolean;
  /** Honest statement of what could not be read, or null. Untrusted — escaped. */
  readonly notice: string | null;
}

/**
 * Escape the five characters that matter for safe HTML text/attribute
 * interpolation. Must be applied to every value pulled from an
 * `InspectReportView` before it touches the returned markup — transcripts and
 * quotes originate in user-uploaded documents and are never trusted.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A structural view of one conflict for rendering — deliberately independent
 *  of `lib/ai/reconcile.ts` / `lib/ai/conflict.ts` / `lib/ai/group.ts` (the
 *  file avoids importing them, per its own pattern above) so this module has
 *  no compile-time coupling to the reconciliation pipeline. Satisfied
 *  structurally by whatever the route builds.
 *
 *  `_viewCoversConflictContract` below ties its scalar fields to the frozen
 *  `Conflict` contract at typecheck time. Without that tie, a contract rename
 *  (`generated_question` -> something else) would leave this view compiling
 *  happily and rendering a blank question. */
export interface InspectConflictView {
  readonly id: string;
  readonly ontology_key: string;
  readonly subject: string;
  readonly generated_question: string;
  readonly resolution: string;
  readonly claims: ReadonlyArray<{
    readonly id: string;
    readonly value: string;
    readonly quote: string;
    readonly source_title: string;
    readonly asserted_at: string | null;
  }>;
}

/**
 * Load-bearing, typecheck-time. `claim_ids` is deliberately replaced by a
 * resolved `claims` array (the page shows quotes, not bare uuids) and
 * `person_id` is not rendered; every OTHER field of the frozen `Conflict`
 * contract must be present here, and this view may not invent fields the
 * contract does not have. Add or rename a field in `lib/contracts.ts` and this
 * fails to compile — which is the point.
 */
type ConflictScalarKeys = Exclude<keyof Conflict, 'person_id' | 'claim_ids'>;
type ViewScalarKeys = Exclude<keyof InspectConflictView, 'claims'>;
type _ViewCoversConflictContract = [ViewScalarKeys] extends [ConflictScalarKeys]
  ? [ConflictScalarKeys] extends [ViewScalarKeys]
    ? true
    : never
  : never;
const _viewCoversConflictContract: _ViewCoversConflictContract = true;
void _viewCoversConflictContract;

/**
 * A structural view of one derived Fact for the timeline section —
 * deliberately independent of `lib/ai/facts.ts` / `lib/ai/reconcile.ts` /
 * `lib/contracts.ts` (same pattern as `InspectConflictView` above), so this
 * module keeps no compile-time coupling to the reconciliation pipeline.
 * Satisfied structurally by whatever the route builds from the real `Fact`
 * plus each supporting claim's source classification.
 *
 * `_factViewMatchesContract` below ties its Fact-derived fields to the frozen
 * contract at typecheck time, the same way `_viewCoversConflictContract`
 * does for conflicts. Without that tie, renaming `canonical_value` or
 * `valid_to` in `lib/contracts.ts` would leave this view compiling happily
 * and rendering a blank validity window on the one page a reviewer uses to
 * check supersession.
 */
export interface InspectFactView {
  readonly id: string;
  readonly ontology_key: string;
  readonly subject: string;
  readonly canonical_value: string;
  readonly status: string;
  readonly valid_from: string | null;
  readonly valid_to: string | null;
  readonly superseded: boolean;
  readonly supporting: ReadonlyArray<{
    readonly quote: string;
    readonly source_title: string;
    readonly role: string;
    readonly role_reason: string;
  }>;
}

/**
 * Load-bearing, typecheck-time: every Fact-derived field on the view must
 * still exist on the frozen `Fact` contract, with a compatible type. `id`,
 * `ontology_key`, `subject`, `canonical_value`, `valid_from` and `valid_to`
 * are checked directly; `status` is `string` here on purpose (the view is
 * format-agnostic) so it is checked as assignable FROM the contract's union.
 * `superseded` and `supporting` are view-only projections and have no
 * contract counterpart.
 */
type FactDerivedKeys = 'id' | 'ontology_key' | 'subject' | 'canonical_value' | 'valid_from' | 'valid_to';
type _FactViewMatchesContract =
  Pick<InspectFactView, FactDerivedKeys> extends Pick<Fact, FactDerivedKeys>
    ? Fact['status'] extends InspectFactView['status']
      ? true
      : never
    : never;
const _factViewMatchesContract: _FactViewMatchesContract = true;
void _factViewMatchesContract;

/**
 * A date for display. Returns RAW text — the caller escapes, exactly once, at
 * the interpolation site. This used to escape internally and then be escaped
 * again by its caller, so a date carrying an `&` rendered as `&amp;amp;`.
 * Escaping in one place only is the rule that keeps that from recurring.
 */
function fmtDate(d: string | null): string {
  return d === null ? '—' : d;
}

function renderSupportingRow(s: InspectFactView['supporting'][number]): string {
  return `
    <tr>
      <td>${escapeHtml(s.source_title)}</td>
      <td><span class="badge badge-role badge-role-${escapeHtml(s.role)}">${escapeHtml(s.role)}</span></td>
      <td>${escapeHtml(s.role_reason)}</td>
      <td class="mono quote-cell">${escapeHtml(s.quote)}</td>
    </tr>`;
}

function renderFactCard(fact: InspectFactView): string {
  const window = `${fmtDate(fact.valid_from)} – ${fact.superseded ? fmtDate(fact.valid_to) : 'current'}`;
  const supersededNote = fact.superseded
    ? `<p class="fact-superseded-note">
         This record was not wrong — it was true earlier, and a later
         instruction replaced it. It is kept here with its supporting quotes
         so it can still be checked.
       </p>`
    : '';

  return `
    <div class="fact-card ${fact.superseded ? 'fact-card-superseded' : ''}">
      <div class="fact-meta">
        <span class="pill">status: ${escapeHtml(fact.status)}</span>
        <span class="pill">valid: ${escapeHtml(window)}</span>
        ${fact.superseded ? '<span class="pill pill-superseded">superseded</span>' : ''}
      </div>
      <p class="fact-value ${fact.superseded ? 'fact-value-superseded' : ''}">${escapeHtml(fact.canonical_value)}</p>
      ${supersededNote}
      <table class="fact-supporting-table">
        <thead>
          <tr>
            <th>source</th>
            <th>read as</th>
            <th>why</th>
            <th>quote</th>
          </tr>
        </thead>
        <tbody>${fact.supporting.map(renderSupportingRow).join('')}</tbody>
      </table>
    </div>`;
}

/** Facts arrive in the order `lib/ai/facts.ts` emitted them (valid_from
 *  ascending), and that order is preserved rather than re-derived here. A
 *  second comparator in this file would have been one more thing to drift,
 *  and the version that existed tiebroke on `Fact.id` — a fresh randomUUID —
 *  so the page could order two same-day periods differently on each render. */
function renderFactSubjectGroup(subject: string, facts: readonly InspectFactView[]): string {
  return `
    <div class="fact-subject-group">
      <h3 class="fact-subject-heading">${escapeHtml(subject)}</h3>
      ${facts.map(renderFactCard).join('')}
    </div>`;
}

/**
 * "What each record says, over time" — the timeline view of derived Facts.
 * Grouped by subject, each group shown in date order, so a supersession —
 * two facts about the same subject, one closing where the other opens — is
 * legible without reading raw ids. A superseded fact is rendered struck
 * through and visually de-emphasised via `.fact-card-superseded` /
 * `.fact-value-superseded`, but its value, validity window and supporting
 * quotes all stay in the markup — nothing about a superseded fact is ever
 * omitted, only styled differently. Every interpolated value — subject,
 * canonical value, quotes, source titles, role reasons — originates in
 * user-uploaded documents and goes through `escapeHtml`.
 */
function renderFactsSection(facts: readonly InspectFactView[]): string {
  if (facts.length === 0) {
    return '';
  }

  const bySubject = new Map<string, InspectFactView[]>();
  for (const fact of facts) {
    const list = bySubject.get(fact.subject);
    if (list === undefined) {
      bySubject.set(fact.subject, [fact]);
    } else {
      list.push(fact);
    }
  }

  const subjects = [...bySubject.keys()].sort();
  const groups = subjects
    .map((subject) => renderFactSubjectGroup(subject, bySubject.get(subject) ?? []))
    .join('');

  return `
    <section class="facts-section" id="facts">
      <h2 class="facts-heading">What each record says, over time</h2>
      <p class="facts-explainer">
        Each block below is one period during which a record held one state, built
        from the claims that support it. A record marked superseded is not
        deleted — it is shown struck through, with the record that replaced it
        and the reasoning behind each source's classification, so the timeline
        can be checked rather than taken on trust.
      </p>
      ${groups}
    </section>`;
}

function fmtLocatorPart(n: number | null): string {
  return n === null ? '—' : escapeHtml(String(n));
}

function fmtCharRange(charStart: number | null, charEnd: number | null): string {
  if (charStart === null && charEnd === null) return '—';
  return `${fmtLocatorPart(charStart)}–${fmtLocatorPart(charEnd)}`;
}

function renderKeptTable(kept: InspectReportView['kept']): string {
  if (kept.length === 0) {
    return '<p class="empty-note">No claims passed verification for this source.</p>';
  }
  const rows = kept
    .map(
      (c) => `
        <tr>
          <td>${escapeHtml(c.id)}</td>
          <td>${escapeHtml(c.ontology_key)}</td>
          <td>${escapeHtml(c.subject)}</td>
          <td>${escapeHtml(c.value)}</td>
          <td class="mono quote-cell">${escapeHtml(c.quote)}</td>
          <td>${fmtLocatorPart(c.locator.page)}</td>
          <td class="mono">${fmtCharRange(c.locator.char_start, c.locator.char_end)}</td>
          <td><span class="badge badge-pass">PASS</span></td>
        </tr>`,
    )
    .join('');
  return `
    <table class="kept-table">
      <thead>
        <tr>
          <th>id</th>
          <th>ontology_key</th>
          <th>subject</th>
          <th>value</th>
          <th>quote</th>
          <th>page</th>
          <th>char range</th>
          <th>verification</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDroppedTable(dropped: InspectReportView['dropped']): string {
  if (dropped.length === 0) {
    return '<p class="empty-note dropped-empty">none dropped</p>';
  }
  const rows = dropped
    .map(
      (d) => `
        <tr>
          <td>${escapeHtml(d.claim.subject)}</td>
          <td>${escapeHtml(d.claim.value)}</td>
          <td class="mono quote-cell">${escapeHtml(d.claim.quote)}</td>
          <td>${fmtLocatorPart(d.claim.page)}</td>
          <td>${escapeHtml(d.reason)}</td>
        </tr>`,
    )
    .join('');
  return `
    <table class="dropped-table">
      <thead>
        <tr>
          <th>subject</th>
          <th>value</th>
          <th>quote (not found in source)</th>
          <th>page</th>
          <th>reason</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSource(report: InspectReportView): string {
  const { source, transcript, kept, dropped } = report;
  return `
    <section class="source-block">
      <h2 class="source-heading">
        ${escapeHtml(source.title)}
        <span class="source-meta">kind: ${escapeHtml(source.kind)} · id: ${escapeHtml(source.id)}</span>
      </h2>

      ${
        report.notice === null
          ? ''
          : `<p class="source-notice">${escapeHtml(report.notice)}</p>`
      }

      <div class="report-meta">
        <span class="pill">mode: ${escapeHtml(report.mode)}</span>
        ${report.retried ? '<span class="pill pill-retried">retried once</span>' : ''}
        ${
          report.usage
            ? `<span class="pill">input tokens: ${escapeHtml(String(report.usage.inputTokens))}</span>
               <span class="pill">output tokens: ${escapeHtml(String(report.usage.outputTokens))}</span>
               <span class="pill pill-cache">cache-read tokens: ${escapeHtml(String(report.usage.cacheReadTokens))}</span>`
            : ''
        }
      </div>

      <h3 class="subheading">Kept — verified against the transcript</h3>
      ${renderKeptTable(kept)}

      <div class="dropped-section">
        <h3 class="subheading dropped-heading">Dropped — quote not found in source</h3>
        ${renderDroppedTable(dropped)}
      </div>

      <details class="transcript-details">
        <summary>Show transcript (${escapeHtml(String(transcript.length))} characters)</summary>
        <pre class="mono transcript-block">${escapeHtml(transcript)}</pre>
      </details>
    </section>`;
}

function renderSummaryBar(
  reports: readonly InspectReportView[],
  conflicts: readonly InspectConflictView[],
): string {
  const totalSources = reports.length;
  const totalKept = reports.reduce((sum, r) => sum + r.kept.length, 0);
  const totalDropped = reports.reduce((sum, r) => sum + r.dropped.length, 0);
  const totalExtracted = reports.reduce((sum, r) => sum + r.stats.claims_extracted, 0);
  const anyRetried = reports.some((r) => r.retried);
  const modes = Array.from(new Set(reports.map((r) => r.mode)));

  return `
    <section class="summary-bar">
      <div class="summary-stat">
        <span class="summary-number">${escapeHtml(String(totalSources))}</span>
        <span class="summary-label">sources</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number">${escapeHtml(String(totalExtracted))}</span>
        <span class="summary-label">claims extracted</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number summary-number-pass">${escapeHtml(String(totalKept))}</span>
        <span class="summary-label">verified (kept)</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number summary-number-drop">${escapeHtml(String(totalDropped))}</span>
        <span class="summary-label">dropped</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number summary-number-conflict">${escapeHtml(String(conflicts.length))}</span>
        <span class="summary-label">disagreements</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number-small">${modes.map(escapeHtml).join(', ') || '—'}</span>
        <span class="summary-label">mode(s)</span>
      </div>
      ${anyRetried ? '<div class="summary-retried-flag">One or more sources were retried once before this result.</div>' : ''}
    </section>`;
}

function renderConflictCard(conflict: InspectConflictView): string {
  const rows = conflict.claims
    .map(
      (c) => `
        <tr>
          <td>${escapeHtml(c.source_title)}</td>
          <td>${c.asserted_at === null ? '—' : escapeHtml(c.asserted_at)}</td>
          <td>${escapeHtml(c.value)}</td>
          <td class="mono quote-cell">${escapeHtml(c.quote)}</td>
        </tr>`,
    )
    .join('');

  return `
    <div class="conflict-card">
      <div class="conflict-meta">
        <span class="pill">subject: ${escapeHtml(conflict.subject)}</span>
        <span class="pill">ontology_key: ${escapeHtml(conflict.ontology_key)}</span>
        <span class="pill">resolution: ${escapeHtml(conflict.resolution)}</span>
        <span class="pill">id: ${escapeHtml(conflict.id)}</span>
      </div>
      <p class="conflict-question">${escapeHtml(conflict.generated_question)}</p>
      <table class="conflict-table">
        <thead>
          <tr>
            <th>source</th>
            <th>asserted</th>
            <th>value</th>
            <th>quote</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * The "Disagreements between sources" section — placed above the per-source
 * tables so it is the first thing a reviewer sees. Every value interpolated
 * here (subject, question, resolution, ids, dates, values, quotes, titles)
 * is untrusted transcript-derived text and goes through `escapeHtml`.
 *
 * `id="conflicts"` is not decoration. Tests that need to assert something
 * about THIS section scope to it by id; the previous approach sliced the page
 * between the heading text and the next `source-block` marker, which silently
 * made the assertion depend on nothing else ever being rendered in between.
 * That is a test dictating page layout, and it did: it is why the timeline
 * section was originally appended after the per-source blocks.
 */
function renderConflictsSection(conflicts: readonly InspectConflictView[]): string {
  const body =
    conflicts.length === 0
      ? '<p class="empty-note">No disagreements were detected between the sources shown below.</p>'
      : conflicts.map(renderConflictCard).join('');

  return `
    <section class="conflicts-section" id="conflicts">
      <h2 class="conflicts-heading">Disagreements between sources</h2>
      <p class="conflicts-explainer">
        A disagreement here is never resolved automatically. This page shows what each
        source says and the question that follows from the disagreement — a question a
        clinician can answer. It does not decide which source is right.
      </p>
      ${body}
    </section>`;
}

const STYLE = `
  :root {
    --paper: #FAF7F2;
    --ink: #1C1B1A;
    --ink-muted: #55504A;
    --hairline: #E7E1D8;
    --brand: #14453D;
    --citation-bg: #E4EFEC;
    --citation-mid: #A9C9C2;
    --citation-ink: #14453D;
    --unverified-bg: #FBEADD;
    --unverified-mid: #E8B98C;
    --unverified-ink: #9A4A15;
  }
  * { box-sizing: border-box; }
  html { font-size: 18px; }
  body {
    margin: 0;
    padding: 3rem 2rem 6rem;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    line-height: 1.5;
  }
  .mono {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }
  .page-title {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    color: var(--brand);
  }
  .explainer {
    max-width: 60rem;
    color: var(--ink-muted);
    font-size: 1rem;
    margin: 0 0 2rem;
    border-left: 4px solid var(--citation-mid);
    background: var(--citation-bg);
    padding: 1rem 1.25rem;
    border-radius: 4px;
  }
  .summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    align-items: center;
    background: white;
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 1.5rem 2rem;
    margin-bottom: 3rem;
  }
  .summary-stat {
    display: flex;
    flex-direction: column;
    min-width: 6rem;
  }
  .summary-number {
    font-size: 2rem;
    font-weight: 700;
    color: var(--ink);
  }
  .summary-number-small {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .summary-number-pass { color: var(--citation-ink); }
  .summary-number-drop { color: var(--unverified-ink); }
  .summary-number-conflict { color: var(--brand); }
  .summary-label {
    font-size: 0.8rem;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .page-notice, .source-notice {
    background: var(--unverified-bg);
    border: 1px solid var(--unverified-mid);
    color: var(--unverified-ink);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin: 0 0 1.5rem;
    max-width: 60rem;
    font-weight: 600;
  }
  .summary-retried-flag {
    flex-basis: 100%;
    background: var(--unverified-bg);
    color: var(--unverified-ink);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .empty-page-note {
    background: white;
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 2rem;
    color: var(--ink-muted);
  }
  .conflicts-section {
    background: white;
    border: 2px solid var(--brand);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 3rem;
  }
  .conflicts-heading {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
    color: var(--brand);
  }
  .conflicts-explainer {
    max-width: 60rem;
    color: var(--ink-muted);
    font-size: 0.95rem;
    margin: 0 0 1.5rem;
  }
  .conflict-card {
    background: var(--citation-bg);
    border: 1px solid var(--citation-mid);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
  }
  .conflict-card:last-child { margin-bottom: 0; }
  .conflict-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .conflict-question {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--brand);
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    background: white;
    border-left: 4px solid var(--brand);
    border-radius: 4px;
  }
  .conflict-table {
    background: white;
    border-radius: 4px;
    overflow: hidden;
  }
  .source-block {
    background: white;
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2.5rem;
  }
  .source-heading {
    font-size: 1.4rem;
    margin: 0 0 0.25rem;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.75rem;
  }
  .source-meta {
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--ink-muted);
  }
  .report-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem 0 1.5rem;
  }
  .pill {
    background: var(--hairline);
    color: var(--ink-muted);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
  }
  .pill-retried {
    background: var(--unverified-bg);
    color: var(--unverified-ink);
  }
  .pill-cache {
    background: var(--citation-bg);
    color: var(--citation-ink);
  }
  .subheading {
    font-size: 1.05rem;
    margin: 1.5rem 0 0.75rem;
    color: var(--ink);
  }
  .dropped-heading { color: var(--unverified-ink); }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--hairline);
    vertical-align: top;
  }
  th {
    color: var(--ink-muted);
    font-weight: 600;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .quote-cell {
    max-width: 28rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .badge {
    display: inline-block;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .badge-pass {
    background: var(--citation-bg);
    color: var(--citation-ink);
    border: 1px solid var(--citation-mid);
  }
  .dropped-section {
    background: var(--unverified-bg);
    border: 1px solid var(--unverified-mid);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    margin-top: 1.5rem;
  }
  .dropped-section table th {
    color: var(--unverified-ink);
  }
  .dropped-section table td, .dropped-section table th {
    border-bottom: 1px solid var(--unverified-mid);
  }
  .empty-note {
    color: var(--ink-muted);
    font-style: italic;
    margin: 0.5rem 0;
  }
  .dropped-empty {
    color: var(--unverified-ink);
    font-style: normal;
    font-weight: 600;
  }
  .transcript-details {
    margin-top: 1.5rem;
    border-top: 1px solid var(--hairline);
    padding-top: 1rem;
  }
  .transcript-details summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--brand);
  }
  .transcript-block {
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--paper);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: 1rem;
    margin-top: 0.75rem;
    max-height: 24rem;
    overflow-y: auto;
    font-size: 0.85rem;
  }
  .facts-section {
    background: white;
    border: 2px solid var(--brand);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 3rem;
  }
  .facts-heading {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
    color: var(--brand);
  }
  .facts-explainer {
    max-width: 60rem;
    color: var(--ink-muted);
    font-size: 0.95rem;
    margin: 0 0 1.5rem;
  }
  .fact-subject-group {
    margin-bottom: 2rem;
  }
  .fact-subject-group:last-child { margin-bottom: 0; }
  .fact-subject-heading {
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
    color: var(--ink);
    text-transform: capitalize;
  }
  .fact-card {
    background: var(--citation-bg);
    border: 1px solid var(--citation-mid);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  .fact-card:last-child { margin-bottom: 0; }
  .fact-card-superseded {
    background: var(--hairline);
    border-color: var(--ink-muted);
    opacity: 0.85;
  }
  .fact-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .pill-superseded {
    background: var(--unverified-bg);
    color: var(--unverified-ink);
    font-weight: 600;
  }
  .fact-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--brand);
    margin: 0 0 0.75rem;
    padding: 0.6rem 1rem;
    background: white;
    border-left: 4px solid var(--brand);
    border-radius: 4px;
  }
  .fact-value-superseded {
    text-decoration: line-through;
    color: var(--ink-muted);
    border-left-color: var(--ink-muted);
    font-weight: 600;
  }
  .fact-superseded-note {
    color: var(--ink-muted);
    font-size: 0.85rem;
    font-style: italic;
    margin: 0 0 0.75rem;
  }
  .fact-supporting-table {
    background: white;
    border-radius: 4px;
    overflow: hidden;
  }
  .badge-role {
    background: var(--hairline);
    color: var(--ink-muted);
    border: 1px solid var(--ink-muted);
  }
  .badge-role-instruction {
    background: var(--citation-bg);
    color: var(--citation-ink);
    border-color: var(--citation-mid);
  }
  .badge-role-observation {
    background: var(--unverified-bg);
    color: var(--unverified-ink);
    border-color: var(--unverified-mid);
  }
`;

/**
 * Render the full `/api/debug/inspect` page: a standalone HTML document, no
 * external requests, styled inline, safe against a hostile transcript or
 * quote because every interpolation goes through `escapeHtml`.
 */
export function renderInspectPage(
  reports: readonly InspectReportView[],
  pageNotice: string | null = null,
  conflicts: readonly InspectConflictView[] = [],
  facts: readonly InspectFactView[] = [],
): string {
  // Interpolated, not spliced into the finished document by the caller: a
  // String.replace() on the rendered page would treat `$&` in the note as a
  // substitution pattern, and escapeHtml does not neutralise `$`.
  const notice =
    pageNotice === null ? '' : `<p class="page-notice">${escapeHtml(pageNotice)}</p>`;

  const body =
    reports.length === 0
      ? `
        <h1 class="page-title">Verity — extraction inspector</h1>
        ${notice}
        <div class="empty-page-note">No sources have been extracted yet. Run the pipeline against at least one source to see claims here.</div>`
      : `
        <h1 class="page-title">Verity — extraction inspector</h1>
        ${notice}
        <p class="explainer">
          Every quote shown under a source below was checked to be a literal, word-for-word
          match inside that source's own text. Anything that failed that check was dropped
          and appears only in the red section for its source — a dropped claim is never
          shown to a user anywhere else in the product.
        </p>
        ${/* Reading order, chosen for the reader and not for a test:
             counts -> the disagreement -> why the timeline looks like that ->
             the raw per-source evidence. The two reconciled sections belong
             together and above the per-source blocks, because the blocks are
             an appendix: full transcripts and every kept/dropped row, which a
             reviewer scrolls into only once a derived claim looks wrong. The
             timeline sits directly under the conflict it explains — the
             question "why are only three of the four furosemide claims in
             that conflict?" is answered by the struck-through March period,
             and burying it below four transcript dumps meant nobody ever
             connected the two. */ ''}
        ${renderSummaryBar(reports, conflicts)}
        ${renderConflictsSection(conflicts)}
        ${renderFactsSection(facts)}
        ${reports.map(renderSource).join('')}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verity — extraction inspector</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}
