/**
 * A `<Link>` styled exactly like `components/ui/Button.tsx`. Navigation
 * should render a real anchor (new-tab, right-click, prefetch all keep
 * working) rather than a `<button>` with an onClick router push, so this
 * mirrors Button's geometry/colour classes instead of wrapping it.
 */

import Link from "next/link";
import type { ReactNode } from "react";

type LinkButtonVariant = "primary" | "secondary" | "tertiary";

const SHAPE_CLASSES: Record<LinkButtonVariant, string> = {
  // Mirrors components/ui/Button.tsx exactly — same heights, same hover.
  primary: "h-[56px] px-8 rounded-cta border border-transparent",
  secondary: "h-[48px] px-5 rounded-card border border-hairline",
  tertiary: "h-auto px-0 py-0.5 border-0 bg-transparent",
};

const COLOR_CLASSES: Record<LinkButtonVariant, string> = {
  primary: "bg-brand text-white hover:brightness-95",
  secondary: "bg-surface text-ink hover:brightness-[0.97]",
  tertiary: "bg-transparent text-brand hover:underline underline-offset-4",
};

export function LinkButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: LinkButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    "inline-flex items-center justify-center gap-2 text-body font-medium",
    "transition-[filter] duration-[120ms] ease-out",
    SHAPE_CLASSES[variant],
    COLOR_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
