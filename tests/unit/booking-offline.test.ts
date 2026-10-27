import { syntheticLifecycleReport } from "../helpers/synthetic-lifecycle";
import { awaitProcessTermination } from "../helpers/process-termination";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import {
  OfflineConfigSchema,
  offlineObligations,
  type OfflineConfig,
} from "../../scripts/experiments/isolation/offline-config";
import {
  admitOffline,
  offlineConfigurationDigest,
  reviewOffline,
} from "../../scripts/experiments/isolation/offline-gate";
import { runOfflineAcceptance } from "../../scripts/experiments/runner/offline-controller";
import {
  createOfflineSbxAdapter,
  verifyInstalledGrader,
  type OfflineAdapter,
} from "../../scripts/experiments/runner/offline-sbx";
import { acceptanceCandidate } from "../../scripts/experiments/runner/offline-scenarios";
import { prepareRuntimeBundle } from "../../scripts/experiments/isolation/bundle";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";
import * as processModule from "../../scripts/experiments/runner/process";
import * as snapshotModule from "../../scripts/evaluator/booking-v1/snapshot";
import * as runtime from "../../scripts/evaluator/booking-v1/runtime.mjs";
import { acquireBookingLease } from "../../scripts/experiments/runner/lease";
import { cleanupOwned } from "../../scripts/evaluator/booking-v1/lifecycle.mjs";
import { createProtectedEvaluationStore } from "@/server/artifacts/evaluation-store";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import type { GradeReport } from "../../scripts/experiments/runner/protocol";

const temporary: string[] = [],
  hash = "a".repeat(64);
async function writable(root: string): Promise<void> {
  await chmod(root, 0o700);
  for (const e of await readdir(root, { withFileTypes: true }))
    if (e.isDirectory()) await writable(path.join(root, e.name));
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0)) {
    await writable(root);
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
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
async function reviewFixture(
  config: OfflineConfig,
  root: string,
  inventory: unknown = { synthetic: true },
) {
  config.acceptanceEnabled = true;
  const observation = path.join(root, "observations.txt");
  const text =
    "SYNTHETIC review binding data only; no real boundary observations or provider budget evidence.";
  await writeFile(observation, text, { mode: 0o600 });
  const review = {
    schemaVersion: "booking-offline-isolation-review.v1",
    scope: config.scope,
    reviewedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    configurationSha256: offlineConfigurationDigest(config),
    implementationSha256: hash,
    inventorySha256: jsonDigest(inventory),
    evidence: offlineObligations.map((obligation) => ({
      obligation,
      path: observation,
      sha256: sha256(text),
      reviewedObservation:
        "Synthetic admission regression data only; no containment claim.",
    })),
  };
  const save = async (value: unknown) => {
    const bytes = JSON.stringify(value);
    await writeFile(config.reviewFile, bytes, { mode: 0o600 });
    config.reviewSha256 = sha256(bytes);
  };
  await save(review);
  return { review, save, observation };
}
function synthetic(mode = "normal"): OfflineAdapter {
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

describe("offline acceptance — SYNTHETIC DEVELOPMENT, no sandbox or inference", () => {
  it("accepts only fixed configuration and rejects paid/agent/source/command capabilities", async () => {
    const { config } = await setup();
    for (const extra of [
      { enabled: true },
      { authorizedModel: "anything" },
      { spendUsd: 1 },
      { command: "true" },
      { source: "/tmp/evil" },
      { agentSandbox: "forecode-experiments" },
    ]) {
      expect(() =>
        OfflineConfigSchema.parse({ ...config, ...extra }),
      ).toThrow();
    }
    const spawn = vi
      .spyOn(processModule, "boundedProcess")
      .mockRejectedValue(new Error("MUST NOT REACH"));
    await expect(
      createOfflineSbxAdapter(config).admit(hash, new AbortController().signal),
    ).rejects.toThrow("disabled");
    expect(spawn).not.toHaveBeenCalled();
  });
  it("offline CLI runtime import closure cannot reach agent/provider transport", async () => {
    const visited = new Set<string>();
    async function visit(file: string): Promise<void> {
      if (visited.has(file)) return;
      visited.add(file);
      expect(file).not.toMatch(
        /(?:runner\/(?:sbx|controller|cli)\.ts|server\/(?:meta|providers?)\/)/,
      );
      const text = await readFile(file, "utf8");
      const unit = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of unit.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          node.importClause?.isTypeOnly
        )
          continue;
        const spec = node.moduleSpecifier.text;
        if (spec.startsWith(".") || spec.startsWith("@/")) {
          const target = spec.startsWith("@/")
            ? path.resolve("src", spec.slice(2))
            : path.resolve(path.dirname(file), spec);
          await visit(/\.[cm]?[jt]s$/.test(target) ? target : `${target}.ts`);
        }
      }
      expect(text).not.toMatch(
        /\/usr\/local\/bin\/codex|codex.*exec|muse.*exec|fetch\(/,
      );
    }
    await visit(path.resolve("scripts/experiments/runner/offline-cli.ts"));
    await visit(path.resolve("scripts/experiments/isolation/toolchain-cli.ts"));
    expect(visited.size).toBeGreaterThan(12);
    const adapter = createOfflineSbxAdapter((await setup()).config);
    expect(Object.keys(adapter).sort()).toEqual([
      "admit",
      "cleanup",
      "grade",
      "kind",
      "observations",
      "probe",
    ]);
  });
  it("requires real scoped evidence without provider-budget fabrication", async () => {
    const { root, config } = await setup();
    config.acceptanceEnabled = true;
    await expect(reviewOffline(config, hash)).rejects.toThrow();
    const { review, save, observation } = await reviewFixture(config, root);
    await expect(
      admitOffline(config, { synthetic: true }, hash),
    ).resolves.toBeDefined();
    expect(
      review.evidence.some((e) => /provider|budget/.test(e.obligation)),
    ).toBe(false);
    await expect(admitOffline(config, { wrong: true }, hash)).rejects.toThrow(
      "inventory",
    );
    await expect(reviewOffline(config, "b".repeat(64))).rejects.toThrow(
      "binding",
    );
    config.vmPids++;
    await expect(reviewOffline(config, hash)).rejects.toThrow("binding");
    config.vmPids--;
    for (const bad of [
      { passed: true },
      { ...review, evidence: review.evidence.slice(1) },
      { ...review, evidence: review.evidence.map(() => review.evidence[0]) },
      { ...review, expiresAt: new Date(0).toISOString() },
      { ...review, reviewedAt: new Date(Date.now() + 99999).toISOString() },
    ]) {
      await save(bad);
      await expect(reviewOffline(config, hash)).rejects.toThrow();
    }
    await save(review);
    config.reviewSha256 = "b".repeat(64);
    await expect(reviewOffline(config, hash)).rejects.toThrow("digest");
    await save(review);
    await writeFile(observation, "tampered");
    await expect(reviewOffline(config, hash)).rejects.toThrow(
      "evidence changed",
    );
  });
  it("rejects installed controller, loader, dependency-tree and image substitutions", async () => {
    const { config } = await setup();
    const files: Record<string, string> = {
      "/opt/forecode-booking/bin/node": hash,
      "/opt/forecode-booking/package-lock.json": hash,
      node_modules: hash,
      runtime_metadata: hash,
      "executable:docker": hash,
      "executable:python3": hash,
      "executable:ldd": hash,
      "native:/lib/reviewed.so": hash,
      "/opt/forecode-booking/package.json": sha256(
        await readFile("scripts/evaluator/booking-v1/toolchain/package.json"),
      ),
    };
    for (const name of controllerFiles)
      files[`/opt/forecode-booking/controller/${name}`] = sha256(
        await readFile(`scripts/evaluator/booking-v1/${name}`),
      );
    const images = [
      { Id: config.workerImage, Os: "linux", Architecture: "arm64" },
    ];
    await expect(
      verifyInstalledGrader(files, images, config),
    ).resolves.toBeDefined();
    for (const name of Object.keys(files).filter(
      (key) =>
        !key.startsWith("executable:") &&
        !key.startsWith("native:") &&
        key !== "runtime_metadata",
    ))
      await expect(
        verifyInstalledGrader(
          { ...files, [name]: "b".repeat(64) },
          images,
          config,
        ),
      ).rejects.toThrow();
    await expect(
      verifyInstalledGrader(
        files,
        [
          {
            Id: `sha256:${"b".repeat(64)}`,
            Os: "linux",
            Architecture: "arm64",
          },
        ],
        config,
      ),
    ).rejects.toThrow("image mismatch");
    for (const badImages of [
      [{ ...images[0], Os: "darwin" }],
      [{ ...images[0], Architecture: "unknown" }],
      [...images, ...images],
    ])
      await expect(
        verifyInstalledGrader(files, badImages, config),
      ).rejects.toThrow("image mismatch");
    for (const key of [
      "runtime_metadata",
      "executable:docker",
      "executable:python3",
      "executable:ldd",
    ])
      await expect(
        verifyInstalledGrader({ ...files, [key]: "" }, images, config),
      ).rejects.toThrow("inventory missing");
    await expect(
      verifyInstalledGrader(
        Object.fromEntries(
          Object.entries(files).filter(([key]) => !key.startsWith("native:")),
        ),
        images,
        config,
      ),
    ).rejects.toThrow("native loader inventory missing");
  });
  it("rejects incomplete installed custody inventory", async () => {
    const { config } = await setup();
    await expect(verifyInstalledGrader({}, [], config)).rejects.toThrow(
      "custody/executable inventory missing",
    );
  });
  it("withholds probes and cleanup if the lease changes during admission", async () => {
    const { config } = await setup(),
      adapter = synthetic();
    adapter.admit = async () => {
      await writeFile(
        path.join(config.coordinationRoot, ".booking-run.lock/owner.json"),
        "another owner",
      );
      return { synthetic: true };
    };
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("failed");
    expect(record.entries).toEqual([]);
    expect(adapter.probe).not.toHaveBeenCalled();
    expect(adapter.cleanup).not.toHaveBeenCalled();
  });
  it("runs probe-only mode without candidate capture, grading or receipts", async () => {
    const { config } = await setup(),
      adapter = synthetic();
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
      "lifecycle-only",
    );
    expect(record.status).toBe("completed");
    expect(record.mode).toBe("lifecycle-only");
    expect(record.entries).toEqual([]);
    expect(record.verdicts).toEqual([]);
    expect(record.lifecycle?.cases).toHaveLength(8);
    expect(adapter.grade).not.toHaveBeenCalled();
    expect(await readdir(config.protectedRoot)).toEqual([record.acceptanceId]);
    expect(record.limits.lifecycleWorkerSeconds).toBe(30);
  });
  it.each([
    "missing",
    "stale",
    "cleanup-unconfirmed",
    "timeout",
    "output-limit",
  ])("rejects lifecycle %s before booking grading", async (mode) => {
    const { config } = await setup(),
      adapter = synthetic();
    adapter.probe = async (input) => {
      const report = syntheticLifecycleReport(input);
      if (mode === "missing") report.cases.pop();
      if (mode === "stale") report.requestSha256 = hash;
      if (mode === "cleanup-unconfirmed") report.cleanupConfirmed = false;
      return {
        reason:
          mode === "timeout"
            ? "timed_out"
            : mode === "output-limit"
              ? "output_limit"
              : "completed",
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify(report),
        stderr: "SYNTHETIC probe diagnostic",
        elapsedMs: 1,
      };
    };
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("failed");
    expect(record.entries).toEqual([]);
    expect(adapter.grade).not.toHaveBeenCalled();
    expect(adapter.cleanup).toHaveBeenCalled();
    expect(await readdir(config.coordinationRoot)).toContain(
      ".booking-run.lock",
    );
    expect(
      await readFile(
        path.join(
          config.protectedRoot,
          record.acceptanceId,
          "lifecycle-stderr.txt",
        ),
        "utf8",
      ),
    ).toBe("SYNTHETIC probe diagnostic");
  });
  it("forbids receipt publication without stop/restart absence evidence", async () => {
    const { config } = await setup(),
      adapter = synthetic();
    adapter.cleanup = vi.fn(async () => ({
      touched: true,
      restartChecked: true,
      absentRunIds: [],
      observations: [],
    }));
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.entries).toEqual([]);
    expect(record.status).toBe("failed");
    expect(await readdir(config.coordinationRoot)).toContain(
      ".booking-run.lock",
    );
  });
  it("routes baseline and distinct final data through publication, loading and verdict normalization", async () => {
    const { config } = await setup(),
      adapter = synthetic();
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("completed");
    expect(record.verdicts.map((v) => v.verdict)).toEqual([
      "VERIFIED",
      "VERIFIED",
      "REJECTED",
      "REJECTED",
    ]);
    const trees = record.entries.map((e) => e.identity.evaluatedTreeSha256);
    expect(new Set(trees).size).toBe(4);
    expect(record.inference).toBe("NOT_RUN");
    expect(record.realAgentExecution).toBe("NOT_RUN");
    expect(record.metrics).toEqual({
      tokens: null,
      costUsd: null,
      iterations: null,
    });
    expect(record.limitations.join()).toContain("SYNTHETIC");
    const first = record.entries[0]!;
    const store = await createProtectedEvaluationStore({
      root: config.protectedRoot,
      agentWorkspaceRoot: config.scratchRoot,
      entries: new Map([[first.identity.runId, first]]),
    });
    const file = path.join(
      config.protectedRoot,
      first.directory,
      "checks/baseline-domain.json",
    );
    await chmod(file, 0o600);
    await writeFile(file, '{"status":"PASS"}');
    expect(await store.load(first.identity.runId)).toBeNull();
  });
  it.each(["wrong", "forged", "missing", "timeout", "cancel", "cleanup"])(
    "retains %s failure without claiming acceptance",
    async (mode) => {
      const { config } = await setup(),
        adapter = synthetic(mode);
      const result = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(result.status).toBe("failed");
      expect(result.failure).toBeTruthy();
      expect(adapter.cleanup).toHaveBeenCalled();
      if (mode === "missing")
        expect(result.verdicts[0]?.verdict).toBe("INSUFFICIENT_EVIDENCE");
      else expect(result.entries).toEqual([]);
      if (["timeout", "cancel", "cleanup"].includes(mode)) {
        expect(await readdir(config.coordinationRoot)).toContain(
          ".booking-run.lock",
        );
        await expect(
          runOfflineAcceptance(
            config,
            synthetic(),
            new AbortController().signal,
          ),
        ).rejects.toThrow();
      }
    },
  );
  it.each(["spawn_error", "module-resolution", "native-abi"])(
    "withholds publication after observed %s worker startup failure (SYNTHETIC)",
    async (kind) => {
      const { config } = await setup(),
        adapter = synthetic();
      adapter.grade = async () => ({
        reason: kind === "spawn_error" ? "spawn_error" : "completed",
        exitCode: kind === "spawn_error" ? null : 1,
        signal: null,
        stdout: "",
        stderr:
          kind === "module-resolution"
            ? "SYNTHETIC ERR_MODULE_NOT_FOUND"
            : "SYNTHETIC incompatible native loader",
        elapsedMs: 1,
      });
      const result = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(result.status).toBe("failed");
      expect(result.entries).toEqual([]);
      expect(result.observations.at(-1)).toMatchObject({
        exitCode: kind === "spawn_error" ? null : 1,
      });
      expect(await readdir(config.coordinationRoot)).toContain(
        ".booking-run.lock",
      );
    },
  );
  it("refuses publication if inert candidate bytes change during grading", async () => {
    const { config } = await setup(),
      adapter = synthetic(),
      grade = adapter.grade;
    adapter.grade = async (input, signal) => {
      const result = await grade(input, signal);
      const file = path.join(
        config.protectedRoot,
        input.runId,
        "candidate/src/server/booking-service.ts",
      );
      await chmod(file, 0o600);
      await writeFile(file, "inert tamper");
      return result;
    };
    const result = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(result.entries).toEqual([]);
    expect(result.status).toBe("failed");
  });
  it("rejects source mutation during capture", async () => {
    const { config } = await setup();
    const actual = snapshotModule.snapshotTree;
    let capture = 0;
    vi.spyOn(snapshotModule, "snapshotTree").mockImplementation(
      async (root) => {
        const snap = await actual(root);
        if (root.endsWith("fixtures/booking-v1") && ++capture === 3)
          return { ...snap, treeSha256: hash };
        return snap;
      },
    );
    const adapter = synthetic();
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("failed");
    expect(adapter.grade).not.toHaveBeenCalled();
  });
  it("pre-cancellation avoids admission and grading", async () => {
    const { config } = await setup(),
      adapter = synthetic(),
      abort = new AbortController();
    abort.abort();
    const result = await runOfflineAcceptance(config, adapter, abort.signal);
    expect(result.status).toBe("failed");
    expect(adapter.admit).not.toHaveBeenCalled();
    expect(adapter.grade).not.toHaveBeenCalled();
  });
  it("rejects unsupported scenario transformations", () => {
    expect(() =>
      acceptanceCandidate(
        { runId: randomUUID(), files: [] },
        "baseline",
        randomUUID(),
      ),
    ).toThrow();
  });
  it("never reaches sandbox execution for a stale offline review", async () => {
    const { root, config } = await setup();
    const { review, save } = await reviewFixture(config, root);
    await save({ ...review, expiresAt: new Date(0).toISOString() });
    const spawn = vi
      .spyOn(processModule, "boundedProcess")
      .mockRejectedValue(new Error("MUST NOT REACH"));
    await expect(
      createOfflineSbxAdapter(config).admit(hash, new AbortController().signal),
    ).rejects.toThrow("freshness");
    expect(spawn).not.toHaveBeenCalled();
  });
  it("refuses to release a lock replaced by another operator", async () => {
    const { config } = await setup();
    const lease = await acquireBookingLease(
      config.coordinationRoot,
      randomUUID(),
    );
    await rename(
      lease.directory,
      path.join(config.coordinationRoot, "retained-old-lease"),
    );
    await mkdir(lease.directory, { mode: 0o700 });
    await writeFile(
      path.join(lease.directory, "owner.json"),
      "another operator",
      { mode: 0o600 },
    );
    await expect(lease.release()).rejects.toThrow("Lease ownership changed");
    expect(await readdir(config.coordinationRoot)).toContain(
      ".booking-run.lock",
    );
  });
  it("withholds cleanup and publication when shared lease ownership changes", async () => {
    const { config } = await setup(),
      adapter = synthetic(),
      grade = adapter.grade;
    adapter.grade = async (input, signal) => {
      const result = await grade(input, signal);
      await writeFile(
        path.join(config.coordinationRoot, ".booking-run.lock/owner.json"),
        "another operator",
        { mode: 0o600 },
      );
      return result;
    };
    const result = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(result.status).toBe("failed");
    expect(result.entries).toEqual([]);
    expect(adapter.cleanup).not.toHaveBeenCalled();
    expect(await readdir(config.coordinationRoot)).toContain(
      ".booking-run.lock",
    );
  });
  it("prepares a minimal byte-bound bundle without candidate, app, keys or installs", async () => {
    const { root } = await setup();
    const destination = path.join(root, "bundle"),
      manifest = await prepareRuntimeBundle(destination);
    expect(manifest.installationStatus).toBe("NOT_INSTALLED");
    expect(manifest.imageDigest).toBeNull();
    expect(
      manifest.files
        .filter((f) => f.path.startsWith("controller/"))
        .map((f) => path.basename(f.path))
        .sort(),
    ).toEqual([...controllerFiles].sort());
    for (const file of manifest.files) {
      expect(file.path).not.toMatch(/fixture|candidate|receipt|\.env|operator/);
      expect(sha256(await readFile(path.join(destination, file.path)))).toBe(
        file.sha256,
      );
    }
    expect(
      await readFile(path.join(destination, "toolchain/.dockerignore"), "utf8"),
    ).toContain("**");
    await expect(prepareRuntimeBundle(destination)).rejects.toThrow();
    await expect(
      prepareRuntimeBundle(
        path.resolve("../AgentHarness-Planning/forbidden-runtime-bundle"),
      ),
    ).rejects.toThrow("disjoint");
  });
});

describe("trusted lifecycle — synthetic Docker observations, no sandbox", () => {
  it("cleans only exact run-labelled workers and rechecks absence", async () => {
    const runId = randomUUID(),
      replies = [
        "a".repeat(12),
        JSON.stringify({ "forecode.booking.run": runId }),
        "",
        "",
      ];
    const spy = vi.spyOn(runtime, "command").mockImplementation(async () => ({
      status: 0,
      signal: null,
      reason: "completed",
      stdout: replies.shift()!,
      stderr: "",
      elapsedMs: 0,
    }));
    expect(await cleanupOwned(runId)).toEqual({
      runId,
      removed: 1,
      remaining: 0,
    });
    expect(spy.mock.calls[0]?.[1]).toContain(
      `label=forecode.booking.run=${runId}`,
    );
    expect(spy.mock.calls[2]?.[1]).toEqual(["rm", "-f", "a".repeat(12)]);
  });
  it.each(["wrong-owner", "remaining", "remove-failure"])(
    "fails closed for %s",
    async (mode) => {
      const runId = randomUUID();
      let n = 0;
      const spy = vi.spyOn(runtime, "command").mockImplementation(async () => {
        const i = n++;
        return {
          status: mode === "remove-failure" && i === 2 ? 1 : 0,
          signal: null,
          reason: "completed",
          stdout:
            i === 0 || (i === 3 && mode === "remaining")
              ? "a".repeat(12)
              : i === 1
                ? JSON.stringify({
                    "forecode.booking.run":
                      mode === "wrong-owner" ? randomUUID() : runId,
                  })
                : "",
          stderr: "",
          elapsedMs: 0,
        };
      });
      await expect(cleanupOwned(runId)).rejects.toThrow();
      if (mode === "wrong-owner")
        expect(spy.mock.calls.some((c) => c[1][0] === "rm")).toBe(false);
    },
  );
  it.each(["SIGINT", "SIGTERM"] as const)(
    "cancels trusted subprocess trees on %s",
    async (sig) => {
      const abort = new AbortController();
      const listener = () => abort.abort();
      process.once(sig, listener);
      const timer = setTimeout(() => process.emit(sig), 150);
      try {
        const p = await runtime.command(
          process.execPath,
          [
            "-e",
            "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','process.on(\"SIGTERM\",()=>{});setInterval(()=>{},1000)'],{stdio:'inherit'});console.log(child.pid);process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
          ],
          { signal: abort.signal, milliseconds: 2000 },
        );
        expect(p.reason).toBe("cancelled");
        await awaitProcessTermination(Number(p.stdout.trim()));
      } finally {
        clearTimeout(timer);
        process.off(sig, listener);
      }
    },
  );
  it("bounds real trusted harmless subprocess output and deadline", async () => {
    const output = await runtime.command(
      process.execPath,
      ["-e", "setInterval(()=>process.stdout.write('x'.repeat(4096)),1)"],
      { maxBytes: 1024, milliseconds: 1000 },
    );
    expect(output.reason).toBe("output_limit");
    expect(Buffer.byteLength(output.stdout)).toBe(1024);
    const timed = await runtime.command(
      process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      { milliseconds: 100 },
    );
    expect(timed.reason).toBe("timed_out");
    expect(timed.signal).toBe("SIGKILL");
  });
});
