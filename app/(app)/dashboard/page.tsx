import { getActiveCaseId } from "@/components/data/activeCase";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata = { title: "Dashboard — Verity" };

/**
 * Resolves the active case off the request cookie and renders the
 * (synchronous, cookie-free) `DashboardView`. This is the only place on
 * this route that touches `next/headers` — see `DashboardView.tsx` for why
 * that split exists.
 */
export default async function DashboardPage() {
  const caseId = await getActiveCaseId();
  return <DashboardView caseId={caseId} />;
}
