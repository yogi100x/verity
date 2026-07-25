import { CaseSwitcher } from "@/components/dashboard/CaseSwitcher";
import { LinkButton } from "@/components/dashboard/LinkButton";

export default function Home() {
  return (
    // id/tabIndex are the target for the root layout's skip link, which is
    // rendered on every route including this one. Without them the first
    // focusable element on the landing page points at nothing.
    <main id="main-content" tabIndex={-1} className="flex-1 bg-paper outline-none">
      <div className="mx-auto max-w-[70rem] px-6 py-16 md:py-24">
        <h1 className="max-w-[38rem] font-display text-display-xl font-[680] tracking-tight text-ink">
          Your mum&rsquo;s paperwork,
          <br />
          finally saying one thing.
        </h1>

        <p className="mt-6 max-w-[34rem] text-body-l text-ink-secondary">
          Verity reads the letters, prescriptions and notes you already have,
          shows you where they disagree, and writes the document the next
          person needs — with every line traced back to the page it came
          from.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-6">
          <LinkButton href="/dashboard" variant="primary">
            Start with one document
          </LinkButton>
          <LinkButton href="/welcome" variant="secondary">
            Set up a new record
          </LinkButton>
          <LinkButton href="/timeline" variant="tertiary">
            See an example →
          </LinkButton>
        </div>

        <p className="mt-8 text-label text-ink-secondary">
          Powered by Juno · Does not diagnose · You review everything before
          it leaves
        </p>

        <CaseSwitcher />
      </div>
    </main>
  );
}
