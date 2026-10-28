import { CertificateV1Schema, type CertificateV1 } from "../contracts/evidence";
import {
  sameIds,
  invariant,
  validateCertificateReferences,
} from "../contracts/validation";
import { canonicalJson } from "./canonical";
import { certificateDigest } from "./digests";

export type CertificateRecords = Parameters<
  typeof validateCertificateReferences
>[1];

// Pure construction establishes shape, relationships and byte identity only.
// Authentication and disclosure approval belong to the server composition.
export function assembleCertificate(
  input: Omit<CertificateV1, "artifactSha256">,
  records: CertificateRecords,
) {
  const parsed = CertificateV1Schema.parse({
    ...input,
    artifactSha256: "0".repeat(64),
  });
  validateCertificateReferences(parsed, records);
  for (const [references, sources] of [
    [parsed.experimentRunIds, records.runs.map((item) => item.id)],
    [parsed.verificationIds, records.verifications.map((item) => item.id)],
    [parsed.receiptIds, records.receipts.map((item) => item.id)],
    [parsed.scenarioIds, records.scenarios.map((item) => item.id)],
    [
      parsed.intentRevisions.map((item) => item.intentId),
      records.intents.map((item) => item.id),
    ],
  ] as const)
    invariant(sameIds(references, sources), "Certificate source set mismatch.");
  for (const receipt of records.receipts)
    invariant(
      Date.parse(parsed.generatedAt) >= Date.parse(receipt.finishedAt),
      "Certificate predates receipt.",
    );
  const certificate = {
    ...parsed,
    generatedAt: new Date(parsed.generatedAt).toISOString(),
    intentRevisions: [...parsed.intentRevisions].sort((a, b) =>
      compare(a.intentId, b.intentId),
    ),
    scenarioIds: [...parsed.scenarioIds].sort(),
    experimentRunIds: [...parsed.experimentRunIds].sort(),
    verificationIds: [...parsed.verificationIds].sort(),
    receiptIds: [...parsed.receiptIds].sort(),
    limitations: [...parsed.limitations].sort(),
  };
  certificate.artifactSha256 = certificateDigest(certificate);
  return {
    certificate: CertificateV1Schema.parse(certificate),
    json: canonicalJson(certificate),
  };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
