import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { publishEvaluation } from "../../scripts/experiments/artifacts/publish";
import {
  createProtectedEvaluationStore,
  hasAuthorizationTelemetryFailure,
  isTrustedEvaluation,
} from "@/server/artifacts/evaluation-store";
import {
  futureEvaluationVerdict,
  validateTeamGradeObservation,
} from "../../scripts/evaluator/booking-v1/future";
import { teamGradeData } from "../support/team-grade-data";
import { withOptionalAuthorizationExport } from "../../scripts/experiments/tournament/optional-authorization-export";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture(
  mode: "pass" | "fail" | "missing" | "incomplete" | "fail-missing",
) {
  const data = teamGradeData();
  if (mode === "missing" || mode === "fail-missing") data.report.checks.pop();
  if (mode === "fail" || mode === "fail-missing") {
    data.report.checks[5]!.status = "fail";
    data.report.checks[5]!.exitCode = 1;
  }
  if (mode === "incomplete") {
    data.report.checks[6]!.status = "error";
    data.report.checks[6]!.exitCode = null;
  }
  const report = validateTeamGradeObservation(
    data.report,
    data.input,
    data.request,
  );
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-team-publication-unit-")),
  );
  temporary.push(parent);
  const root = path.join(parent, "protected"),
    workspace = path.join(parent, "task");
  const directory = path.join(root, "record");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir(workspace);
  const entry = await publishEvaluation(
    directory,
    data.request.identity,
    report,
    "2026-10-28T18:00:00.000Z",
    "2026-10-28T18:00:01.000Z",
    {
      evidenceOrigin: "synthetic",
      dependencyLockSha256: data.profile.dependencyLockSha256,
    },
    data.profile,
  );
  const store = await createProtectedEvaluationStore({
    root,
    agentWorkspaceRoot: workspace,
    entries: new Map([[data.request.identity.runId, entry]]),
  });
  const verdict = (evidence: unknown) =>
    futureEvaluationVerdict(data.request, evidence, {
      descriptor: data.descriptor,
      task: data.draft.task,
    });
  return { ...data, root, store, verdict, directory };
}
describe("future observations through the unchanged receipt/store engine; synthetic only", () => {
  it.each(["pass", "fail"] as const)(
    "blocks a potentially complete sidecar after unavailable telemetry while preserving the actual %s grade",
    async (mode) => {
      const data = await fixture(mode);
      data.report.checks[5]!.detail += " Authorization telemetry unavailable.";
      let collected = false;
      let failures = 0;
      const retained = await withOptionalAuthorizationExport(
        { report: data.report, result: JSON.stringify(data.report) },
        async () => {
          collected = true;
          return { complete: true };
        },
        async () => {
          failures++;
        },
        data.report.checks,
      );
      expect(collected).toBe(false);
      expect(failures).toBe(1);
      expect(retained.authorizationExport).toBeUndefined();
      expect(retained.report).toBe(data.report);
      const directory = path.join(data.root, "unavailable-telemetry-grade");
      await mkdir(directory, { mode: 0o700 });
      const entry = await publishEvaluation(
        directory,
        data.request.identity,
        retained.report,
        "2026-10-28T18:00:00.000Z",
        "2026-10-28T18:00:01.000Z",
        { evidenceOrigin: "synthetic" },
        data.profile,
      );
      const store = await createProtectedEvaluationStore({
        root: data.root,
        agentWorkspaceRoot: path.join(path.dirname(data.root), "task"),
        entries: new Map([[data.request.identity.runId, entry]]),
      });
      const loaded = await store.load(data.request.identity.runId);
      expect(isTrustedEvaluation(loaded)).toBe(true);
      expect(hasAuthorizationTelemetryFailure(loaded)).toBe(true);
      expect(loaded?.checks).toHaveLength(8);
      expect(loaded?.checks[5]?.status).toBe(mode);
      expect(data.verdict(loaded)).toBe(
        mode === "pass" ? "VERIFIED" : "REJECTED",
      );
    },
  );
  it.each([false, true])(
    "publishes the complete protected report when sidecar export fails (diagnostics fail: %s)",
    async (diagnosticFails) => {
      const data = await fixture("pass");
      let failures = 0;
      const retained = await withOptionalAuthorizationExport(
        { report: data.report, result: JSON.stringify(data.report) },
        async () => {
          throw new Error("Synthetic supplementary export unavailable.");
        },
        async () => {
          failures++;
          if (diagnosticFails)
            throw new Error("Synthetic diagnostic storage unavailable.");
        },
      );
      expect(retained.report).toBe(data.report);
      expect(retained.authorizationExport).toBeUndefined();
      expect(failures).toBe(1);
      const directory = path.join(data.root, "sidecar-failed-grade");
      await mkdir(directory, { mode: 0o700 });
      const entry = await publishEvaluation(
        directory,
        data.request.identity,
        retained.report,
        "2026-10-28T18:00:00.000Z",
        "2026-10-28T18:00:01.000Z",
        { evidenceOrigin: "synthetic" },
        data.profile,
      );
      const store = await createProtectedEvaluationStore({
        root: data.root,
        agentWorkspaceRoot: path.join(path.dirname(data.root), "task"),
        entries: new Map([[data.request.identity.runId, entry]]),
      });
      const loaded = await store.load(data.request.identity.runId);
      expect(isTrustedEvaluation(loaded)).toBe(true);
      expect(loaded?.checks).toHaveLength(8);
      expect(data.verdict(loaded)).toBe("VERIFIED");
    },
  );
  it("binds task/descriptor/profile/lock pins in the original protected check artifact", async () => {
    const data = await fixture("pass");
    const artifact = JSON.parse(
      await readFile(
        path.join(data.directory, "checks/team-permissions-http.json"),
        "utf8",
      ),
    );
    expect(artifact.runtimePins).toMatchObject({
      taskId: data.profile.taskId,
      taskDefinitionSha256: data.profile.taskDefinitionSha256,
      descriptorSha256: data.profile.descriptorSha256,
      dependencyLockSha256: data.profile.dependencyLockSha256,
    });
  });
  it.each([
    ["pass", "VERIFIED"],
    ["fail", "REJECTED"],
    ["missing", "INSUFFICIENT_EVIDENCE"],
    ["incomplete", "INSUFFICIENT_EVIDENCE"],
    ["fail-missing", "REJECTED"],
  ] as const)("preserves %s evidence as %s", async (mode, expected) => {
    const data = await fixture(mode);
    expect(
      data.verdict(await data.store.load(data.request.identity.runId)),
    ).toBe(expected);
    expect(isTrustedEvaluation(data.report)).toBe(false);
    expect(data.verdict(data.report)).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("rejects modified check evidence and serialized success on fresh reload", async () => {
    const data = await fixture("pass");
    const loaded = await data.store.load(data.request.identity.runId);
    expect(data.verdict(JSON.parse(JSON.stringify(loaded)))).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    await chmod(
      path.join(data.directory, "checks/team-permissions-http.json"),
      0o600,
    );
    await writeFile(
      path.join(data.directory, "checks/team-permissions-http.json"),
      "tampered",
    );
    expect(
      data.verdict(await data.store.load(data.request.identity.runId)),
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("refuses future publication without an explicit trusted profile and rejects cross-run source claims", async () => {
    const data = await fixture("pass");
    await expect(
      publishEvaluation(
        path.join(data.root, "other"),
        data.request.identity,
        data.report,
        "2026-10-28T18:00:00.000Z",
        "2026-10-28T18:00:01.000Z",
        {},
      ),
    ).rejects.toThrow("profile");
    expect(() =>
      validateTeamGradeObservation(data.report, data.input, {
        ...data.request,
        identity: {
          ...data.request.identity,
          runId: "11111111-1111-4111-8111-111111111111",
        },
      }),
    ).toThrow("request mismatch");
  });
});
