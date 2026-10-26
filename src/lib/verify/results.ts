import {
  CheckResultV1Schema,
  VerificationV1Schema,
  type CheckResultV1,
  type VerificationV1,
} from "../contracts/evidence";
import { invariant, unique } from "../contracts/validation";

// Pure normalization only. Authentication/freshness belongs to the protected store.
export function verdictForAuthenticatedChecks(
  checks: readonly CheckResultV1[],
  requiredCheckIds: readonly string[],
): VerificationV1["verdict"] {
  unique(requiredCheckIds, "required checks");
  unique(
    checks.map((check) => check.id),
    "check IDs",
  );
  const required = checks.filter((check) =>
    requiredCheckIds.includes(check.id),
  );
  for (const check of checks) CheckResultV1Schema.parse(check);
  if (required.some((check) => check.status === "fail")) return "REJECTED";
  if (
    requiredCheckIds.length > 0 &&
    requiredCheckIds.every((id) =>
      required.some((check) => check.id === id && check.status === "pass"),
    )
  )
    return "VERIFIED";
  return "INSUFFICIENT_EVIDENCE";
}

export function untrustedPreview(
  id: string,
  runId: string,
  requiredCheckIds: string[],
  checks: CheckResultV1[],
): VerificationV1 {
  unique(requiredCheckIds, "required checks");
  unique(
    checks.map((check) => check.id),
    "check IDs",
  );
  invariant(
    checks.every((check) => check.runId === runId),
    "Preview checks belong to another run.",
  );
  return VerificationV1Schema.parse({
    schemaVersion: "verification.v1",
    id,
    runId,
    requiredCheckIds,
    checks,
    verdict: "INSUFFICIENT_EVIDENCE",
    receiptId: null,
    origin: "untrusted_preview",
    scope: "Untrusted input preview only.",
    limitations: [
      "Client-supplied checks cannot authenticate evaluation results.",
    ],
  });
}
