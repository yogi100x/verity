/**
 * Three variants, one disabled state. Geometry and colour come straight from
 * docs/design.md §6 — no component library, hand-built against the tokens.
 *
 * A disabled button that doesn't say why is a bug (design.md §10), so the
 * disabled state is a type-level requirement: you cannot pass `disabled`
 * without also passing `disabledReason`.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "tertiary";

type CommonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "className" | "children" | "type"
> & {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
};

type EnabledButtonProps = CommonProps & {
  disabled?: false;
  disabledReason?: never;
};

type DisabledButtonProps = CommonProps & {
  disabled: true;
  /** Rendered as text adjacent to the control. Never omit this. */
  disabledReason: string;
};

export type ButtonProps = EnabledButtonProps | DisabledButtonProps;

const SHAPE_CLASSES: Record<ButtonVariant, string> = {
  // 56px primary / 48px secondary are the design spec's fixed heights
  // (docs/design.md §6) — deliberately px, matching the showcase.
  primary: "h-[56px] px-8 rounded-cta border border-transparent",
  secondary: "h-[48px] px-5 rounded-card border border-hairline",
  tertiary: "h-auto px-0 py-0.5 border-0 bg-transparent",
};

const ENABLED_COLOR_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:brightness-95",
  secondary: "bg-surface text-ink hover:brightness-[0.97]",
  tertiary: "bg-transparent text-brand hover:underline underline-offset-4",
};

const DISABLED_COLOR_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-hairline text-ink-secondary",
  secondary: "bg-hairline text-ink-secondary border-transparent",
  tertiary: "bg-transparent text-ink-secondary",
};

export function Button({
  variant = "primary",
  className,
  children,
  disabled,
  disabledReason,
  type = "button",
  ...rest
}: ButtonProps) {
  const buttonClasses = [
    "inline-flex items-center justify-center gap-2 text-body font-medium",
    "transition-[filter] duration-[120ms] ease-out",
    SHAPE_CLASSES[variant],
    disabled ? DISABLED_COLOR_CLASSES[variant] : ENABLED_COLOR_CLASSES[variant],
    disabled ? "cursor-not-allowed" : "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const button = (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={buttonClasses}
      {...rest}
    >
      {children}
    </button>
  );

  if (!disabled) return button;

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      {button}
      <span className="text-body-s italic text-ink-secondary">
        {disabledReason}
      </span>
    </span>
  );
}
