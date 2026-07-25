import { getActiveCaseId } from "@/components/data/activeCase";
import { getCase } from "@/components/data/dal";
import { UploadView } from "@/components/upload/UploadView";

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
 */
export default async function UploadPage() {
  const caseId = await getActiveCaseId();
  const { person } = getCase(caseId);

  return <UploadView personId={person.id} />;
}
