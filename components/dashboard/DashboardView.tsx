import type { CaseId } from "@/components/data/dal";
import { getCase, getSources } from "@/components/data/dal";
import { AccessBasisBadge } from "@/components/dashboard/AccessBasisBadge";
import { LinkButton } from "@/components/dashboard/LinkButton";
import { SourceList } from "@/components/dashboard/SourceList";
import { subjectPossessive, voiceFromAccessBasis } from "@/components/voice/voice";

/**
 * The dashboard's actual markup, split out from `app/(app)/dashboard/page.tsx`
 * so it stays a plain, synchronous function of `caseId` — no `next/headers`
 * import, nothing async. `page.tsx` is the only thing that touches the case
 * cookie (via `getActiveCaseId()`); this component is what's under test in
 * `__tests__/dashboard.test.tsx`, rendered directly with an explicit caseId
 * for both Margaret and Maya.
 *
 * One idea: here is what has been gathered about the person's care, and
 * here is how to add more. Everything renders from the DAL — no fixture
 * import, no raw query (docs/lanes/lane-b-surface.md).
 *
 * Self mode (stretch S1) is the degenerate carer case, not a fork: the same
 * markup renders for both, driven by `person.access_basis === 'self'`. The
 * access-basis badge is administrative context about a carer's legal basis
 * for viewing someone else's records — it is meaningless, and hidden, when
 * a person is acting for themself.
 */
export function DashboardView({ caseId }: { caseId: CaseId }) {
  const { person, claims, stats } = getCase(caseId);
  const sources = getSources(caseId);
  const voice = voiceFromAccessBasis(person.access_basis);
  const isSelf = person.access_basis === "self";

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title font-semibold text-ink">{person.display_name}</h1>
          {!isSelf && <AccessBasisBadge accessBasis={person.access_basis} />}
        </div>
        <p className="max-w-[38rem] text-body-l text-ink-secondary">
          Here&rsquo;s everything you&rsquo;ve gathered about {subjectPossessive(voice, person.display_name)}{" "}
          care, organised from the documents themselves — never from a guess.
        </p>
        <p className="text-body-s text-ink-secondary">
          {stats.claims_extracted} claims extracted, {stats.claims_dropped} dropped
          for unverifiable quotes
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-title font-semibold text-ink">Documents</h2>
        <SourceList
          sources={sources}
          claims={claims}
          personName={person.display_name}
          voice={voice}
        />
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
