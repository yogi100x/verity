import { WelcomeForm } from "@/components/onboarding/WelcomeForm";

export const metadata = { title: "Set up a record — Verity" };

/**
 * The entry point for a visitor nobody seeded. Everything on this screen is
 * client-side (the form posts and navigates), so this page is a plain
 * server wrapper — it reads no cookie, because the record it is about to
 * create is the thing that sets one.
 */
export default function WelcomePage() {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">Set up a record</h1>
        <p className="max-w-[38rem] text-body-l text-ink-secondary">
          A record holds one person&rsquo;s documents and everything Verity
          reads out of them. Nothing is shared with anyone until you print or
          send it.
        </p>
      </header>

      <WelcomeForm />
    </div>
  );
}
