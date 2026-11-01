// SYNTHETIC ONLY. Disposable signing material and inert source strings. Nothing
// here is a private study original, an oracle assertion, or an actual agent run.
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { matchedConditionsDigest } from "../../src/lib/experiment/study-identities";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { canonicalJson } from "../../src/lib/report/canonical";
import {
  MetricProtocolSchema,
  type MetricObservations,
} from "../../src/lib/experiment/prospective-metrics";
import { createStudyCustodyStore } from "../../scripts/experiments/tournament/custody";
import {
  loadTournamentArm,
  historySubject,
} from "../../scripts/experiments/tournament/measured";
import {
  collectMetricSnapshotOriginal,
  createProtectedMetricObservationReader,
  metricMeasurementStatus,
  metricBaselineEvaluationRunId,
  type MetricObservationReaderConfig,
  type SupplementaryMetricOriginalSchema,
} from "../../scripts/experiments/tournament/metric-observation";
import { readProtectedAuthorizationCases } from "../../scripts/evaluator/booking-v1/metric-authorization";
import { measuredFixture } from "./tournament-measured";
import { syntheticEvaluation } from "./tournament-evidence";
import type { z } from "zod";

export async function removeMetricFixture(directory: string) {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory())
      await removeMetricFixture(path.join(directory, entry.name));
  await rm(directory, { recursive: true, force: true });
}
async function seal(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory()) await seal(path.join(directory, entry.name));
  await chmod(directory, 0o500);
}
export async function protectedMetricFixture(
  options: {
    measured?: Awaited<ReturnType<typeof measuredFixture>>;
    registered?: {
      protocol: import("../../src/lib/experiment/prospective-metrics").MetricProtocol;
      commitmentId: string;
      resolveRegistration: () => Promise<unknown>;
    };
    codeA?: string;
    codeB?: string;
    failB?: boolean;
    failedAgent?: boolean;
    statusA?: "failed" | "cancelled" | "timed_out" | "blocked";
  } = {},
) {
  const f =
    options.measured ??
    (await measuredFixture({
      failB: options.failB,
      failedAgent: options.failedAgent,
    }));
  const p = MetricProtocolSchema.parse(
    options.registered?.protocol ?? {
      schemaVersion: "prospective-tournament-metrics.v1",
      studyId: f.study.draft.plan.manifest.id,
      hypothesisId: "12345678-1234-4234-8234-123456789012",
      contextSha256: "a".repeat(64),
      taskSha256: f.study.draft.taskDefinitionSha256,
      matchedConditionsSha256: matchedConditionsDigest(f.study.definition),
      evaluatorSha256: f.study.draft.plan.futureOracle.evaluatorSha256,
      suiteSha256: f.study.draft.plan.futureOracle.testSuiteSha256,
      policySha256: f.study.draft.plan.futureOracle.requiredPolicySha256,
      externalPackages: [],
      stylesheetPaths: [],
      // A synthetic self-edge makes counts adjustable without changing the
      // shared study fixture's independently held prepared-source inventories.
      boundaryRules: [
        {
          id: "synthetic-self-edge",
          from: "src/service.ts",
          to: "src/service.ts",
        },
      ],
      authorizationCaseIds: f.study.definition.protocol.task.acceptance.map(
        (c) => c.id,
      ),
      observationWindow: "prepared_baseline_and_sealed_final_tree",
      duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
      prediction: "B_fewer_final_forbidden_edges_than_A",
    },
  );
  const root = path.join(f.parent, "metric-originals"),
    evaluationRoot = path.join(f.parent, "metric-evaluations");
  await mkdir(root, { mode: 0o700 });
  await mkdir(evaluationRoot, { mode: 0o700 });
  const commitment = options.registered
    ? (await createStudyCustodyStore(f.config)).load(
        options.registered.commitmentId,
      )
    : f.hold({
        id: "metric-commitment",
        studyId: p.studyId,
        kind: "protocol",
        heldAt: "2026-10-28T12:00:00.000Z",
        subjectSha256: jsonDigest(p),
        predecessorSha256: f.study.protocol.sha256,
      });
  const heldCommitment = (await commitment)!;
  const sources: MetricObservationReaderConfig["sources"] extends ReadonlyMap<
    infer K,
    infer V
  >
    ? Map<K, V>
    : never = new Map();
  const arms: z.infer<typeof SupplementaryMetricOriginalSchema>["arms"] = [];
  const observations: MetricObservations = {
    schemaVersion: "prospective-tournament-observations.v1",
    studyId: p.studyId,
    protocolSha256: jsonDigest(p),
    taskSha256: p.taskSha256,
    matchedConditionsSha256: p.matchedConditionsSha256,
    evaluatorSha256: p.evaluatorSha256,
    suiteSha256: p.suiteSha256,
    policySha256: p.policySha256,
    arms: [],
  };
  for (const [i, variant] of (["A", "B"] as const).entries()) {
    const original = f.observations[i]!;
    if (variant === "A" && options.statusA)
      original.run.status = options.statusA;
    const code =
      variant === "A"
        ? (options.codeA ?? 'import "./service";')
        : (options.codeB ?? "// inert final B");
    original.finalManifest = original.finalManifest!.map((file) =>
      file.path === "src/service.ts" ? { ...file, sha256: sha256(code) } : file,
    );
    original.run.evaluatedTreeSha256 = jsonDigest(original.finalManifest);
    const future = await syntheticEvaluation({
      root: evaluationRoot,
      workspace: f.workspace,
      identity: {
        ...f.evaluations.get(original.run.id)!.entry.identity,
        evaluatedTreeSha256: original.run.evaluatedTreeSha256,
      },
      startedAt: f.evaluations.get(original.run.id)!.loaded!.receipt.startedAt,
      finishedAt: original.run.endedAt,
      fail:
        variant === "B" && options.failB
          ? "team-permissions-adversarial"
          : undefined,
    });
    f.evaluations.set(original.run.id, future);
    const filename = path.join(
      f.runtimeRoot,
      original.run.id,
      "runtime-observation.json",
    );
    await chmod(filename, 0o600);
    await writeFile(filename, canonicalJson(original));
    await chmod(filename, 0o400);
    const execution = (await f.hold({
      id: `metric-execution-${variant}`,
      studyId: p.studyId,
      kind: "execution",
      heldAt: "2026-10-28T12:09:30.000Z",
      subjectSha256: jsonDigest(original),
      predecessorSha256: f.loaded[i]!.admission.sha256,
    }))!;
    f.armInputs[i]!.executionId = execution.record.id;
    const arm = await loadTournamentArm(f.armInputs[i]!);
    if (!arm) throw new Error("Synthetic metric runtime failed authentication");
    f.loaded[i] = arm;
    const baselineEvaluationRunId = metricBaselineEvaluationRunId(
      original.run.id,
    );
    const baseline = await syntheticEvaluation({
      root: evaluationRoot,
      workspace: f.workspace,
      identity: {
        ...future.entry.identity,
        runId: baselineEvaluationRunId,
        evaluatedTreeSha256: jsonDigest(original.initialManifest),
      },
      startedAt: "2026-10-28T12:05:35.000Z",
      finishedAt: "2026-10-28T12:05:40.000Z",
    });
    f.evaluations.set(baselineEvaluationRunId, baseline);
    const finalRoot = path.join(f.parent, `metric-final-${variant}`);
    await mkdir(path.join(finalRoot, "src"), { recursive: true, mode: 0o700 });
    await writeFile(path.join(finalRoot, "package-lock.json"), "{}", {
      mode: 0o400,
    });
    await writeFile(path.join(finalRoot, "src/service.ts"), code, {
      mode: 0o400,
    });
    if (variant === "B")
      await writeFile(
        path.join(finalRoot, "src/policy.ts"),
        "// inert policy",
        { mode: 0o400 },
      );
    await seal(f.sources[variant]);
    await seal(finalRoot);
    sources.set(variant, {
      baseline: f.sources[variant],
      final: finalRoot,
      baselineEvaluationRunId,
    });
    const recorded: (typeof arms)[number] = {
      variant,
      runId: original.run.id,
      executionOriginalSha256: execution.sha256,
      baseline: null,
      final: null,
    };
    const projected: MetricObservations["arms"][number] = {
      variant,
      runId: original.run.id,
      status: original.run.status,
      baseline: null,
      final: null,
    };
    for (const role of ["baseline", "final"] as const) {
      const evaluation = role === "baseline" ? baseline : future;
      const authorization = {
        schemaVersion: "protected-authorization-cases.local.v1",
        identity: evaluation.entry.identity,
        receiptSha256: jsonDigest(evaluation.loaded!.receipt),
        cases: p.authorizationCaseIds.map((caseId, index) => ({
          caseId,
          outcome:
            role === "final" && variant === "B" && options.failB && index === 0
              ? "fail"
              : "pass",
        })),
      };
      const snapshot = await collectMetricSnapshotOriginal({
        protocol: p,
        variant,
        runId: original.run.id,
        role,
        directory: sources.get(variant)![role]!,
        manifest:
          role === "baseline"
            ? original.initialManifest
            : original.finalManifest,
        treeSha256: evaluation.entry.identity.evaluatedTreeSha256,
        authorization,
        evaluation: evaluation.loaded,
        clock: () =>
          role === "baseline"
            ? "2026-10-28T12:05:45.000Z"
            : "2026-10-28T12:09:40.000Z",
      });
      const custodyId = `metric-${role}-${variant}`;
      await f.hold({
        id: custodyId,
        studyId: p.studyId,
        kind: "telemetry",
        subjectSha256: jsonDigest(snapshot),
        predecessorSha256:
          role === "baseline"
            ? arm.admission.sha256
            : arm.originalRecord.sha256,
        heldAt:
          role === "baseline"
            ? "2026-10-28T12:05:50.000Z"
            : "2026-10-28T12:10:00.000Z",
      });
      recorded[role] = { custodyId, original: snapshot };
      projected[role] = {
        treeSha256: snapshot.treeSha256,
        boundary: snapshot.boundary,
        authorization: readProtectedAuthorizationCases(
          authorization,
          p,
          evaluation.loaded,
        ),
      };
    }
    arms.push(recorded);
    observations.arms.push(projected);
  }
  const history = await f.hold({
    id: "metric-history",
    studyId: p.studyId,
    kind: "execution",
    heldAt: "2026-10-28T12:11:00.000Z",
    subjectSha256: historySubject(f.study, f.loaded),
    predecessorSha256: f.study.prepared.sha256,
  });
  const original: z.infer<typeof SupplementaryMetricOriginalSchema> = {
    schemaVersion: "protected-tournament-metrics.local.v1",
    evidenceOrigin: "synthetic",
    protocol: p,
    metricCommitmentSha256: heldCommitment.sha256,
    preparedOriginalSha256: f.study.prepared.sha256,
    historyOriginalSha256: history!.sha256,
    observations,
    status: metricMeasurementStatus(p, observations),
    arms,
  };
  let sequence = 0;
  async function publish() {
    const filename = path.join(root, "metric-observation.json");
    if (sequence) await chmod(filename, 0o600);
    await writeFile(filename, canonicalJson(original), { mode: 0o400 });
    await chmod(filename, 0o400);
    const id = `metric-observation-${sequence++}`;
    await f.hold({
      id,
      studyId: p.studyId,
      kind: "telemetry",
      subjectSha256: jsonDigest(original),
      predecessorSha256: f.study.prepared.sha256,
      heldAt: "2026-10-28T12:11:30.000Z",
    });
    return id;
  }
  const config: MetricObservationReaderConfig = {
    protocol: p,
    root,
    workspaceRoots: [f.workspace],
    sources,
    commitmentId: heldCommitment.record.id,
    resolveRegistration: options.registered?.resolveRegistration,
    observationId: await publish(),
    loadContext: async () => ({
      study: f.study,
      arms: await Promise.all(f.armInputs.map(loadTournamentArm)),
      history,
    }),
    loadRecord: async (id) =>
      (await createStudyCustodyStore(f.config)).load(id),
    loadEvaluation: async (id) => f.evaluations.get(id)?.store.load(id) ?? null,
  };
  return {
    ...f,
    root,
    metricConfig: config,
    original,
    publish,
    sources,
    load: () =>
      createProtectedMetricObservationReader(config).load(f.assessmentAt),
  };
}
