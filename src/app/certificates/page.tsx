import { RecordedCertificatesView } from "@/components/recorded-certificates";
import { loadApprovedCertificates } from "@/server/artifacts/recording-catalog";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export default async function Certificates() {
  return (
    <RecordedCertificatesView catalog={await loadApprovedCertificates()} />
  );
}
