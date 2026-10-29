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
import { bookingPolicy, freezeBooking } from "./freeze";
import { assembleEvaluatorReceipt } from "./receipt";
import {
  validateGradeInput,
  validateGradeReport,
  type GradeInput,
  type TeamGradeProfile,
} from "./grade-profile";
import type { CandidateEnvelope } from "../../experiments/artifacts/files";

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

// Operator-local data preparation only. No guest/agent lifecycle or publication.
// Baseline runtime adapters explicitly refuse this profile.
export async function prepareTeamGradeInput(input: {
  descriptor: unknown;
  task: unknown;
  request: FutureEvaluationRequest;
  candidate: CandidateEnvelope;
  workerImage: string;
}): Promise<GradeInput> {
  const descriptor = validateFutureOracle(input.descriptor, input.task);
  const pins = await freezeBooking();
  const baseline = {
    evaluatorSha256: pins.evaluatorSha256,
    testSuiteSha256: pins.testSuiteSha256,
    requiredPolicySha256: pins.requiredPolicySha256,
    requiredCheckIds: [...bookingPolicy.requiredCheckIds],
  };
  invariant(
    jsonDigest(baseline) === jsonDigest(descriptor.baselineOracle),
    "Stale public evaluator dependencies.",
  );
  const request = prepareFutureEvaluation({
    descriptor,
    task: input.task,
    ...input.request.identity,
  });
  invariant(
    jsonDigest(request) === jsonDigest(input.request) &&
      request.identity.fixtureSha256 === pins.fixtureSha256,
    "Future request or fixture mismatch.",
  );
  const lock = pins.fixtureManifest.find(
    (file) => file.path === "package-lock.json",
  );
  invariant(lock, "Baseline dependency lock absent.");
  const profile: TeamGradeProfile = {
    kind: "booking-team-permissions.v1",
    taskId: "booking-team-permissions-v1",
    taskDefinitionSha256:
      descriptor.taskDefinitionSha256 as TeamGradeProfile["taskDefinitionSha256"],
    descriptorSha256: jsonDigest(descriptor),
    fixtureSha256: pins.fixtureSha256,
    dependencyLockSha256: lock.sha256,
    baselineEvaluatorSha256: pins.evaluatorSha256,
    evaluatorSha256: descriptor.oracle.evaluatorSha256,
    testSuiteSha256: descriptor.oracle.testSuiteSha256,
    requiredPolicySha256: descriptor.oracle.requiredPolicySha256,
  };
  const {
    runId,
    evaluatedTreeSha256,
    evaluatorSha256,
    testSuiteSha256,
    requiredPolicySha256,
  } = request.identity;
  return validateGradeInput({
    runId,
    evaluatedTreeSha256,
    evaluatorSha256,
    testSuiteSha256,
    requiredPolicySha256,
    candidate: input.candidate,
    workerImage: input.workerImage,
    evaluationProfile: profile,
  });
}

export function validateTeamGradeObservation(
  raw: unknown,
  input: GradeInput,
  request: FutureEvaluationRequest,
) {
  const checked = validateGradeInput(input);
  invariant(
    checked.evaluationProfile &&
      checked.runId === request.identity.runId &&
      checked.evaluatedTreeSha256 === request.identity.evaluatedTreeSha256 &&
      checked.evaluationProfile.fixtureSha256 ===
        request.identity.fixtureSha256 &&
      checked.evaluationProfile.descriptorSha256 === request.descriptorSha256 &&
      checked.evaluationProfile.taskDefinitionSha256 ===
        request.taskDefinitionSha256,
    "Future observation request mismatch.",
  );
  for (const key of [
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
  ] as const)
    invariant(
      checked[key] === request.identity[key],
      "Future request policy mismatch.",
    );
  invariant(
    sameIds(request.identity.requiredCheckIds, futureCheckIds),
    "Future request required checks mismatch.",
  );
  return validateGradeReport(
    raw,
    {
      runId: checked.runId,
      evaluatedTreeSha256: checked.evaluatedTreeSha256,
      evaluatorSha256: checked.evaluatorSha256,
      testSuiteSha256: checked.testSuiteSha256,
      requiredPolicySha256: checked.requiredPolicySha256,
    },
    checked.evaluationProfile,
  );
}
