import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { createProtectedEvaluationStore } from "@/server/artifacts/evaluation-store";
import { assembleEvaluatorReceipt } from "../../scripts/evaluator/booking-v1/receipt";
import { frozenTaskDigest } from "../../scripts/experiments/tournament/plan";
import {
  assessFutureStudy,
  loadPreparationRecord,
  validateFutureStudy,
  PreparationRecordSchema,
  futureProtocolCommitment,
  requireFutureStudyCommitments,
} from "../../scripts/experiments/tournament/future-study";
import { tournamentCli } from "../../scripts/experiments/tournament/cli";
import { futureStudyData } from "../support/future-study-data";
import { check, hash } from "../support/research-data";

const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-future-study-unit-")),
  );
  temporary.push(parent);
  const root = path.join(parent, "protected");
  const workspace = path.join(parent, "task");
  await mkdir(root, { mode: 0o700 });
  await mkdir(workspace, { mode: 0o700 });
  const draft = futureStudyData();
  const condition = draft.plan.conditions[0]!;
  const b = draft.plan.manifest.arms[1]!;
  const record = PreparationRecordSchema.parse({
    schemaVersion: "booking-preparation.local.v1",
    studyId: draft.plan.manifest.id,
    variant: "B",
    taskDefinitionSha256: draft.taskDefinitionSha256,
    protocolSha256: futureProtocolCommitment(draft),
    original: {
      commit: condition.originalCommit,
      treeSha256: condition.originalTreeSha256,
      dependencyLockSha256: condition.dependencyLockSha256,
    },
    prepared: {
      commit: b.initialCommit,
      treeSha256: b.initialTreeSha256,
      dependencyLockSha256: condition.dependencyLockSha256,
    },
    preparationPromptSha256: hash("1"),
    reviewRecordSha256: hash("2"),
    executionRecordSha256: hash("3"),
    startedAt: "2026-10-28T12:02:00.000Z",
    finishedAt: "2026-10-28T12:03:00.000Z",
    metrics: b.upfrontMetrics,
  });
  const filename = path.join(root, "preparation.json");
  async function load() {
    const bytes = JSON.stringify(record);
    await writeFile(filename, bytes, { mode: 0o600 });
    draft.preparationRecordSha256 = sha256(bytes);
    return loadPreparationRecord({
      filename,
      expectedSha256: sha256(bytes),
      agentWorkspaceRoots: [workspace],
    });
  }
  return { parent, root, workspace, draft, record, filename, load };
}

async function baseline(
  data: Awaited<ReturnType<typeof fixture>>,
  result: "pass" | "fail" = "pass",
  startedAt = "2026-10-28T12:04:00.000Z",
) {
  const runId = "synthetic-prepared-baseline-B";
  const identity = {
    runId,
    evaluatedTreeSha256: data.draft.plan.manifest.arms[1]!.initialTreeSha256,
    fixtureSha256: data.draft.plan.manifest.fixtureSha256,
    ...data.draft.plan.baselineOracle,
  };
  await mkdir(path.join(data.root, "baseline", "checks"), { recursive: true });
  const checks = identity.requiredCheckIds.map((id, i) => ({
    ...check(id, i === 0 ? result : "pass"),
    runId,
  }));
  for (const observed of checks) {
    const bytes = JSON.stringify({
      evidenceOrigin: "synthetic",
      checkId: observed.id,
    });
    observed.artifactSha256 = sha256(bytes);
    await writeFile(
      path.join(data.root, "baseline", observed.evidencePath!),
      bytes,
    );
  }
  const bundle = assembleEvaluatorReceipt({
    id: "synthetic-preparation-receipt",
    identity,
    checks,
    startedAt,
    finishedAt: startedAt,
  });
  const bytes = JSON.stringify(bundle);
  await writeFile(path.join(data.root, "baseline", "evaluation.json"), bytes);
  const store = await createProtectedEvaluationStore({
    root: data.root,
    agentWorkspaceRoot: data.workspace,
    entries: new Map([
      [runId, { directory: "baseline", bundleSha256: sha256(bytes), identity }],
    ]),
  });
  return store.load(runId);
}

describe("future study preparation and downstream equivalence", () => {
  it("commits full task/oracle/agent/resource definitions without granting execution or preregistration", () => {
    const draft = futureStudyData();
    expect(validateFutureStudy(draft)).toEqual(draft);
    const report = assessFutureStudy({ draft });
    expect(report).toMatchObject({
      comparability: "BLOCKED",
      execution: "DISABLED",
      correctness: "INCONCLUSIVE",
      oracleProvisioning: "BLOCKED",
      behavioralOracleExecution: "NOT_RUN",
      evidenceOrigin: "none",
    });
    expect(report.blockers).toContain(
      "B_PREPARATION_RECORD_MISSING_OR_UNAUTHENTICATED",
    );
    expect(report.arms[1]!.total.costUsd).toBeNull();
    expect(JSON.stringify(report)).not.toContain(draft.task.specification);
  });
  it.each(["agentId", "modelId"] as const)("rejects unequal %s", (field) => {
    const draft = futureStudyData();
    draft.executionConditions[1]![field] = "other";
    expect(() => validateFutureStudy(draft)).toThrow("Unequal");
  });
  it.each(["cpus", "memoryMiB", "pids", "diskMiB", "outputBytes"] as const)(
    "rejects unequal resource %s",
    (field) => {
      const draft = futureStudyData();
      draft.executionConditions[1]!.resources[field]++;
      expect(() => validateFutureStudy(draft)).toThrow("Unequal");
    },
  );
  it.each([
    "originalCommit",
    "originalTreeSha256",
    "dependencyLockSha256",
    "visibleRoadmapSha256",
    "promptTemplateSha256",
    "runtimeSha256",
    "networkPolicySha256",
    "credentialPolicySha256",
  ] as const)("retains shared-plan rejection for unequal %s", (field) => {
    const draft = futureStudyData();
    draft.plan.conditions[1]![field] =
      field === "originalCommit" ? "0".repeat(40) : hash("0");
    expect(() => validateFutureStudy(draft)).toThrow();
  });
  it("rejects unequal downstream instructions even when the old scenario commitment is recomputed", () => {
    const draft = futureStudyData();
    draft.plan.scenario.request += " Give B extra instructions.";
    draft.plan.taskSha256 = frozenTaskDigest(draft.plan);
    draft.plan.conditions.forEach((arm) => {
      arm.taskSha256 = draft.plan.taskSha256;
    });
    expect(() => validateFutureStudy(draft)).toThrow("Downstream task");
  });
  it("rejects task, evaluator, policy, budget and retry substitution", () => {
    const changes = [
      (d: ReturnType<typeof futureStudyData>) => {
        d.task.specification += " Changed";
      },
      (d: ReturnType<typeof futureStudyData>) => {
        d.plan.baselineOracle.evaluatorSha256 = hash("0");
      },
      (d: ReturnType<typeof futureStudyData>) => {
        d.plan.futureOracle.testSuiteSha256 = hash("0");
      },
      (d: ReturnType<typeof futureStudyData>) => {
        d.plan.futureOracle.requiredCheckIds.pop();
      },
      (d: ReturnType<typeof futureStudyData>) => {
        d.plan.conditions[1]!.budget = {
          ...d.plan.conditions[1]!.budget,
          maxSeconds: 301,
        };
      },
      (d: ReturnType<typeof futureStudyData>) => {
        Object.assign(d.plan.trialPolicy, { attemptsPerArm: 2 });
      },
    ];
    for (const change of changes) {
      const draft = futureStudyData();
      change(draft);
      expect(() => validateFutureStudy(draft)).toThrow();
    }
  });
  it("rejects selection preceding freeze; timestamps alone never establish independent authority", () => {
    const draft = futureStudyData();
    draft.proposedChronology.architectureSelectionAt =
      draft.proposedChronology.independentFreezeAt;
    expect(() => validateFutureStudy(draft)).toThrow("chronology");
  });
  it("separates pre-selection protocol from later prepared-source commitment and detects post-commit changes", () => {
    const draft = futureStudyData();
    const expected = {
      protocolSha256: futureProtocolCommitment(draft),
      draftSha256: jsonDigest(draft),
    };
    expect(requireFutureStudyCommitments(draft, expected)).toEqual(draft);
    draft.plan.manifest.arms[1]!.initialTreeSha256 = hash("0");
    draft.plan.manifest.arms[1]!.upfrontMetrics.costUsd = 0.1;
    expect(futureProtocolCommitment(draft)).toBe(expected.protocolSha256);
    expect(() => requireFutureStudyCommitments(draft, expected)).toThrow(
      "changed after commitment",
    );
    draft.executionConditions.forEach((item) => {
      item.resources.memoryMiB = 1024;
    });
    expect(futureProtocolCommitment(draft)).not.toBe(expected.protocolSha256);
  });
});

describe("operator-held preparation record custody and accounting", () => {
  it("accepts exact pinned immutable bytes but rejects serialized copies and does not authenticate review references", async () => {
    const data = await fixture();
    const loaded = await data.load();
    expect(Object.isFrozen(loaded?.record.metrics)).toBe(true);
    const report = assessFutureStudy({
      draft: data.draft,
      preparation: loaded,
    });
    expect(report.deviations).toEqual([]);
    expect(report.blockers).toContain(
      "B_PREPARATION_REVIEW_AND_TELEMETRY_NOT_INDEPENDENTLY_AUTHENTICATED",
    );
    expect(report.arms[1]!.preparation.costUsd).toBeNull();
    expect(
      assessFutureStudy({
        draft: data.draft,
        preparation: JSON.parse(JSON.stringify(loaded)),
      }).blockers,
    ).toContain("B_PREPARATION_RECORD_MISSING_OR_UNAUTHENTICATED");
  });
  it.each(["original", "prepared", "lock", "task", "study", "metrics", "pin"])(
    "detects substituted preparation %s",
    async (field) => {
      const data = await fixture();
      if (field === "original") data.record.original.treeSha256 = hash("0");
      if (field === "prepared")
        data.record.prepared.treeSha256 = data.record.original.treeSha256;
      if (field === "lock")
        data.record.prepared.dependencyLockSha256 = hash("0");
      if (field === "task") data.record.taskDefinitionSha256 = hash("0");
      if (field === "study") data.record.studyId = "other-study";
      if (field === "metrics")
        data.record.metrics = { ...data.record.metrics, costUsd: 0 };
      const loaded = await data.load();
      if (field === "pin") data.draft.preparationRecordSha256 = hash("0");
      expect(
        assessFutureStudy({ draft: data.draft, preparation: loaded })
          .deviations,
      ).toContain("B_PREPARATION_BINDING_MISMATCH");
    },
  );
  it("retains rejected present-day results and refuses verification before preparation ends", async () => {
    const data = await fixture();
    const preparation = await data.load();
    const rejected = await baseline(data, "fail");
    expect(
      assessFutureStudy({
        draft: data.draft,
        preparation,
        baselines: new Map([["B", rejected]]),
      }).deviations,
    ).toContain("B_PRESENT_DAY_FUNCTIONALITY_REJECTED");
    const early = await baseline(data, "pass", "2026-10-28T12:02:30.000Z");
    expect(
      assessFutureStudy({
        draft: data.draft,
        preparation,
        baselines: new Map([["B", early]]),
      }).deviations,
    ).toContain("B_BASELINE_PRECEDES_PREPARATION");
  });
  it("detects preparation before selection and backwards time", async () => {
    const data = await fixture();
    data.record.startedAt = "2026-10-28T12:00:00.000Z";
    expect(
      assessFutureStudy({ draft: data.draft, preparation: await data.load() })
        .deviations,
    ).toContain("B_PREPARATION_CHRONOLOGY_INVALID");
    data.record.startedAt = "2026-10-28T12:04:00.000Z";
    expect(
      assessFutureStudy({ draft: data.draft, preparation: await data.load() })
        .deviations,
    ).toContain("B_PREPARATION_CHRONOLOGY_INVALID");
  });
  it.each([
    "wrong-hash",
    "changed-bytes",
    "symlink",
    "public-mode",
    "overlap",
    "missing-roots",
  ])("refuses unsafe preparation custody: %s", async (defect) => {
    const data = await fixture();
    await data.load();
    let filename = data.filename;
    let expectedSha256 = data.draft.preparationRecordSha256!;
    let agentWorkspaceRoots = [data.workspace];
    if (defect === "wrong-hash") expectedSha256 = hash("0");
    if (defect === "changed-bytes") await writeFile(filename, "{}");
    if (defect === "symlink") {
      filename = path.join(data.root, "alias.json");
      await symlink(data.filename, filename);
    }
    if (defect === "public-mode") await chmod(data.root, 0o755);
    if (defect === "overlap") agentWorkspaceRoots = [data.root];
    if (defect === "missing-roots") agentWorkspaceRoots = [];
    expect(
      await loadPreparationRecord({
        filename,
        expectedSha256,
        agentWorkspaceRoots,
      }),
    ).toBeNull();
  });
  it("CLI validates a private draft with a blocked disposition and refuses execution switches", async () => {
    const data = await fixture();
    const filename = path.join(data.root, "draft.json");
    await writeFile(filename, JSON.stringify(data.draft), { mode: 0o600 });
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(await tournamentCli(["--future-draft", filename])).toBe(2);
    expect(JSON.parse(stdout.mock.calls[0]![0] as string)).toMatchObject({
      execution: "DISABLED",
      oracleProvisioning: "BLOCKED",
    });
    expect(stdout.mock.calls.flat().join("")).not.toContain("PROPOSED TASK");
    expect(await tournamentCli(["--future-draft", filename, "--execute"])).toBe(
      1,
    );
  });
});
