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

import type { Assertion, Conflict, Fact, Slot } from '@/lib/contracts';

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
 * A structural view of one generated `Artifact`, joined against its
 * `ArtifactTemplate` for section/slot metadata — deliberately independent of
 * `lib/ai/artifacts.ts` / `lib/ai/templates.ts` (same pattern as the other
 * views in this file) so this module keeps no compile-time coupling to the
 * pipeline. Satisfied structurally by whatever the route builds from the
 * real `Artifact` + `ArtifactTemplate`.
 *
 * `_artifactSlotViewMatchesContract` below ties the assertion-derived slot
 * fields to the frozen `Assertion` contract and the template-derived fields
 * to the frozen `Slot` contract, the same way `_factViewMatchesContract` and
 * `_viewCoversConflictContract` do above.
 */
export interface InspectArtifactView {
  readonly template_key: string;
  readonly title: string;
  readonly audience: string;
  readonly sections: ReadonlyArray<{
    readonly key: string;
    readonly title: string;
    readonly slots: ReadonlyArray<{
      readonly slot_key: string;
      readonly label: string;
      readonly renderer: string;
      readonly text: string;
      /** The frozen template's fall-back copy, read live at render time rather
       *  than stored in `Assertion.text`. Rendered only when the slot fell
       *  through; never mixed with composed evidence text. */
      readonly gap_prompt: string | null;
      /** The resolved facts behind this slot, structured — what the `list` and
       *  `table` renderers lay out, instead of re-splitting `text`. */
      readonly values: ReadonlyArray<{
        readonly subject: string;
        readonly value: string;
        readonly valid_from: string | null;
        readonly status: string;
      }>;
      /** `Conflict.generated_question` for any resolved fact that is part of a
       *  disagreement — what the `conflict` renderer leads with. Never the
       *  conflicting claims themselves: those are reachable from superseded
       *  claim ids and must not resurface as current evidence here. */
      readonly conflict_questions: readonly string[];
      /** Level words present in this slot's evidence that the official DST form
       *  does not offer for this domain (three domains cap at High; altered
       *  states of consciousness has no Severe). Rendered as a warning, never
       *  silently presented as a level. */
      readonly form_invalid_levels: readonly string[];
      readonly citation_verified: boolean;
      /** Empty when the slot fell through to its gap prompt, or when the slot
       *  is verbatim copy (its evidence is not a resolved `Fact`). */
      readonly citations: ReadonlyArray<{
        readonly quote: string;
        readonly source_title: string;
      }>;
      /** A structural slot is neither evidence-backed nor missing: it is
       *  copy this pipeline may assert without a fact behind it (Lane C's
       *  fixed wording, or a verbatim framework citation), and a reader must
       *  not mistake it for either `filled` or `gap_prompt`. Derived from
       *  `BuildArtifactResult.structuralAssertions` (`lib/ai/artifacts.ts`),
       *  never re-derived from a slot-key list. */
      readonly state: 'filled' | 'verbatim_copy' | 'gap_prompt';
      /** The framework citation's `ref`, for a `verbatim_copy` slot filled
       *  from `FRAMEWORK_CITATIONS`; `null` for Lane C copy (no `ref` to
       *  show) and for every other state. */
      readonly verbatim_attribution: string | null;
    }>;
  }>;
  readonly counts: {
    readonly slots_total: number;
    readonly filled: number;
    readonly verbatim_copy: number;
    readonly gap_prompted: number;
    readonly omitted: number;
  };
  /** Every slot the template defines that produced no assertion, NAMED. A bare
   *  "3 omitted" count let the CHC pack's cover page and method section vanish
   *  without trace; a reader could not tell a missing scope statement from an
   *  empty clinical domain. Structurally satisfied by `SlotOmission[]` from
   *  `lib/ai/artifacts.ts` — if `SlotOmissionReason` ever gains a member, the
   *  route stops compiling against this union. */
  readonly omissions: ReadonlyArray<{
    readonly slot_key: string;
    readonly label: string;
    readonly section_title: string;
    readonly reason: 'awaiting_fixed_copy' | 'no_evidence';
  }>;
}

type ArtifactSlotView = InspectArtifactView['sections'][number]['slots'][number];

/**
 * Load-bearing, typecheck-time: the assertion-derived slot fields
 * (`slot_key`, `text`, `citation_verified`) must stay assignable from the
 * frozen `Assertion` contract, and the template-derived fields (`label`,
 * `renderer`) from the frozen `Slot` contract. Renaming `Assertion.text` or
 * narrowing `Slot.renderer` would otherwise leave this view compiling
 * happily while quietly rendering nothing for it.
 */
type ArtifactAssertionDerivedKeys = 'slot_key' | 'text' | 'citation_verified';
type _ArtifactSlotViewMatchesContract =
  Pick<ArtifactSlotView, ArtifactAssertionDerivedKeys> extends Pick<Assertion, ArtifactAssertionDerivedKeys>
    ? Pick<ArtifactSlotView, 'label'> extends Pick<Slot, 'label'>
      ? Slot['renderer'] extends ArtifactSlotView['renderer']
        ? true
        : never
      : never
    : never;
const _artifactSlotViewMatchesContract: _ArtifactSlotViewMatchesContract = true;
void _artifactSlotViewMatchesContract;

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

function renderArtifactCitation(
  c: InspectArtifactView['sections'][number]['slots'][number]['citations'][number],
): string {
  return `
    <li class="artifact-citation">
      <span class="artifact-citation-source">${escapeHtml(c.source_title)}</span>
      <blockquote class="mono artifact-citation-quote">${escapeHtml(c.quote)}</blockquote>
    </li>`;
}

type ArtifactSlotValue = ArtifactSlotView['values'][number];

/** A value's own words, never re-worded: '<subject>: <value>' where the
 *  subject and value both come verbatim from the reconciled `Fact`. */
function renderValueList(values: readonly ArtifactSlotValue[]): string {
  const items = values
    .map(
      (v) => `
      <li class="artifact-value-item">
        <span class="artifact-value-subject">${escapeHtml(v.subject)}</span>
        <span class="artifact-value-text">${escapeHtml(v.value)}</span>
      </li>`,
    )
    .join('');
  return `<ul class="artifact-slot-list">${items}</ul>`;
}

function renderValueTable(values: readonly ArtifactSlotValue[]): string {
  const rows = values
    .map(
      (v) => `
        <tr>
          <td>${escapeHtml(v.subject)}</td>
          <td>${escapeHtml(v.value)}</td>
          <td>${v.valid_from === null ? '—' : escapeHtml(v.valid_from)}</td>
          <td>${escapeHtml(v.status)}</td>
        </tr>`,
    )
    .join('');
  return `
      <table class="artifact-slot-table">
        <thead>
          <tr><th>Item</th><th>What the record says</th><th>Recorded from</th><th>Agreement</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
}

/** The `quote` renderer's body IS the verbatim citations — the slot exists to
 *  show the source's own wording, so composed text would defeat it. */
function renderQuoteBody(slot: ArtifactSlotView): string {
  return `
        <p class="artifact-slot-evidence-label">Verbatim from the record:</p>
        <ul class="artifact-citations">${slot.citations.map(renderArtifactCitation).join('')}</ul>`;
}

/** The `conflict` renderer leads with the question the disagreement raises,
 *  then the differing values — not with a flattened '<subject>: Disputed — 3
 *  sources give different answers' line, which reads as a finding rather than
 *  as an open question. */
function renderConflictBody(slot: ArtifactSlotView): string {
  const questions = slot.conflict_questions
    .map((q) => `<p class="artifact-slot-conflict-question">${escapeHtml(q)}</p>`)
    .join('');
  return `${questions}${renderValueList(slot.values)}`;
}

/**
 * The slot's declared `renderer` decides the shape. Ignoring it — rendering
 * every slot as one paragraph of '<subject>: <value>' lines — meant a `table`
 * slot, a `list` slot and a `quote` slot all came out identical, and the pack
 * did not resemble the form an assessor reads it against. Unknown renderer
 * values fall back to prose rather than rendering nothing.
 */
function renderFilledBody(slot: ArtifactSlotView): string {
  if (slot.values.length === 0) {
    return `<p class="artifact-slot-text">${escapeHtml(slot.text)}</p>`;
  }
  switch (slot.renderer) {
    case 'list':
      return renderValueList(slot.values);
    case 'table':
      return renderValueTable(slot.values);
    case 'quote':
      return renderQuoteBody(slot);
    case 'conflict':
      return renderConflictBody(slot);
    default:
      return `<p class="artifact-slot-text">${escapeHtml(slot.text)}</p>`;
  }
}

function renderLevelWarning(slot: ArtifactSlotView): string {
  if (slot.form_invalid_levels.length === 0) return '';
  const names = slot.form_invalid_levels.map(escapeHtml).join(', ');
  return `
        <p class="artifact-slot-level-warning" data-form-invalid-levels="${escapeHtml(String(slot.form_invalid_levels.length))}">
          The record uses a level this domain does not have on the official Decision Support Tool form: ${names}. Shown above as the record's own words, not as a level for this pack.
        </p>`;
}

/**
 * A `verbatim_copy` slot's body: fixed wording this pipeline is allowed to
 * assert without a fact behind it — Lane C's copy (`lib/copy/safety.ts`) or a
 * verbatim National Framework citation (`lib/detectors/well_managed.ts`).
 * Labelled distinctly from both `filled` ("Evidence-backed — from the
 * record") and `gap_prompt` ("No evidence yet") so a reader cannot mistake
 * fixed copy for either. `slot.text` here is Lane C's own copy or a
 * framework citation and is rendered as-is — it was never routed through
 * `filterOutput` upstream (`lib/ai/artifacts.ts`'s `STRUCTURAL_COPY_SOURCES`
 * / `FRAMEWORK_CITATION_SOURCES` paths bypass it on purpose: the persistent
 * banner contains "urgent" and "999" by design) — but it is still escaped
 * here, like every other interpolated value on this page.
 */
function renderVerbatimBody(slot: ArtifactSlotView): string {
  const attribution =
    slot.verbatim_attribution === null
      ? ''
      : `<p class="artifact-slot-verbatim-attribution">Source: ${escapeHtml(slot.verbatim_attribution)}</p>`;
  return `
        <p class="artifact-slot-verbatim-label">Fixed wording — not evidence from the record</p>
        <p class="artifact-slot-text">${escapeHtml(slot.text)}</p>
        ${attribution}`;
}

const STATE_CLASS: Readonly<Record<ArtifactSlotView['state'], string>> = {
  filled: 'artifact-slot-filled',
  verbatim_copy: 'artifact-slot-verbatim',
  gap_prompt: 'artifact-slot-gap',
};

function renderArtifactSlot(slot: ArtifactSlotView): string {
  const stateClass = STATE_CLASS[slot.state];
  // The `quote` renderer's body already IS the citation list; repeating it
  // below would show every quote twice.
  const evidence =
    slot.renderer === 'quote'
      ? ''
      : `
        <p class="artifact-slot-evidence-label">Evidence-backed — from the record:</p>
        <ul class="artifact-citations">${slot.citations.map(renderArtifactCitation).join('')}</ul>`;

  const body =
    slot.state === 'filled'
      ? `${renderFilledBody(slot)}${renderLevelWarning(slot)}${evidence}`
      : slot.state === 'verbatim_copy'
        ? renderVerbatimBody(slot)
        : `
        <p class="artifact-slot-gap-label">No evidence yet — what to ask for</p>
        <p class="artifact-slot-text artifact-slot-gap-text">${escapeHtml(slot.gap_prompt ?? '')}</p>`;

  return `
    <div class="artifact-slot ${stateClass}" data-slot-key="${escapeHtml(slot.slot_key)}" data-renderer="${escapeHtml(slot.renderer)}" data-state="${escapeHtml(slot.state)}" data-citations="${escapeHtml(String(slot.citations.length))}">
      <p class="artifact-slot-label">${escapeHtml(slot.label)}</p>
      ${body}
    </div>`;
}

function renderArtifactSection(section: InspectArtifactView['sections'][number]): string {
  return `
    <div class="artifact-section">
      <h4 class="artifact-section-heading">${escapeHtml(section.title)}</h4>
      ${section.slots.map(renderArtifactSlot).join('')}
    </div>`;
}

/** Why a named slot is absent. Lane A's own words about its own behaviour —
 *  not clinical copy, and not a substitute for the fixed copy the slot itself
 *  is waiting for. */
const OMISSION_EXPLANATION: Record<InspectArtifactView['omissions'][number]['reason'], string> = {
  awaiting_fixed_copy:
    'Not evidence-driven: this slot needs fixed wording (a cover statement, a scope statement, a provenance note), not facts from the record. That wording is not this pipeline’s to write and it will not be invented here, so the slot is left out and named rather than filled with a guess.',
  no_evidence:
    'Evidence-driven, but nothing in the record matches it and the template offers no fall-back prompt for it.',
};

/**
 * The omitted slots, listed by name. This block is the fix for a real defect:
 * the CHC pack's cover page and method section produced no assertions and
 * disappeared behind a bare “3 omitted”, so a reviewer could not tell three
 * missing structural pages from three empty clinical domains. An evidence pack
 * arriving at an ICB panel without a statement of who it concerns, without a
 * scope statement and without a provenance section is a serious defect; it may
 * only ever be an EXPLICIT one.
 */
function renderArtifactOmissions(artifact: InspectArtifactView): string {
  const { omissions } = artifact;
  if (omissions.length === 0) {
    return '<p class="artifact-omissions-none" data-omissions="0">Nothing was left out: every slot in this template produced either evidence or a prompt for the missing document.</p>';
  }

  const items = omissions
    .map(
      (o) => `
        <li class="artifact-omission" data-omitted-slot-key="${escapeHtml(o.slot_key)}" data-omission-reason="${escapeHtml(o.reason)}">
          <span class="artifact-omission-name">${escapeHtml(o.section_title)} — ${escapeHtml(o.label)}</span>
          <span class="artifact-omission-why">${escapeHtml(OMISSION_EXPLANATION[o.reason])}</span>
        </li>`,
    )
    .join('');

  return `
      <div class="artifact-omissions" data-omissions="${escapeHtml(String(omissions.length))}">
        <h4 class="artifact-omissions-heading">Left out of this document (${escapeHtml(String(omissions.length))}) — named, not hidden</h4>
        <ul class="artifact-omissions-list">${items}</ul>
      </div>`;
}

function renderArtifactCard(artifact: InspectArtifactView): string {
  const { counts } = artifact;
  const countLine =
    `${counts.slots_total} slots · ${counts.filled} filled from evidence · ` +
    `${counts.verbatim_copy} fixed wording (not evidence) · ` +
    `${counts.gap_prompted} asking for a document · ${counts.omitted} left out (each one named below)`;
  return `
    <div class="artifact-card" data-template-key="${escapeHtml(artifact.template_key)}" data-slots-total="${escapeHtml(String(counts.slots_total))}" data-filled="${escapeHtml(String(counts.filled))}" data-verbatim-copy="${escapeHtml(String(counts.verbatim_copy))}" data-gap-prompted="${escapeHtml(String(counts.gap_prompted))}" data-omitted="${escapeHtml(String(counts.omitted))}">
      <h3 class="artifact-title">${escapeHtml(artifact.title)}</h3>
      <p class="artifact-audience">For: ${escapeHtml(artifact.audience)}</p>
      <p class="artifact-count-line">${escapeHtml(countLine)}</p>
      ${renderArtifactOmissions(artifact)}
      ${artifact.sections.map(renderArtifactSection).join('')}
    </div>`;
}

/**
 * "Generated documents" — the artefact-rendering view. Placed directly after
 * the timeline it is built from and before the per-source appendix: the
 * timeline explains WHY the fact set looks the way it does, and this section
 * shows what gets produced FROM that same fact set through a fixed template.
 * Reading order stays counts -> disagreement -> timeline -> what gets
 * generated -> raw evidence appendix.
 *
 * Every interpolated value — template title, audience, slot label, composed
 * text, gap prompt text, quotes, source titles — goes through `escapeHtml`.
 * A slot's gap-prompt copy comes verbatim from the frozen template in
 * `fixtures/templates.json`; nothing in this function invents replacement
 * prose for it.
 */
function renderArtifactsSection(artifacts: readonly InspectArtifactView[]): string {
  const body =
    artifacts.length === 0
      ? '<p class="empty-note">No artefacts have been generated yet.</p>'
      : artifacts.map(renderArtifactCard).join('');

  return `
    <section class="artifacts-section" id="artifacts">
      <h2 class="artifacts-heading">Generated documents</h2>
      <p class="artifacts-explainer">
        Each document below is built from the same set of facts, filled through a
        fixed template. A slot with no supporting evidence shows what document to
        ask for instead of a blank space — this product will not write a sentence
        it cannot back with a verbatim quote from something already in the record.
      </p>
      ${body}
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
  .artifacts-section {
    background: white;
    border: 2px solid var(--brand);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 3rem;
  }
  .artifacts-heading {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
    color: var(--brand);
  }
  .artifacts-explainer {
    max-width: 60rem;
    color: var(--ink-muted);
    font-size: 0.95rem;
    margin: 0 0 1.5rem;
  }
  .artifact-card {
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  .artifact-card:last-child { margin-bottom: 0; }
  .artifact-title {
    font-size: 1.2rem;
    margin: 0 0 0.25rem;
    color: var(--brand);
  }
  .artifact-audience {
    color: var(--ink-muted);
    font-size: 0.9rem;
    margin: 0 0 0.5rem;
  }
  .artifact-count-line {
    font-weight: 600;
    margin: 0 0 1.25rem;
    color: var(--ink);
  }
  .artifact-section { margin-bottom: 1.5rem; }
  .artifact-section:last-child { margin-bottom: 0; }
  .artifact-section-heading {
    font-size: 1rem;
    margin: 0 0 0.75rem;
    color: var(--ink);
    text-transform: capitalize;
  }
  .artifact-slot {
    border-radius: 6px;
    padding: 0.9rem 1.1rem;
    margin-bottom: 0.75rem;
  }
  .artifact-slot:last-child { margin-bottom: 0; }
  .artifact-slot-label {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--ink-muted);
    margin: 0 0 0.5rem;
  }
  .artifact-slot-filled {
    background: var(--citation-bg);
    border: 1px solid var(--citation-mid);
  }
  .artifact-slot-text {
    margin: 0 0 0.5rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .artifact-slot-evidence-label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--citation-ink);
    margin: 0 0 0.4rem;
  }
  .artifact-citations { list-style: none; margin: 0; padding: 0; }
  .artifact-citation {
    background: white;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .artifact-citation:last-child { margin-bottom: 0; }
  .artifact-citation-source {
    display: block;
    font-size: 0.78rem;
    color: var(--ink-muted);
    margin-bottom: 0.25rem;
  }
  .artifact-citation-quote {
    margin: 0;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .artifact-slot-gap {
    background: var(--paper);
    border: 1px dashed var(--hairline);
  }
  .artifact-slot-verbatim {
    background: white;
    border: 1px solid var(--ink-muted);
  }
  .artifact-slot-verbatim-label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink-muted);
    margin: 0 0 0.4rem;
  }
  .artifact-slot-verbatim-attribution {
    font-size: 0.8rem;
    color: var(--ink-muted);
    font-style: italic;
    margin: 0.4rem 0 0;
  }
  .artifact-slot-gap-label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink-muted);
    margin: 0 0 0.4rem;
  }
  .artifact-slot-gap-text {
    color: var(--ink-muted);
    font-style: italic;
  }
  .artifact-slot-list { margin: 0 0 0.5rem; padding-left: 1.1rem; }
  .artifact-value-item { margin-bottom: 0.3rem; }
  .artifact-value-subject { font-weight: 600; margin-right: 0.4rem; }
  .artifact-slot-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin: 0 0 0.6rem;
    background: white;
  }
  .artifact-slot-table th,
  .artifact-slot-table td {
    border: 1px solid var(--hairline);
    padding: 0.35rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }
  .artifact-slot-conflict-question {
    margin: 0 0 0.5rem;
    font-weight: 600;
    color: var(--brand);
  }
  .artifact-slot-level-warning {
    margin: 0 0 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    background: var(--unverified-bg);
    border: 1px solid var(--unverified-mid);
    color: var(--unverified-ink);
    font-size: 0.85rem;
  }
  .artifact-omissions {
    background: var(--unverified-bg);
    border: 1px solid var(--unverified-mid);
    border-radius: 6px;
    padding: 0.9rem 1.1rem;
    margin-bottom: 1.25rem;
  }
  .artifact-omissions-heading {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: var(--unverified-ink);
  }
  .artifact-omissions-none {
    color: var(--ink-muted);
    font-size: 0.88rem;
    margin: 0 0 1.25rem;
  }
  .artifact-omissions-list { list-style: none; margin: 0; padding: 0; }
  .artifact-omission { margin-bottom: 0.6rem; }
  .artifact-omission:last-child { margin-bottom: 0; }
  .artifact-omission-name { display: block; font-weight: 600; font-size: 0.88rem; }
  .artifact-omission-why { display: block; font-size: 0.83rem; color: var(--ink-muted); }
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
  artifacts: readonly InspectArtifactView[] = [],
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
             what gets generated from that same fact set -> the raw per-source
             evidence. The three reconciled sections belong together and above
             the per-source blocks, because the blocks are an appendix: full
             transcripts and every kept/dropped row, which a reviewer scrolls
             into only once a derived claim looks wrong. The timeline sits
             directly under the conflict it explains — the question "why are
             only three of the four furosemide claims in that conflict?" is
             answered by the struck-through March period. The artefacts
             section sits directly under the timeline, because it is built
             from the very facts the timeline just showed — the same fact set
             feeding two different templates is the "templates are data"
             proof, and it belongs next to the facts it proves, not buried
             below four transcript dumps. */ ''}
        ${renderSummaryBar(reports, conflicts)}
        ${renderConflictsSection(conflicts)}
        ${renderFactsSection(facts)}
        ${renderArtifactsSection(artifacts)}
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
