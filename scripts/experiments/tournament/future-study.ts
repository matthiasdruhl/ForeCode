import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  GitCommitSchema,
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";
import {
  MetricsSchema,
  type ExperimentRunV1,
} from "../../../src/lib/contracts/evidence";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import {
  FutureTaskSchema,
  futureTaskDigest,
  futureTaskRequest,
  validateFutureTask,
} from "../../../src/lib/experiment/future-task";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { isTrustedEvaluation } from "../../../src/server/artifacts/evaluation-store";
import {
  FutureOracleDescriptorSchema,
  validateFutureOracle,
} from "../../evaluator/booking-v1/future";
import { disjoint, privateDirectory, protectedRead } from "../artifacts/files";
import { TournamentPlanSchema, validateTournamentPlan } from "./plan";
import { buildTournamentReport } from "./report";

const SourceSchema = z.strictObject({
  commit: GitCommitSchema,
  treeSha256: Sha256Schema,
  dependencyLockSha256: Sha256Schema,
});
export const PreparationRecordSchema = z.strictObject({
  schemaVersion: z.literal("booking-preparation.local.v1"),
  studyId: IdSchema,
  variant: z.literal("B"),
  taskDefinitionSha256: Sha256Schema,
  protocolSha256: Sha256Schema,
  original: SourceSchema,
  prepared: SourceSchema,
  preparationPromptSha256: Sha256Schema,
  reviewRecordSha256: Sha256Schema,
  executionRecordSha256: Sha256Schema,
  startedAt: UtcTimestampSchema,
  finishedAt: UtcTimestampSchema,
  metrics: MetricsSchema,
});
export const ExecutionConditionsSchema = z.strictObject({
  variant: z.enum(["A", "B"]),
  agentId: IdSchema,
  modelId: IdSchema,
  resources: z.strictObject({
    cpus: z.number().int().min(1).max(64),
    memoryMiB: z.number().int().min(1).max(65536),
    pids: z.number().int().min(1).max(4096),
    diskMiB: z.number().int().min(1).max(1048576),
    outputBytes: z.number().int().min(1).max(16777216),
  }),
});
// Local supplement: neither this nor the embedded frozen plan authorizes work.
export const FutureStudyDraftSchema = z.strictObject({
  schemaVersion: z.literal("booking-future-study.local.v1"),
  task: FutureTaskSchema,
  taskDefinitionSha256: Sha256Schema,
  plan: TournamentPlanSchema,
  futureOracle: FutureOracleDescriptorSchema,
  executionConditions: z.array(ExecutionConditionsSchema).length(2),
  preparationRecordSha256: Sha256Schema.nullable(),
  proposedChronology: z.strictObject({
    independentFreezeAt: UtcTimestampSchema,
    architectureSelectionAt: UtcTimestampSchema,
  }),
});
export type FutureStudyDraft = z.infer<typeof FutureStudyDraftSchema>;

export function validateFutureStudy(input: unknown): FutureStudyDraft {
  const draft = FutureStudyDraftSchema.parse(input);
  const task = validateFutureTask(draft.task);
  const plan = validateTournamentPlan(draft.plan);
  const oracle = validateFutureOracle(draft.futureOracle, task);
  invariant(
    draft.taskDefinitionSha256 === futureTaskDigest(task),
    "Changed future task commitment.",
  );
  invariant(
    plan.manifest.taskId === task.id &&
      plan.scenario.request === futureTaskRequest(task) &&
      sameIds(plan.scenario.acceptanceIds, [
        ...task.acceptance.map((item) => item.id),
        ...task.invariants,
      ]),
    "Downstream task instructions or acceptance differ.",
  );
  invariant(
    jsonDigest(plan.baselineOracle) === jsonDigest(oracle.baselineOracle) &&
      jsonDigest(plan.futureOracle) === jsonDigest(oracle.oracle),
    "Study evaluator or policy substitution.",
  );
  invariant(
    sameIds(
      draft.executionConditions.map((arm) => arm.variant),
      ["A", "B"],
    ),
    "Execution conditions must contain A/B once.",
  );
  const [{ variant: a, ...left }, { variant: b, ...right }] =
    draft.executionConditions as [
      z.infer<typeof ExecutionConditionsSchema>,
      z.infer<typeof ExecutionConditionsSchema>,
    ];
  invariant(
    a !== b && jsonDigest(left) === jsonDigest(right),
    "Unequal downstream agent/model/resource conditions.",
  );
  invariant(
    Date.parse(draft.proposedChronology.independentFreezeAt) <
      Date.parse(draft.proposedChronology.architectureSelectionAt) &&
      Date.parse(draft.proposedChronology.architectureSelectionAt) <
        Date.parse(plan.manifest.frozenAt),
    "Invalid proposed freeze/selection chronology.",
  );
  return draft;
}

// Freeze this projection BEFORE selection: prepared trees, observed preparation
// metrics and the later pair freeze cannot be known then. The complete draft
// commitment is separate and must be held before downstream attempts.
export function futureProtocolDocument(input: unknown) {
  const draft = validateFutureStudy(input);
  const plan = draft.plan;
  return {
    schemaVersion: "booking-future-protocol-commitment.local.v1" as const,
    task: draft.task,
    futureOracle: draft.futureOracle,
    conditions: plan.conditions,
    executionConditions: draft.executionConditions,
    trialPolicy: plan.trialPolicy,
    studyKind: plan.studyKind,
    intentRevision: plan.intentRevision,
    scenario: plan.scenario,
    studyId: plan.manifest.id,
    fixtureSha256: plan.manifest.fixtureSha256,
    arms: plan.manifest.arms.map(({ variant, runId }) => ({ variant, runId })),
  };
}

export function futureProtocolCommitment(input: unknown): string {
  return jsonDigest(futureProtocolDocument(input));
}

export function requireFutureStudyCommitments(
  input: unknown,
  expected: { protocolSha256: string; draftSha256: string },
) {
  const draft = validateFutureStudy(input);
  invariant(
    futureProtocolCommitment(draft) ===
      Sha256Schema.parse(expected.protocolSha256) &&
      jsonDigest(draft) === Sha256Schema.parse(expected.draftSha256),
    "Future study changed after commitment.",
  );
  return draft;
}

type PreparationRecord = z.infer<typeof PreparationRecordSchema>;
type LoadedPreparation = Readonly<{
  record: PreparationRecord;
  sha256: string;
}>;
const loadedRecords = new WeakSet<object>();
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Operator supplies the pin out of band. This authenticates only exact local
// bytes/custody, NOT the referenced review, execution telemetry or chronology.
export async function loadPreparationRecord(input: {
  filename: string;
  expectedSha256: string;
  agentWorkspaceRoots: readonly string[];
}): Promise<LoadedPreparation | null> {
  try {
    Sha256Schema.parse(input.expectedSha256);
    invariant(
      path.isAbsolute(input.filename) && input.agentWorkspaceRoots.length > 0,
      "Missing custody roots.",
    );
    const directory = await privateDirectory(path.dirname(input.filename));
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    disjoint(directory, repository);
    disjoint(directory, path.resolve(repository, "../AgentHarness-Planning"));
    for (const workspace of input.agentWorkspaceRoots)
      disjoint(directory, await realpath(workspace));
    const bytes = await protectedRead(input.filename);
    invariant(
      sha256(bytes) === input.expectedSha256,
      "Preparation pin mismatch.",
    );
    const record = PreparationRecordSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const loaded = freeze({ record, sha256: input.expectedSha256 });
    loadedRecords.add(loaded);
    return loaded;
  } catch {
    return null;
  }
}

export function assessFutureStudy(input: {
  draft: unknown;
  preparation?: unknown;
  attempts?: readonly ExperimentRunV1[];
  baselines?: ReadonlyMap<"A" | "B", unknown>;
  evaluations?: ReadonlyMap<string, unknown>;
}) {
  const draft = validateFutureStudy(input.draft);
  const report = buildTournamentReport({
    plan: draft.plan,
    attempts: input.attempts ?? [],
    baselines: input.baselines,
    evaluations: input.evaluations,
  });
  const blockers = [
    "OWNER_TASK_DECISIONS_NOT_INDEPENDENTLY_APPROVED",
    "PRIVATE_FUTURE_ORACLE_NOT_PROVISIONED",
    "FUTURE_GUEST_BRIDGE_NOT_REVIEWED_OR_INSTALLED",
    "INDEPENDENT_PREREGISTRATION_NOT_AUTHENTICATED",
  ];
  const deviations: string[] = [...report.deviations];
  if (
    !input.preparation ||
    typeof input.preparation !== "object" ||
    !loadedRecords.has(input.preparation)
  ) {
    blockers.push("B_PREPARATION_RECORD_MISSING_OR_UNAUTHENTICATED");
  } else {
    const loaded = input.preparation as LoadedPreparation;
    const record = loaded.record;
    const condition = draft.plan.conditions[0]!;
    const arm = draft.plan.manifest.arms.find((item) => item.variant === "B")!;
    if (
      loaded.sha256 !== draft.preparationRecordSha256 ||
      record.studyId !== draft.plan.manifest.id ||
      record.taskDefinitionSha256 !== draft.taskDefinitionSha256 ||
      record.protocolSha256 !== futureProtocolCommitment(draft) ||
      record.original.commit !== condition.originalCommit ||
      record.original.treeSha256 !== condition.originalTreeSha256 ||
      record.original.dependencyLockSha256 !== condition.dependencyLockSha256 ||
      record.prepared.commit !== arm.initialCommit ||
      record.prepared.treeSha256 !== arm.initialTreeSha256 ||
      record.prepared.dependencyLockSha256 !== condition.dependencyLockSha256 ||
      jsonDigest(record.metrics) !== jsonDigest(arm.upfrontMetrics)
    )
      deviations.push("B_PREPARATION_BINDING_MISMATCH");
    if (
      Date.parse(record.startedAt) <
        Date.parse(draft.proposedChronology.architectureSelectionAt) ||
      Date.parse(record.finishedAt) < Date.parse(record.startedAt) ||
      Date.parse(record.finishedAt) >= Date.parse(draft.plan.manifest.frozenAt)
    )
      deviations.push("B_PREPARATION_CHRONOLOGY_INVALID");
    const baseline = input.baselines?.get("B");
    if (
      isTrustedEvaluation(baseline) &&
      Date.parse(baseline.receipt.startedAt) < Date.parse(record.finishedAt)
    )
      deviations.push("B_BASELINE_PRECEDES_PREPARATION");
    blockers.push(
      "B_PREPARATION_REVIEW_AND_TELEMETRY_NOT_INDEPENDENTLY_AUTHENTICATED",
    );
  }
  return {
    ...report,
    kind: "private_local_future_study_assessment" as const,
    draftSha256: jsonDigest(draft),
    protocolSha256: futureProtocolCommitment(draft),
    taskDefinitionSha256: draft.taskDefinitionSha256,
    oracleDescriptorSha256: jsonDigest(draft.futureOracle),
    comparability: deviations.length
      ? ("NOT_COMPARABLE" as const)
      : ("BLOCKED" as const),
    deviations: [...new Set(deviations)],
    blockers: [...report.blockers, ...blockers],
    oracleProvisioning: "BLOCKED" as const,
    behavioralOracleExecution: "NOT_RUN" as const,
    evidenceOrigin: "none" as const,
  };
}
