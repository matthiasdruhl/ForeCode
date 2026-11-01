// Private sequential controller. Never imported by web code; no production
// transport is configured by default. Synthetic transports cannot create actual evidence.
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ExperimentRunV1Schema,
  type ExperimentRunV1,
} from "../../../src/lib/contracts/evidence";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { unknownMetrics } from "../../../src/lib/experiment/metrics";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest } from "../../../src/lib/report/digests";
import {
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import {
  validateGradeInput,
  validateGradeReport,
  type GradeInput,
  type TeamGradeProfile,
} from "../../evaluator/booking-v1/grade-profile";
import {
  captureReviewedTree,
  freezeCandidate,
  privateDirectory,
  disjoint,
} from "../artifacts/files";
import { acquireBookingLease } from "../runner/lease";
import {
  isTrustedAgentFinalization,
  type AgentFinalization,
} from "../runner/sbx";
import type { ProcessResult } from "../runner/process";
import { isPreparedStudy, sourceDiff, type PreparedStudy } from "./study";
import { requireHeldRecord, immutable } from "./custody";
import {
  isAdmittedSupervisedTeamTransport,
  teamCompositionBlockers,
  isTrustedSupervisedTeamFinalization,
  assertSupervisedControllerInputs,
  recordSupervisedTeamOutcome,
  supervisedTeamMeasurementBlockers,
} from "./supervised-team";

import {
  sharedFutureTask,
  pairedRuntimeSubject,
  type Variant,
} from "./paired-inputs";
export {
  sharedFutureTask,
  pairedRuntimeSubject,
  type Variant,
} from "./paired-inputs";

import { PublicReadinessSchema, type PublicReadiness } from "./team-readiness";

export type PairedTransport = {
  kind: "synthetic-development" | "supervised-team";
  preflight?(
    ownership: { assertOwned(): Promise<void> },
    signal: AbortSignal,
  ): Promise<void>;
  baseline(
    variant: Variant,
    treeSha256: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  admit(
    variant: Variant,
    subjectSha256: string,
    ownership: { assertOwned(): Promise<void> },
    signal: AbortSignal,
  ): Promise<void>;
  prepare(
    runId: string,
    source: Awaited<ReturnType<typeof captureReviewedTree>>,
    shared: ReturnType<typeof sharedFutureTask>,
    signal: AbortSignal,
  ): Promise<void>;
  agent(runId: string, signal: AbortSignal): Promise<ProcessResult>;
  finalizeAgent(
    runId: string,
    signal: AbortSignal,
  ): Promise<AgentFinalization & { publicReadiness?: PublicReadiness }>;
  grade(input: GradeInput, signal: AbortSignal): Promise<ProcessResult>;
  cleanup(runId: string): Promise<void>;
  retainFailure?(
    runId: string,
    stage:
      | "admission"
      | "preparation"
      | "agent"
      | "finalization"
      | "grading"
      | "cleanup",
    error: unknown,
  ): Promise<void>;
};
// No unchecked 'admitted:true' or transport.kind can grant a live capability.
// This set intentionally has no registration API/default production member.
export const pairedRuntimeBlockers = [
  "TEAM_AGENT_PROFILE_NOT_INDEPENDENTLY_ADMITTED",
  "EXACT_STUDY_RUNTIME_AND_SPENDING_AUTHORITY_REQUIRED",
  ...teamCompositionBlockers,
] as const;
const ProcessSchema = z.strictObject({
  exitCode: z.number().int().min(0).max(255).nullable(),
  signal: z.enum(["SIGINT", "SIGTERM", "SIGKILL"]).nullable(),
  reason: z.enum([
    "completed",
    "timed_out",
    "cancelled",
    "output_limit",
    "spawn_error",
  ]),
  stdout: z.string().max(8000000),
  stderr: z.string().max(8000000),
  elapsedMs: z.number().int().nonnegative(),
});
export type PairedAttempt = {
  variant: Variant;
  run: ExperimentRunV1;
  candidateTreeSha256: string | null;
  changedFiles: string[] | null;
  finalizationConfirmed: boolean;
  publicReadiness: PublicReadiness | null;
  cleanupConfirmed: boolean;
  grade: ReturnType<typeof validateGradeReport> | null;
  failure: string | null;
};
export type PairedOutcome = {
  kind:
    | "synthetic_no_inference_paired_lifecycle"
    | "blocked_paired_execution"
    | "supervised_team_paired_lifecycle";
  studyId: string;
  execution: "NOT_RUN" | "BLOCKED" | "OBSERVED" | "INCOMPLETE";
  attempts: PairedAttempt[];
  cleanupConfirmed: boolean;
  leaseReleased: boolean;
  blockers: string[];
};
export async function runPairedTournament(input: {
  study: unknown;
  transport: PairedTransport;
  protectedRoot: string;
  coordinationRoot: string;
  sources: Record<Variant, string>;
  reloadRuntimeAuthorization(variant: Variant): Promise<unknown>;
  reloadStudy(): Promise<PreparedStudy>;
  implementationIdentity(): Promise<string>;
  signal: AbortSignal;
  // Deterministic clock seam is honored only for the no-inference adapter.
  syntheticNow?: () => string;
}): Promise<PairedOutcome> {
  invariant(
    isPreparedStudy(input.study),
    "Original authenticated study required.",
  );
  const study = input.study,
    transport = input.transport,
    studyId = study.definition.protocol.studyId;
  if (
    transport.kind !== "synthetic-development" &&
    !isAdmittedSupervisedTeamTransport(transport)
  )
    return {
      kind: "blocked_paired_execution",
      studyId,
      execution: "BLOCKED",
      attempts: [],
      cleanupConfirmed: false,
      leaseReleased: false,
      blockers: [...pairedRuntimeBlockers],
    };
  if (transport.kind === "supervised-team")
    assertSupervisedControllerInputs(transport, {
      study,
      protectedRoot: input.protectedRoot,
      coordinationRoot: input.coordinationRoot,
      sources: input.sources,
    });
  const synthetic = transport.kind === "synthetic-development";
  const now =
    transport.kind === "synthetic-development" && input.syntheticNow
      ? input.syntheticNow
      : () => new Date().toISOString();
  const root = await privateDirectory(input.protectedRoot),
    coordination = await privateDirectory(input.coordinationRoot);
  disjoint(root, coordination);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  for (const directory of [root, coordination]) {
    disjoint(directory, repository);
    disjoint(directory, path.resolve(repository, "../AgentHarness-Planning"));
  }
  for (const source of Object.values(input.sources)) {
    await privateDirectory(source);
    disjoint(root, source);
    disjoint(coordination, source);
  }
  const directory = path.join(root, `paired-${studyId}`);
  await mkdir(directory, { mode: 0o700 }); // Reserves study forever, including crashes.
  async function write(name: string, value: unknown) {
    const handle = await open(path.join(directory, name), "wx", 0o400);
    try {
      await handle.writeFile(canonicalJson(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  const attempts: PairedAttempt[] = [],
    blockers: string[] = [];
  let lease: Awaited<ReturnType<typeof acquireBookingLease>> | undefined;
  let safe = true,
    released = false,
    sequence = 0;
  let active: string | null = null;
  const implementation = await input.implementationIdentity();
  async function fresh(variant?: Variant) {
    const loaded = await input.reloadStudy();
    invariant(
      isPreparedStudy(loaded) &&
        jsonDigest(loaded) === jsonDigest(study) &&
        (await input.implementationIdentity()) === implementation,
      "Study, custody or runtime source changed.",
    );
    if (input.signal.aborted) throw new Error("Interrupted study.");
    for (const variant of ["A", "B"] as const)
      invariant(
        (await snapshotTree(input.sources[variant])).treeSha256 ===
          study.draft.plan.manifest.arms.find((x) => x.variant === variant)!
            .initialTreeSha256,
        "Original prepared source changed.",
      );
    if (variant)
      requireHeldRecord(await input.reloadRuntimeAuthorization(variant), {
        studyId,
        kind: "runtime",
        subjectSha256: pairedRuntimeSubject(study, implementation, variant),
        predecessorSha256: study.prepared.sha256,
        at: now(),
      });
    await lease?.assertOwned();
  }
  async function transition(stage: string, variant: Variant | null) {
    await write(`stage-${String(sequence++).padStart(4, "0")}.json`, {
      stage,
      variant,
      observedAt: now(),
      studyId,
      preparedOriginalSha256: study.prepared.sha256,
      evidenceOrigin: synthetic ? "synthetic" : "controller_observation",
    });
  }
  const baselines = new Map<Variant, TrustedEvaluation>();
  try {
    await write("study-original.json", {
      definitionSha256: jsonDigest(study.definition),
      draftSha256: jsonDigest(study.draft),
      protocolOriginalSha256: study.protocol.sha256,
      preparedOriginalSha256: study.prepared.sha256,
      evidenceOrigin: synthetic ? "synthetic" : "controller_observation",
      execution: synthetic ? "NOT_RUN" : "PENDING_RUNTIME_OBSERVATION",
    });
    await fresh();
    for (const arm of study.draft.plan.manifest.arms) {
      invariant(arm.runId, "Predeclared run UUID required.");
      const reservation = await open(
        path.join(
          coordination,
          `tournament-run-${z.string().uuid().parse(arm.runId)}.json`,
        ),
        "wx",
        0o400,
      );
      try {
        await reservation.writeFile(
          canonicalJson({
            studyId,
            preparedOriginalSha256: study.prepared.sha256,
          }),
        );
        await reservation.sync();
      } finally {
        await reservation.close();
      }
    }
    lease = await acquireBookingLease(coordination, studyId);
    if (transport.preflight) await transport.preflight(lease, input.signal);
    else invariant(synthetic, "Owned production preflight required.");
    for (const variant of ["A", "B"] as const) {
      await fresh();
      await transition("baseline", variant);
      const arm = study.draft.plan.manifest.arms.find(
        (x) => x.variant === variant,
      )!;
      invariant(
        (await snapshotTree(input.sources[variant])).treeSha256 ===
          arm.initialTreeSha256,
        "Prepared source changed.",
      );
      active = `baseline-${variant}`;
      const baseline = await transport.baseline(
        variant,
        arm.initialTreeSha256,
        input.signal,
      );
      await transport.cleanup(active);
      active = null;
      invariant(
        isTrustedEvaluation(baseline),
        "Fresh authenticated baseline required.",
      );
      const r = baseline.receipt,
        oracle = study.draft.plan.baselineOracle;
      invariant(
        r.evaluatedTreeSha256 === arm.initialTreeSha256 &&
          r.fixtureSha256 === study.draft.plan.manifest.fixtureSha256 &&
          r.evaluatorSha256 === oracle.evaluatorSha256 &&
          r.testSuiteSha256 === oracle.testSuiteSha256 &&
          r.requiredPolicySha256 === oracle.requiredPolicySha256 &&
          sameIds(r.requiredCheckIds, oracle.requiredCheckIds) &&
          baseline.verification.verdict === "VERIFIED" &&
          Date.parse(r.finishedAt) <= Date.parse(now()) &&
          (variant === "A" ||
            Date.parse(r.startedAt) >=
              Date.parse(study.evidence.record.finishedAt)),
        "Baseline rejected, incomplete, stale or mismatched.",
      );
      invariant(
        ![...baselines.values()].some((x) => x.receipt.runId === r.runId),
        "Cross-arm baseline reuse.",
      );
      baselines.set(variant, baseline);
    }
    const order: Variant[] =
      study.draft.plan.trialPolicy.order === "A_then_B"
        ? ["A", "B"]
        : ["B", "A"];
    // Authorize BOTH arms before launching either, so missing B cannot cause an
    // avoidable unmatched paid A. Gates are rechecked at each arm transition.
    const authorizations = new Set<string>();
    for (const variant of order) {
      const held = requireHeldRecord(
        await input.reloadRuntimeAuthorization(variant),
        {
          studyId,
          kind: "runtime",
          subjectSha256: pairedRuntimeSubject(study, implementation, variant),
          predecessorSha256: study.prepared.sha256,
          at: now(),
        },
      );
      invariant(
        !authorizations.has(held.record.id),
        "Runtime authorization reused.",
      );
      authorizations.add(held.record.id);
    }
    for (const variant of order) {
      const arm = study.draft.plan.manifest.arms.find(
          (x) => x.variant === variant,
        )!,
        runId = arm.runId!;
      const startedAt = now();
      const run = ExperimentRunV1Schema.parse({
        schemaVersion: "experiment-run.v1",
        id: runId,
        variant,
        status: "blocked",
        repoCommit: arm.initialCommit,
        evaluatedTreeSha256: null,
        fixtureSha256: study.draft.plan.manifest.fixtureSha256,
        agentConfigSha256: study.draft.plan.manifest.agentConfigSha256,
        evaluatorSha256: study.draft.plan.futureOracle.evaluatorSha256,
        requiredPolicySha256:
          study.draft.plan.futureOracle.requiredPolicySha256,
        isolationAttestationId: null,
        seed: study.definition.protocol.conditions[0]!.seed,
        startedAt,
        endedAt: startedAt,
        verificationId: null,
        receiptId: null,
        metrics: unknownMetrics(),
        evidenceOrigin: "none",
        presentationMode: "recorded",
        limitations: [
          synthetic
            ? "Synthetic no-inference lifecycle; no actual coding-agent or protected experiment evidence."
            : "Protected evidence and independent execution custody remain separate from process completion; usage and charges are unknown.",
        ],
      });
      const attempt: PairedAttempt = {
        variant,
        run,
        candidateTreeSha256: null,
        changedFiles: null,
        finalizationConfirmed: false,
        publicReadiness: null,
        cleanupConfirmed: false,
        grade: null,
        failure: null,
      };
      attempts.push(attempt);
      const signal = AbortSignal.any([
        input.signal,
        AbortSignal.timeout(
          study.definition.protocol.conditions[0]!.budget.maxSeconds * 1000,
        ),
      ]);
      let failureStage:
        "admission" | "preparation" | "agent" | "finalization" | "grading" =
        "admission";
      try {
        await fresh(variant);
        await transition("admission", variant);
        requireHeldRecord(await input.reloadRuntimeAuthorization(variant), {
          studyId,
          kind: "runtime",
          subjectSha256: pairedRuntimeSubject(study, implementation, variant),
          predecessorSha256: study.prepared.sha256,
          at: now(),
        });
        active = runId;
        await transport.admit(
          variant,
          pairedRuntimeSubject(study, implementation, variant),
          lease,
          signal,
        );
        const original = await captureReviewedTree(
          input.sources[variant],
          runId,
        );
        invariant(
          (await snapshotTree(input.sources[variant])).treeSha256 ===
            arm.initialTreeSha256,
          "Source drift before worker preparation.",
        );
        failureStage = "preparation";
        await transport.prepare(
          runId,
          original,
          sharedFutureTask(study),
          signal,
        );
        await fresh(variant);
        failureStage = "agent";
        await transition("agent", variant);
        const process = ProcessSchema.parse(
          await transport.agent(runId, signal),
        );
        attempt.run.status =
          process.reason === "timed_out"
            ? "timed_out"
            : process.reason === "cancelled"
              ? "cancelled"
              : process.reason === "completed" && process.exitCode === 0
                ? "completed"
                : "failed";
        // Terminated/interrupted source can still be archived. This grants no
        // extra coding/checking time and never resumes the native agent.
        await fresh(variant);
        failureStage = "finalization";
        await transition("sealing", variant);
        const finalized = await transport.finalizeAgent(
          runId,
          signal.aborted ? AbortSignal.timeout(30_000) : signal,
        );
        invariant(
          transport.kind === "synthetic-development" ||
            isTrustedAgentFinalization(finalized) ||
            isTrustedSupervisedTeamFinalization(finalized),
          "Concrete supervised finalization required.",
        );
        invariant(
          finalized.runId === runId &&
            finalized.terminationConfirmed &&
            finalized.restartAbsenceConfirmed &&
            finalized.exportWithoutGuestExecution &&
            jsonDigest(finalized.candidate) === finalized.candidateSha256,
          "Agent termination or sealing unconfirmed.",
        );
        attempt.finalizationConfirmed = true;
        if (finalized.publicReadiness) {
          attempt.publicReadiness = PublicReadinessSchema.parse(
            finalized.publicReadiness,
          );
          invariant(
            attempt.publicReadiness.candidateSha256 ===
              finalized.candidateSha256,
            "Public readiness source changed.",
          );
        }
        invariant(
          transport.kind !== "supervised-team" || attempt.publicReadiness,
          "Public readiness missing.",
        );
        const candidate = await freezeCandidate(
          finalized.candidate,
          runId,
          path.join(directory, `candidate-${variant}`),
          original,
        );
        attempt.candidateTreeSha256 = candidate.treeSha256;
        attempt.run.evaluatedTreeSha256 = candidate.treeSha256;
        attempt.changedFiles = sourceDiff(
          (await snapshotTree(input.sources[variant])).files,
          candidate.manifest,
        );
        if (
          attempt.publicReadiness?.status !== "READY" &&
          attempt.publicReadiness
        ) {
          if (attempt.run.status === "completed") attempt.run.status = "failed";
          attempt.run.limitations.push(
            "Finalized candidate is not publicly ready; failed source retained independently of protected grading.",
          );
        }
        invariant(
          !signal.aborted && process.reason === "completed",
          "Interrupted candidate archived; no protected grading.",
        );
        const oracle = study.draft.plan.futureOracle;
        const profile: TeamGradeProfile = {
          kind: "booking-team-permissions.v1",
          taskId: "booking-team-permissions-v1",
          taskDefinitionSha256: study.draft
            .taskDefinitionSha256 as TeamGradeProfile["taskDefinitionSha256"],
          descriptorSha256: jsonDigest(study.draft.futureOracle),
          fixtureSha256: study.draft.plan.manifest.fixtureSha256,
          dependencyLockSha256:
            study.definition.protocol.conditions[0]!.dependencyLockSha256,
          baselineEvaluatorSha256:
            study.draft.plan.baselineOracle.evaluatorSha256,
          evaluatorSha256: oracle.evaluatorSha256,
          testSuiteSha256: oracle.testSuiteSha256,
          requiredPolicySha256: oracle.requiredPolicySha256,
        };
        const gradeInput = validateGradeInput({
          runId,
          evaluatedTreeSha256: candidate.treeSha256,
          evaluatorSha256: oracle.evaluatorSha256,
          testSuiteSha256: oracle.testSuiteSha256,
          requiredPolicySha256: oracle.requiredPolicySha256,
          candidate: candidate.envelope,
          workerImage: study.definition.runtime.workerImage,
          evaluationProfile: profile,
        });
        await fresh(variant);
        failureStage = "grading";
        await transition("protected-grading", variant);
        const graded = ProcessSchema.parse(
          await transport.grade(gradeInput, signal),
        );
        invariant(
          graded.reason === "completed" &&
            graded.exitCode === 0 &&
            !signal.aborted,
          "Protected grader unavailable or interrupted.",
        );
        attempt.grade = validateGradeReport(
          JSON.parse(graded.stdout),
          {
            runId: gradeInput.runId,
            evaluatedTreeSha256: gradeInput.evaluatedTreeSha256,
            evaluatorSha256: gradeInput.evaluatorSha256,
            testSuiteSha256: gradeInput.testSuiteSha256,
            requiredPolicySha256: gradeInput.requiredPolicySha256,
          },
          profile,
        );
        invariant(
          (await snapshotTree(candidate.directory)).treeSha256 ===
            candidate.treeSha256,
          "Sealed candidate changed during grading.",
        );
        await fresh(variant);
      } catch (error) {
        await transport.retainFailure?.(runId, failureStage, error);
        if (attempt.run.status === "completed") attempt.run.status = "failed";
        if (input.signal.aborted) attempt.run.status = "cancelled";
        else if (signal.aborted) attempt.run.status = "timed_out";
        attempt.failure = "PAIRED_ATTEMPT_BLOCKED_INTERRUPTED_OR_INVALID";
      } finally {
        try {
          await lease.assertOwned();
          if (active) await transport.cleanup(active);
          active = null;
          attempt.cleanupConfirmed = true;
        } catch (error) {
          await transport.retainFailure?.(runId, "cleanup", error);
          safe = false;
          attempt.run.status = "blocked";
          attempt.grade = null;
          blockers.push("CLEANUP_UNCONFIRMED_OWNER_RECOVERY_REQUIRED");
        }
        attempt.run.endedAt = now();
        await write(`attempt-${variant}.json`, attempt);
      }
      if (!safe || input.signal.aborted) break;
    }
  } catch {
    blockers.push("STUDY_GATES_SOURCE_BASELINE_OR_ORIGINALS_INVALID");
  } finally {
    if (active && lease) {
      try {
        await lease.assertOwned();
        await transport.cleanup(active);
        active = null;
      } catch {
        safe = false;
      }
    }
    if (safe && lease) {
      try {
        await lease.release();
        released = true;
      } catch {
        safe = false;
        blockers.push("LEASE_RELEASE_UNCONFIRMED");
      }
    }
  }
  let originals: { runId: string; sha256: string }[] = [];
  if (!synthetic) {
    try {
      originals = await recordSupervisedTeamOutcome(transport, {
        studyId,
        attempts,
        cleanupConfirmed: safe,
        leaseReleased: released,
      });
      blockers.push(...supervisedTeamMeasurementBlockers(transport));
    } catch {
      blockers.push("ACTUAL_RUNTIME_ORIGINALS_INCOMPLETE");
    }
  }
  // Runtime observations are not independent execution/history authority or a
  // public comparison. Synthetic paths can never produce actual originals.
  const outcome: PairedOutcome = {
    kind: synthetic
      ? "synthetic_no_inference_paired_lifecycle"
      : "supervised_team_paired_lifecycle",
    studyId,
    execution: synthetic
      ? "NOT_RUN"
      : originals.length === 2 && safe && released
        ? "OBSERVED"
        : "INCOMPLETE",
    attempts,
    cleanupConfirmed: safe,
    leaseReleased: released,
    blockers: [...new Set(blockers)],
  };
  if (!synthetic)
    await write("runtime-original-index.json", {
      originals,
      independentExecutionHistoryCustody: "REQUIRED",
      publication: "DISABLED",
    });
  await write("outcome.json", outcome);
  return immutable(outcome);
}
