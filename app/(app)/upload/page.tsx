import { getActiveCaseId } from "@/components/data/activeCase";
import { getCase } from "@/components/data/dal";
import { UploadView } from "@/components/upload/UploadView";
import { resolveMode } from "@/lib/modes";

/**
 * Server Component wrapper. The dictation entry point on this screen
 * (components/dictation/MicButton) needs the active person's uuid to post
 * to /api/voice/upload, and the only place that uuid lives is the DAL — which
 * a client component must never import directly (it would pull every fixture
 * into the browser bundle, the lesson from a prior PR). So this page reads
 * the active case server-side, same as every other Server Component page
 * under app/(app)/**, and hands the one serialisable field the client view
 * needs down as a prop. Everything else — voice, display name, the upload
 * simulation — is unchanged and still resolved client-side in UploadView.
 *
 * Mode is resolved here too, server-side, via the same `resolveMode`
 * precedence (?mode= > NEXT_PUBLIC_DEFAULT_MODE > 'fixtures') that
 * app/api/extract/route.ts uses — so the screen and the API it calls always
 * agree on which mode is active for a given request. `UploadView` only
 * branches on the single resulting value, never re-derives it.
 */
export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const params = await searchParams;
  const modeParam = typeof params.mode === "string" ? params.mode : undefined;
  const mode = resolveMode({ searchParam: modeParam });

  const caseId = await getActiveCaseId();
  const { person } = getCase(caseId);

  return <UploadView personId={person.id} mode={mode} />;
}
