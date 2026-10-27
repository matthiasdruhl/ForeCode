import { RecordedVerificationView } from "@/components/recorded-verification";
import { loadApprovedRecordings } from "@/server/artifacts/recording-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function Experiments() {
  return <RecordedVerificationView catalog={await loadApprovedRecordings()} />;
}
