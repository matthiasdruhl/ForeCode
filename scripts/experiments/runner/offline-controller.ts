import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import {
  captureReviewedTree,
  disjoint,
  freezeCandidate,
  privateDirectory,
} from "../artifacts/files";
import { publishEvaluation } from "../artifacts/publish";
import { createProtectedEvaluationStore } from "../../../src/server/artifacts/evaluation-store";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import type { OfflineConfig } from "../isolation/offline-config";
import { offlineConfigurationDigest } from "../isolation/offline-gate";
import type { OfflineAdapter } from "./offline-sbx";
import { acceptanceCandidate, acceptanceScenarios } from "./offline-scenarios";
import { validateGradeReport } from "./protocol";
import { acquireBookingLease } from "./lease";

const project = fileURLToPath(new URL("../../../", import.meta.url));
export async function runOfflineAcceptance(
  config: OfflineConfig,
  adapter: OfflineAdapter,
  userSignal: AbortSignal,
) {
  const root = await privateDirectory(config.protectedRoot),
    scratch = await privateDirectory(config.scratchRoot);
  disjoint(root, scratch);
  disjoint(config.coordinationRoot, scratch);
  disjoint(config.coordinationRoot, project);
  disjoint(root, await realpath(project));
  disjoint(scratch, await realpath(project));
  const acceptanceId = randomUUID(),
    lease = await acquireBookingLease(config.coordinationRoot, acceptanceId);
  const directory = path.join(root, acceptanceId);
  await mkdir(directory, { mode: 0o700 });
  const startedAt = new Date().toISOString(),
    pins = await freezeBooking();
  const limits = {
    vmCpu: 2,
    vmMemoryBytes: 4 * 1024 ** 3,
    vmDiskBytes: config.vmDiskBytes,
    vmPids: config.vmPids,
    workerCpu: 1,
    workerMemoryBytes: 768 * 1024 ** 2,
    workerPids: 64,
    workerWorkBytes: 256 * 1024 ** 2,
    workerTmpBytes: 32 * 1024 ** 2,
    workerShmBytes: 16 * 1024 ** 2,
    workerDescriptors: 256,
    acceptanceSeconds: config.maxSeconds,
    graderSeconds: 580,
    cleanupSeconds: 60,
    outputBytes: config.maxOutputBytes,
  };
  const runtimePins = {
    limitsSha256: jsonDigest(limits),
    implementationSha256: pins.evaluatorSha256,
    workerImage: config.workerImage,
    graderNodeSha256: config.graderNodeSha256,
    graderLockSha256: config.graderLockSha256,
    graderModulesSha256: config.graderModulesSha256,
  };
  const evaluatorSha256 = jsonDigest(runtimePins);
  const signal = AbortSignal.any([
    userSignal,
    AbortSignal.timeout(config.maxSeconds * 1000),
  ]);
  const pending: {
    scenario: string;
    directory: string;
    candidate: Awaited<ReturnType<typeof freezeCandidate>>;
    report: ReturnType<typeof validateGradeReport>;
    expected: Parameters<typeof publishEvaluation>[1];
  }[] = [];
  const observations: unknown[] = [],
    runIds: string[] = [];
  let inventory: unknown = null,
    cleanup: unknown = null,
    failure: string | null = null,
    cleaned = false,
    interrupted = false;
  const entries: Awaited<ReturnType<typeof publishEvaluation>>[] = [];
  const verdicts: { scenario: string; verdict: string | undefined }[] = [];
  try {
    signal.throwIfAborted();
    await lease.assertOwned();
    inventory = await adapter.admit(pins.evaluatorSha256, signal);
    const baseline = await captureReviewedTree(
      path.join(project, "fixtures/booking-v1"),
      acceptanceId,
    );
    for (const scenario of acceptanceScenarios) {
      signal.throwIfAborted();
      const runId = randomUUID();
      runIds.push(runId);
      const runDirectory = path.join(root, runId);
      await mkdir(runDirectory, { mode: 0o700 });
      const candidate = await freezeCandidate(
        acceptanceCandidate(baseline, scenario, runId),
        runId,
        path.join(runDirectory, "candidate"),
        baseline,
      );
      if (
        (scenario === "baseline") !==
        (candidate.treeSha256 === pins.fixtureSha256)
      )
        throw new Error("Baseline/final selection mismatch");
      const expected = {
        runId,
        evaluatedTreeSha256: candidate.treeSha256,
        fixtureSha256: pins.fixtureSha256,
        evaluatorSha256,
        testSuiteSha256: pins.testSuiteSha256,
        requiredPolicySha256: pins.requiredPolicySha256,
        requiredCheckIds: pins.policy.requiredCheckIds,
      };
      await lease.assertOwned();
      const result = await adapter.grade(
        {
          ...expected,
          candidate: candidate.envelope,
          workerImage: config.workerImage,
        },
        signal,
      );
      observations.push({
        scenario,
        runId,
        ...result,
        stdout: sha256(result.stdout),
        stderr: sha256(result.stderr),
      });
      await writeFile(
        path.join(runDirectory, "grader-observed.txt"),
        result.stdout,
        { flag: "wx", mode: 0o400 },
      );
      if (
        result.reason !== "completed" ||
        result.exitCode !== 0 ||
        signal.aborted
      ) {
        interrupted = true;
        throw new Error("Grader interrupted");
      }
      const {
        fixtureSha256: _fixture,
        requiredCheckIds: _checks,
        ...reportIdentity
      } = expected;
      void _fixture;
      void _checks;
      const report = validateGradeReport(
        JSON.parse(result.stdout),
        reportIdentity,
      );
      pending.push({
        scenario,
        directory: runDirectory,
        candidate,
        report,
        expected,
      });
    }
  } catch {
    failure =
      "Offline admission, candidate capture or grading failed; inspect private observations.";
  } finally {
    try {
      await lease.assertOwned();
      cleanup = await adapter.cleanup(runIds);
      cleaned = true;
    } catch {
      failure =
        "Termination unconfirmed; publication forbidden; lease retained for owner recovery.";
    }
  }
  try {
    if (!cleaned || interrupted || signal.aborted || failure)
      throw new Error("No publication");
    if ((await freezeBooking()).evaluatorSha256 !== pins.evaluatorSha256)
      throw new Error("Implementation changed");
    for (const item of pending)
      if (
        (await snapshotTree(item.candidate.directory)).treeSha256 !==
        item.candidate.treeSha256
      )
        throw new Error("Candidate changed during grading");
    for (const item of pending) {
      signal.throwIfAborted();
      await lease.assertOwned();
      const entry = await publishEvaluation(
        item.directory,
        item.expected,
        item.report,
        startedAt,
        new Date().toISOString(),
        {
          ...runtimePins,
          scope: config.scope,
          configurationSha256: offlineConfigurationDigest(config),
          isolationReviewSha256: config.reviewSha256,
        },
      );
      entries.push(entry);
      const store = await createProtectedEvaluationStore({
        root,
        agentWorkspaceRoot: scratch,
        entries: new Map([[item.expected.runId, entry]]),
      });
      const loaded = await store.load(item.expected.runId);
      verdicts.push({
        scenario: item.scenario,
        verdict: loaded?.verification.verdict,
      });
      const expectedVerdict = ["baseline", "distinct-final"].includes(
        item.scenario,
      )
        ? "VERIFIED"
        : "REJECTED";
      if (loaded?.verification.verdict !== expectedVerdict)
        throw new Error(
          "Acceptance expectation failed; preserve observed verdict",
        );
    }
  } catch {
    failure ??=
      "Offline acceptance incomplete or unexpected; preserved checks are limited public-baseline observations.";
  }
  const record = {
    schemaVersion: "booking-offline-acceptance.v1",
    acceptanceId,
    scope: config.scope,
    adapter: adapter.kind,
    status: failure ? "failed" : "completed",
    startedAt,
    endedAt: new Date().toISOString(),
    runtimePins,
    configurationSha256: offlineConfigurationDigest(config),
    isolationReviewSha256: config.reviewSha256,
    inventory,
    limits,
    adapterObservations: adapter.observations(),
    observations,
    cleanup,
    verdicts,
    entries,
    failure,
    realAgentExecution: "NOT_RUN",
    inference: "NOT_RUN",
    metrics: { tokens: null, costUsd: null, iterations: null },
    limitations: [
      "No coding-agent trial, Meta contribution, architecture comparison, hidden holdout or product certificate.",
      ...(adapter.kind === "synthetic-development"
        ? [
            "SYNTHETIC DEVELOPMENT TEST; no observed containment or runtime acceptance.",
          ]
        : []),
    ],
  };
  await writeFile(
    path.join(directory, "acceptance.json"),
    JSON.stringify(record, null, 2),
    { flag: "wx", mode: 0o400 },
  );
  if (cleaned && !interrupted) await lease.release();
  return record;
}
