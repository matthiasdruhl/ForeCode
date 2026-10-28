import { z } from "zod";
import { IdSchema, Sha256Schema } from "../../../src/lib/contracts/common";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import {
  futureTaskDigest,
  validateFutureTask,
} from "../../../src/lib/experiment/future-task";
import { jsonDigest } from "../../../src/lib/report/digests";
import {
  EvaluationIdentitySchema,
  isTrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { OracleSchema } from "../../experiments/tournament/plan";
import { bookingPolicy } from "./freeze";
import { assembleEvaluatorReceipt } from "./receipt";

export const futureCheckIds = [
  ...bookingPolicy.requiredCheckIds,
  "team-permissions-domain",
  "team-permissions-http",
  "team-permissions-adversarial",
] as const;

// Metadata only: never an executable package path, private inputs or approval.
export const FutureOracleDescriptorSchema = z.strictObject({
  schemaVersion: z.literal("booking-future-oracle.local.v1"),
  id: IdSchema,
  taskId: IdSchema,
  taskDefinitionSha256: Sha256Schema,
  baselineOracle: OracleSchema,
  oracle: OracleSchema,
});
export type FutureOracleDescriptor = z.infer<
  typeof FutureOracleDescriptorSchema
>;

export function futurePolicy(
  task: unknown,
  baseline: z.infer<typeof OracleSchema>,
) {
  const parsed = OracleSchema.parse(baseline);
  invariant(
    sameIds(parsed.requiredCheckIds, bookingPolicy.requiredCheckIds),
    "Baseline required checks must be preserved.",
  );
  invariant(
    parsed.requiredPolicySha256 === jsonDigest(bookingPolicy),
    "Baseline policy must be unchanged.",
  );
  return {
    schemaVersion: "booking-team-required-policy.local.v1",
    taskDefinitionSha256: futureTaskDigest(task),
    baselineOracle: parsed,
    requiredCheckIds: [...futureCheckIds],
    hiddenHoldout: false,
    executionBoundary: "independently_reviewed_network_off_grader_guest",
  } as const;
}

export function validateFutureOracle(
  input: unknown,
  taskInput: unknown,
): FutureOracleDescriptor {
  const task = validateFutureTask(taskInput);
  const descriptor = FutureOracleDescriptorSchema.parse(input);
  invariant(
    descriptor.taskId === task.id &&
      descriptor.taskDefinitionSha256 === futureTaskDigest(task),
    "Future oracle task mismatch.",
  );
  const policy = futurePolicy(task, descriptor.baselineOracle);
  invariant(
    sameIds(descriptor.oracle.requiredCheckIds, futureCheckIds) &&
      new Set(descriptor.oracle.requiredCheckIds).size ===
        futureCheckIds.length,
    "Future required checks differ.",
  );
  invariant(
    descriptor.oracle.requiredPolicySha256 === jsonDigest(policy),
    "Future policy identity mismatch.",
  );
  invariant(
    descriptor.oracle.evaluatorSha256 !==
      descriptor.baselineOracle.evaluatorSha256 &&
      descriptor.oracle.testSuiteSha256 !==
        descriptor.baselineOracle.testSuiteSha256,
    "Future oracle must have separate evaluator and suite identities.",
  );
  return descriptor;
}

const FutureEvaluationRequestSchema = z.strictObject({
  schemaVersion: z.literal("booking-future-evaluation-request.local.v1"),
  descriptorSha256: Sha256Schema,
  taskDefinitionSha256: Sha256Schema,
  identity: EvaluationIdentitySchema,
});
export type FutureEvaluationRequest = z.infer<
  typeof FutureEvaluationRequestSchema
>;

export function prepareFutureEvaluation(input: {
  descriptor: unknown;
  task: unknown;
  runId: string;
  evaluatedTreeSha256: string;
  fixtureSha256: string;
}): FutureEvaluationRequest {
  const descriptor = validateFutureOracle(input.descriptor, input.task);
  return FutureEvaluationRequestSchema.parse({
    schemaVersion: "booking-future-evaluation-request.local.v1",
    descriptorSha256: jsonDigest(descriptor),
    taskDefinitionSha256: descriptor.taskDefinitionSha256,
    identity: {
      runId: input.runId,
      evaluatedTreeSha256: input.evaluatedTreeSha256,
      fixtureSha256: input.fixtureSha256,
      ...descriptor.oracle,
    },
  });
}

// Test/development adapter only. This wrapper is not a protected-store bundle
// or a TrustedEvaluation; assembly never authenticates supplied observations.
export function assembleSyntheticFutureEvaluation(
  requestInput: FutureEvaluationRequest,
  observation: Omit<Parameters<typeof assembleEvaluatorReceipt>[0], "identity">,
) {
  const request = FutureEvaluationRequestSchema.parse(requestInput);
  return {
    evidenceOrigin: "synthetic" as const,
    executionStatus: "NOT_RUN" as const,
    requestSha256: jsonDigest(request),
    bundle: assembleEvaluatorReceipt({
      ...observation,
      identity: request.identity,
    }),
  };
}

// Verdict calculation remains exclusively in the existing protected store.
// Callers must freshly load original artifacts immediately before assessment.
export function futureEvaluationVerdict(
  requestInput: FutureEvaluationRequest,
  evidence: unknown,
  expected: { descriptor: unknown; task: unknown },
) {
  const request = FutureEvaluationRequestSchema.parse(requestInput);
  const rebuilt = prepareFutureEvaluation({ ...expected, ...request.identity });
  if (jsonDigest(rebuilt) !== jsonDigest(request))
    return "INSUFFICIENT_EVIDENCE" as const;
  if (!isTrustedEvaluation(evidence)) return "INSUFFICIENT_EVIDENCE" as const;
  const { requiredCheckIds, ...identity } = request.identity;
  if (
    Object.entries(identity).some(
      ([key, value]) =>
        evidence.receipt[key as keyof typeof identity] !== value,
    ) ||
    !sameIds(evidence.receipt.requiredCheckIds, requiredCheckIds)
  )
    return "INSUFFICIENT_EVIDENCE" as const;
  return evidence.verification.verdict;
}
