import { RecordedVerificationView } from "@/components/recorded-verification";
import {
  loadApprovedRecordings,
  loadApprovedTournamentRecordings,
} from "@/server/artifacts/recording-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function Experiments() {
  const [catalog, tournaments] = await Promise.all([
    loadApprovedRecordings(),
    loadApprovedTournamentRecordings(),
  ]);
  return (
    <RecordedVerificationView catalog={catalog} tournaments={tournaments} />
  );
}
