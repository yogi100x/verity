/**
 * components/data/dal.ts
 *
 * THE ONLY DATA ACCESS LAYER for Lane B. Every screen and component gets its
 * data exclusively from the functions below — never a raw import of
 * fixtures/*.json, never a raw query. When Lane A lands a real API this file
 * is the only one that changes; nothing downstream should notice.
 *
 * fixtures/margaret.json, fixtures/maya.json, and fixtures/templates.json are
 * parsed against the frozen contract exactly once, at module load, and
 * cached in `CASE_REGISTRY`. Everything below only *derives* views from a
 * parsed snapshot — nothing here mutates it.
 *
 * Every view function that resolves a fact/claim/gap/conflict to evidence
 * fails loud (throws) if the reference doesn't resolve. A bare, sourceless
 * statement is the one thing the design system forbids (docs/design.md §10),
 * so it is better to crash in dev than silently render one.
 *
 * ---- Active-case selection (stretch S1 — Maya coda) ----
 *
 * Every selector below takes an optional trailing `caseId` and defaults to
 * `'margaret'` when omitted. That default is deliberate and load-bearing:
 * every call site that existed before this stretch calls these functions
 * with no `caseId` argument, and must keep resolving to Margaret's case
 * exactly as before. Server Component pages resolve the *active* case from
 * the request cookie via `components/data/activeCase.ts` and pass it in
 * explicitly; nothing in this file reads cookies itself, which is what lets
 * client components (e.g. the upload flow) keep importing it safely.
 */

import { z } from "zod";
import {
  ArtifactTemplate,
  CaseSnapshot,
  type Claim,
  type DatePrecision,
  type Fact,
  type Gap,
  type Locator,
  type Source,
  type SourceKind,
  type TemplateKey,
} from "@/lib/contracts";
import margaretFixture from "../../fixtures/margaret.json";
import mayaFixture from "../../fixtures/maya.json";
import templatesFixture from "../../fixtures/templates.json";

/* ============================ module-level parse ============================ */

/** The set of seeded accounts. Adding a third demo account is one new entry
 *  in `CASE_REGISTRY` below plus a fixture file — no selector changes. */
export type CaseId = "margaret" | "maya";

export const DEFAULT_CASE_ID: CaseId = "margaret";

type CaseIndex = {
  snapshot: CaseSnapshot;
  sourcesById: Map<string, Source>;
  claimsById: Map<string, Claim>;
  factsById: Map<string, Fact>;
};

function buildIndex(raw: unknown): CaseIndex {
  const snapshot = CaseSnapshot.parse(raw);
  return {
    snapshot,
    sourcesById: new Map(snapshot.sources.map((s) => [s.id, s])),
    claimsById: new Map(snapshot.claims.map((c) => [c.id, c])),
    factsById: new Map(snapshot.facts.map((f) => [f.id, f])),
  };
}

const CASE_REGISTRY: Record<CaseId, CaseIndex> = {
  margaret: buildIndex(margaretFixture),
  maya: buildIndex(mayaFixture),
};

function indexFor(caseId: CaseId = DEFAULT_CASE_ID): CaseIndex {
  return CASE_REGISTRY[caseId];
}

const TEMPLATES: ArtifactTemplate[] = z.array(ArtifactTemplate).parse(templatesFixture);

/* ============================ formatting helpers ============================ */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * `p.2 · c.512–620`-style locator label. The contract has no "line" concept
 * — only page, a char range, and an ms range — so a char range stands in for
 * a line number when one is present.
 */
export function formatLocator(locator: Locator): string {
  const parts: string[] = [];
  if (locator.page !== null) parts.push(`p.${locator.page}`);
  if (locator.char_start !== null && locator.char_end !== null) {
    parts.push(`c.${locator.char_start}–${locator.char_end}`);
  } else if (locator.char_start !== null) {
    parts.push(`c.${locator.char_start}`);
  }
  if (locator.ms_start !== null) {
    const start = formatMs(locator.ms_start);
    const end = locator.ms_end !== null ? formatMs(locator.ms_end) : null;
    parts.push(end !== null ? `${start}–${end}` : start);
  }
  return parts.length > 0 ? parts.join(" · ") : "location not recorded";
}

/**
 * Spelled-out date label honouring date_precision. Approximate dates read
 * "around March 2024" — spelled out, never a bare asterisk or dotted mark
 * alone (docs/design.md §6).
 */
export function formatDateLabel(iso: string | null, precision: DatePrecision): string {
  if (iso === null || precision === "unknown") return "Date not recorded";
  const [yearStr, monthStr, dayStr] = iso.split("-");
  const monthName = MONTH_NAMES[Number(monthStr) - 1] ?? "";
  const day = Number(dayStr);

  switch (precision) {
    case "year":
      return yearStr;
    case "month":
      return monthName ? `${monthName} ${yearStr}` : yearStr;
    case "approximate":
      return monthName ? `around ${monthName} ${yearStr}` : `around ${yearStr}`;
    case "exact":
    default:
      return monthName ? `${day} ${monthName} ${yearStr}` : yearStr;
  }
}

function formatDayMonth(iso: string): string {
  const [, monthStr, dayStr] = iso.split("-");
  const monthName = MONTH_NAMES[Number(monthStr) - 1] ?? "";
  const day = Number(dayStr);
  return monthName ? `${day} ${monthName}` : iso;
}

/* ============================ base accessors ============================ */

export function getCase(caseId: CaseId = DEFAULT_CASE_ID): CaseSnapshot {
  return indexFor(caseId).snapshot;
}

export function getTemplates(): ArtifactTemplate[] {
  return TEMPLATES;
}

export function getSources(caseId: CaseId = DEFAULT_CASE_ID): Source[] {
  return indexFor(caseId).snapshot.sources;
}

export function getSource(id: string, caseId: CaseId = DEFAULT_CASE_ID): Source | undefined {
  return indexFor(caseId).sourcesById.get(id);
}

/* ============================ timeline ============================ */

export type Citation = {
  sourceTitle: string;
  locator: Locator;
  quote: string;
  sourceId: string;
};

export type EventProvenance = { citation: Citation } | { userStated: true };

export type TimelineEvent = {
  fact: Fact;
  dateLabel: string;
  isApproximate: boolean;
  superseded: boolean;
  supersededNote?: string;
  provenance: EventProvenance;
};

function firstClaimOf(fact: Fact, idx: CaseIndex): Claim | undefined {
  const id = fact.supporting_claim_ids[0];
  return id !== undefined ? idx.claimsById.get(id) : undefined;
}

export function resolveProvenance(
  fact: Fact,
  firstClaim: Claim | undefined,
  caseId: CaseId = DEFAULT_CASE_ID,
): EventProvenance {
  if (fact.provenance === "user_stated") {
    if (firstClaim === undefined) {
      throw new Error(
        `fact ${fact.id} (${fact.subject}) is user_stated but has no supporting claim`,
      );
    }
    return { userStated: true };
  }

  if (firstClaim !== undefined) {
    const source = indexFor(caseId).sourcesById.get(firstClaim.source_id);
    if (source === undefined) {
      throw new Error(`claim ${firstClaim.id} references unknown source ${firstClaim.source_id}`);
    }
    return {
      citation: {
        sourceTitle: source.title,
        locator: firstClaim.locator,
        quote: firstClaim.quote,
        sourceId: source.id,
      },
    };
  }

  // Fail loud: every renderable fact resolves to exactly one provenance
  // shape. Neither branch matching means the fact is sourceless, and a
  // sourceless fact must never reach the UI (docs/design.md §10).
  throw new Error(
    `fact ${fact.id} (${fact.subject}) has neither a citation nor user-stated provenance — refusing to render`,
  );
}

function buildSupersededNote(fact: Fact, idx: CaseIndex): string | undefined {
  if (fact.superseded_by === null) return undefined;
  const replacement = idx.factsById.get(fact.superseded_by);
  if (replacement === undefined) {
    throw new Error(`fact ${fact.id} superseded_by unknown fact ${fact.superseded_by}`);
  }
  const replacementClaim = firstClaimOf(replacement, idx);
  const source = replacementClaim ? idx.sourcesById.get(replacementClaim.source_id) : undefined;
  const sourceName = source
    ? source.title.charAt(0).toLowerCase() + source.title.slice(1)
    : "a later source";
  const dateLabel = replacement.valid_from !== null ? formatDayMonth(replacement.valid_from) : "a later date";
  return `Replaced by the ${sourceName}, ${dateLabel}.`;
}

/**
 * Facts with status 'unknown' are excluded — there is nothing to put on a
 * timeline yet. Every remaining fact resolves to exactly one provenance
 * shape or this throws; see resolveProvenance.
 */
export function timelineEvents(caseId: CaseId = DEFAULT_CASE_ID): TimelineEvent[] {
  const idx = indexFor(caseId);
  const withSortKey = idx.snapshot.facts
    .filter((fact) => fact.status !== "unknown")
    .map((fact) => {
      const firstClaim = firstClaimOf(fact, idx);
      const provenance = resolveProvenance(fact, firstClaim, caseId);
      const precision: DatePrecision = firstClaim?.date_precision ?? "unknown";
      const dateISO = fact.valid_from ?? firstClaim?.asserted_at ?? null;

      const event: TimelineEvent = {
        fact,
        dateLabel: formatDateLabel(dateISO, precision),
        isApproximate: precision === "approximate",
        superseded: fact.superseded_by !== null,
        supersededNote: buildSupersededNote(fact, idx),
        provenance,
      };

      return { event, sortKey: dateISO ?? "" };
    });

  withSortKey.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return withSortKey.map(({ event }) => event);
}

/* ============================ conflicts ============================ */

export type ConflictChip = {
  sourceName: string;
  sourceKind: SourceKind;
  locatorLabel: string;
  dateLabel: string;
  quote: string;
  isPatient: boolean;
  // Added additively so each institutional chip can drive a ProvenanceTag
  // citation popover (journey 1.13 — "click each chip, each opens its own
  // source"). The pre-formatted fields above are untouched; these carry the
  // raw material a popover needs. The patient chip shows her words inline
  // instead of a popover (user_stated has no source page to open).
  sourceId: string;
  sourceTitle: string;
  locator: Locator;
};

export type ConflictView = {
  id: string;
  subject: string;
  generatedQuestion: string;
  chips: ConflictChip[];
};

export function conflictViews(caseId: CaseId = DEFAULT_CASE_ID): ConflictView[] {
  const idx = indexFor(caseId);
  return idx.snapshot.conflicts.map((conflict) => {
    const chips = conflict.claim_ids.map((claimId) => {
      const claim = idx.claimsById.get(claimId);
      if (claim === undefined) {
        throw new Error(`conflict ${conflict.id} references unknown claim ${claimId}`);
      }
      const source = idx.sourcesById.get(claim.source_id);
      if (source === undefined) {
        throw new Error(`claim ${claim.id} references unknown source ${claim.source_id}`);
      }
      return {
        sourceName: source.title,
        sourceKind: source.kind,
        locatorLabel: formatLocator(claim.locator),
        dateLabel: formatDateLabel(claim.asserted_at, claim.date_precision),
        quote: claim.quote,
        isPatient: claim.provenance === "user_stated",
        sourceId: source.id,
        sourceTitle: source.title,
        locator: claim.locator,
      };
    });

    return {
      id: conflict.id,
      subject: conflict.subject,
      generatedQuestion: conflict.generated_question,
      chips,
    };
  });
}

/* ============================ gaps ============================ */

export type GapView = {
  id: string;
  detector: Gap["detector"];
  statement: string;
  suggestedNextDocument: string | null;
  citations: Citation[];
};

export function gapViews(caseId: CaseId = DEFAULT_CASE_ID): GapView[] {
  const idx = indexFor(caseId);
  return idx.snapshot.gaps.map((gap) => ({
    id: gap.id,
    detector: gap.detector,
    statement: gap.statement,
    suggestedNextDocument: gap.suggested_next_document,
    citations: gap.supporting_claim_ids.map((claimId) => {
      const claim = idx.claimsById.get(claimId);
      if (claim === undefined) {
        throw new Error(`gap ${gap.id} references unknown claim ${claimId}`);
      }
      const source = idx.sourcesById.get(claim.source_id);
      if (source === undefined) {
        throw new Error(`claim ${claim.id} references unknown source ${claim.source_id}`);
      }
      return {
        sourceTitle: source.title,
        locator: claim.locator,
        quote: claim.quote,
        sourceId: source.id,
      };
    }),
  }));
}

/* ============================ artefacts ============================ */

export type ArtifactSlotView = {
  slot: ArtifactTemplate["sections"][number]["slots"][number];
  assertion: CaseSnapshot["artifacts"][number]["assertions"][number] | null;
  facts: Fact[];
  /** false ⇒ render slot.gap_prompt instead. Never blank space, never
   *  invented text (docs/lanes/lane-b-surface.md). */
  hasContent: boolean;
};

export type ArtifactSectionView = {
  key: string;
  title: string;
  slots: ArtifactSlotView[];
};

export type ArtifactView = {
  templateKey: TemplateKey;
  title: string;
  audience: string;
  person: CaseSnapshot["person"];
  stats: CaseSnapshot["stats"];
  sections: ArtifactSectionView[];
};

/**
 * Layout is driven entirely by the template's sections/slots — never a
 * hardcoded `if (templateKey === ...)`. Adding a third gatekeeper template is
 * a new object in fixtures/templates.json, not a new branch here.
 */
export function artifactView(
  templateKey: TemplateKey,
  caseId: CaseId = DEFAULT_CASE_ID,
): ArtifactView {
  const idx = indexFor(caseId);
  const template = TEMPLATES.find((t) => t.key === templateKey);
  if (template === undefined) {
    throw new Error(`no template registered for ${templateKey}`);
  }
  const artifact = idx.snapshot.artifacts.find((a) => a.template_key === templateKey);
  if (artifact === undefined) {
    throw new Error(`no artifact found for template ${templateKey}`);
  }

  const assertionsBySlot = new Map(artifact.assertions.map((a) => [a.slot_key, a]));

  const sections: ArtifactSectionView[] = template.sections.map((section) => ({
    key: section.key,
    title: section.title,
    slots: section.slots.map((slot) => {
      const assertion = assertionsBySlot.get(slot.key) ?? null;
      const facts =
        assertion !== null
          ? assertion.fact_ids.map((factId) => {
              const fact = idx.factsById.get(factId);
              if (fact === undefined) {
                throw new Error(`assertion ${assertion.id} cites unknown fact ${factId}`);
              }
              return fact;
            })
          : [];
      const hasContent = assertion !== null && assertion.text.trim().length > 0;

      return { slot, assertion, facts, hasContent };
    }),
  }));

  return {
    templateKey,
    title: template.title,
    audience: template.audience,
    person: idx.snapshot.person,
    stats: idx.snapshot.stats,
    sections,
  };
}
