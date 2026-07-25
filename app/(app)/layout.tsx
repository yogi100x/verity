import Link from "next/link";
import { BottomNav, TopNav } from "@/components/shell/AppNav";
import { InstallPrompt } from "@/components/shell/InstallPrompt";
import { getActiveCaseId } from "@/components/data/activeCase";
import { getCase } from "@/components/data/dal";
import { voiceFromAccessBasis } from "@/components/voice/voice";
import { VoiceProvider } from "@/components/voice/VoiceProvider";

/**
 * App shell for every authenticated-feel screen. Server component — the
 * only client-side pieces are the nav (needs usePathname for active state,
 * split out to components/shell/AppNav.tsx) and the voice context provider
 * below.
 *
 * Voice is resolved exactly once here (stretch S1 — Maya coda): the active
 * case comes off the request cookie, and voice is a pure function of that
 * case's `person.access_basis` — never a separate flag someone could set
 * out of sync with the account. Client descendants (the upload flow) read
 * it from context; Server Component pages independently call the same two
 * functions, since RSC cannot consume context — see VoiceProvider.tsx.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const caseId = await getActiveCaseId();
  const { person } = getCase(caseId);
  const voice = voiceFromAccessBasis(person.access_basis);

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

      <VoiceProvider value={{ voice, caseId, displayName: person.display_name }}>
        <main className="mx-auto w-full max-w-[70rem] flex-1 px-6 pb-24 pt-8 md:pb-12">
          {children}
        </main>
      </VoiceProvider>

      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
