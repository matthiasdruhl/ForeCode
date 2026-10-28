// Inert synthetic adapter/configuration shared by offline producer tests only.
import { vi } from "vitest";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OfflineConfigSchema } from "../../scripts/experiments/isolation/offline-config";
import type { OfflineAdapter } from "../../scripts/experiments/runner/offline-sbx";
import type { GradeReport } from "../../scripts/experiments/runner/protocol";
import { syntheticLifecycleReport } from "./synthetic-lifecycle";
const hash = "a".repeat(64);
export async function syntheticOfflineFixture(temporary: string[]) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-offline-synthetic-")),
  );
  temporary.push(root);
  for (const dir of ["coordination", "protected", "scratch"])
    await mkdir(path.join(root, dir), { mode: 0o700 });
  const config = OfflineConfigSchema.parse({
    schemaVersion: "booking-offline-operator.v1",
    scope: "fixed-booking-grader-acceptance-no-inference",
    enabled: false,
    sbx: "/opt/homebrew/bin/sbx",
    sbxSha256: hash,
    graderSandbox: "forecode-grader",
    graderImage: `sha256:${hash}`,
    workerImage: `sha256:${hash}`,
    graderNodeSha256: hash,
    graderLockSha256: hash,
    graderModulesSha256: hash,
    coordinationRoot: path.join(root, "coordination"),
    protectedRoot: path.join(root, "protected"),
    scratchRoot: path.join(root, "scratch"),
    reviewFile: path.join(root, "review.json"),
    reviewSha256: hash,
    maxSeconds: 60,
    maxOutputBytes: 65536,
    vmDiskBytes: 1024 ** 3,
    vmPids: 256,
  });
  return { root, config };
}
export function syntheticOfflineAdapter(mode = "normal"): OfflineAdapter {
  return {
    kind: "synthetic-development",
    observations: () => [],
    admit: vi.fn(async () => ({ synthetic: true })),
    probe: vi.fn<OfflineAdapter["probe"]>(async (input) => ({
      exitCode: 0,
      reason: "completed",
      signal: null,
      stdout: JSON.stringify(syntheticLifecycleReport(input)),
      stderr: "",
      elapsedMs: 1,
    })),
    grade: vi.fn<OfflineAdapter["grade"]>(async (input) => {
      // Inspect inert source bytes only. This adapter does not prove guest grading.
      const service = Buffer.from(
        input.candidate.files.find(
          (f) => f.path === "src/server/booking-service.ts",
        )!.base64,
        "base64",
      ).toString();
      const regression = !service.includes(
        "if (!row || row.ownerId !== viewerId)",
      );
      const report: GradeReport = {
        schemaVersion: "booking-grade-observation.v1",
        runId: input.runId,
        evaluatedTreeSha256: input.evaluatedTreeSha256,
        evaluatorSha256: input.evaluatorSha256,
        testSuiteSha256: input.testSuiteSha256,
        requiredPolicySha256: input.requiredPolicySha256,
        checks: [
          "typecheck",
          "build",
          "baseline-domain",
          "http-integration",
          "boundary",
        ].map((id) => ({
          id: id as GradeReport["checks"][number]["id"],
          status: regression && id === "baseline-domain" ? "fail" : "pass",
          exitCode: regression && id === "baseline-domain" ? 1 : 0,
          detail: "SYNTHETIC observation only",
        })),
      };
      if (mode === "missing")
        report.checks = report.checks.filter((c) => c.id !== "build");
      if (mode === "wrong") report.evaluatedTreeSha256 = hash;
      if (mode === "forged") report.checks[0]!.exitCode = 3;
      return {
        exitCode: 0,
        reason:
          mode === "timeout"
            ? "timed_out"
            : mode === "cancel"
              ? "cancelled"
              : "completed",
        signal: null,
        stdout: JSON.stringify(report),
        stderr: "",
        elapsedMs: 1,
      };
    }),
    cleanup: vi.fn(async (runIds) => {
      if (mode === "cleanup") throw new Error("synthetic cleanup failure");
      return {
        touched: true,
        restartChecked: true,
        absentRunIds: [...runIds],
        observations: [],
      };
    }),
  };
}
