// Counterfactual signed inputs in test-owned storage, never genuine experiment evidence.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExperimentRunV1Schema } from "../../src/lib/contracts/evidence";
import { unknownMetrics } from "../../src/lib/experiment/metrics";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { createStudyCustodyStore } from "../../scripts/experiments/tournament/custody";
import {
  RuntimeObservationSchema,
  loadTournamentArm,
  historySubject,
  type AuthenticatedArm,
} from "../../scripts/experiments/tournament/measured";
import {
  pairedRuntimeSubject,
  sharedFutureTask,
} from "../../scripts/experiments/tournament/paired";
import { studyFixture } from "./tournament-study";
import { syntheticEvaluation } from "./tournament-evidence";
export async function measuredFixture(
  options: {
    failA?: boolean;
    failB?: boolean;
    missingB?: string;
    failedAgent?: boolean;
    cleanup?: boolean;
    reverse?: boolean;
    telemetry?: boolean;
    deviation?: boolean;
  } = {},
) {
  const data = await studyFixture(
    options.telemetry
      ? {
          preparationMetrics: {
            elapsedMs: 60000,
            tokens: 200,
            costUsd: 0.5,
            iterations: 1,
            filesTouched: 2,
          },
        }
      : {},
  );
  const runtimeRoot = path.join(data.parent, "runtime-originals"),
    evaluationRoot = path.join(data.parent, "protected-evaluations");
  for (const root of [runtimeRoot, evaluationRoot])
    await mkdir(root, { mode: 0o700 });
  const loaded: AuthenticatedArm[] = [],
    armInputs = [],
    observations = [];
  const evaluations = new Map<
    string,
    Awaited<ReturnType<typeof syntheticEvaluation>>
  >();
  const studyId = data.study.draft.plan.manifest.id,
    assessmentAt = "2026-10-28T12:12:00.000Z";
  for (const variant of ["A", "B"] as const) {
    const arm = data.study.draft.plan.manifest.arms.find(
        (x) => x.variant === variant,
      )!,
      runId = arm.runId!;
    const first = (variant === "A") !== !!options.reverse;
    const startedAt = first
        ? "2026-10-28T12:06:00.000Z"
        : "2026-10-28T12:08:00.000Z",
      endedAt = first ? "2026-10-28T12:07:00.000Z" : "2026-10-28T12:09:00.000Z";
    const initialManifest =
      variant === "A"
        ? data.study.evidence.originalManifest
        : data.study.evidence.preparedManifest;
    const finalManifest = initialManifest.map((f) =>
      f.path === "src/service.ts"
        ? { ...f, sha256: sha256(`// inert final ${variant}`) }
        : { ...f },
    );
    const run = ExperimentRunV1Schema.parse({
      schemaVersion: "experiment-run.v1",
      id: runId,
      variant,
      status: options.failedAgent && variant === "A" ? "failed" : "completed",
      repoCommit: arm.initialCommit,
      evaluatedTreeSha256: jsonDigest(finalManifest),
      fixtureSha256: data.study.draft.plan.manifest.fixtureSha256,
      agentConfigSha256: data.study.draft.plan.manifest.agentConfigSha256,
      evaluatorSha256: data.study.draft.plan.futureOracle.evaluatorSha256,
      requiredPolicySha256:
        data.study.draft.plan.futureOracle.requiredPolicySha256,
      isolationAttestationId: null,
      seed: 1,
      startedAt,
      endedAt,
      verificationId: `verify-receipt-${runId}`,
      receiptId: `receipt-${runId}`,
      metrics: { ...unknownMetrics(), costUsd: 999 },
      evidenceOrigin: "none",
      presentationMode: "recorded",
      limitations: ["PRIVATE_SENTINEL deliberately excluded from projection"],
    });
    const baselineId = `baseline-${variant}`;
    const baseline = await syntheticEvaluation({
      root: evaluationRoot,
      workspace: data.workspace,
      identity: {
        runId: baselineId,
        evaluatedTreeSha256: arm.initialTreeSha256,
        fixtureSha256: run.fixtureSha256,
        ...data.study.draft.plan.baselineOracle,
      },
      startedAt: "2026-10-28T12:04:00.000Z",
      finishedAt: "2026-10-28T12:04:30.000Z",
    });
    const future = await syntheticEvaluation({
      root: evaluationRoot,
      workspace: data.workspace,
      identity: {
        runId,
        evaluatedTreeSha256: run.evaluatedTreeSha256!,
        fixtureSha256: run.fixtureSha256,
        ...data.study.draft.plan.futureOracle,
      },
      startedAt: startedAt.replace(":00.000Z", ":10.000Z"),
      finishedAt: endedAt,
      fail:
        (variant === "A" && options.failA) || (variant === "B" && options.failB)
          ? "team-permissions-adversarial"
          : undefined,
      missing: variant === "B" ? options.missingB : undefined,
    });
    evaluations.set(baselineId, baseline);
    evaluations.set(runId, future);
    const original = RuntimeObservationSchema.parse({
      schemaVersion: "tournament-runtime-original.local.v1",
      origin: "actual_supervised_agent",
      run,
      implementationSha256:
        data.study.draft.plan.baselineOracle.evaluatorSha256,
      taskDefinitionSha256: data.study.draft.taskDefinitionSha256,
      sharedTaskSha256: jsonDigest(sharedFutureTask(data.study)),
      initialManifest,
      finalManifest,
      baselineRunId: baselineId,
      deviations:
        options.deviation && variant === "A"
          ? ["OPPOSING_OUTCOME_EXPOSED"]
          : [],
      finalization: {
        terminationConfirmed: true,
        restartAbsenceConfirmed: true,
        exportWithoutGuestExecution: true,
      },
      cleanup: {
        workersAbsent: options.cleanup !== false,
        scratchRemoved: true,
        ownedLeaseReleased: true,
      },
    });
    const admission = (await data.hold({
      id: `admission-${variant}`,
      studyId,
      kind: "runtime",
      heldAt: "2026-10-28T12:05:30.000Z",
      subjectSha256: pairedRuntimeSubject(
        data.study,
        original.implementationSha256,
        variant,
      ),
      predecessorSha256: data.study.prepared.sha256,
    }))!;
    const execution = (await data.hold({
      id: `execution-${variant}`,
      studyId,
      kind: "execution",
      heldAt: "2026-10-28T12:09:30.000Z",
      subjectSha256: jsonDigest(original),
      predecessorSha256: admission.sha256,
    }))!;
    await mkdir(path.join(runtimeRoot, runId), { mode: 0o700 });
    await writeFile(
      path.join(runtimeRoot, runId, "runtime-observation.json"),
      canonicalJson(original),
      { mode: 0o400 },
    );
    let telemetryId: string | undefined;
    if (options.telemetry) {
      const telemetry = {
        runOriginalSha256: execution.sha256,
        metrics: {
          elapsedMs: 60000,
          tokens: 100,
          costUsd: 0.1,
          iterations: 1,
          filesTouched: 1,
        },
        inputTokens: 60,
        outputTokens: 40,
        actualChargeSource: "provider_invoice",
        reservedMicroUsd: 500000,
      };
      telemetryId = `telemetry-${variant}`;
      await writeFile(
        path.join(runtimeRoot, runId, "telemetry.json"),
        canonicalJson(telemetry),
        { mode: 0o400 },
      );
      await data.hold({
        id: telemetryId,
        studyId,
        kind: "telemetry",
        heldAt: "2026-10-28T12:10:00.000Z",
        subjectSha256: jsonDigest(telemetry),
        predecessorSha256: execution.sha256,
      });
    }
    const input = {
      study: data.study,
      variant,
      root: runtimeRoot,
      workspaceRoots: [data.workspace],
      loadRecord: async (id: string) =>
        (await createStudyCustodyStore(data.config)).load(id),
      admissionId: admission.record.id,
      executionId: execution.record.id,
      telemetryId,
      loadEvaluation: async (id: string) =>
        evaluations.get(id)?.store.load(id) ?? null,
      assessmentAt,
    };
    armInputs.push(input);
    observations.push(original);
    const armEvidence = await loadTournamentArm(input);
    if (!armEvidence)
      throw new Error("Synthetic original fixture failed authentication.");
    loaded.push(armEvidence);
  }
  const ordered = [...loaded].sort(
    (a, b) =>
      Date.parse(a.original.run.startedAt) -
      Date.parse(b.original.run.startedAt),
  );
  const history = await data.hold({
    id: "complete-history",
    studyId,
    kind: "execution",
    heldAt: "2026-10-28T12:11:00.000Z",
    subjectSha256: historySubject(data.study, ordered),
    predecessorSha256: data.study.prepared.sha256,
  });
  return {
    ...data,
    runtimeRoot,
    evaluationRoot,
    loaded,
    armInputs,
    observations,
    evaluations,
    history,
    assessmentAt,
  };
}
