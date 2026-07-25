/**
 * One mini-card inside the conflict card — docs/design.md §6. Three of these
 * sit side by side with identical outer chrome (icon, name, locator+date,
 * quoted span on a provenance-tinted ground). Structural parity is what makes
 * the "equal visual weight" rule true — never give one chip an extra border,
 * a bigger radius, or a bolder name than another. All three keep the verbatim
 * quote visible inline: seeing the three contradicting quotes side by side at
 * rest is the whole money moment (demo/design-showcase.html).
 *
 * Interactivity (journey 1.13 — "click each chip, each opens its own source"):
 * the two institutional chips additionally render a real <ProvenanceTag>
 * citation, whose popover exposes the verbatim quote and the "Open page N →"
 * source link. The patient chip is user_stated — it has no source page to
 * open, so per journey 1.13 it shows her actual words with her timestamp
 * inline (the header's date · locator line) rather than a popover, mirroring
 * ProvenanceTag's userStated variant, which deliberately has no popover.
 */

import { AudioIcon, DocumentIcon, ImageIcon, SpeechBubbleIcon } from "@/components/ui/icons";
import { ProvenanceTag } from "@/components/provenance/ProvenanceTag";
import type { ConflictChip } from "@/components/data/dal";

function ChipIcon({ chip }: { chip: ConflictChip }) {
  if (chip.isPatient) return <SpeechBubbleIcon className="shrink-0 text-ink-secondary" />;
  if (chip.sourceKind === "audio") return <AudioIcon className="shrink-0 text-ink-secondary" />;
  if (chip.sourceKind === "image") return <ImageIcon className="shrink-0 text-ink-secondary" />;
  return <DocumentIcon className="shrink-0 text-ink-secondary" />;
}

export function SourceChip({ chip }: { chip: ConflictChip }) {
  return (
    <div
      data-testid="conflict-chip"
      data-patient={chip.isPatient}
      className="rounded-[8px] border border-hairline bg-surface p-4"
    >
      <div className="flex items-center gap-1.5 text-body-s font-semibold text-ink">
        <ChipIcon chip={chip} />
        <span>{chip.sourceName}</span>
      </div>
      <div className="mt-1 font-mono text-mono-s text-ink-secondary">
        {chip.dateLabel} · {chip.locatorLabel}
      </div>
      <p
        className={[
          "mt-2.5 rounded-chip p-2.5 font-mono text-mono text-ink",
          chip.isPatient ? "bg-unverified-fill" : "bg-cite-fill",
        ].join(" ")}
      >
        &#8220;{chip.quote}&#8221;
      </p>
      {!chip.isPatient && (
        <div className="mt-2.5">
          <ProvenanceTag
            citation={{
              sourceTitle: chip.sourceTitle,
              locator: chip.locator,
              quote: chip.quote,
              sourceId: chip.sourceId,
            }}
          />
        </div>
      )}
    </div>
  );
}
