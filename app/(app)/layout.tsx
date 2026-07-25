import Link from "next/link";
import { BottomNav, TopNav } from "@/components/shell/AppNav";
import { InstallPrompt } from "@/components/shell/InstallPrompt";

/**
 * App shell for every authenticated-feel screen. Server component — the
 * only client-side piece is the nav itself (needs usePathname for active
 * state), split out to components/shell/AppNav.tsx.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper">
      <header className="no-print sticky top-0 z-10 border-b border-hairline bg-paper">
        <div className="mx-auto flex h-16 max-w-[70rem] items-center justify-between px-6">
          <Link
            href="/"
            className="font-display text-[1.375rem] font-[560] tracking-tight text-ink"
          >
            Verity
          </Link>
          <TopNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[70rem] flex-1 px-6 pb-24 pt-8 md:pb-12">
        {children}
      </main>

      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
