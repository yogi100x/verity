import { getCase, getSources } from "@/components/data/dal";
import { AccessBasisBadge } from "@/components/dashboard/AccessBasisBadge";
import { LinkButton } from "@/components/dashboard/LinkButton";
import { SourceList } from "@/components/dashboard/SourceList";

/**
 * Sarah's home screen. One idea: here is what has been gathered about
 * Margaret, and here is how to add more. Everything renders from the DAL —
 * no fixture import, no raw query (docs/lanes/lane-b-surface.md).
 */
export default function DashboardPage() {
  const { person, claims, stats } = getCase();
  const sources = getSources();

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title font-semibold text-ink">{person.display_name}</h1>
          <AccessBasisBadge accessBasis={person.access_basis} />
        </div>
        <p className="max-w-[38rem] text-body-l text-ink-secondary">
          Here&rsquo;s everything you&rsquo;ve gathered about {person.display_name}&rsquo;s
          care, organised from the documents themselves — never from a guess.
        </p>
        <p className="text-body-s text-ink-secondary">
          {stats.claims_extracted} claims extracted, {stats.claims_dropped} dropped
          for unverifiable quotes
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-title font-semibold text-ink">Documents</h2>
        <SourceList sources={sources} claims={claims} personName={person.display_name} />
      </section>

      <section className="flex flex-col gap-4">
        <LinkButton href="/upload" variant="primary" className="self-start">
          Add a document
        </LinkButton>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/timeline" variant="secondary">
            View the timeline
          </LinkButton>
          <LinkButton href="/artefacts" variant="secondary">
            View artefacts
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
