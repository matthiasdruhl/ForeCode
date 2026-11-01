// Disposable synthetic public metadata only. No real tournament outcomes.
import {
  PublicTournamentSchema,
  tournamentRequiredChecks,
  type PublicTournament,
} from "@/lib/experiment/tournament-publication";
import { unknownMetrics } from "@/lib/experiment/metrics";
export const start = "2026-10-29T12:00:00.000Z";
export const end = "2026-10-29T12:01:00.000Z";
export function replayFixture(): PublicTournament {
  return PublicTournamentSchema.parse({
    schemaVersion: "tournament-public-projection.v1",
    studyId: "synthetic-replay-study",
    taskId: "synthetic-task",
    title: "Synthetic replay test only",
    futureProblem: "Test delegated access",
    reviewedProposal: "Test a reviewed permission boundary",
    hypothesis: "Synthetic hypothesis, not a model recording",
    taskDefinitionSha256: "1".repeat(64),
    definitionSha256: "2".repeat(64),
    protocolOriginalSha256: "3".repeat(64),
    preparedOriginalSha256: "4".repeat(64),
    model: "synthetic-model",
    order: "A_then_B",
    comparability: "COMPARABLE",
    correctness: "BOTH_VERIFIED",
    baselineEvaluatorSha256: "5".repeat(64),
    baselineSuiteSha256: "6".repeat(64),
    baselinePolicySha256: "7".repeat(64),
    futureEvaluatorSha256: "8".repeat(64),
    futureSuiteSha256: "9".repeat(64),
    futurePolicySha256: "a".repeat(64),
    arms: (["A", "B"] as const).map((variant, i) => ({
      variant,
      runId: `run-${variant}`,
      status: "completed",
      baselineVerdict: "VERIFIED",
      verdict: "VERIFIED",
      initialCommit: String(i + 1).repeat(40),
      initialTreeSha256: String(i + 1).repeat(64),
      finalTreeSha256: String(i + 3).repeat(64),
      receiptId: `future-${variant}`,
      baselineReceiptId: `baseline-${variant}`,
      preparation: unknownMetrics(),
      downstream: unknownMetrics(),
      total: unknownMetrics(),
      inputTokens: null,
      outputTokens: null,
      reservedMicroUsd: null,
      changedFileCount: null,
      totalChangedFileCount: null,
      checks: tournamentRequiredChecks.map((id) => ({ id, status: "pass" })),
      startedAt: start,
      endedAt: end,
    })),
    sourceComparison: null,
    attempts: (["A", "B"] as const).map((variant) => ({
      id: `run-${variant}`,
      variant,
      status: "completed",
      startedAt: start,
      endedAt: end,
    })),
    preparationAttempts: [
      { id: "prep-1", status: "completed", startedAt: start, finishedAt: end },
    ],
    blockers: [],
    deviations: [],
    limitations: ["Synthetic test projection; no authentic experiment."],
  });
}
export function missingFuture(p: PublicTournament, index = 1) {
  const arm = p.arms[index]!;
  arm.receiptId = null;
  arm.verdict = "INSUFFICIENT_EVIDENCE";
  arm.checks.forEach((c) => {
    c.status = "not_run";
  });
  p.correctness = "INCONCLUSIVE";
  return p;
}
