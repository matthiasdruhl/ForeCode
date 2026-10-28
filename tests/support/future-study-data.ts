import proposedTask from "../../benchmarks/booking-team-permissions/task.proposal.json";
import {
  futureTaskDigest,
  futureTaskRequest,
  validateFutureTask,
} from "../../src/lib/experiment/future-task";
import { unknownMetrics } from "../../src/lib/experiment/metrics";
import { jsonDigest } from "../../src/lib/report/digests";
import { bookingPolicy } from "../../scripts/evaluator/booking-v1/freeze";
import {
  futureCheckIds,
  futurePolicy,
} from "../../scripts/evaluator/booking-v1/future";
import {
  frozenTaskDigest,
  type TournamentPlan,
} from "../../scripts/experiments/tournament/plan";
import type { FutureStudyDraft } from "../../scripts/experiments/tournament/future-study";
import { hash, commit } from "./research-data";

// Synthetic preparation inputs, not measured preparation or approved identities.
export function futureStudyData(): FutureStudyDraft {
  const task = validateFutureTask(structuredClone(proposedTask));
  const baseline = {
    evaluatorSha256: hash("1"),
    testSuiteSha256: hash("2"),
    requiredPolicySha256: jsonDigest(bookingPolicy),
    requiredCheckIds: [...bookingPolicy.requiredCheckIds],
  };
  const oracle = {
    evaluatorSha256: hash("3"),
    testSuiteSha256: hash("4"),
    requiredPolicySha256: jsonDigest(futurePolicy(task, baseline)),
    requiredCheckIds: [...futureCheckIds],
  };
  const budget = {
    maxSeconds: 300,
    maxIterations: 3,
    tokenLimit: 10000,
    spendUsd: 1,
  };
  const conditions = {
    originalCommit: commit,
    originalTreeSha256: hash("5"),
    dependencyLockSha256: hash("6"),
    taskSha256: hash("7"),
    visibleRoadmapSha256: hash("8"),
    promptTemplateSha256: hash("9"),
    agentConfigSha256: hash("a"),
    toolAllowlistSha256: hash("b"),
    runtimeSha256: hash("c"),
    networkPolicySha256: hash("d"),
    credentialPolicySha256: hash("e"),
    seed: 1,
    budget,
  };
  const plan: TournamentPlan = {
    schemaVersion: "tournament-plan.local.v1",
    manifest: {
      schemaVersion: "pair-manifest.v1",
      id: "synthetic-future-study",
      taskId: task.id,
      scenarioId: "team-scenario",
      fixtureSha256: hash("5"),
      agentConfigSha256: conditions.agentConfigSha256,
      evaluatorSha256: oracle.evaluatorSha256,
      requiredPolicySha256: oracle.requiredPolicySha256,
      toolAllowlistSha256: conditions.toolAllowlistSha256,
      budget,
      arms: [
        {
          variant: "A",
          initialCommit: commit,
          initialTreeSha256: hash("5"),
          runId: "future-A",
          upfrontMetrics: unknownMetrics(),
        },
        {
          variant: "B",
          initialCommit: "2".repeat(40),
          initialTreeSha256: hash("f"),
          runId: "future-B",
          upfrontMetrics: unknownMetrics(),
        },
      ],
      frozenAt: "2026-10-28T12:05:00.000Z",
      limitations: ["Synthetic unit draft only."],
    },
    scenario: {
      schemaVersion: "scenario.v1",
      id: "team-scenario",
      intentIds: ["team-intent"],
      request: futureTaskRequest(task),
      assumptions: [],
      acceptanceIds: [
        ...task.acceptance.map((item) => item.id),
        ...task.invariants,
      ],
      frozen: true,
      baselineCommit: commit,
      origin: "developer_confirmed",
    },
    taskSha256: hash("7"),
    visibleRoadmapSha256: conditions.visibleRoadmapSha256,
    baselineOracle: baseline,
    futureOracle: oracle,
    conditions: [
      { variant: "A", ...conditions },
      { variant: "B", ...conditions },
    ],
    trialPolicy: {
      attemptsPerArm: 1,
      order: "A_then_B",
      failedAttempts: "retain_all_no_retries",
      opposingResults: "withheld_until_both_finished",
    },
    studyKind: "visible_preregistered_case_study",
    intentRevision: { id: "team-intent", revision: 1 },
  };
  plan.taskSha256 = frozenTaskDigest(plan);
  plan.conditions.forEach((item) => {
    item.taskSha256 = plan.taskSha256;
  });
  const execution = {
    agentId: "synthetic-agent",
    modelId: "synthetic-model",
    resources: {
      cpus: 1,
      memoryMiB: 768,
      pids: 128,
      diskMiB: 1024,
      outputBytes: 4096,
    },
  };
  return {
    schemaVersion: "booking-future-study.local.v1",
    task,
    taskDefinitionSha256: futureTaskDigest(task),
    plan,
    futureOracle: {
      schemaVersion: "booking-future-oracle.local.v1",
      id: "synthetic-future-oracle",
      taskId: task.id,
      taskDefinitionSha256: futureTaskDigest(task),
      baselineOracle: structuredClone(baseline),
      oracle: structuredClone(oracle),
    },
    executionConditions: [
      { variant: "A", ...execution },
      { variant: "B", ...structuredClone(execution) },
    ],
    preparationRecordSha256: null,
    proposedChronology: {
      independentFreezeAt: "2026-10-28T12:00:00.000Z",
      architectureSelectionAt: "2026-10-28T12:01:00.000Z",
    },
  };
}
