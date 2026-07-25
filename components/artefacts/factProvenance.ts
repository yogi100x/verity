/**
 * dal.ts resolves fact -> provenance only through `timelineEvents()` (every
 * fact whose status isn't 'unknown', run through the same fail-loud checks
 * used everywhere else). It does not export a standalone
 * `resolveFactProvenance(fact)` or a `getClaim(id)` lookup, so there is no
 * way to build a citation for an artefact-cited fact without either
 * duplicating that resolution logic here or reusing the timeline's output.
 *
 * This reuses it: build a one-time fact-id -> provenance map from
 * `timelineEvents()` and look facts up in it. If dal.ts ever grows a direct
 * `resolveFactProvenance` export, this file becomes a thin re-export.
 */

import { ALL_CASE_IDS, timelineEvents, type EventProvenance } from "@/components/data/dal";
import type { Fact } from "@/lib/contracts";

/**
 * Fact ids are unique across every seeded case, so provenance is resolved by
 * searching all case registries rather than assuming the default case. The
 * original single-case cache silently pinned this map to Margaret, which
 * crashed every artefact screen the moment the S1 account switcher put Maya's
 * facts in front of it — the fail-loud guard below did its job; the map was
 * the bug.
 */
let cache: Map<string, EventProvenance> | null = null;

function provenanceByFactId(): Map<string, EventProvenance> {
  if (cache === null) {
    cache = new Map(
      ALL_CASE_IDS.flatMap((caseId) =>
        timelineEvents(caseId).map(
          (event) => [event.fact.id, event.provenance] as const,
        ),
      ),
    );
  }
  return cache;
}

/**
 * Resolves a fact cited by an artefact assertion to its provenance shape,
 * whichever seeded case it belongs to. Fails loud if the fact isn't
 * resolvable (e.g. status 'unknown', which the timeline excludes) — a
 * sourceless fact must never reach the UI (docs/design.md §10).
 */
export function resolveFactProvenance(fact: Fact): EventProvenance {
  const provenance = provenanceByFactId().get(fact.id);
  if (provenance === undefined) {
    throw new Error(
      `fact ${fact.id} (${fact.subject}) is cited by an artefact assertion but has no ` +
        `resolvable provenance — refusing to render`,
    );
  }
  return provenance;
}
