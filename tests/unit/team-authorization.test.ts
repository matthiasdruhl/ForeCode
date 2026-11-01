import { afterEach, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  TeamAuthorizationInstrumentationSchema,
  authorizationInstrumentationDigest,
  createTeamAuthorizationCollector,
  readTeamAuthorizationJournal,
  retainTeamAuthorizationCheckpoint,
  type TeamAuthorizationCheckpoint,
} from "../../scripts/evaluator/booking-v1/team-authorization";
import { collectProtectedAuthorizationOriginal } from "../../scripts/evaluator/booking-v1/metric-authorization-collector";
import { teamOnlyCheckIds } from "../../scripts/evaluator/booking-v1/grade-profile";
import { teamGradeData } from "../support/team-grade-data";
import { syntheticEvaluation } from "../support/tournament-evidence";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function temporary() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "forecode-authorization-synthetic-")),
  );
  roots.push(root);
  return root;
}
const descriptor = () => ({
  schemaVersion: "booking-team-authorization-instrumentation.v1" as const,
  semanticsSha256: "a".repeat(64),
  cases: teamOnlyCheckIds.map((checkId, i) => ({
    caseId: "synthetic-case-" + i,
    checkId,
  })),
});
function collector(checkId: string = teamOnlyCheckIds[0]) {
  const checkpoints: TeamAuthorizationCheckpoint[] = [];
  const value = createTeamAuthorizationCollector({
    instrumentation: descriptor(),
    identity: teamGradeData().identity,
    checkId,
    retain: (v) => checkpoints.push(structuredClone(v)),
  });
  return { ...value, checkpoints };
}
describe("protected per-case channel — synthetic assertions only, no guest/private suite", () => {
  it("records actual assertions, preserves original failures and retains unrun cases", async () => {
    const c = collector();
    const error = new assert.AssertionError({
      message: "SYNTHETIC EXPECTATION MUST NOT BE RETAINED",
      actual: "private-value",
      expected: "other",
    });
    await expect(
      c.observeCase("synthetic-case-0", () => {
        throw error;
      }),
    ).rejects.toBe(error);
    c.finish("fail");
    expect(c.checkpoints.at(-1)).toMatchObject({
      complete: true,
      finalized: true,
      groupOutcome: "fail",
      cases: [{ caseId: "synthetic-case-0", outcome: "fail" }],
    });
    expect(c.checkpoints[1]!.cases[0]!.outcome).toBe("invalid");
    expect(JSON.stringify(c.checkpoints)).not.toContain("EXPECTATION");
    expect(JSON.stringify(c.checkpoints)).not.toContain("private-value");
    expect(JSON.stringify(c.checkpoints)).not.toContain("stack");
  });
  it("keeps a runtime error invalid and a never invoked case not_run", async () => {
    const runtime = collector(),
      notRun = collector();
    const error = new Error("synthetic runtime");
    await expect(
      runtime.observeCase("synthetic-case-0", () => {
        throw error;
      }),
    ).rejects.toBe(error);
    runtime.finish("error");
    notRun.finish("pass");
    expect(runtime.checkpoints.at(-1)).toMatchObject({
      complete: false,
      cases: [{ outcome: "invalid" }],
    });
    expect(notRun.checkpoints.at(-1)).toMatchObject({
      complete: false,
      cases: [{ outcome: "not_run" }],
    });
  });
  it.each(["unknown", "duplicate"] as const)(
    "latches %s case misuse before executing assertions",
    async (defect) => {
      const c = collector(),
        run = vi.fn();
      if (defect === "duplicate")
        await c.observeCase("synthetic-case-0", () => {});
      await expect(
        c.observeCase(
          defect === "duplicate" ? "synthetic-case-0" : "unexpected",
          run,
        ),
      ).rejects.toThrow();
      await expect(c.observeCase("synthetic-case-0", run)).rejects.toThrow();
      c.finish("pass");
      expect(run).not.toHaveBeenCalled();
      expect(c.checkpoints.at(-1)!.complete).toBe(false);
    },
  );
  it("rejects late callbacks, double finalization and unawaited in-flight work", async () => {
    const c = collector();
    let release!: () => void;
    const pending = c.observeCase(
      "synthetic-case-0",
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    c.finish("pass");
    expect(c.checkpoints.at(-1)!.complete).toBe(false);
    release();
    await expect(pending).rejects.toThrow("interval ended");
    const run = vi.fn();
    await expect(c.observeCase("synthetic-case-0", run)).rejects.toThrow(
      "finalized",
    );
    expect(() => c.finish("pass")).toThrow("finalized");
    expect(run).not.toHaveBeenCalled();
  });
  it.each(
    ["initial", "start", "end", "final"].flatMap((stage, ordinal) =>
      ["pass", "assertion", "runtime"].flatMap((result) =>
        [false, true].map((persistBeforeFailure) => ({
          stage,
          ordinal,
          result,
          persistBeforeFailure,
        })),
      ),
    ),
  )(
    "preserves $result with $stage retention failure (persisted=$persistBeforeFailure)",
    async ({ ordinal, result, persistBeforeFailure }) => {
      const root = path.join(await temporary(), "storage-failure");
      const identity = teamGradeData().identity;
      const actual =
        result === "assertion"
          ? new assert.AssertionError({
              message: "synthetic original assertion",
            })
          : new TypeError("synthetic original runtime error");
      let calls = 0;
      const c = createTeamAuthorizationCollector({
        instrumentation: descriptor(),
        identity,
        checkId: teamOnlyCheckIds[0],
        retain: (checkpoint) => {
          const failing = calls++ === ordinal;
          if (failing && !persistBeforeFailure) throw Error("synthetic IO");
          retainTeamAuthorizationCheckpoint(root, checkpoint);
          if (failing) throw Error("synthetic post-write IO");
        },
      });
      const run = vi.fn(() => {
        if (result !== "pass") throw actual;
      });
      if (result === "pass")
        await expect(
          c.observeCase("synthetic-case-0", run),
        ).resolves.toBeUndefined();
      else
        await expect(c.observeCase("synthetic-case-0", run)).rejects.toBe(
          actual,
        );
      expect(() =>
        c.finish(
          result === "assertion"
            ? "fail"
            : result === "runtime"
              ? "error"
              : "pass",
        ),
      ).not.toThrow();
      expect(run).toHaveBeenCalledOnce();
      expect(c.retentionAvailable()).toBe(false);
      // Missing ordinals or post-final invalidations cannot export a completion.
      expect(() =>
        readTeamAuthorizationJournal(
          root,
          identity,
          authorizationInstrumentationDigest(descriptor()),
        ),
      ).toThrow();
    },
  );
  it("signals unavailable when final persists but all subsequent invalidation writes fail", async () => {
    const retained: TeamAuthorizationCheckpoint[] = [];
    let failed = false;
    const c = createTeamAuthorizationCollector({
      instrumentation: descriptor(),
      identity: teamGradeData().identity,
      checkId: teamOnlyCheckIds[0],
      retain: (checkpoint) => {
        if (failed) throw Error("synthetic permanent IO loss");
        retained.push(structuredClone(checkpoint));
        if (checkpoint.finalized) {
          failed = true;
          throw Error("synthetic final fsync");
        }
      },
    });
    await c.observeCase("synthetic-case-0", () => {});
    expect(() => c.finish("pass")).not.toThrow();
    expect(retained.at(-1)).toMatchObject({ finalized: true, complete: true });
    // This trusted negative signal is required even if persisted bytes look final.
    expect(c.retentionAvailable()).toBe(false);
  });
  it("runs later distinct cases after persistent storage loss without inventing availability", async () => {
    const d = descriptor();
    d.cases.push({
      caseId: "synthetic-case-next",
      checkId: teamOnlyCheckIds[0],
    });
    const c = createTeamAuthorizationCollector({
      instrumentation: d,
      identity: teamGradeData().identity,
      checkId: teamOnlyCheckIds[0],
      retain: () => {
        throw Error("synthetic IO");
      },
    });
    const run = vi.fn();
    await c.observeCase("synthetic-case-0", run);
    await c.observeCase("synthetic-case-next", run);
    expect(() => c.finish("pass")).not.toThrow();
    expect(run).toHaveBeenCalledTimes(2);
    expect(c.retentionAvailable()).toBe(false);
  });
  it("does not promote a case failure under a passing group", async () => {
    const c = collector();
    await expect(
      c.observeCase("synthetic-case-0", () => assert.fail("synthetic")),
    ).rejects.toThrow();
    c.finish("pass");
    expect(c.checkpoints.at(-1)!.complete).toBe(false);
  });
  it("validates fixed group/case inventory and stable descriptor digest", () => {
    const d = descriptor();
    expect(authorizationInstrumentationDigest(d)).toBe(
      authorizationInstrumentationDigest({
        ...d,
        cases: [...d.cases].reverse(),
      }),
    );
    expect(() =>
      TeamAuthorizationInstrumentationSchema.parse({
        ...d,
        cases: [d.cases[0], d.cases[0]],
      }),
    ).toThrow();
    expect(() =>
      TeamAuthorizationInstrumentationSchema.parse({
        ...d,
        cases: [{ caseId: "../escape", checkId: teamOnlyCheckIds[0] }],
      }),
    ).toThrow();
    expect(() =>
      TeamAuthorizationInstrumentationSchema.parse({
        ...d,
        extra: "arbitrary",
      }),
    ).toThrow();
    expect(() => collector("build")).toThrow();
  });
});

async function journal() {
  const root = path.join(await temporary(), "journal"),
    identity = teamGradeData().identity;
  const groups: TeamAuthorizationCheckpoint[] = [];
  for (const checkId of teamOnlyCheckIds) {
    const c = createTeamAuthorizationCollector({
      instrumentation: descriptor(),
      identity,
      checkId,
      retain: (v) => {
        retainTeamAuthorizationCheckpoint(root, v);
        if (v.finalized) groups.push(v);
      },
    });
    await c.observeCase(
      descriptor().cases.find((x) => x.checkId === checkId)!.caseId,
      () => {},
    );
    c.finish("pass");
  }
  return {
    root,
    identity,
    groups,
    read: () =>
      readTeamAuthorizationJournal(
        root,
        identity,
        authorizationInstrumentationDigest(descriptor()),
      ),
  };
}
describe("immutable private case journal — synthetic files only", () => {
  it("exports exact finalized groups with original history digest and refuses overwrite", async () => {
    const f = await journal(),
      data = f.read();
    expect(data.groups).toHaveLength(3);
    expect(data.groups.every((g) => g.complete)).toBe(true);
    expect(data.journalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      retainTeamAuthorizationCheckpoint(f.root, f.groups[0]),
    ).toThrow();
    expect(f.read()).toEqual(data);
  });
  it.each([
    "writable",
    "symlink",
    "hardlink",
    "identity",
    "gap",
    "after-final",
    "missing",
    "extra",
  ] as const)("rejects %s journal custody/state", async (defect) => {
    const f = await journal(),
      dir = path.join(f.root, f.identity.runId),
      file = path.join(dir, `${teamOnlyCheckIds[0]}-000.json`),
      bytes = await readFile(file);
    if (defect === "writable") await chmod(file, 0o600);
    if (defect === "symlink") {
      await rm(file);
      await symlink(path.join(dir, `${teamOnlyCheckIds[0]}-001.json`), file);
    }
    if (defect === "hardlink")
      await link(file, path.join(path.dirname(f.root), "alias"));
    if (defect === "identity") {
      await chmod(file, 0o600);
      const v = JSON.parse(bytes.toString());
      v.identity.evaluatedTreeSha256 = "0".repeat(64);
      await writeFile(file, JSON.stringify(v));
      await chmod(file, 0o400);
    }
    if (defect === "gap") await rm(file);
    if (defect === "after-final") {
      const final = f.groups[0]!;
      retainTeamAuthorizationCheckpoint(f.root, {
        ...final,
        ordinal: final.ordinal + 1,
      });
    }
    if (defect === "missing")
      await rm(path.join(dir, `${teamOnlyCheckIds[0]}-003.json`));
    if (defect === "extra")
      await writeFile(path.join(dir, "arbitrary.json"), "{}", { mode: 0o400 });
    expect(f.read).toThrow();
  });
});

async function assembly(fail = false, telemetryFailed = false) {
  const root = await temporary(),
    evaluationRoot = path.join(root, "evaluations"),
    workspace = path.join(root, "worker");
  await mkdir(evaluationRoot, { mode: 0o700 });
  await mkdir(workspace, { mode: 0o700 });
  const d = teamGradeData();
  const evaluation = (
    await syntheticEvaluation({
      root: evaluationRoot,
      workspace,
      identity: d.request.identity,
      startedAt: "2026-11-01T00:00:00.000Z",
      finishedAt: "2026-11-01T00:01:00.000Z",
      fail: fail ? teamOnlyCheckIds[0] : undefined,
      authorizationTelemetryFailure: telemetryFailed
        ? teamOnlyCheckIds[0]
        : undefined,
    })
  ).loaded!;
  const protocol = {
    schemaVersion: "prospective-tournament-metrics.v1",
    studyId: "synthetic-study",
    hypothesisId: "12345678-1234-4234-8234-123456789012",
    contextSha256: "a".repeat(64),
    taskSha256: d.profile.taskDefinitionSha256,
    matchedConditionsSha256: "b".repeat(64),
    evaluatorSha256: d.identity.evaluatorSha256,
    suiteSha256: d.identity.testSuiteSha256,
    policySha256: d.identity.requiredPolicySha256,
    externalPackages: [],
    stylesheetPaths: [],
    boundaryRules: [{ id: "synthetic-edge", from: "src/a.ts", to: "src/b.ts" }],
    authorizationCaseIds: descriptor().cases.map((c) => c.caseId),
    observationWindow: "prepared_baseline_and_sealed_final_tree",
    duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
    prediction: "B_fewer_final_forbidden_edges_than_A",
  };
  const groups: TeamAuthorizationCheckpoint[] = [];
  for (const [i, checkId] of teamOnlyCheckIds.entries()) {
    const c = createTeamAuthorizationCollector({
      instrumentation: descriptor(),
      identity: d.identity,
      checkId,
      retain: (v) => {
        if (v.finalized) groups.push(v);
      },
    });
    try {
      await c.observeCase("synthetic-case-" + i, () => {
        if (fail && i === 0) assert.fail("synthetic assertion");
      });
    } catch {}
    c.finish(fail && i === 0 ? "fail" : "pass");
  }
  const input = {
    instrumentation: descriptor(),
    evaluation,
    protocol,
    exported: {
      schemaVersion: "booking-team-authorization-export.v1",
      identity: d.identity,
      instrumentationSha256: authorizationInstrumentationDigest(descriptor()),
      journalSha256: "c".repeat(64),
      groups,
    },
  };
  return { input, collect: () => collectProtectedAuthorizationOriginal(input) };
}
describe("receipt-bound case assembly — test-owned synthetic receipts", () => {
  it("rejects authenticated telemetry failure on assembly and shared-reader reread without changing the valid verdict", async () => {
    const valid = await assembly(),
      unavailable = await assembly(false, true);
    const observed = valid.collect();
    const { readProtectedAuthorizationCases } =
      await import("../../scripts/evaluator/booking-v1/metric-authorization");
    expect(unavailable.input.evaluation.verification.verdict).toBe("VERIFIED");
    expect(() => unavailable.collect()).toThrow("telemetry unavailable");
    expect(() =>
      readProtectedAuthorizationCases(
        observed,
        unavailable.input.protocol as Parameters<
          typeof readProtectedAuthorizationCases
        >[1],
        unavailable.input.evaluation,
      ),
    ).toThrow("telemetry unavailable");
  });
  it("accepts the separate v2 protocol only for the unchanged final future-suite channel", async () => {
    const f = await assembly();
    const observed = collectProtectedAuthorizationOriginal({
      ...f.input,
      protocol: {
        ...f.input.protocol,
        schemaVersion: "prospective-tournament-metrics.v2",
        baselineAuthorization: "not_applicable_before_future_requirement",
      },
    });
    expect(observed.cases.map((c) => c.outcome)).toEqual([
      "pass",
      "pass",
      "pass",
    ]);
    expect(observed.identity.requiredCheckIds).toHaveLength(8);
  });
  it.each([false, true])(
    "assembles actual synthetic assertion outcomes (failure=%s) without changing the receipt",
    async (fail) => {
      const f = await assembly(fail),
        before = JSON.stringify(f.input.evaluation),
        observed = f.collect();
      expect(observed.cases.map((c) => c.outcome)).toEqual([
        fail ? "fail" : "pass",
        "pass",
        "pass",
      ]);
      expect(JSON.stringify(f.input.evaluation)).toBe(before);
    },
  );
  it.each([
    "clone-receipt",
    "wrong-run",
    "wrong-tree",
    "wrong-descriptor",
    "wrong-registration",
    "group-mismatch",
    "missing-case",
    "duplicate-case",
    "invalid-case",
    "missing-group",
    "not-finalized",
    "incomplete",
  ] as const)("rejects %s", async (defect) => {
    const f = await assembly(),
      data = f.input.exported;
    if (defect === "clone-receipt")
      f.input.evaluation = structuredClone(f.input.evaluation);
    if (defect === "wrong-run")
      data.identity.runId = "22222222-2222-4222-8222-222222222222";
    if (defect === "wrong-tree")
      data.identity.evaluatedTreeSha256 = "0".repeat(64);
    if (defect === "wrong-descriptor")
      data.instrumentationSha256 = "0".repeat(64);
    if (defect === "wrong-registration")
      f.input.protocol.authorizationCaseIds = ["unexpected"];
    if (defect === "group-mismatch") data.groups[0]!.groupOutcome = "fail";
    if (defect === "missing-case") data.groups[0]!.cases = [];
    if (defect === "duplicate-case")
      data.groups[0]!.cases.push(data.groups[0]!.cases[0]!);
    if (defect === "invalid-case")
      data.groups[0]!.cases[0]!.outcome = "invalid";
    if (defect === "missing-group") data.groups[0] = data.groups[1]!;
    if (defect === "not-finalized") data.groups[0]!.finalized = false;
    if (defect === "incomplete") data.groups[0]!.complete = false;
    expect(f.collect).toThrow();
  });
});
