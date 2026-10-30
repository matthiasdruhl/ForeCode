// UI-only synthetic projection. Never added to a production catalog.
import type { PublicTournament } from "../../src/lib/experiment/tournament-publication";
import { tournamentRequiredChecks } from "../../src/lib/experiment/tournament-publication";
import { unknownMetrics } from "../../src/lib/experiment/metrics";
export function syntheticTournamentView(): PublicTournament {
  const hash = "1".repeat(64),
    commit = "1".repeat(40);
  return {
    schemaVersion: "tournament-public-projection.v1",
    studyId: "synthetic-ui-study",
    taskId: "booking-team-permissions-v1",
    title: "Synthetic tournament — UI test only",
    futureProblem:
      "Add team bookings with delegated permissions while preserving personal bookings.",
    reviewedProposal:
      "Extract a shared authorization policy before adding team permissions.",
    hypothesis:
      "The prepared architecture may reduce downstream effort after its preparation cost is counted.",
    taskDefinitionSha256: hash,
    definitionSha256: hash,
    protocolOriginalSha256: hash,
    preparedOriginalSha256: hash,
    model: "muse-spark-1.3",
    order: "A_then_B",
    comparability: "COMPARABLE",
    correctness: "B_ONLY_VERIFIED",
    baselineEvaluatorSha256: hash,
    baselineSuiteSha256: hash,
    baselinePolicySha256: hash,
    futureEvaluatorSha256: hash,
    futureSuiteSha256: hash,
    futurePolicySha256: hash,
    arms: (["A", "B"] as const).map((variant) => ({
      variant,
      runId: `synthetic-run-${variant}`,
      status: "completed",
      baselineVerdict: "VERIFIED",
      verdict: variant === "A" ? "REJECTED" : "VERIFIED",
      initialCommit: commit,
      initialTreeSha256: hash,
      finalTreeSha256: hash,
      receiptId: `synthetic-receipt-${variant}`,
      baselineReceiptId: `synthetic-baseline-${variant}`,
      preparation:
        variant === "A"
          ? {
              elapsedMs: 0,
              tokens: 0,
              costUsd: 0,
              iterations: 0,
              filesTouched: 0,
            }
          : {
              elapsedMs: 60000,
              tokens: 200,
              costUsd: 0.5,
              iterations: 1,
              filesTouched: 2,
            },
      downstream: {
        elapsedMs: 60000,
        tokens: null,
        costUsd: null,
        iterations: 1,
        filesTouched: 1,
      },
      total: {
        ...unknownMetrics(),
        elapsedMs: variant === "B" ? 120000 : 60000,
      },
      inputTokens: null,
      outputTokens: null,
      reservedMicroUsd: 1000000,
      changedFileCount: 1,
      totalChangedFileCount: variant === "B" ? 2 : 1,
      checks: tournamentRequiredChecks.map((id) => ({
        id,
        status:
          variant === "A" && id === "team-permissions-domain" ? "fail" : "pass",
      })),
      startedAt:
        variant === "A"
          ? "2026-10-28T12:06:00.000Z"
          : "2026-10-28T12:08:00.000Z",
      endedAt:
        variant === "A"
          ? "2026-10-28T12:07:00.000Z"
          : "2026-10-28T12:09:00.000Z",
    })),
    sourceComparison: [
      {
        path: "src/server/authorization-policy.ts",
        beforeSha256: null,
        afterSha256: hash,
      },
    ],
    attempts: [
      {
        id: "synthetic-run-A",
        variant: "A",
        status: "completed",
        startedAt: "2026-10-28T12:06:00.000Z",
        endedAt: "2026-10-28T12:07:00.000Z",
      },
      {
        id: "synthetic-run-B",
        variant: "B",
        status: "completed",
        startedAt: "2026-10-28T12:08:00.000Z",
        endedAt: "2026-10-28T12:09:00.000Z",
      },
    ],
    preparationAttempts: [
      {
        id: "synthetic-failed-preparation",
        status: "failed",
        startedAt: "2026-10-28T12:02:00.000Z",
        finishedAt: "2026-10-28T12:03:00.000Z",
      },
      {
        id: "synthetic-selected-preparation",
        status: "completed",
        startedAt: "2026-10-28T12:03:00.000Z",
        finishedAt: "2026-10-28T12:04:00.000Z",
      },
    ],
    blockers: [],
    deviations: [],
    limitations: [
      "Synthetic UI data only. No experiment occurred.",
      "One visible case study cannot establish general productivity or Meta incremental benefit.",
    ],
  };
}
