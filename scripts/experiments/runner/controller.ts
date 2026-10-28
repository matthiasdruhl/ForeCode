import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
  open,
} from "node:fs/promises";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBookingWorkspace } from "../prepare-booking";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { ExperimentRunV1Schema } from "../../../src/lib/contracts/evidence";
import { validateReceiptRelationships } from "../../../src/lib/contracts/validation";
import {
  captureReviewedTree,
  protectedRead,
  disjoint,
  freezeCandidate,
  privateDirectory,
} from "../artifacts/files";
import { publishEvaluation } from "../artifacts/publish";
import { configurationDigest } from "../isolation/gate";
import type { OperatorConfig } from "../isolation/config";
import { acquireBookingLease } from "./lease";
import { fixedTask, validateGradeReport, type GradeReport } from "./protocol";
import { canonicalJson } from "../../../src/lib/report/canonical";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { writeOfflineOriginal } from "../artifacts/offline-runs";
import {
  bookingExecutionCommitment,
  realAgentExecutionBlockers,
} from "./commitment";
import type { BookingAdapter } from "./sbx";
import { isTrustedAgentFinalization } from "./sbx";
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
  preparedProposal?: unknown,
) {
  config = structuredClone(config);
  const supplied = preparedProposal as
    | { commitment?: { runId?: unknown }; commitmentSha256?: unknown }
    | undefined;
  const start = Date.now(),
    startedAt = new Date(start).toISOString(),
    runId = supplied
      ? z.string().uuid().parse(supplied.commitment?.runId)
      : randomUUID();
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
  if (supplied && jsonDigest(supplied) !== jsonDigest(proposal))
    throw new Error(
      "Prepared commitment is stale or does not match exact inputs.",
    );
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
  let pendingReport: GradeReport | undefined;
  let authenticated: TrustedEvaluation | undefined;
  let gradingStartedAt = startedAt,
    gradingFinishedAt = startedAt;
  let journalIndex = 0;
  async function transition(next: string) {
    stage = next;
    if (!directory) return;
    const handle = await open(
      path.join(
        directory,
        `attempt-${String(journalIndex++).padStart(4, "0")}.json`,
      ),
      "wx",
      0o400,
    );
    try {
      await handle.writeFile(
        canonicalJson({
          runId,
          stage,
          observedAt: new Date().toISOString(),
          commitmentSha256: proposal.commitmentSha256,
          cleanupConfirmed: cleaned,
          publication: entry ? "WRITTEN" : "NOT_PERFORMED",
        }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  try {
    directory = path.join(root, runId);
    if (supplied) {
      await privateDirectory(directory);
      const original = JSON.parse(
        (
          await protectedRead(path.join(directory, "commitment-proposal.json"))
        ).toString(),
      );
      if (jsonDigest(original) !== jsonDigest(proposal))
        throw new Error("Original prepared commitment changed.");
    } else {
      await mkdir(directory, { mode: 0o700 });
      await writeFile(
        path.join(directory, "commitment-proposal.json"),
        JSON.stringify(proposal, null, 2),
        { mode: 0o400, flag: "wx" },
      );
    }
    await transition("lease");
    lease = await acquireBookingLease(config.coordinationRoot, runId);
    await lease.assertOwned();
    await transition("admission");
    if (adapter.kind === "sbx" && !supplied)
      throw new Error("Independently reviewed prepared commitment required.");
    await adapter.admit(pins.evaluatorSha256, signal, {
      runId,
      repoCommit,
      commitmentSha256: proposal.commitmentSha256,
      fixtureSha256: pins.fixtureSha256,
      assertOwned: lease.assertOwned,
    });
    admitted = true;
    if (signal.aborted) throw new Error("cancelled");
    await transition("preparation");
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
    await transition("agent");
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
    await transition("candidate-export");
    await lease.assertOwned();
    // Atomic trusted adapter boundary: terminate, prove absence across restart,
    // seal source and transfer it without executing the untrusted guest again.
    const finalized = await adapter.finalizeAgent(runId, signal);
    if (adapter.kind === "sbx" && !isTrustedAgentFinalization(finalized))
      throw new Error(
        "Concrete supervised finalization authenticity required.",
      );
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
    await transition("grading");
    gradingStartedAt = new Date().toISOString();
    grading = await adapter.grade(
      {
        ...expected,
        candidate: candidate.envelope,
        workerImage: config.workerImage,
      },
      signal,
    );
    gradingFinishedAt = new Date().toISOString();
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
    await transition("report-validation");
    const report = validateGradeReport(JSON.parse(grading.stdout), expected);
    await transition("cleanup-and-freshness");
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
    pendingReport = report;
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
  // Publish only after sandbox, scratch AND owned-lease cleanup have succeeded.
  if (pendingReport && cleaned && candidate && directory && !signal.aborted) {
    try {
      if (
        (await snapshotTree(candidate.directory)).treeSha256 !==
          candidate.treeSha256 ||
        (await freezeBooking()).evaluatorSha256 !== pins.evaluatorSha256
      )
        throw new Error("Source changed before publication.");
      await transition("publication");
      entry = await publishEvaluation(
        directory,
        {
          runId,
          evaluatedTreeSha256: candidate.treeSha256,
          fixtureSha256: pins.fixtureSha256,
          evaluatorSha256,
          testSuiteSha256: pins.testSuiteSha256,
          requiredPolicySha256: pins.requiredPolicySha256,
          requiredCheckIds: pins.policy.requiredCheckIds,
        },
        pendingReport,
        gradingStartedAt,
        gradingFinishedAt,
        {
          ...runtimePins,
          configurationSha256: configurationDigest(config),
          isolationReviewSha256: config.reviewSha256,
        },
      );
      const trusted = await (
        await createProtectedEvaluationStore({
          root,
          agentWorkspaceRoot: scratch,
          entries: new Map([[runId, entry]]),
        })
      ).load(runId);
      if (!isTrustedEvaluation(trusted))
        throw new Error("Published evaluation failed fresh authentication.");
      authenticated = trusted;
      await writeFile(
        path.join(directory, "verification.json"),
        canonicalJson(trusted.verification),
        { flag: "wx", mode: 0o400 },
      );
    } catch {
      entry = null;
      status = "failed";
      failure = "Protected publication or fresh authentication failed.";
    }
  }
  let run = ExperimentRunV1Schema.parse({
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
    // A private isolation review is not an original frozen attestation record.
    isolationAttestationId: null,
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
    // Measured origin also requires a genuine frozen isolation attestation.
    // A private runtime admission/review is not that original record.
    evidenceOrigin: "none",
    presentationMode: "recorded",
    limitations: [
      "Public baseline behavior checks only; no hidden holdout, refactor-quality certificate, A/B study or Meta inference.",
      "No original IsolationAttestationV1 is supplied; a private runtime admission does not authorize a measured-origin label.",
      ...(adapter.kind === "synthetic-development"
        ? [
            "SYNTHETIC DEVELOPMENT ADAPTER: not real agent or containment evidence.",
          ]
        : []),
    ],
  });
  if (entry && authenticated) {
    try {
      validateReceiptRelationships(
        authenticated.receipt,
        authenticated.verification,
        run,
      );
      if (
        Date.parse(authenticated.receipt.startedAt) <
          Date.parse(run.startedAt) ||
        Date.parse(authenticated.receipt.finishedAt) > Date.parse(run.endedAt!)
      )
        throw new Error("Receipt time outside the observed run.");
    } catch {
      entry = null;
      failure =
        "Original run/evaluation relationships invalid; no linked evidence.";
      run = ExperimentRunV1Schema.parse({
        ...run,
        status: "failed",
        receiptId: null,
        verificationId: null,
      });
    }
  }
  const record = {
    run,
    adapter: adapter.kind,
    stage,
    runtimePins,
    configurationSha256: configurationDigest(config),
    commitmentSha256: proposal.commitmentSha256,
    executionBlockers:
      adapter.kind === "sbx" && !admitted ? realAgentExecutionBlockers : [],
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
  if (directory) {
    await writeOfflineOriginal(directory, runId, "experiment-run.json", run);
    await transition("finished");
  }
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
