import { z } from "zod";
import { privateDirectory, protectedRead, disjoint } from "../artifacts/files";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExperimentRunV1Schema,
  MetricsSchema,
} from "../../../src/lib/contracts/evidence";
import {
  IdSchema,
  Sha256Schema,
  RelativePathSchema,
} from "../../../src/lib/contracts/common";
import { invariant } from "../../../src/lib/contracts/validation";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import {
  unknownMetrics,
  preparationInclusiveMetrics,
} from "../../../src/lib/experiment/metrics";
import {
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { isPreparedStudy, sourceDiff, type PreparedStudy } from "./study";
import { requireHeldRecord, immutable, type HeldRecord } from "./custody";
import { pairedRuntimeSubject, sharedFutureTask, type Variant } from "./paired";
import { buildTournamentReport } from "./report";

const ManifestSchema = z
  .array(z.strictObject({ path: RelativePathSchema, sha256: Sha256Schema }))
  .min(1)
  .max(100);
export const RuntimeObservationSchema = z.strictObject({
  schemaVersion: z.literal("tournament-runtime-original.local.v1"),
  origin: z.literal("actual_supervised_agent"),
  run: ExperimentRunV1Schema,
  implementationSha256: Sha256Schema,
  taskDefinitionSha256: Sha256Schema,
  sharedTaskSha256: Sha256Schema,
  initialManifest: ManifestSchema,
  finalManifest: ManifestSchema.nullable(),
  baselineRunId: IdSchema,
  deviations: z
    .array(
      z.enum([
        "TASK_DRIFT",
        "MODEL_DRIFT",
        "BUDGET_EXCEEDED",
        "RUNTIME_DRIFT",
        "EXTRA_ATTEMPT",
        "OPPOSING_OUTCOME_EXPOSED",
        "RESOURCE_DRIFT",
      ]),
    )
    .max(16),
  finalization: z.strictObject({
    terminationConfirmed: z.boolean(),
    restartAbsenceConfirmed: z.boolean(),
    exportWithoutGuestExecution: z.boolean(),
  }),
  cleanup: z.strictObject({
    workersAbsent: z.boolean(),
    scratchRemoved: z.boolean(),
    ownedLeaseReleased: z.boolean(),
  }),
});
export const TelemetrySchema = z.strictObject({
  runOriginalSha256: Sha256Schema,
  metrics: MetricsSchema,
  inputTokens: z.number().int().nonnegative().max(2147483647).nullable(),
  outputTokens: z.number().int().nonnegative().max(2147483647).nullable(),
  actualChargeSource: z.enum(["provider_invoice", "unknown"]),
  reservedMicroUsd: z.number().int().nonnegative().max(10000000000).nullable(),
});
type Observed = z.infer<typeof RuntimeObservationSchema>;
type Telemetry = z.infer<typeof TelemetrySchema>;
export type AuthenticatedArm = Readonly<{
  variant: Variant;
  original: Observed;
  originalRecord: HeldRecord;
  admission: HeldRecord;
  baseline: TrustedEvaluation;
  future: TrustedEvaluation | null;
  telemetry: Telemetry | null;
  changedFiles: string[] | null;
}>;
const arms = new WeakSet<object>();
const reports = new WeakSet<object>();
export function isAuthenticatedArm(value: unknown): value is AuthenticatedArm {
  return !!value && typeof value === "object" && arms.has(value);
}
export async function loadTournamentArm(input: {
  study: PreparedStudy;
  variant: Variant;
  root: string;
  workspaceRoots: readonly string[];
  loadRecord(id: string): Promise<unknown>;
  admissionId: string;
  executionId: string;
  telemetryId?: string;
  loadEvaluation(id: string): Promise<unknown>;
  assessmentAt: string;
}): Promise<AuthenticatedArm | null> {
  try {
    invariant(isPreparedStudy(input.study), "Authenticated study required.");
    const study = input.study,
      plan = study.draft.plan,
      arm = plan.manifest.arms.find((x) => x.variant === input.variant)!;
    const root = await privateDirectory(input.root),
      repository = fileURLToPath(new URL("../../../", import.meta.url));
    disjoint(root, repository);
    disjoint(root, path.resolve(repository, "../AgentHarness-Planning"));
    invariant(input.workspaceRoots.length > 0, "Workspace inventory required.");
    for (const workspace of input.workspaceRoots)
      disjoint(root, await realpath(workspace));
    const runId = z.string().uuid().parse(arm.runId);
    await privateDirectory(path.join(root, runId));
    const bytes = await protectedRead(
      path.join(root, runId, "runtime-observation.json"),
    );
    const original = RuntimeObservationSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const run = original.run;
    invariant(
      run.id === runId &&
        run.variant === input.variant &&
        original.implementationSha256 === plan.baselineOracle.evaluatorSha256 &&
        original.taskDefinitionSha256 === study.draft.taskDefinitionSha256 &&
        original.sharedTaskSha256 === jsonDigest(sharedFutureTask(study)) &&
        jsonDigest(original.initialManifest) === arm.initialTreeSha256,
      "Runtime source/task/model binding mismatch.",
    );
    const admission = requireHeldRecord(
      await input.loadRecord(input.admissionId),
      {
        studyId: plan.manifest.id,
        kind: "runtime",
        subjectSha256: pairedRuntimeSubject(
          study,
          original.implementationSha256,
          input.variant,
        ),
        predecessorSha256: study.prepared.sha256,
        at: run.startedAt,
      },
    );
    const originalRecord = requireHeldRecord(
      await input.loadRecord(input.executionId),
      {
        studyId: plan.manifest.id,
        kind: "execution",
        subjectSha256: sha256(bytes),
        predecessorSha256: admission.sha256,
        at: input.assessmentAt,
      },
    );
    invariant(
      Date.parse(originalRecord.record.heldAt) >= Date.parse(run.endedAt) &&
        Date.parse(run.startedAt) >=
          Date.parse(study.draft.plan.manifest.frozenAt),
      "Execution custody chronology invalid.",
    );
    const baseline = await input.loadEvaluation(original.baselineRunId);
    invariant(isTrustedEvaluation(baseline), "Original baseline unavailable.");
    const future = await input.loadEvaluation(run.id);
    invariant(
      future === null || isTrustedEvaluation(future),
      "Forged future evaluation.",
    );
    invariant(
      input.variant !== "B" ||
        Date.parse(baseline.receipt.startedAt) >=
          Date.parse(study.evidence.record.finishedAt),
      "Baseline precedes preparation.",
    );
    if (original.finalManifest)
      invariant(
        jsonDigest(original.finalManifest) === run.evaluatedTreeSha256,
        "Final candidate substitution.",
      );
    let telemetry: Telemetry | null = null;
    if (input.telemetryId) {
      const metricsBytes = await protectedRead(
        path.join(root, runId, "telemetry.json"),
      );
      telemetry = TelemetrySchema.parse(
        JSON.parse(metricsBytes.toString("utf8")),
      );
      requireHeldRecord(await input.loadRecord(input.telemetryId), {
        studyId: plan.manifest.id,
        kind: "telemetry",
        subjectSha256: jsonDigest(telemetry),
        predecessorSha256: originalRecord.sha256,
        at: input.assessmentAt,
      });
      invariant(
        telemetry.runOriginalSha256 === originalRecord.sha256,
        "Telemetry from another run.",
      );
      const m = telemetry.metrics;
      invariant(
        m.elapsedMs === null ||
          m.elapsedMs === Date.parse(run.endedAt) - Date.parse(run.startedAt),
        "Inconsistent measured elapsed time.",
      );
      invariant(
        m.tokens === null ||
          (telemetry.inputTokens !== null &&
            telemetry.outputTokens !== null &&
            m.tokens === telemetry.inputTokens + telemetry.outputTokens),
        "Inconsistent provider usage.",
      );
      invariant(
        m.costUsd === null ||
          telemetry.actualChargeSource === "provider_invoice",
        "Reservation or tariff estimate is not measured cost.",
      );
    }
    const changedFiles = original.finalManifest
      ? sourceDiff(original.initialManifest, original.finalManifest)
      : null;
    const loaded = immutable({
      variant: input.variant,
      original,
      originalRecord,
      admission,
      baseline,
      future: isTrustedEvaluation(future) ? future : null,
      telemetry,
      changedFiles,
    });
    arms.add(loaded);
    return loaded;
  } catch {
    return null;
  }
}
export function historySubject(
  study: PreparedStudy,
  loaded: readonly AuthenticatedArm[],
) {
  return jsonDigest({
    draftSha256: jsonDigest(study.draft),
    orderedExecutionOriginals: loaded.map((x) => x.originalRecord.sha256),
    preparationAttemptIds: study.evidence.attempts.map((x) => x.id),
    attemptIds: loaded.map((x) => x.original.run.id),
    completeAttemptHistory: true,
  });
}
export function buildMeasuredTournamentReport(input: {
  study: unknown;
  arms: readonly unknown[];
  history?: unknown;
  assessmentAt: string;
}) {
  invariant(isPreparedStudy(input.study), "Original prepared study required.");
  const study = input.study,
    loaded = input.arms.filter(isAuthenticatedArm),
    blockers: string[] = [],
    deviations: string[] = [];
  if (loaded.length !== input.arms.length)
    blockers.push("UNAUTHENTICATED_RUNTIME_ORIGINALS");
  if (loaded.length !== 2 || new Set(loaded.map((x) => x.variant)).size !== 2)
    blockers.push("COMPLETE_MATCHED_ARMS_REQUIRED");
  const ordered = [...loaded].sort(
    (a, b) =>
      Date.parse(a.original.run.startedAt) -
      Date.parse(b.original.run.startedAt),
  );
  try {
    const history = requireHeldRecord(input.history, {
      studyId: study.draft.plan.manifest.id,
      kind: "execution",
      subjectSha256: historySubject(study, ordered),
      predecessorSha256: study.prepared.sha256,
      at: input.assessmentAt,
    });
    invariant(
      loaded.every(
        (arm) =>
          Date.parse(history.record.heldAt) >=
          Date.parse(arm.original.run.endedAt),
      ),
      "History commitment precedes outcomes.",
    );
  } catch {
    blockers.push("COMPLETE_ORIGINAL_ATTEMPT_HISTORY_NOT_AUTHENTICATED");
  }
  const local = buildTournamentReport({
    plan: study.draft.plan,
    attempts: loaded.map((x) => x.original.run),
    baselines: new Map(loaded.map((x) => [x.variant, x.baseline])),
    evaluations: new Map(loaded.map((x) => [x.original.run.id, x.future])),
  });
  deviations.push(...local.deviations);
  for (const arm of loaded) {
    const r = arm.original;
    deviations.push(...r.deviations);
    const budget = study.definition.protocol.conditions[0]!.budget,
      m = arm.telemetry?.metrics;
    if (
      (m?.tokens !== null &&
        m?.tokens !== undefined &&
        m.tokens > budget.tokenLimit!) ||
      (m?.costUsd !== null &&
        m?.costUsd !== undefined &&
        m.costUsd > budget.spendUsd!) ||
      (m?.iterations !== null &&
        m?.iterations !== undefined &&
        m.iterations > budget.maxIterations) ||
      (arm.telemetry?.reservedMicroUsd !== null &&
        arm.telemetry?.reservedMicroUsd !== undefined &&
        arm.telemetry.reservedMicroUsd > budget.spendUsd! * 1000000)
    )
      deviations.push(`${arm.variant}_FROZEN_BUDGET_EXCEEDED`);
    if (
      !Object.values(r.cleanup).every(Boolean) ||
      !Object.values(r.finalization).every(Boolean)
    )
      blockers.push(`${arm.variant}_FINALIZATION_OR_CLEANUP_UNCONFIRMED`);
    if (r.run.status !== "completed")
      blockers.push(`${arm.variant}_ATTEMPT_${r.run.status.toUpperCase()}`);
  }
  if (local.arms.some((x) => x.baselineVerdict !== "VERIFIED"))
    blockers.push("BASELINE_CORRECTNESS_NOT_ESTABLISHED");
  if (local.arms.some((x) => x.verdict === "INSUFFICIENT_EVIDENCE"))
    blockers.push("FUTURE_CORRECTNESS_EVIDENCE_INSUFFICIENT");
  const reportArms = local.arms.map((arm) => {
    const observed = loaded.find((x) => x.variant === arm.variant),
      downstream = observed?.telemetry?.metrics ?? unknownMetrics();
    const total = preparationInclusiveMetrics(arm.preparation, downstream);
    const changedFiles = observed?.changedFiles ?? null;
    const preparationFiles = arm.variant === "B" ? study.changedFiles : [];
    return {
      ...arm,
      initialCommit: study.draft.plan.manifest.arms.find(
        (x) => x.variant === arm.variant,
      )!.initialCommit,
      downstream,
      total,
      changedFiles,
      totalChangedFiles: changedFiles
        ? [...new Set([...preparationFiles, ...changedFiles])].sort()
        : null,
      inputTokens: observed?.telemetry?.inputTokens ?? null,
      outputTokens: observed?.telemetry?.outputTokens ?? null,
      reservedMicroUsd: observed?.telemetry?.reservedMicroUsd ?? null,
      executionOriginalSha256: observed?.originalRecord.sha256 ?? null,
      baselineReceiptId: observed?.baseline.receipt.id ?? null,
      checks: study.draft.plan.futureOracle.requiredCheckIds.map((id) => ({
        id,
        status:
          observed?.future?.checks.find((c) => c.id === id)?.status ??
          "not_run",
      })),
      startedAt: observed?.original.run.startedAt ?? null,
      endedAt: observed?.original.run.endedAt ?? null,
    };
  });
  const a = reportArms[0]!,
    b = reportArms[1]!;
  const comparable = deviations.length === 0 && blockers.length === 0;
  const correctness = !comparable
    ? "INCONCLUSIVE"
    : a.verdict === "VERIFIED" && b.verdict === "VERIFIED"
      ? "BOTH_VERIFIED"
      : a.verdict === "VERIFIED"
        ? "A_ONLY_VERIFIED"
        : b.verdict === "VERIFIED"
          ? "B_ONLY_VERIFIED"
          : "BOTH_REJECTED";
  const report = immutable({
    kind: "private_authenticated_tournament_report" as const,
    studyId: study.draft.plan.manifest.id,
    taskId: study.draft.task.id,
    taskDefinitionSha256: study.draft.taskDefinitionSha256,
    definitionSha256: jsonDigest(study.definition),
    conditions: study.definition,
    preparationEvidence: study.evidence,
    preparedChangedFiles: study.changedFiles,
    protocolOriginalSha256: study.protocol.sha256,
    preparedOriginalSha256: study.prepared.sha256,
    model: study.definition.protocol.executionConditions[0]!.modelId,
    order: study.draft.plan.trialPolicy.order,
    baselineEvaluator: study.draft.plan.baselineOracle,
    futureEvaluator: study.draft.plan.futureOracle,
    comparability: deviations.length
      ? ("NOT_COMPARABLE" as const)
      : comparable
        ? ("COMPARABLE" as const)
        : ("INSUFFICIENT_EVIDENCE" as const),
    correctness,
    execution: loaded.length
      ? ("AUTHENTICATED_ORIGINALS" as const)
      : ("NOT_ESTABLISHED" as const),
    arms: reportArms,
    attempts: local.attempts.map(({ reportedMetrics, ...attempt }) => {
      void reportedMetrics;
      return attempt;
    }),
    preparationAttempts: study.evidence.attempts.map((x) => ({
      id: x.id,
      status: x.status,
      startedAt: x.startedAt,
      finishedAt: x.finishedAt,
    })),
    blockers: [...new Set(blockers)],
    deviations: [...new Set(deviations)],
    limitations: [
      "One visible preregistered case study, not a general productivity estimate.",
      "A/B does not isolate Meta's incremental benefit; that requires an equally informed non-Meta control.",
      "Protected verdicts apply only to the pinned source, task and required checks.",
      "Missing authenticated telemetry remains unknown. Reservations are conservative allocations, not measured charges.",
      "No composite winner: compare downstream efficiency and preparation-inclusive totals separately.",
      "Changed files count distinct final source differences across phases; total files-touched remains unknown without authenticated path histories.",
      "Private report; no publication authority is implied.",
    ],
  });
  reports.add(report);
  return report;
}
export type MeasuredTournamentReport = ReturnType<
  typeof buildMeasuredTournamentReport
>;
export function isMeasuredTournamentReport(
  value: unknown,
): value is MeasuredTournamentReport {
  return !!value && typeof value === "object" && reports.has(value);
}
