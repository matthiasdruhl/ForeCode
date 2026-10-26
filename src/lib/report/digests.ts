import { createHash } from "node:crypto";
import type {
  CertificateV1,
  CheckResultV1,
  EvaluatorReceiptV1,
} from "../contracts/evidence";
import { canonicalJson } from "./canonical";

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function jsonDigest(value: unknown): string {
  return sha256(canonicalJson(value));
}
export function checkArtifactDigest(checks: readonly CheckResultV1[]): string {
  return jsonDigest(
    [...checks].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  );
}
export function receiptManifestDigest(receipt: EvaluatorReceiptV1): string {
  return jsonDigest({
    ...receipt,
    integrity: { kind: receipt.integrity.kind },
  });
}
export function certificateDigest(certificate: CertificateV1): string {
  const { artifactSha256: _self, ...contents } = certificate;
  void _self;
  return jsonDigest(contents);
}
