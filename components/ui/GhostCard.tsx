/**
 * Dashed, transparent, italic — the "not yet known" / gap_prompt fall-through
 * state (docs/design.md §6, §10). Used whenever a slot, event, or field has
 * nothing to show rather than leaving blank space or inventing text.
 */

import type { HTMLAttributes, ReactNode } from "react";

type GhostCardProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "children"> & {
  className?: string;
  children: ReactNode;
};

export function GhostCard({ className, children, ...rest }: GhostCardProps) {
  const classes = [
    "bg-transparent border border-dashed border-hairline rounded-card p-6 md:p-8",
    "text-ink-secondary italic text-body",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
