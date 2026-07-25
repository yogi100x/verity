/**
 * Derives the counts the artefact document's summary header renders, from
 * the resolved `ArtifactView` at render time — never hardcoded, so a new
 * fixture or a template edit changes the header without a source change
 * here.
 *
 * "Contains evidence" is deliberately stricter than dal.ts's `hasContent`
 * (which SlotContent uses only to decide gap_prompt vs content): a section
 * counts as evidence-bearing when at least one of its slots has an
 * assertion with non-empty text AND `citation_verified: true`. A dropped
 * quote (`verified_substring: false` upstream, CLAUDE.md) must never read
 * as evidence just because its slot happens to have text.
 *
 * "Domain" sections are identified generically against the frozen
 * `ChcDomain` enum (lib/contracts.ts) by matching section key — never
 * against a template-key literal. components/artefacts must never branch on
 * a template key (docs/design.md's structural rule, enforced by
 * artefact-view.test.tsx). A template with no domain-keyed sections at all
 * simply reports zero domains; callers decide whether the domain clause is
 * worth rendering.
 *
 * "Disagreement" is counted from the data the pack cites, not from how the
 * template chose to lay it out. It is the number of DISTINCT disputed facts
 * that this pack's own assertions cite: every `assertion.fact_ids` entry the
 * view already resolved (`ArtifactSlotView.facts`), kept when the fact
 * carries a `conflict_id` or `status === 'disputed'`, de-duplicated by fact
 * id so one fact cited from three slots is still one disagreement.
 *
 * The earlier definition — "filled `renderer: "conflict"` slots" — was
 * false as read on the flagship demo. Margaret's CHC pack narrates the
 * three-source furosemide disagreement in `drug_therapies.evidence` prose
 * while its dedicated conflict slot is empty, so the header printed
 * "0 disagreements appear in this pack" directly above a paragraph
 * describing one. Counting cited disputed facts cannot drift from the prose
 * that way: the same fact that makes the prose a disagreement is the thing
 * being counted.
 */

import { ChcDomain } from "@/lib/contracts";
import type { ArtifactSectionView, ArtifactView } from "@/components/data/dal";

const DOMAIN_KEYS = new Set<string>(ChcDomain.options);

function sectionHasEvidence(section: ArtifactSectionView): boolean {
  return section.slots.some(
    (slotView) =>
      slotView.assertion !== null &&
      slotView.assertion.text.trim().length > 0 &&
      slotView.assertion.citation_verified === true,
  );
}

export type ArtifactSummary = {
  totalSectionCount: number;
  sectionsWithEvidenceCount: number;
  totalDomainCount: number;
  /** The domain sections whose slots are all empty/unverified, in template
   *  order — the disclosure list renders exactly these. */
  domainsWithoutEvidence: ArtifactSectionView[];
  /** Distinct disputed facts cited by this pack's assertions — see the note
   *  at the top of this file. */
  disagreementCount: number;
};

/** Every distinct fact id this pack's assertions cite that the record marks
 *  as being in dispute. Reads only what `ArtifactView` already resolved. */
function citedDisputedFactIds(view: ArtifactView): Set<string> {
  const ids = new Set<string>();
  for (const section of view.sections) {
    for (const slotView of section.slots) {
      for (const fact of slotView.facts) {
        if (fact.conflict_id !== null || fact.status === "disputed") ids.add(fact.id);
      }
    }
  }
  return ids;
}

export function computeArtifactSummary(view: ArtifactView): ArtifactSummary {
  const domainSections = view.sections.filter((section) => DOMAIN_KEYS.has(section.key));
  const domainsWithoutEvidence = domainSections.filter(
    (section) => !sectionHasEvidence(section),
  );
  const sectionsWithEvidenceCount = view.sections.filter(sectionHasEvidence).length;

  const disagreementCount = citedDisputedFactIds(view).size;

  return {
    totalSectionCount: view.sections.length,
    sectionsWithEvidenceCount,
    totalDomainCount: domainSections.length,
    domainsWithoutEvidence,
    disagreementCount,
  };
}
