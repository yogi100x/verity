/**
 * Renders a single artefact slot. This is the one place that switches on
 * `slot.renderer` — never on which template or which slot key is being
 * rendered. Adding a new gatekeeper template is a new row in
 * fixtures/templates.json; nothing here should ever need to change for it.
 */

import type { ArtifactSlotView } from "@/components/data/dal";
import type { Fact } from "@/lib/contracts";
import { ProvenanceTag } from "@/components/provenance/ProvenanceTag";
import { GhostCard } from "@/components/ui/GhostCard";
import { resolveFactProvenance } from "./factProvenance";

const FALLBACK_GAP_PROMPT = "Nothing recorded for this section yet.";

/**
 * Splits assertion text into list items. No filled `list`-renderer slot
 * exists in the current fixture, so this is a documented heuristic rather
 * than something verified against real content: newline-separated first,
 * falling back to semicolon-separated, falling back to the whole string.
 */
function splitListItems(text: string): string[] {
  const byLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (byLine.length > 1) return byLine;

  const bySemicolon = text
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return bySemicolon.length > 0 ? bySemicolon : [text.trim()];
}

function ProvenanceRow({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {facts.map((fact) => {
        const provenance = resolveFactProvenance(fact);
        return "citation" in provenance ? (
          <ProvenanceTag key={fact.id} citation={provenance.citation} />
        ) : (
          <ProvenanceTag key={fact.id} userStated />
        );
      })}
    </div>
  );
}

function FactTable({ facts }: { facts: Fact[] }) {
  return (
    <table className="w-full border-collapse text-body-s text-ink">
      <thead>
        <tr>
          <th scope="col" className="border-b border-hairline py-2 pr-4 text-left font-semibold">
            Item
          </th>
          <th scope="col" className="border-b border-hairline py-2 text-left font-semibold">
            Detail
          </th>
        </tr>
      </thead>
      <tbody>
        {facts.map((fact) => (
          <tr key={fact.id}>
            <th scope="row" className="border-b border-hairline py-2 pr-4 text-left font-normal">
              {fact.subject}
            </th>
            <td className="border-b border-hairline py-2">{fact.canonical_value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SlotContent({ slotView }: { slotView: ArtifactSlotView }) {
  const { slot, assertion, facts, hasContent } = slotView;

  // Never blank space, never invented text — the gap_prompt fall-through is
  // the same regardless of which slot or renderer this is.
  if (!hasContent || assertion === null) {
    return <GhostCard>{slot.gap_prompt ?? FALLBACK_GAP_PROMPT}</GhostCard>;
  }

  switch (slot.renderer) {
    case "prose":
      return (
        <div>
          <p className="text-body text-ink">{assertion.text}</p>
          <ProvenanceRow facts={facts} />
        </div>
      );

    case "list":
      return (
        <div>
          <ul className="list-disc space-y-1 pl-5 text-body text-ink">
            {splitListItems(assertion.text).map((item, index) => (
              <li key={`${slot.key}-${index}`}>{item}</li>
            ))}
          </ul>
          <ProvenanceRow facts={facts} />
        </div>
      );

    case "table":
      return (
        <div className="print-avoid-break">
          <FactTable facts={facts} />
          <ProvenanceRow facts={facts} />
        </div>
      );

    case "quote":
      return (
        <div>
          <p className="border-l-[3px] border-brand pl-4 font-mono text-mono text-ink">
            &#8220;{assertion.text}&#8221;
          </p>
          <ProvenanceRow facts={facts} />
        </div>
      );

    case "conflict":
      // Bordered callout, reusing the print-safe `.conflict-surface` hook
      // defined in app/globals.css (Lane B territory, not edited here).
      return (
        <div className="conflict-surface rounded-[8px] border border-brand bg-surface p-5">
          <p className="text-body-l text-ink">{assertion.text}</p>
          <ProvenanceRow facts={facts} />
        </div>
      );

    default: {
      const exhaustive: never = slot.renderer;
      throw new Error(`unhandled slot renderer: ${String(exhaustive)}`);
    }
  }
}
