import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import {
  disjoint,
  freezeCandidate,
  privateDirectory,
} from "../artifacts/files";
import { publishEvaluation } from "../artifacts/publish";
import {
  captureOfflineSource,
  offlineRunProfile,
  publishOfflineRun,
  writeOfflineOriginal,
} from "../artifacts/offline-runs";
import type { ExperimentRunV1 } from "../../../src/lib/contracts/evidence";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import type { OfflineConfig } from "../isolation/offline-config";
import { offlineConfigurationDigest } from "../isolation/offline-gate";
import type { OfflineAdapter } from "./offline-sbx";
import { acceptanceCandidate, acceptanceScenarios } from "./offline-scenarios";
import { validateGradeReport } from "./protocol";
import {
  createLifecycleRequest,
  validateLifecycleReport,
  validateRestartCleanup,
} from "./lifecycle-protocol";
import { workerLimits } from "../../evaluator/booking-v1/worker-policy.mjs";
import { acquireBookingLease } from "./lease";

const project = fileURLToPath(new URL("../../../", import.meta.url));
export async function runOfflineAcceptance(
  config: OfflineConfig,
  adapter: OfflineAdapter,
  userSignal: AbortSignal,
  mode: "booking-and-lifecycle" | "lifecycle-only" = "booking-and-lifecycle",
) {
  const root = await privateDirectory(config.protectedRoot),
    scratch = await privateDirectory(config.scratchRoot);
  disjoint(root, scratch);
  disjoint(config.coordinationRoot, scratch);
  disjoint(config.coordinationRoot, project);
  disjoint(root, await realpath(project));
  disjoint(scratch, await realpath(project));
  // Freeze caller-owned configuration and source before any adapter operation.
  config = structuredClone(config);
  const acceptanceId = randomUUID(),
    startedAt = new Date().toISOString(),
    pins = await freezeBooking();
  const source =
    mode === "lifecycle-only"
      ? null
      : await captureOfflineSource(acceptanceId, pins.fixtureSha256);
  const lease = await acquireBookingLease(
    config.coordinationRoot,
    acceptanceId,
  );
  const directory = path.join(root, acceptanceId);
  await mkdir(directory, { mode: 0o700 });
  const limits = {
    vmCpu: 2,
    vmMemoryBytes: 4 * 1024 ** 3,
    vmDiskBytes: config.vmDiskBytes,
    vmPids: config.vmPids,
    workerCpu: workerLimits.cpu,
    workerMemoryBytes: workerLimits.memoryBytes,
    workerPids: workerLimits.pids,
    workerWorkBytes: workerLimits.workBytes,
    workerTmpBytes: workerLimits.tempBytes,
    workerShmBytes: workerLimits.shmBytes,
    workerDescriptors: workerLimits.descriptors,
    lifecycleSeconds: 90,
    lifecycleWorkerSeconds: 30,
    lifecycleWorkerOutputBytes: 4096,
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
  const profile = offlineRunProfile(config, runtimePins);
  const agentConfigSha256 = jsonDigest(profile);
  const casePlan =
    mode === "lifecycle-only"
      ? []
      : acceptanceScenarios.map((scenario) => ({
          scenario,
          variant: profile.variant,
        }));
  const signal = AbortSignal.any([
    userSignal,
    AbortSignal.timeout(config.maxSeconds * 1000),
  ]);
  const attempts: {
    scenario: string;
    directory: string;
    run: ExperimentRunV1;
  }[] = [];
  const sourceRecords: Awaited<ReturnType<typeof publishOfflineRun>>[] = [];
  const publicationFailures: string[] = [];
  const pending: {
    scenario: string;
    directory: string;
    candidate: Awaited<ReturnType<typeof freezeCandidate>>;
    report: ReturnType<typeof validateGradeReport>;
    expected: Parameters<typeof publishEvaluation>[1];
    attempt: (typeof attempts)[number];
    gradeStartedAt: string;
    gradeFinishedAt: string;
  }[] = [];
  const observations: unknown[] = [],
    runIds: string[] = [];
  const lifecycleRequest = createLifecycleRequest(
    acceptanceId,
    pins.evaluatorSha256,
    config.workerImage,
  );
  let lifecycle: ReturnType<typeof validateLifecycleReport> | null = null;
  let inventory: unknown = null,
    cleanup: unknown = null,
    failure: string | null = null,
    cleaned = false,
    interrupted = false;
  const entries: Awaited<ReturnType<typeof publishEvaluation>>[] = [];
  const verdicts: { scenario: string; verdict: string | undefined }[] = [];
  try {
    signal.throwIfAborted();
    if (source)
      await writeOfflineOriginal(
        directory,
        acceptanceId,
        "source-context.json",
        {
          schemaVersion: "booking-offline-source-plan.v1",
          acceptanceId,
          repoCommit: source.repoCommit,
          fixtureSha256: source.fixtureSha256,
          profile,
          agentConfigSha256,
          cases: casePlan,
        },
      );
    await lease.assertOwned();
    inventory = await adapter.admit(pins.evaluatorSha256, signal);
    runIds.push(
      lifecycleRequest.suiteId,
      ...Object.values(lifecycleRequest.runs),
    );
    await lease.assertOwned();
    const probe = await adapter.probe(lifecycleRequest, signal);
    observations.push({
      stage: "lifecycle",
      ...probe,
      stdout: sha256(probe.stdout),
      stderr: sha256(probe.stderr),
    });
    await writeFile(
      path.join(directory, "lifecycle-observed.txt"),
      probe.stdout,
      { flag: "wx", mode: 0o400 },
    );
    await writeFile(
      path.join(directory, "lifecycle-stderr.txt"),
      probe.stderr,
      { flag: "wx", mode: 0o400 },
    );
    if (
      probe.reason !== "completed" ||
      probe.exitCode !== 0 ||
      signal.aborted
    ) {
      interrupted = true;
      throw new Error("Lifecycle suite interrupted");
    }
    try {
      lifecycle = validateLifecycleReport(
        JSON.parse(probe.stdout),
        lifecycleRequest,
      );
    } catch {
      interrupted = true;
      throw new Error("Lifecycle observations incomplete or invalid");
    }
    const baseline = source?.baseline;
    for (const { scenario, variant } of casePlan) {
      if (!baseline) throw new Error("Reviewed baseline missing");
      signal.throwIfAborted();
      const runId = randomUUID();
      runIds.push(runId);
      const runDirectory = path.join(root, runId);
      await mkdir(runDirectory, { mode: 0o700 });
      const attempt = {
        scenario,
        directory: runDirectory,
        run: {
          schemaVersion: "experiment-run.v1" as const,
          id: runId,
          variant,
          status: "blocked" as ExperimentRunV1["status"],
          repoCommit: source!.repoCommit,
          evaluatedTreeSha256: null as string | null,
          fixtureSha256: pins.fixtureSha256,
          agentConfigSha256,
          evaluatorSha256,
          requiredPolicySha256: pins.requiredPolicySha256,
          isolationAttestationId: null,
          seed: null,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          verificationId: null as string | null,
          receiptId: null as string | null,
          metrics: {
            elapsedMs: null,
            tokens: null,
            costUsd: null,
            iterations: null,
            filesTouched: null,
          },
          evidenceOrigin: "none" as const,
          presentationMode: "recorded" as const,
          limitations: [
            "Fixed no-agent offline infrastructure acceptance only; all cases are baseline-family A, not a matched comparison.",
            "Run interval starts at case capture and ends after cleanup and publication disposition; elapsed time and usage are unmeasured.",
            "No hidden holdout, measured architecture or Meta benefit, isolation attestation or root-agent containment proof.",
            ...(adapter.kind === "synthetic-development"
              ? [
                  "SYNTHETIC DEVELOPMENT TEST; no genuine runtime execution or containment evidence.",
                ]
              : []),
          ],
        },
      };
      attempts.push(attempt);
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
      attempt.run.evaluatedTreeSha256 = candidate.treeSha256;
      await writeOfflineOriginal(runDirectory, runId, "source-context.json", {
        schemaVersion: "booking-offline-source-context.v1",
        acceptanceId,
        scenario,
        runId,
        variant: profile.variant,
        repoCommit: source!.repoCommit,
        fixtureSha256: pins.fixtureSha256,
        evaluatedTreeSha256: candidate.treeSha256,
        evaluatorSha256,
        requiredPolicySha256: pins.requiredPolicySha256,
        testSuiteSha256: pins.testSuiteSha256,
        agentConfigSha256,
        profile,
        startedAt: attempt.run.startedAt,
      });
      await lease.assertOwned();
      signal.throwIfAborted();
      attempt.run.status = "failed";
      const gradeStartedAt = new Date().toISOString();
      const result = await adapter.grade(
        {
          ...expected,
          candidate: candidate.envelope,
          workerImage: config.workerImage,
        },
        signal,
      );
      const gradeFinishedAt = new Date().toISOString();
      if (result.reason === "cancelled" || result.reason === "timed_out")
        attempt.run.status = result.reason;
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
        attempt,
        gradeStartedAt,
        gradeFinishedAt,
      });
    }
  } catch {
    if (signal.aborted) {
      interrupted = true;
      if (attempts.length)
        attempts.at(-1)!.run.status = userSignal.aborted
          ? "cancelled"
          : "timed_out";
    }
    failure =
      "Offline admission, candidate capture or grading failed; inspect private observations.";
  } finally {
    try {
      await lease.assertOwned();
      cleanup = await adapter.cleanup(runIds);
      if (lifecycle) validateRestartCleanup(cleanup, runIds);
      cleaned = true;
    } catch {
      for (const attempt of attempts) attempt.run.status = "blocked";
      failure =
        "Termination unconfirmed; publication forbidden; lease retained for owner recovery.";
    }
  }
  let publishingRunId: string | null = null;
  try {
    if (!cleaned || interrupted || signal.aborted || failure)
      throw new Error("No publication");
    if ((await freezeBooking()).evaluatorSha256 !== pins.evaluatorSha256)
      throw new Error("Implementation changed");
    if (
      source &&
      (await captureOfflineSource(acceptanceId, pins.fixtureSha256))
        .repoCommit !== source.repoCommit
    )
      throw new Error("Source baseline changed");
    for (const item of pending)
      if (
        (await snapshotTree(item.candidate.directory)).treeSha256 !==
        item.candidate.treeSha256
      )
        throw new Error("Candidate changed during grading");
    for (const item of pending) {
      signal.throwIfAborted();
      await lease.assertOwned();
      publishingRunId = item.expected.runId;
      const entry = await publishEvaluation(
        item.directory,
        item.expected,
        item.report,
        item.gradeStartedAt,
        item.gradeFinishedAt,
        {
          ...runtimePins,
          scope: config.scope,
          configurationSha256: offlineConfigurationDigest(config),
          isolationReviewSha256: config.reviewSha256,
        },
      );
      const store = await createProtectedEvaluationStore({
        root,
        agentWorkspaceRoot: scratch,
        entries: new Map([[item.expected.runId, entry]]),
      });
      const loaded = await store.load(item.expected.runId);
      // Recheck after evidence I/O too: no completed source record may rely on
      // a candidate or trusted implementation that changed during publication.
      if (
        (await freezeBooking()).evaluatorSha256 !== pins.evaluatorSha256 ||
        (await snapshotTree(item.candidate.directory)).treeSha256 !==
          item.candidate.treeSha256
      )
        throw new Error("Publication source changed");
      if (!isTrustedEvaluation(loaded))
        throw new Error("Published evaluation did not authenticate");
      const run: ExperimentRunV1 = {
        ...item.attempt.run,
        status: "completed",
        receiptId: loaded.receipt.id,
        verificationId: loaded.verification.id,
        endedAt: new Date().toISOString(),
      };
      sourceRecords.push(await publishOfflineRun(item.directory, run, loaded));
      item.attempt.run = run;
      entries.push(entry);
      publishingRunId = null;
      verdicts.push({
        scenario: item.scenario,
        verdict: loaded.verification.verdict,
      });
      const expectedVerdict = ["baseline", "distinct-final"].includes(
        item.scenario,
      )
        ? "VERIFIED"
        : "REJECTED";
      if (loaded.verification.verdict !== expectedVerdict)
        failure ??=
          "Acceptance expectation failed; preserve observed verdict and completed mechanical run.";
    }
  } catch {
    if (publishingRunId) publicationFailures.push(publishingRunId);
    failure ??=
      "Offline acceptance incomplete or unexpected; preserved checks are limited public-baseline observations.";
  }
  // Preserve every selected attempt, including interruptions and publication
  // failures. Never attach guessed links or revise an original run in place.
  for (const attempt of attempts) {
    if (sourceRecords.some((record) => record.runId === attempt.run.id))
      continue;
    const run: ExperimentRunV1 = {
      ...attempt.run,
      status: !cleaned
        ? "blocked"
        : signal.aborted
          ? userSignal.aborted
            ? "cancelled"
            : "timed_out"
          : attempt.run.status,
      endedAt: new Date().toISOString(),
      receiptId: null,
      verificationId: null,
      limitations: [
        ...attempt.run.limitations,
        "No authenticated receipt was linked; trusted mechanical completion was not established.",
      ],
    };
    try {
      sourceRecords.push(await publishOfflineRun(attempt.directory, run, null));
      attempt.run = run;
    } catch {
      if (!publicationFailures.includes(attempt.run.id))
        publicationFailures.push(attempt.run.id);
      failure ??=
        "Source record publication failed; inspect private partial diagnostics.";
      try {
        sourceRecords.push(
          await publishOfflineRun(attempt.directory, run, null, true),
        );
        attempt.run = run;
      } catch {
        // Custody/collision failures cannot authorize writes over originals.
      }
    }
  }
  const record = {
    schemaVersion: "booking-offline-acceptance.v1",
    acceptanceId,
    scope: config.scope,
    adapter: adapter.kind,
    mode,
    lifecycleRequest,
    lifecycle,
    status: failure ? "failed" : "completed",
    startedAt,
    endedAt: new Date().toISOString(),
    runtimePins,
    source: source
      ? { repoCommit: source.repoCommit, fixtureSha256: source.fixtureSha256 }
      : null,
    profile,
    agentConfigSha256,
    casePlan,
    sourceRecords,
    publicationFailures,
    attemptDiagnostics: attempts.map(({ scenario, run }) => ({
      scenario,
      runId: run.id,
      status: run.status,
    })),
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
      "No coding-agent trial, Meta contribution, architecture comparison or hidden holdout; capture alone does not provision a certificate.",
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
  if (cleaned && !interrupted && !signal.aborted) await lease.release();
  return record;
}
