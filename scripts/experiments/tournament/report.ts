import { z } from "zod";
import { realAgentExecutionBlockers } from "../runner/commitment";
import {
  ExperimentRunV1Schema,
  type ExperimentRunV1,
} from "../../../src/lib/contracts/evidence";
import {
  invariant,
  sameIds,
  validatePair,
  validateReceiptRelationships,
} from "../../../src/lib/contracts/validation";
import {
  preparationInclusiveMetrics,
  unknownMetrics,
} from "../../../src/lib/experiment/metrics";
import {
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import {
  tournamentPlanCommitment,
  validateTournamentPlan,
  type TournamentPlan,
} from "./plan";

export const tournamentExecutionBlockers = [
  "INDEPENDENT_PREREGISTRATION_NOT_ESTABLISHED",
  "PREPARATION_PREREGISTRATION_CHRONOLOGY_UNESTABLISHED",
  "REAL_AGENT_STUDY_ADMISSION_UNAVAILABLE",
  "PROTECTED_FUTURE_TASK_ORACLE_NOT_PROVISIONED",
] as const;

type EvidenceState = "VERIFIED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
function oracleMatches(
  evaluation: TrustedEvaluation,
  oracle: TournamentPlan["futureOracle"],
  fixtureSha256: string,
) {
  const receipt = evaluation.receipt;
  invariant(
    receipt.fixtureSha256 === fixtureSha256 &&
      receipt.evaluatorSha256 === oracle.evaluatorSha256 &&
      receipt.testSuiteSha256 === oracle.testSuiteSha256 &&
      receipt.requiredPolicySha256 === oracle.requiredPolicySha256 &&
      sameIds(receipt.requiredCheckIds, oracle.requiredCheckIds),
    "Evaluation oracle mismatch.",
  );
}

// Private report only. Receipts must come from the existing protected store in
// this process; serialized objects, issuer strings and self-hashes cannot pass.
// Run metrics remain reported telemetry, not authenticated runtime measurements.
export function buildTournamentReport(input: {
  plan: unknown;
  attempts: readonly ExperimentRunV1[];
  baselines?: ReadonlyMap<"A" | "B", unknown>;
  evaluations?: ReadonlyMap<string, unknown>;
}) {
  const plan = validateTournamentPlan(input.plan);
  const attempts = z
    .array(ExperimentRunV1Schema)
    .max(100)
    .parse(input.attempts);
  invariant(
    new Set(attempts.map((run) => run.id)).size === attempts.length,
    "Duplicate attempt IDs.",
  );
  const deviations: string[] = [];
  if (attempts.some((run) => run.endedAt < run.startedAt))
    deviations.push("ATTEMPT_CHRONOLOGY_INVALID");
  try {
    validatePair(
      {
        ...plan.manifest,
        arms: plan.manifest.arms.map((arm) => ({
          ...arm,
          runId: attempts.some((run) => run.id === arm.runId)
            ? arm.runId
            : null,
        })),
      },
      attempts,
      [plan.scenario],
    );
  } catch {
    deviations.push("PAIR_RUN_CONDITIONS_MISMATCH");
  }
  const plannedIds = plan.manifest.arms.flatMap((arm) =>
    arm.runId === null ? [] : [arm.runId],
  );
  if (attempts.some((run) => !plannedIds.includes(run.id)))
    deviations.push("UNPLANNED_ATTEMPT_RETAINED");
  if (
    attempts.filter((run) => run.variant === "A").length > 1 ||
    attempts.filter((run) => run.variant === "B").length > 1
  )
    deviations.push("PREDECLARED_TRIAL_COUNT_EXCEEDED");
  const ordered = [...attempts].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
  if (ordered.length === 2) {
    const first = plan.trialPolicy.order === "A_then_B" ? "A" : "B";
    if (
      ordered[0]!.variant !== first ||
      ordered[0]!.endedAt > ordered[1]!.startedAt
    )
      deviations.push("PREDECLARED_RUN_ORDER_MISMATCH");
  }
  const missing: string[] = [];
  const baselineIds: string[] = [];
  const arms = (["A", "B"] as const).map((variant) => {
    const arm = plan.manifest.arms.find((item) => item.variant === variant)!;
    const run = attempts.find((item) => item.id === arm.runId);
    if (
      run &&
      run.seed !==
        plan.conditions.find((item) => item.variant === variant)!.seed
    )
      deviations.push(`${variant}_FROZEN_SEED_MISMATCH`);
    const baseline = input.baselines?.get(variant);
    let baselineVerdict: EvidenceState = "INSUFFICIENT_EVIDENCE";
    if (isTrustedEvaluation(baseline)) {
      try {
        oracleMatches(
          baseline,
          plan.baselineOracle,
          plan.manifest.fixtureSha256,
        );
        invariant(
          baseline.receipt.evaluatedTreeSha256 === arm.initialTreeSha256,
          "Baseline prepared source mismatch.",
        );
        invariant(
          !run || baseline.receipt.finishedAt <= run.startedAt,
          "Initial correctness not established before future task.",
        );
        baselineIds.push(baseline.receipt.runId);
        baselineVerdict = baseline.verification.verdict;
      } catch {
        deviations.push(`${variant}_BASELINE_IDENTITY_MISMATCH`);
      }
    }
    if (baselineVerdict === "REJECTED")
      deviations.push(`${variant}_PRESENT_DAY_FUNCTIONALITY_REJECTED`);
    if (baselineVerdict === "INSUFFICIENT_EVIDENCE")
      missing.push(`${variant}_BASELINE_EVIDENCE_MISSING`);
    const candidate = run ? input.evaluations?.get(run.id) : null;
    let verdict: EvidenceState = "INSUFFICIENT_EVIDENCE";
    let receiptId: string | null = null;
    let finalTreeSha256: string | null = null;
    if (run && isTrustedEvaluation(candidate)) {
      try {
        oracleMatches(
          candidate,
          plan.futureOracle,
          plan.manifest.fixtureSha256,
        );
        validateReceiptRelationships(
          candidate.receipt,
          candidate.verification,
          run,
        );
        invariant(
          run.variant === variant &&
            run.repoCommit === arm.initialCommit &&
            candidate.receipt.startedAt >= run.startedAt,
          "Future run does not bind to the prepared arm and execution chronology.",
        );
        verdict = candidate.verification.verdict;
        receiptId = candidate.receipt.id;
        finalTreeSha256 = candidate.receipt.evaluatedTreeSha256;
      } catch {
        deviations.push(`${variant}_FUTURE_EVIDENCE_IDENTITY_MISMATCH`);
      }
    }
    if (!run) missing.push(`${variant}_ATTEMPT_MISSING`);
    if (verdict === "INSUFFICIENT_EVIDENCE")
      missing.push(`${variant}_FUTURE_EVIDENCE_MISSING_OR_INCOMPLETE`);
    const downstream = run?.metrics ?? unknownMetrics();
    return {
      variant,
      runId: run?.id ?? null,
      status: run?.status ?? "not_run",
      baselineVerdict,
      verdict,
      initialTreeSha256: arm.initialTreeSha256,
      finalTreeSha256,
      receiptId,
      preparation: arm.upfrontMetrics,
      downstream,
      total: preparationInclusiveMetrics(arm.upfrontMetrics, downstream),
    };
  });
  if (new Set(baselineIds).size !== baselineIds.length)
    deviations.push("CROSS_ARM_BASELINE_REUSE");
  const a = attempts.find((run) => run.variant === "A");
  const b = attempts.find((run) => run.variant === "B");
  if (a && b && a.seed !== b.seed) deviations.push("UNEQUAL_DOWNSTREAM_SEEDS");

  return {
    kind: "private_local_tournament_assessment" as const,
    studyId: plan.manifest.id,
    planSha256: tournamentPlanCommitment(plan),
    taskId: plan.manifest.taskId,
    comparability: deviations.length
      ? ("NOT_COMPARABLE" as const)
      : ("BLOCKED" as const),
    correctness: "INCONCLUSIVE" as const,
    execution: "DISABLED" as const,
    runtimeBlockers: [...realAgentExecutionBlockers],
    blockers: [...tournamentExecutionBlockers, ...missing],
    deviations: [...new Set(deviations)],
    arms,
    // Preserve every attempt, including cancelled/failed/blocked and unplanned
    // attempts. Do not copy arbitrary limitations or private host paths to output.
    attempts: attempts.map((run) => ({
      id: run.id,
      variant: run.variant,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      reportedFinalTreeSha256: run.evaluatedTreeSha256,
      reportedMetrics: run.metrics,
    })),
    limitations: [
      "This report cannot authenticate preregistration, execution authorization, cleanup, cross-arm secrecy or telemetry custody.",
      "No authenticated pre-selection/preparation commitment chronology is available; frozenAt alone does not prove independent preregistration.",
      "Authenticated checks alone do not establish that coding-agent execution was admitted or this study was fairly performed.",
      "No comparison winner is issued while independent study/runtime/oracle gates are unavailable.",
      "Input metrics are unvalidated run telemetry; totals propagate unknowns and do not add files-touched counts.",
      "Preparation-inclusive elapsed time is additive effort across phases, not concurrent study makespan.",
      "Local reports are private and cannot provision recordings or certificates.",
      "One visible case study cannot establish Meta incremental advantage or general productivity benefit.",
    ],
  };
}
