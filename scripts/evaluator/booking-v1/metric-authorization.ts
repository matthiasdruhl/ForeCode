// Supplementary case observations, not assertions, commands, or a verdict engine.
import { z } from "zod";
import { Sha256Schema } from "../../../src/lib/contracts/common";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import {
  MetricAuthorizationCaseSchema,
  type MetricProtocol,
} from "../../../src/lib/experiment/prospective-metrics";
import {
  EvaluationIdentitySchema,
  isTrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { futureCheckIds } from "./future";

export const ProtectedAuthorizationObservationSchema = z.strictObject({
  schemaVersion: z.literal("protected-authorization-cases.local.v1"),
  identity: EvaluationIdentitySchema,
  receiptSha256: Sha256Schema,
  cases: z.array(MetricAuthorizationCaseSchema).max(100),
});

// Structured case data is accepted ONLY inside an independently held snapshot
// original. A protected receipt alone has group checks, not per-case counts.
export function readProtectedAuthorizationCases(
  input: unknown,
  protocol: MetricProtocol,
  evaluation: unknown,
) {
  const observed = ProtectedAuthorizationObservationSchema.parse(input);
  invariant(
    isTrustedEvaluation(evaluation),
    "Authenticated protected receipt required.",
  );
  const r = evaluation.receipt,
    identity = observed.identity;
  invariant(
    observed.receiptSha256 === jsonDigest(r) &&
      (
        [
          "runId",
          "evaluatedTreeSha256",
          "fixtureSha256",
          "evaluatorSha256",
          "testSuiteSha256",
          "requiredPolicySha256",
        ] as const
      ).every((k) => identity[k] === r[k]) &&
      identity.evaluatorSha256 === protocol.evaluatorSha256 &&
      identity.testSuiteSha256 === protocol.suiteSha256 &&
      identity.requiredPolicySha256 === protocol.policySha256 &&
      sameIds(identity.requiredCheckIds, [...futureCheckIds]) &&
      sameIds(r.requiredCheckIds, [...futureCheckIds]),
    "Protected authorization identity mismatch.",
  );
  invariant(
    new Set(observed.cases.map((c) => c.caseId)).size ===
      observed.cases.length &&
      observed.cases.every((c) =>
        protocol.authorizationCaseIds.includes(c.caseId),
      ),
    "Duplicate or unexpected authorization case.",
  );
  const validSuite = futureCheckIds.every((id) =>
    evaluation.checks.some(
      (c) => c.id === id && (c.status === "pass" || c.status === "fail"),
    ),
  );
  invariant(
    !observed.cases.some((c) => c.outcome === "fail") ||
      evaluation.verification.verdict !== "VERIFIED",
    "Case failure contradicts protected receipt.",
  );
  // Missing/error group evidence cannot substantiate a claimed per-case pass.
  return validSuite
    ? observed.cases
    : observed.cases.map((c) => ({ ...c, outcome: "invalid" as const }));
}
