/**
 * Content card: surface fill, hairline border, no shadow — a hairline does
 * the work a shadow would elsewhere (docs/design.md §4).
 */

import type { HTMLAttributes, ReactNode } from "react";

type CardProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "children"> & {
  className?: string;
  children: ReactNode;
};

export function Card({ className, children, ...rest }: CardProps) {
  const classes = [
    "bg-surface border border-hairline rounded-card p-6 md:p-8",
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
