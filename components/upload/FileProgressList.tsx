/**
 * `aria-live="polite"` so each named-state change is announced without
 * interrupting whatever the user is doing — the accessible equivalent of
 * the visible progress list (docs/lanes/lane-b-surface.md).
 */

import { FileProgressRow } from "@/components/upload/FileProgressRow";
import type { UploadItem } from "@/components/upload/useUploadSimulation";

export function FileProgressList({ items }: { items: UploadItem[] }) {
  return (
    <ul aria-live="polite" className="flex flex-col gap-3">
      {items.map((item) => (
        <FileProgressRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
