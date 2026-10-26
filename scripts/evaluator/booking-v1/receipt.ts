import {
  CheckResultV1Schema,
  EvaluatorReceiptV1Schema,
  type CheckResultV1,
} from "../../../src/lib/contracts/evidence";
import {
  invariant,
  orderedTime,
  unique,
} from "../../../src/lib/contracts/validation";
import {
  checkArtifactDigest,
  receiptManifestDigest,
} from "../../../src/lib/report/digests";
import type { EvaluationIdentity } from "../../../src/server/artifacts/evaluation-store";

// Assembly does not run code or authenticate inputs. A trusted controller must
// pin actual observed artifacts after isolated evaluation, outside task custody.
export function assembleEvaluatorReceipt(input: {
  id: string;
  identity: EvaluationIdentity;
  checks: CheckResultV1[];
  startedAt: string;
  finishedAt: string;
}) {
  const checks = input.checks.map((check) => CheckResultV1Schema.parse(check));
  unique(
    checks.map((check) => check.id),
    "evaluator check IDs",
  );
  unique(input.identity.requiredCheckIds, "required check IDs");
  orderedTime(input.startedAt, input.finishedAt);
  for (const check of checks)
    invariant(
      check.runId === input.identity.runId,
      "Evaluator check belongs to another run.",
    );
  const receipt = EvaluatorReceiptV1Schema.parse({
    schemaVersion: "evaluator-receipt.v1",
    id: input.id,
    ...input.identity,
    checkArtifactSha256: checkArtifactDigest(checks),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    issuer: "trusted-local-evaluator",
    integrity: {
      kind: "trusted-local-artifact",
      manifestSha256: "0".repeat(64),
    },
  });
  receipt.integrity.manifestSha256 = receiptManifestDigest(receipt);
  return { receipt, checks };
}
