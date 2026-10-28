import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBookingWorkspace } from "../prepare-booking";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { ExperimentRunV1Schema } from "../../../src/lib/contracts/evidence";
import {
  captureReviewedTree,
  disjoint,
  freezeCandidate,
  privateDirectory,
} from "../artifacts/files";
import { publishEvaluation } from "../artifacts/publish";
import { configurationDigest } from "../isolation/gate";
import type { OperatorConfig } from "../isolation/config";
import { acquireBookingLease } from "./lease";
import { fixedTask, validateGradeReport } from "./protocol";
import {
  bookingExecutionCommitment,
  realAgentExecutionBlockers,
} from "./commitment";
import type { BookingAdapter } from "./sbx";
import type { ProcessResult } from "./process";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
function summary(observed: ProcessResult | undefined) {
  return observed
    ? {
        exitCode: observed.exitCode,
        signal: observed.signal,
        reason: observed.reason,
        elapsedMs: observed.elapsedMs,
        stdoutSha256: sha256(observed.stdout),
        stderrSha256: sha256(observed.stderr),
        capturedOutputBytes:
          Buffer.byteLength(observed.stdout) +
          Buffer.byteLength(observed.stderr),
      }
    : null;
}
export async function runBookingExperiment(
  config: OperatorConfig,
  adapter: BookingAdapter,
  userSignal: AbortSignal,
  repoCommit: string,
) {
  const start = Date.now(),
    startedAt = new Date(start).toISOString(),
    runId = randomUUID();
  const root = await privateDirectory(config.protectedRoot),
    scratch = await privateDirectory(config.scratchRoot);
  disjoint(root, scratch);
  disjoint(config.coordinationRoot, scratch);
  disjoint(config.coordinationRoot, projectRoot);
  disjoint(root, await realpath(projectRoot));
  disjoint(scratch, await realpath(projectRoot));
  // Exclusive controller lock: never stop another operator's in-flight trial.
  const pins = await freezeBooking();
  const runtimePins = {
    implementationSha256: pins.evaluatorSha256,
    workerImage: config.workerImage,
    graderNodeSha256: config.graderNodeSha256,
    graderLockSha256: config.graderLockSha256,
    graderModulesSha256: config.graderModulesSha256,
  };
  const evaluatorSha256 = jsonDigest(runtimePins);
  const proposal = bookingExecutionCommitment(config, repoCommit, runId, pins);
  let lease: Awaited<ReturnType<typeof acquireBookingLease>> | undefined;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), config.maxSeconds * 1000);
  const signal = AbortSignal.any([userSignal, deadline.signal]);
  let temporary: string | undefined, directory: string | undefined;
  let agent: ProcessResult | undefined, grading: ProcessResult | undefined;
  let candidate: Awaited<ReturnType<typeof freezeCandidate>> | undefined;
  let finalization: Omit<
    Awaited<ReturnType<BookingAdapter["finalizeAgent"]>>,
    "candidate"
  > | null = null;
  let status: "completed" | "failed" | "cancelled" | "timed_out" | "blocked" =
    "blocked";
  let failure: string | null = null;
  let cleaned = false;
  let admitted = false;
  let stage = "commitment";
  let entry: Awaited<ReturnType<typeof publishEvaluation>> | null = null;
  try {
    directory = path.join(root, runId);
    await mkdir(directory, { mode: 0o700 });
    await writeFile(
      path.join(directory, "commitment-proposal.json"),
      JSON.stringify(proposal, null, 2),
      { mode: 0o400, flag: "wx" },
    );
    stage = "lease";
    lease = await acquireBookingLease(config.coordinationRoot, runId);
    await lease.assertOwned();
    stage = "admission";
    await adapter.admit(pins.evaluatorSha256, signal);
    admitted = true;
    if (signal.aborted) throw new Error("cancelled");
    stage = "preparation";
    temporary = await mkdtemp(path.join(scratch, "booking-"));
    const exported = path.join(temporary, "subject");
    const prepared = await prepareBookingWorkspace(
      path.join(projectRoot, "fixtures/booking-v1"),
      exported,
    );
    if (prepared.treeSha256 !== pins.fixtureSha256)
      throw new Error("Reviewed fixture changed.");
    const baseline = await captureReviewedTree(exported, runId);
    await adapter.prepare(runId, exported, signal);
    stage = "agent";
    agent = await adapter.agent(runId, signal);
    if (agent.reason !== "completed" || signal.aborted) {
      status =
        signal.aborted || agent.reason === "cancelled"
          ? "cancelled"
          : agent.reason === "timed_out"
            ? "timed_out"
            : "failed";
      throw new Error("Agent interrupted; final candidate unavailable.");
    }
    stage = "candidate-export";
    await lease.assertOwned();
    // Atomic trusted adapter boundary: terminate, prove absence across restart,
    // seal source and transfer it without executing the untrusted guest again.
    // The real sbx adapter deliberately has no implementation of this boundary.
    const finalized = await adapter.finalizeAgent(runId, signal);
    finalization = {
      runId: finalized.runId,
      terminationConfirmed: finalized.terminationConfirmed,
      restartAbsenceConfirmed: finalized.restartAbsenceConfirmed,
      exportWithoutGuestExecution: finalized.exportWithoutGuestExecution,
      candidateSha256: finalized.candidateSha256,
    };
    if (
      finalized.runId !== runId ||
      finalized.terminationConfirmed !== true ||
      finalized.restartAbsenceConfirmed !== true ||
      finalized.exportWithoutGuestExecution !== true ||
      jsonDigest(finalized.candidate) !== finalized.candidateSha256
    )
      throw new Error("Supervised termination/export boundary unconfirmed.");
    const first = finalized.candidate;
    candidate = await freezeCandidate(
      first,
      runId,
      path.join(directory, "candidate"),
      baseline,
    );
    const expected = {
      runId,
      evaluatedTreeSha256: candidate.treeSha256,
      evaluatorSha256,
      testSuiteSha256: pins.testSuiteSha256,
      requiredPolicySha256: pins.requiredPolicySha256,
    };
    if (signal.aborted) throw new Error("cancelled");
    stage = "grading";
    grading = await adapter.grade(
      {
        ...expected,
        candidate: candidate.envelope,
        workerImage: config.workerImage,
      },
      signal,
    );
    // Preserve bounded protected controller output even if malformed or failing.
    // It is not a receipt and is never loaded as authority.
    await writeFile(
      path.join(directory, "grader-observed.txt"),
      grading.stdout,
      { flag: "wx", mode: 0o400 },
    );
    // Result stdout comes from the protected grader controller, never candidate
    // files or agent trace output. Exit zero alone is insufficient.
    if (
      grading.reason !== "completed" ||
      grading.exitCode !== 0 ||
      signal.aborted
    ) {
      status =
        signal.aborted || grading.reason === "cancelled"
          ? "cancelled"
          : grading.reason === "timed_out"
            ? "timed_out"
            : "failed";
      throw new Error("Independent grader did not finish.");
    }
    stage = "report-validation";
    const report = validateGradeReport(JSON.parse(grading.stdout), expected);
    stage = "cleanup-and-freshness";
    await lease.assertOwned();
    await adapter.cleanup();
    cleaned = true;
    if (
      (await snapshotTree(candidate.directory)).treeSha256 !==
        candidate.treeSha256 ||
      (await freezeBooking()).evaluatorSha256 !== pins.evaluatorSha256
    )
      throw new Error("Candidate or evaluator source mutated during grading.");
    if (signal.aborted) throw new Error("cancelled");
    stage = "publication";
    entry = await publishEvaluation(
      directory,
      {
        ...expected,
        fixtureSha256: pins.fixtureSha256,
        requiredCheckIds: pins.policy.requiredCheckIds,
      },
      report,
      startedAt,
      new Date().toISOString(),
      {
        ...runtimePins,
        configurationSha256: configurationDigest(config),
        isolationReviewSha256: config.reviewSha256,
      },
    );
    status = agent.exitCode === 0 ? "completed" : "failed";
  } catch {
    failure =
      "Experiment blocked, interrupted, stale or invalid; inspect protected stage observations and operator gates.";
    if (signal.aborted) status = userSignal.aborted ? "cancelled" : "timed_out";
    else if (status === "blocked" && agent) status = "failed";
  } finally {
    try {
      if (!cleaned && lease) {
        await lease.assertOwned();
        await adapter.cleanup();
        cleaned = true;
      }
    } catch {
      status = "blocked";
      failure = "Sandbox termination unconfirmed; publication forbidden.";
      entry = null;
    }
    clearTimeout(timer);
    if (temporary) {
      try {
        await rm(temporary, { recursive: true, force: true });
      } catch {
        cleaned = false;
        status = "blocked";
        entry = null;
        stage = "scratch-cleanup";
        failure =
          "Scratch cleanup unconfirmed; lease retained and publication forbidden.";
      }
    }
    if (cleaned && lease) {
      try {
        await lease.release();
      } catch {
        cleaned = false;
        status = "blocked";
        entry = null;
        stage = "lease-release";
        failure =
          "Lease release unconfirmed; owner recovery required and publication forbidden.";
      }
    }
  }
  const run = ExperimentRunV1Schema.parse({
    schemaVersion: "experiment-run.v1",
    id: runId,
    variant: "A",
    status,
    repoCommit,
    evaluatedTreeSha256: candidate?.treeSha256 ?? null,
    fixtureSha256: pins.fixtureSha256,
    agentConfigSha256: jsonDigest({
      task: fixedTask,
      model: config.authorizedModel,
      configurationSha256: config.agentConfigSha256,
      binarySha256: config.codexBinarySha256,
      implementationSha256: pins.evaluatorSha256,
      tokenLimit: config.tokenLimit,
      maxSeconds: config.maxSeconds,
      spendUsd: config.spendUsd,
    }),
    evaluatorSha256,
    requiredPolicySha256: pins.requiredPolicySha256,
    isolationAttestationId:
      adapter.kind === "sbx" && admitted
        ? `review-${config.reviewSha256.slice(0, 32)}`
        : null,
    seed: null,
    startedAt,
    endedAt: new Date().toISOString(),
    verificationId: entry ? `verify-receipt-${runId}` : null,
    receiptId: entry ? `receipt-${runId}` : null,
    metrics: {
      elapsedMs: Date.now() - start,
      tokens: null,
      costUsd: null,
      iterations: null,
      filesTouched: candidate
        ? candidate.manifest.filter(
            (file) =>
              pins.fixtureManifest.find((f) => f.path === file.path)?.sha256 !==
              file.sha256,
          ).length +
          pins.fixtureManifest.filter(
            (f) => !candidate!.manifest.some((file) => file.path === f.path),
          ).length
        : null,
    },
    evidenceOrigin: adapter.kind === "sbx" && entry ? "measured" : "none",
    presentationMode: "recorded",
    limitations: [
      "Public baseline behavior checks only; no hidden holdout, refactor-quality certificate, A/B study or Meta inference.",
      ...(adapter.kind === "synthetic-development"
        ? [
            "SYNTHETIC DEVELOPMENT ADAPTER: not real agent or containment evidence.",
          ]
        : []),
    ],
  });
  const record = {
    run,
    adapter: adapter.kind,
    stage,
    runtimePins,
    configurationSha256: configurationDigest(config),
    commitmentSha256: proposal.commitmentSha256,
    executionBlockers: adapter.kind === "sbx" ? realAgentExecutionBlockers : [],
    cleanupConfirmed: cleaned,
    finalization,
    changedFiles: candidate
      ? [
          ...candidate.manifest
            .filter(
              (file) =>
                pins.fixtureManifest.find(
                  (baseline) => baseline.path === file.path,
                )?.sha256 !== file.sha256,
            )
            .map((file) => file.path),
          ...pins.fixtureManifest
            .filter(
              (file) =>
                !candidate!.manifest.some(
                  (current) => current.path === file.path,
                ),
            )
            .map((file) => file.path),
        ].sort()
      : null,
    agent: summary(agent),
    grader: summary(grading),
    failure,
    entry,
  };
  // Preserve blocked attempts too; no raw agent output, secrets or host paths.
  const recordPath = directory
    ? path.join(directory, "run.json")
    : path.join(root, `${runId}-blocked.json`);
  await writeFile(recordPath, JSON.stringify(record, null, 2), {
    flag: "wx",
    mode: 0o400,
  });
  return record;
}
