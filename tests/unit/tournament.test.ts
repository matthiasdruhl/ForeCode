import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExperimentRunV1 } from "@/lib/contracts/evidence";
import {
  unknownMetrics,
  preparationInclusiveMetrics,
} from "@/lib/experiment/metrics";
import { unprovisionedTournament } from "@/lib/experiment/report";
import { sha256 } from "@/lib/report/digests";
import {
  createProtectedEvaluationStore,
  type TrustedEvaluation,
} from "@/server/artifacts/evaluation-store";
import { assembleEvaluatorReceipt } from "../../scripts/evaluator/booking-v1/receipt";
import {
  validateTournamentPlan,
  tournamentPlanCommitment,
  frozenTaskDigest,
  type TournamentPlan,
} from "../../scripts/experiments/tournament/plan";
import { buildTournamentReport } from "../../scripts/experiments/tournament/report";
import { tournamentCli } from "../../scripts/experiments/tournament/cli";

// Everything in this suite is synthetic unit evidence, never a real study.
const hash = (digit: string) => digit.repeat(64);
const commit = "1".repeat(40);
const frozenAt = "2026-10-28T16:00:00.000Z";
const start = "2026-10-28T17:00:00.000Z";
const later = "2026-10-28T18:00:00.000Z";
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
function planFixture(): TournamentPlan {
  const budget = {
    maxSeconds: 300,
    maxIterations: 3,
    tokenLimit: null,
    spendUsd: null,
  };
  const conditions = {
    originalCommit: commit,
    originalTreeSha256: hash("1"),
    dependencyLockSha256: hash("2"),
    taskSha256: hash("3"),
    visibleRoadmapSha256: hash("4"),
    promptTemplateSha256: hash("5"),
    agentConfigSha256: hash("6"),
    toolAllowlistSha256: hash("7"),
    runtimeSha256: hash("8"),
    networkPolicySha256: hash("9"),
    credentialPolicySha256: hash("a"),
    seed: 1,
    budget,
  };
  const plan: TournamentPlan = {
    schemaVersion: "tournament-plan.local.v1",
    manifest: {
      schemaVersion: "pair-manifest.v1",
      id: "synthetic-study",
      taskId: "synthetic-team-task",
      scenarioId: "team-access",
      fixtureSha256: hash("b"),
      agentConfigSha256: conditions.agentConfigSha256,
      evaluatorSha256: hash("c"),
      requiredPolicySha256: hash("d"),
      toolAllowlistSha256: conditions.toolAllowlistSha256,
      budget,
      arms: [
        {
          variant: "A",
          initialCommit: commit,
          initialTreeSha256: hash("1"),
          runId: "future-A",
          upfrontMetrics: unknownMetrics(),
        },
        {
          variant: "B",
          initialCommit: "2".repeat(40),
          initialTreeSha256: hash("2"),
          runId: "future-B",
          upfrontMetrics: unknownMetrics(),
        },
      ],
      frozenAt,
      limitations: ["Synthetic unit plan."],
    },
    scenario: {
      schemaVersion: "scenario.v1",
      id: "team-access",
      intentIds: ["intent-team"],
      request: "Synthetic delegated booking case.",
      assumptions: [],
      acceptanceIds: ["team-permissions"],
      frozen: true,
      baselineCommit: commit,
      origin: "developer_confirmed",
    },
    taskSha256: conditions.taskSha256,
    visibleRoadmapSha256: conditions.visibleRoadmapSha256,
    baselineOracle: {
      evaluatorSha256: hash("e"),
      testSuiteSha256: hash("f"),
      requiredPolicySha256: hash("a"),
      requiredCheckIds: ["present"],
    },
    futureOracle: {
      evaluatorSha256: hash("c"),
      testSuiteSha256: hash("e"),
      requiredPolicySha256: hash("d"),
      requiredCheckIds: ["future", "regression"],
    },
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
    intentRevision: { id: "intent-team", revision: 1 },
  };
  plan.taskSha256 = frozenTaskDigest(plan);
  plan.conditions.forEach((arm) => {
    arm.taskSha256 = plan.taskSha256;
  });
  return plan;
}
async function authenticated(
  plan: TournamentPlan,
  variant: "A" | "B",
  phase: "baseline" | "future",
  result: "pass" | "fail" | "missing" = "pass",
) {
  const parent = await mkdtemp(
    path.join(tmpdir(), "forecode-tournament-unit-"),
  );
  temporary.push(parent);
  const root = path.join(parent, "protected");
  const workspace = path.join(parent, "workspace");
  await mkdir(path.join(root, "record", "checks"), { recursive: true });
  await mkdir(workspace);
  const arm = plan.manifest.arms.find((item) => item.variant === variant)!;
  const oracle = phase === "baseline" ? plan.baselineOracle : plan.futureOracle;
  const runId = phase === "future" ? arm.runId! : `baseline-${variant}`;
  const identity = {
    runId,
    evaluatedTreeSha256:
      phase === "baseline"
        ? arm.initialTreeSha256
        : hash(variant === "A" ? "3" : "4"),
    fixtureSha256: plan.manifest.fixtureSha256,
    ...oracle,
  };
  const checks = await Promise.all(
    oracle.requiredCheckIds
      .filter((_, i) => result !== "missing" || i === 0)
      .map(async (id, index) => {
        const status =
          result === "fail" && index === 0
            ? ("fail" as const)
            : ("pass" as const);
        const bytes = JSON.stringify({ synthetic: true, id, status });
        await writeFile(
          path.join(root, "record", "checks", `${id}.json`),
          bytes,
        );
        return {
          schemaVersion: "check-result.v1" as const,
          id,
          runId,
          kind: "acceptance" as const,
          status,
          exitCode: status === "pass" ? 0 : 1,
          evidencePath: `checks/${id}.json`,
          scope: "Synthetic unit check.",
          artifactSha256: sha256(bytes),
        };
      }),
  );
  const timestamp =
    phase === "baseline" ? frozenAt : variant === "A" ? start : later;
  const bundle = assembleEvaluatorReceipt({
    id: `receipt-${runId}`,
    identity,
    checks,
    startedAt: timestamp,
    finishedAt: timestamp,
  });
  const bytes = JSON.stringify(bundle);
  await writeFile(path.join(root, "record", "evaluation.json"), bytes);
  const store = await createProtectedEvaluationStore({
    root,
    agentWorkspaceRoot: workspace,
    entries: new Map([
      [runId, { directory: "record", bundleSha256: sha256(bytes), identity }],
    ]),
  });
  const evaluation = (await store.load(runId))!;
  expect(evaluation).not.toBeNull();
  return { evaluation, root, store, runId };
}
function runFixture(
  plan: TournamentPlan,
  variant: "A" | "B",
  evaluation: TrustedEvaluation,
): ExperimentRunV1 {
  const arm = plan.manifest.arms.find((item) => item.variant === variant)!;
  return {
    schemaVersion: "experiment-run.v1",
    id: arm.runId!,
    variant,
    status: "completed",
    repoCommit: arm.initialCommit,
    evaluatedTreeSha256: evaluation.receipt.evaluatedTreeSha256,
    fixtureSha256: plan.manifest.fixtureSha256,
    agentConfigSha256: plan.manifest.agentConfigSha256,
    evaluatorSha256: plan.manifest.evaluatorSha256,
    requiredPolicySha256: plan.manifest.requiredPolicySha256,
    isolationAttestationId: "synthetic-not-runtime-approval",
    seed: 1,
    startedAt: variant === "A" ? start : later,
    endedAt: variant === "A" ? start : later,
    verificationId: evaluation.verification.id,
    receiptId: evaluation.receipt.id,
    metrics: unknownMetrics(),
    evidenceOrigin: "measured",
    presentationMode: "recorded",
    limitations: ["Synthetic shape only; not real runtime evidence."],
  };
}
async function evidenceFixture(result: "pass" | "fail" | "missing" = "pass") {
  const plan = planFixture();
  const baselineA = await authenticated(plan, "A", "baseline");
  const baselineB = await authenticated(plan, "B", "baseline");
  const futureA = await authenticated(plan, "A", "future");
  const futureB = await authenticated(plan, "B", "future", result);
  const attempts = [
    runFixture(plan, "A", futureA.evaluation),
    runFixture(plan, "B", futureB.evaluation),
  ];
  const baselines = new Map<"A" | "B", unknown>([
    ["A", baselineA.evaluation],
    ["B", baselineB.evaluation],
  ]);
  const evaluations = new Map<string, unknown>([
    ["future-A", futureA.evaluation],
    ["future-B", futureB.evaluation],
  ]);
  return { plan, attempts, baselines, evaluations, futureB };
}

describe("private tournament condition freeze", () => {
  it("retains exact frozen pair shape and commits a deterministic private draft without approving it", () => {
    const plan = planFixture();
    expect(validateTournamentPlan(plan)).toEqual(plan);
    expect(tournamentPlanCommitment(plan)).toMatch(/^[a-f0-9]{64}$/);
    expect(tournamentPlanCommitment(plan)).toBe(
      tournamentPlanCommitment(structuredClone(plan)),
    );
    expect(buildTournamentReport({ plan, attempts: [] })).toMatchObject({
      comparability: "BLOCKED",
      execution: "DISABLED",
      correctness: "INCONCLUSIVE",
    });
  });
  it.each([
    "originalTreeSha256",
    "taskSha256",
    "visibleRoadmapSha256",
    "dependencyLockSha256",
    "promptTemplateSha256",
    "agentConfigSha256",
    "toolAllowlistSha256",
    "runtimeSha256",
    "networkPolicySha256",
    "credentialPolicySha256",
  ] as const)("rejects unequal %s", (field) => {
    const plan = planFixture();
    plan.conditions[1]![field] = hash("0");
    expect(() => validateTournamentPlan(plan)).toThrow("Unequal");
  });
  it("rejects unequal budgets, duplicate arms and unfrozen or model-proposed tasks", () => {
    const budget = planFixture();
    budget.conditions[1]!.budget = {
      ...budget.conditions[1]!.budget,
      maxSeconds: 301,
    };
    const duplicate = planFixture();
    duplicate.manifest.arms[1]!.variant = "A";
    const unfrozen = planFixture();
    unfrozen.scenario.frozen = false;
    const proposed = planFixture();
    proposed.scenario.origin = "meta_generated";
    for (const plan of [budget, duplicate, unfrozen, proposed])
      expect(() => validateTournamentPlan(plan)).toThrow();
  });
  it("binds the confirmed intent and exact future task to its content commitment", () => {
    const wrongIntent = planFixture();
    wrongIntent.intentRevision.id = "other-intent";
    expect(() => validateTournamentPlan(wrongIntent)).toThrow(
      "intent revision",
    );
    const changedTask = planFixture();
    changedTask.scenario.request = "Observe a different task after B wins.";
    expect(() => validateTournamentPlan(changedTask)).toThrow("exact scenario");
  });
  it("rejects a prepared status quo and self-issued approval fields", () => {
    const plan = planFixture();
    plan.manifest.arms[0]!.initialTreeSha256 = hash("5");
    expect(() => validateTournamentPlan(plan)).toThrow("pre-preparation");
    expect(() =>
      validateTournamentPlan({ ...planFixture(), approved: true }),
    ).toThrow();
  });
});

describe("tournament authenticated evidence linkage and retention", () => {
  it("authenticates prepared and final source receipts but keeps the unapproved study blocked even for two passing arms", async () => {
    const data = await evidenceFixture();
    const report = buildTournamentReport(data);
    expect(report.arms.map((arm) => arm.verdict)).toEqual([
      "VERIFIED",
      "VERIFIED",
    ]);
    expect(report.arms.map((arm) => arm.baselineVerdict)).toEqual([
      "VERIFIED",
      "VERIFIED",
    ]);
    expect(report).toMatchObject({
      comparability: "BLOCKED",
      correctness: "INCONCLUSIVE",
      execution: "DISABLED",
      deviations: [],
    });
    expect(report.blockers).toContain(
      "INDEPENDENT_PREREGISTRATION_NOT_ESTABLISHED",
    );
  });
  it.each(["fail", "missing"] as const)(
    "retains %s outcomes and never fabricates a winner",
    async (result) => {
      const report = buildTournamentReport(await evidenceFixture(result));
      expect(report.arms[1]!.verdict).toBe(
        result === "fail" ? "REJECTED" : "INSUFFICIENT_EVIDENCE",
      );
      expect(report.correctness).toBe("INCONCLUSIVE");
      expect(report.attempts).toHaveLength(2);
    },
  );
  it("compares timestamp instants across valid fractional-second representations", async () => {
    const data = await evidenceFixture();
    data.attempts[0]!.startedAt = start.replace(".000Z", "Z");
    data.attempts[0]!.endedAt = start.replace(".000Z", "Z");
    const report = buildTournamentReport(data);
    expect(report.arms[0]!.verdict).toBe("VERIFIED");
    expect(report.deviations).toEqual([]);
  });
  it("retains independently authenticated failed checks from an unsuccessful process without upgrading execution", async () => {
    const data = await evidenceFixture("fail");
    data.attempts[1]!.status = "failed";
    data.attempts[1]!.evidenceOrigin = "none";
    const report = buildTournamentReport(data);
    expect(report.arms[1]).toMatchObject({
      status: "failed",
      verdict: "REJECTED",
    });
    expect(report.correctness).toBe("INCONCLUSIVE");
    expect(report.execution).toBe("DISABLED");
  });
  it("refuses serialized forgeries and source, arm, policy and commit substitutions", async () => {
    const data = await evidenceFixture();
    data.evaluations.set(
      "future-B",
      JSON.parse(JSON.stringify(data.futureB.evaluation)),
    );
    expect(buildTournamentReport(data).arms[1]!.verdict).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    for (const change of [
      { evaluatedTreeSha256: hash("9") },
      { variant: "A" as const },
      { requiredPolicySha256: hash("9") },
      { repoCommit: "9".repeat(40) },
    ]) {
      const altered = {
        ...data,
        evaluations: new Map([["future-B", data.futureB.evaluation]]),
      };
      altered.attempts = [
        data.attempts[0]!,
        { ...data.attempts[1]!, ...change },
      ];
      const report = buildTournamentReport(altered);
      expect(report.arms[1]!.verdict).toBe("INSUFFICIENT_EVIDENCE");
      expect(report.comparability).toBe("NOT_COMPARABLE");
    }
  });
  it("propagates protected source-byte tampering and changed evidence through fresh loads", async () => {
    const data = await evidenceFixture();
    await writeFile(
      path.join(data.futureB.root, "record", "checks", "future.json"),
      "tampered",
    );
    data.evaluations.set(
      "future-B",
      await data.futureB.store.load(data.futureB.runId),
    );
    expect(buildTournamentReport(data).arms[1]!.verdict).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });
  it("rejects baseline source substitution and rejected present-day correctness", async () => {
    const data = await evidenceFixture();
    data.baselines.set("B", data.baselines.get("A"));
    expect(buildTournamentReport(data).deviations).toContain(
      "B_BASELINE_IDENTITY_MISMATCH",
    );
    const rejected = await authenticated(data.plan, "B", "baseline", "fail");
    data.baselines.set("B", rejected.evaluation);
    expect(buildTournamentReport(data).deviations).toContain(
      "B_PRESENT_DAY_FUNCTIONALITY_REJECTED",
    );
  });
  it("retains denied/cancelled attempts, rejects retries, unequal seeds and post-outcome freeze", async () => {
    const data = await evidenceFixture();
    data.attempts.push({
      ...data.attempts[1]!,
      id: "denied-retry",
      status: "cancelled",
      evidenceOrigin: "none",
      receiptId: null,
      verificationId: null,
      evaluatedTreeSha256: null,
    });
    const report = buildTournamentReport(data);
    expect(report.attempts[2]!.status).toBe("cancelled");
    expect(report.deviations).toContain("PREDECLARED_TRIAL_COUNT_EXCEEDED");
    expect(report.deviations).toContain("UNPLANNED_ATTEMPT_RETAINED");
    data.attempts = data.attempts.slice(0, 2);
    data.attempts[1]!.seed = 2;
    expect(buildTournamentReport(data).deviations).toContain(
      "UNEQUAL_DOWNSTREAM_SEEDS",
    );
    data.plan.manifest.frozenAt = "2026-10-28T20:00:00.000Z";
    expect(buildTournamentReport(data).deviations).toContain(
      "PAIR_RUN_CONDITIONS_MISMATCH",
    );
  });
  it("does not copy unapproved task text, limitations, evidence paths or private payloads to reports", () => {
    const plan = planFixture();
    plan.scenario.request = "/private/operator/token=secret";
    plan.manifest.limitations = ["/private/evaluator"];
    plan.taskSha256 = frozenTaskDigest(plan);
    plan.conditions.forEach((arm) => {
      arm.taskSha256 = plan.taskSha256;
    });
    const report = JSON.stringify(
      buildTournamentReport({ plan, attempts: [] }),
    );
    expect(report).not.toContain("/private/");
    expect(report).not.toContain("token=secret");
    expect(report).not.toContain("evidencePath");
  });
});

describe("safe local CLI preparation", () => {
  it("prints help and unavailable gates without launching a runner", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await tournamentCli(["--help"])).toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain("no-execution");
    expect(await tournamentCli(["--status"])).toBe(2);
    expect(stdout.mock.calls.flat().join("")).toContain(
      '"execution":"DISABLED"',
    );
  });
  it("reads bounded private plan data and returns a blocked report without disclosing task content", async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), "forecode-tournament-cli-unit-"),
    );
    temporary.push(parent);
    const filename = path.join(await realpath(parent), "plan.json");
    await writeFile(filename, JSON.stringify(planFixture()), { mode: 0o600 });
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await tournamentCli(["--plan", filename])).toBe(2);
    const report = JSON.parse(stdout.mock.calls[0]![0] as string);
    expect(report).toMatchObject({
      comparability: "BLOCKED",
      execution: "DISABLED",
    });
    expect(JSON.stringify(report)).not.toContain(
      "Synthetic delegated booking case.",
    );
  });
  it("refuses execution switches, unsafe paths and invalid plans with a fixed safe error", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(await tournamentCli(["--execute"])).toBe(1);
    expect(await tournamentCli(["--plan", "relative.json"])).toBe(1);
    expect(
      await tournamentCli(["--plan", "/private/secret-plan-not-present.json"]),
    ).toBe(1);
    expect(stderr.mock.calls.flat().join("")).not.toContain("secret-plan");
  });
});

describe("tournament accounting and default public state", () => {
  it("counts preparation and downstream separately, propagates missing values, and never sums distinct-file counts", () => {
    const prep = {
      elapsedMs: 30,
      tokens: 10,
      costUsd: 0.2,
      iterations: 1,
      filesTouched: 2,
    };
    const downstream = {
      elapsedMs: 50,
      tokens: null,
      costUsd: 0.3,
      iterations: 2,
      filesTouched: 2,
    };
    expect(preparationInclusiveMetrics(prep, downstream)).toEqual({
      elapsedMs: 80,
      tokens: null,
      costUsd: 0.5,
      iterations: 3,
      filesTouched: null,
    });
    expect(preparationInclusiveMetrics(unknownMetrics(), downstream)).toEqual(
      unknownMetrics(),
    );
  });
  it("never overflows bounded measured quantities or accepts invalid metrics", () => {
    expect(
      preparationInclusiveMetrics(
        { ...unknownMetrics(), elapsedMs: 2_147_483_647 },
        { ...unknownMetrics(), elapsedMs: 1 },
      ).elapsedMs,
    ).toBeNull();
    expect(() =>
      preparationInclusiveMetrics(
        { ...unknownMetrics(), tokens: -1 },
        unknownMetrics(),
      ),
    ).toThrow();
  });
  it("leaves production unprovisioned with unknown effort and no forged run identity", () => {
    const summary = unprovisionedTournament();
    expect(summary).toMatchObject({
      state: "NOT_PROVISIONED",
      comparability: "BLOCKED",
      correctness: "INCONCLUSIVE",
    });
    expect(
      summary.arms.every(
        (arm) =>
          arm.runId === null &&
          Object.values(arm.total).every((value) => value === null),
      ),
    ).toBe(true);
    summary.blockers.length = 0;
    expect(unprovisionedTournament().blockers.length).toBeGreaterThan(0);
  });
});
