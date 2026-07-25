"use client";

/**
 * App navigation — one source of truth for the four core screens, rendered
 * two ways: a horizontal top-bar nav on desktop, a persistent bottom bar on
 * mobile. Active state driven by usePathname so this is a client component;
 * the layout that hosts it stays a server component.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
};

function TimelineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

function ConflictsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h9A1.5 1.5 0 0 1 14 5.5v4A1.5 1.5 0 0 1 12.5 11H9l-2.5 2v-2h-3A1.5 1.5 0 0 1 2 9.5z" />
      <path d="M8 6.25v1.75M8 9.25h.01" />
    </svg>
  );
}

function GapsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeDasharray="2.5 2.5"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="12" height="12" rx="3" />
    </svg>
  );
}

function ArtefactsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 1.5h5.5L13 5v9.5H4z" />
      <path d="M9.5 1.5V5H13" />
      <path d="M6 8.5h4.5M6 11h4.5" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 7.5 8 2.5l6 5" />
      <path d="M3.5 6.5V13.5h9V6.5" />
      <path d="M6.5 13.5V9.5h3v4" />
    </svg>
  );
}

function AddIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5.5v5M5.5 8h5" />
    </svg>
  );
}

const HOME_ITEM: NavItem = { href: "/dashboard", label: "Home", icon: HomeIcon };
const ADD_ITEM: NavItem = { href: "/upload", label: "Add", icon: AddIcon };

const CORE_ITEMS: NavItem[] = [
  { href: "/timeline", label: "Timeline", icon: TimelineIcon },
  { href: "/conflicts", label: "Conflicts", icon: ConflictsIcon },
  { href: "/gaps", label: "Gaps", icon: GapsIcon },
  { href: "/artefacts", label: "Artefacts", icon: ArtefactsIcon },
];

// Mobile bottom bar: the only global nav surface on a phone, so it has to
// reach every top-level screen, including the two the desktop top bar
// covers indirectly (Home via the wordmark link, Add via the dashboard's
// "Add a document" CTA). Home first (conventional), Add last (mirrors the
// common trailing "+" placement) — six items total.
export const NAV_ITEMS: NavItem[] = [HOME_ITEM, ...CORE_ITEMS, ADD_ITEM];

// Desktop top bar deliberately excludes Add: DashboardView already surfaces
// a primary "Add a document" CTA (components/dashboard/DashboardView.tsx),
// so a desktop user is never more than the wordmark + one click away from
// upload. Adding a second entry point here would just duplicate that CTA
// without solving a reachability problem the way it does on mobile, where
// the bottom bar is the only persistent nav.
const TOP_NAV_ITEMS: Array<{ href: string; label: string }> = [
  ...CORE_ITEMS,
  { href: "/dashboard", label: "Dashboard" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
      {TOP_NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`text-body-s font-semibold transition-[color] duration-[120ms] ease-out ${
              active ? "text-brand" : "text-ink-secondary hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        // Six equal flex-1 children with min-w-0 and a truncating label: at
        // 320px each item gets 53.3px, and px-0.5 leaves 49.3px of that for
        // the text. "Artefacts"/"Conflicts" are ~52px at the 13px label
        // token, so on the very narrowest phones those two clip by a few
        // pixels rather than pushing the bar wide; from 360px up nothing
        // clips. Overflow is impossible either way.
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-ink-secondary"
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-[2px] w-8 rounded-full bg-brand"
              />
            )}
            <Icon className={active ? "text-brand" : "text-ink-secondary"} />
            <span
              className={`w-full truncate text-center text-label ${active ? "font-medium text-brand" : "text-ink-secondary"}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
