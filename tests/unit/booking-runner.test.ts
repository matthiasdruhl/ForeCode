import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { awaitProcessTermination } from "../helpers/process-termination";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as hostFiles from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as sourceFreeze from "../../scripts/evaluator/booking-v1/freeze";
import {
  OperatorConfigSchema,
  obligations,
  type OperatorConfig,
} from "../../scripts/experiments/isolation/config";
import {
  admitRuntime,
  configurationDigest,
} from "../../scripts/experiments/isolation/gate";
import {
  captureReviewedTree,
  freezeCandidate,
} from "../../scripts/experiments/artifacts/files";
import { runBookingExperiment } from "../../scripts/experiments/runner/controller";
import { prepareBookingExecutionCommitment } from "../../scripts/experiments/runner/commitment";
import {
  boundedProcess,
  type ProcessResult,
} from "../../scripts/experiments/runner/process";
import {
  validateGradeReport,
  type GradeReport,
} from "../../scripts/experiments/runner/protocol";
import {
  createSbxAdapter,
  type BookingAdapter,
  type GradeInput,
} from "../../scripts/experiments/runner/sbx";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "@/server/artifacts/evaluation-store";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { createBookingService } from "../../fixtures/booking-v1/src/server/booking-service";
import {
  evaluateRemoteDomain,
  evaluateRemoteHttp,
} from "../../scripts/evaluator/booking-v1/remote-oracles";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

const temporary: string[] = [],
  hash = "a".repeat(64);
async function makeWritable(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory())
      await makeWritable(path.join(directory, entry.name));
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(hostFiles.rm).mockImplementation(
    (
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      )
    ).rm,
  );
  for (const root of temporary.splice(0)) {
    await makeWritable(root);
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-runner-development-")),
  );
  temporary.push(root);
  const protectedRoot = path.join(root, "protected"),
    scratchRoot = path.join(root, "scratch");
  await mkdir(protectedRoot, { mode: 0o700 });
  await mkdir(scratchRoot, { mode: 0o700 });
  const config = OperatorConfigSchema.parse({
    schemaVersion: "booking-operator.v1",
    sbx: "/opt/homebrew/bin/sbx",
    agentSandbox: "forecode-experiments",
    graderSandbox: "forecode-grader",
    agentImage: `sha256:${hash}`,
    graderImage: `sha256:${hash}`,
    workerImage: `forecode-booking-toolchain@sha256:${hash}`,
    agentConfigSha256: hash,
    codexBinarySha256: hash,
    graderNodeSha256: hash,
    graderLockSha256: hash,
    graderModulesSha256: hash,
    coordinationRoot: protectedRoot,
    protectedRoot,
    scratchRoot,
    reviewFile: path.join(root, "review.json"),
    reviewSha256: hash,
    maxSeconds: 1,
    maxOutputBytes: 4096,
    tokenLimit: 100,
    spendUsd: 0.1,
    authorizedModel: "gpt-5.6-sol",
  });
  return { root, config };
}
const observed = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  exitCode: 0,
  signal: null,
  reason: "completed",
  stdout: "",
  stderr: "",
  elapsedMs: 2,
  ...overrides,
});
function expected(input: GradeInput) {
  return {
    runId: input.runId,
    evaluatedTreeSha256: input.evaluatedTreeSha256,
    evaluatorSha256: input.evaluatorSha256,
    testSuiteSha256: input.testSuiteSha256,
    requiredPolicySha256: input.requiredPolicySha256,
  };
}
async function syntheticDomain(mutant = false) {
  // Only reviewed baseline code is exercised on the host. Candidate source is
  // inert data; this models a faulty remote subject, not an isolation proof.
  const subjects = new Map<string, ReturnType<typeof createBookingService>>();
  return evaluateRemoteDomain((raw) => {
    const p = raw as {
      op: string;
      options?: Parameters<typeof createBookingService>[0];
      subject: string;
      method: keyof ReturnType<typeof createBookingService>;
      args: unknown[];
    };
    if (p.op === "new-domain") {
      let id = 0;
      const subject = createBookingService({
        ...p.options,
        now: () => new Date("2026-11-01T00:00:00Z"),
        newId: () => `oracle-${++id}`,
      });
      if (mutant) {
        const get = subject.getBooking;
        subject.getBooking = (_viewer, key) => get("u-alice", key);
      }
      const key = randomUUID();
      subjects.set(key, subject);
      return key;
    }
    const subject = subjects.get(p.subject)!;
    const method = subject[p.method] as (...args: unknown[]) => unknown;
    return structuredClone(method(...p.args));
  });
}
function synthetic(config: OperatorConfig, options: { mode?: string } = {}) {
  let envelope: Awaited<ReturnType<typeof captureReviewedTree>>,
    collects = 0,
    cleanups = 0,
    gradedHash: string | null = null;
  const adapter: BookingAdapter = {
    kind: "synthetic-development",
    async admit() {
      if (options.mode === "gate") throw new Error("missing isolation");
    },
    async prepare(runId, directory) {
      envelope = await captureReviewedTree(directory, runId);
      // A distinct candidate marker tests exact-byte routing without execution.
      const file = envelope.files.find(
        (f) => f.path === "src/server/booking-service.ts",
      )!;
      file.base64 = Buffer.from(
        Buffer.from(file.base64, "base64").toString() +
          "\n// SYNTHETIC-CANDIDATE-OWNER-REGRESSION\n",
      ).toString("base64");
    },
    async agent() {
      return observed(
        options.mode === "timeout"
          ? { reason: "timed_out", exitCode: null }
          : options.mode === "cancel"
            ? { reason: "cancelled", exitCode: null }
            : options.mode === "agent-failure"
              ? { exitCode: 7 }
              : {},
      );
    },
    async finalizeAgent(runId) {
      collects++;
      const candidate =
        options.mode === "wrong"
          ? { ...envelope, runId: randomUUID() }
          : structuredClone(envelope);
      expect(envelope.runId).toBe(runId);
      return {
        runId,
        terminationConfirmed: options.mode !== "termination",
        restartAbsenceConfirmed: options.mode !== "resurrection",
        exportWithoutGuestExecution: options.mode !== "guest-export",
        candidate,
        candidateSha256:
          options.mode === "mutation" ? "a".repeat(64) : jsonDigest(candidate),
      };
    },
    async grade(input) {
      gradedHash = input.evaluatedTreeSha256;
      const candidate = Buffer.from(
        input.candidate.files.find(
          (f) => f.path === "src/server/booking-service.ts",
        )!.base64,
        "base64",
      ).toString();
      expect(candidate).toContain("SYNTHETIC-CANDIDATE-OWNER-REGRESSION");
      const results = await syntheticDomain(
        options.mode !== "pass" &&
          candidate.includes("SYNTHETIC-CANDIDATE-OWNER-REGRESSION"),
      );
      const failed = results.some((r) => r.status === "fail");
      expect(failed).toBe(options.mode !== "pass");
      const report: GradeReport = {
        schemaVersion: "booking-grade-observation.v1",
        ...expected(input),
        checks: [
          {
            id: "typecheck",
            status: "pass",
            exitCode: 0,
            detail: "Synthetic development observation.",
          },
          {
            id: "build",
            status: "pass",
            exitCode: 0,
            detail: "Synthetic development observation.",
          },
          {
            id: "baseline-domain",
            status: failed ? "fail" : "pass",
            exitCode: failed ? 1 : 0,
            detail: results.map((r) => `${r.id}:${r.status}`).join(","),
          },
          {
            id: "http-integration",
            status: "pass",
            exitCode: 0,
            detail: "Synthetic development observation.",
          },
          {
            id: "boundary",
            status: "pass",
            exitCode: 0,
            detail: "Synthetic development observation.",
          },
        ],
      };
      if (options.mode === "missing")
        report.checks = report.checks.filter(
          (c) => c.status !== "fail" && c.id !== "build",
        );
      if (options.mode === "forged") report.checks[0]!.exitCode = 2;
      if (options.mode === "evaluator") report.evaluatorSha256 = "b".repeat(64);
      if (options.mode === "source-tamper") {
        const target = path.join(
          config.protectedRoot,
          input.runId,
          "candidate",
          "src/server/booking-service.ts",
        );
        await chmod(target, 0o600);
        await writeFile(target, "tampered");
      }
      return observed({ stdout: JSON.stringify(report) });
    },
    async cleanup() {
      cleanups++;
      if (options.mode === "cleanup") throw new Error("stop failed");
    },
  };
  return { adapter, observations: () => ({ cleanups, collects, gradedHash }) };
}
async function run(mode?: string) {
  const data = await setup(),
    bridge = synthetic(data.config, { mode });
  const result = await runBookingExperiment(
    data.config,
    bridge.adapter,
    new AbortController().signal,
    "b".repeat(40),
  );
  const store = await createProtectedEvaluationStore({
    root: data.config.protectedRoot,
    agentWorkspaceRoot: data.config.scratchRoot,
    entries: new Map(result.entry ? [[result.run.id, result.entry]] : []),
  });
  return { ...data, ...bridge, result, store };
}

describe("controlled booking pipeline — SYNTHETIC DEVELOPMENT evidence only", () => {
  it("writes durable stage observations and a canonical original run; a commitment cannot be retried", async () => {
    const data = await setup(),
      bridge = synthetic(data.config, { mode: "pass" });
    const { commitment, commitmentSha256 } =
      await prepareBookingExecutionCommitment(data.config, "b".repeat(40));
    const proposal = { commitment, commitmentSha256 };
    const result = await runBookingExperiment(
      data.config,
      bridge.adapter,
      new AbortController().signal,
      "b".repeat(40),
      proposal,
    );
    expect(result.run.status).toBe("completed");
    const directory = path.join(data.config.protectedRoot, result.run.id);
    const files = await readdir(directory);
    const stages = await Promise.all(
      files
        .filter((f) => /^attempt-\d{4}\.json$/.test(f))
        .sort()
        .map(
          async (f) =>
            JSON.parse(await readFile(path.join(directory, f), "utf8")).stage,
        ),
    );
    expect(stages).toEqual([
      "lease",
      "admission",
      "preparation",
      "agent",
      "candidate-export",
      "grading",
      "report-validation",
      "cleanup-and-freshness",
      "publication",
      "finished",
    ]);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "experiment-run.json"), "utf8"),
      ),
    ).toEqual(result.run);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "verification.json"), "utf8"),
      ).origin,
    ).toBe("trusted_evaluator");
    const prior = await readFile(path.join(directory, "run.json"));
    await expect(
      runBookingExperiment(
        data.config,
        bridge.adapter,
        new AbortController().signal,
        "b".repeat(40),
        proposal,
      ),
    ).rejects.toThrow();
    expect(await readFile(path.join(directory, "run.json"))).toEqual(prior);
    expect(bridge.observations().cleanups).toBe(1);
  });
  it("rejects plain finalization flags even when an adapter labels itself sbx", async () => {
    const data = await setup(),
      bridge = synthetic(data.config, { mode: "pass" });
    const { commitment, commitmentSha256 } =
      await prepareBookingExecutionCommitment(data.config, "b".repeat(40));
    const proposal = { commitment, commitmentSha256 };
    bridge.adapter.kind = "sbx";
    const graded = vi.spyOn(bridge.adapter, "grade");
    const result = await runBookingExperiment(
      data.config,
      bridge.adapter,
      new AbortController().signal,
      "b".repeat(40),
      proposal,
    );
    expect(result.run.status).toBe("failed");
    expect(result.entry).toBeNull();
    expect(result.run.evidenceOrigin).toBe("none");
    expect(result.run.isolationAttestationId).toBeNull();
    expect(graded).not.toHaveBeenCalled();
  });
  it("routes the exact changed candidate through independent assertions, publication and trusted loading", async () => {
    const data = await run();
    expect(data.result.run.evidenceOrigin).toBe("none");
    expect(data.result.run.limitations.join()).toContain("SYNTHETIC");
    expect(data.result.run.evaluatedTreeSha256).not.toBe(
      data.result.run.fixtureSha256,
    );
    expect(data.observations().gradedHash).toBe(
      data.result.run.evaluatedTreeSha256,
    );
    const trusted = await data.store.load(data.result.run.id);
    expect(isTrustedEvaluation(trusted)).toBe(true);
    expect(trusted?.verification.verdict).toBe("REJECTED"); // Agent exit 0!
    expect(data.result.run.metrics.tokens).toBeNull();
    expect(data.result.run.metrics.costUsd).toBeNull();
    expect(data.result.entry?.identity.evaluatorSha256).toBe(
      jsonDigest(data.result.runtimePins),
    );
    const artifact = JSON.parse(
      await readFile(
        path.join(
          data.config.protectedRoot,
          data.result.run.id,
          "checks/baseline-domain.json",
        ),
        "utf8",
      ),
    );
    expect(artifact.runtimePins.workerImage).toBe(data.config.workerImage);
    expect(artifact.runtimePins.configurationSha256).toBe(
      configurationDigest(data.config),
    );
    expect(data.observations().cleanups).toBe(1);
    expect(await readdir(data.config.scratchRoot)).toEqual([]);
    expect(await readdir(data.config.protectedRoot)).not.toContain(
      ".booking-run.lock",
    );
  });
  it("loads the synthetic all-pass path without claiming a measured experiment", async () => {
    const data = await run("pass");
    const trusted = await data.store.load(data.result.run.id);
    expect(trusted?.verification.verdict).toBe("VERIFIED");
    expect(data.result.run.evidenceOrigin).toBe("none");
    expect(data.result.run.isolationAttestationId).toBeNull();
  });
  it("honors controller cancellation and refuses overlapping roots or concurrent runs", async () => {
    const data = await setup(),
      bridge = synthetic(data.config);
    const cancel = new AbortController();
    cancel.abort();
    const result = await runBookingExperiment(
      data.config,
      bridge.adapter,
      cancel.signal,
      "b".repeat(40),
    );
    expect(result.run.status).toBe("cancelled");
    expect(result.entry).toBeNull();
    expect(bridge.observations().cleanups).toBe(1);
    await expect(
      runBookingExperiment(
        { ...data.config, scratchRoot: data.config.protectedRoot },
        bridge.adapter,
        new AbortController().signal,
        "b".repeat(40),
      ),
    ).rejects.toThrow("disjoint");
    await mkdir(path.join(data.config.protectedRoot, ".booking-run.lock"));
    const conflict = await runBookingExperiment(
      data.config,
      bridge.adapter,
      new AbortController().signal,
      "b".repeat(40),
    );
    expect(conflict.run.status).toBe("blocked");
    expect(conflict.stage).toBe("lease");
    expect(conflict.entry).toBeNull();
    expect(
      JSON.parse(
        await readFile(
          path.join(data.config.protectedRoot, conflict.run.id, "run.json"),
          "utf8",
        ),
      ).stage,
    ).toBe("lease");
  });
  it("publishes missing checks as insufficient and retains observed agent failure", async () => {
    const missing = await run("missing");
    expect(
      (await missing.store.load(missing.result.run.id))?.verification.verdict,
    ).toBe("INSUFFICIENT_EVIDENCE");
    const failed = await run("agent-failure");
    expect(failed.result.run.status).toBe("failed");
    expect(failed.result.agent?.exitCode).toBe(7);
    expect(
      (await failed.store.load(failed.result.run.id))?.verification.verdict,
    ).toBe("REJECTED");
  });
  it.each([
    "gate",
    "timeout",
    "cancel",
    "wrong",
    "mutation",
    "forged",
    "evaluator",
    "source-tamper",
    "cleanup",
    "termination",
    "resurrection",
    "guest-export",
  ])("preserves failure and cleans up for %s", async (mode) => {
    const data = await run(mode);
    expect(data.result.entry).toBeNull();
    expect(data.result.run.receiptId).toBeNull();
    expect(data.observations().cleanups).toBeGreaterThan(0);
    expect(await readdir(data.config.scratchRoot)).toEqual([]);
    expect(data.result.failure).not.toBeNull();
    if (
      [
        "gate",
        "timeout",
        "cancel",
        "wrong",
        "mutation",
        "termination",
        "resurrection",
        "guest-export",
      ].includes(mode)
    )
      expect(data.observations().gradedHash).toBeNull();
  });
  it.each(["scratch-removal", "lease-release"])(
    "retains a durable blocked disposition for host %s failure",
    async (failure) => {
      const data = await setup(),
        bridge = synthetic(data.config);
      const original = (
        await vi.importActual<typeof import("node:fs/promises")>(
          "node:fs/promises",
        )
      ).rm;
      vi.mocked(hostFiles.rm).mockImplementation(async (target, options) => {
        const name = String(target);
        if (
          (failure === "scratch-removal" &&
            name.startsWith(data.config.scratchRoot)) ||
          (failure === "lease-release" && name.endsWith(".booking-run.lock"))
        )
          throw new Error("SYNTHETIC host cleanup refusal");
        return original(target, options);
      });
      const result = await runBookingExperiment(
        data.config,
        bridge.adapter,
        new AbortController().signal,
        "b".repeat(40),
      );
      expect(result.run.status).toBe("blocked");
      expect(result.entry).toBeNull();
      expect(result.run.receiptId).toBeNull();
      expect(result.cleanupConfirmed).toBe(false);
      for (const name of ["evaluation.json", "allowlist-entry.json"])
        await expect(
          readFile(path.join(data.config.protectedRoot, result.run.id, name)),
        ).rejects.toThrow();
      expect(
        await readFile(
          path.join(data.config.protectedRoot, result.run.id, "run.json"),
          "utf8",
        ),
      ).toContain('"blocked"');
      expect(
        await hostFiles.stat(
          path.join(data.config.coordinationRoot, ".booking-run.lock"),
        ),
      ).toBeDefined();
    },
  );
  it("refuses publication when the trusted evaluator changes while grading", async () => {
    const pins = await sourceFreeze.freezeBooking();
    vi.spyOn(sourceFreeze, "freezeBooking")
      .mockResolvedValueOnce(pins)
      .mockResolvedValueOnce({ ...pins, evaluatorSha256: "c".repeat(64) });
    const data = await run();
    expect(data.result.entry).toBeNull();
    expect(data.result.stage).toBe("cleanup-and-freshness");
    expect(data.result.run.status).toBe("failed");
  });
  it("refuses mutated protected check and bundle bytes after publication", async () => {
    const data = await run();
    const directory = path.join(data.config.protectedRoot, data.result.run.id);
    const file = path.join(directory, "checks/baseline-domain.json");
    await chmod(file, 0o600);
    await writeFile(file, '{"status":"pass"}');
    expect(await data.store.load(data.result.run.id)).toBeNull();
    const second = await run();
    const bundle = path.join(
      second.config.protectedRoot,
      second.result.run.id,
      "evaluation.json",
    );
    await chmod(bundle, 0o600);
    await writeFile(bundle, "{}");
    expect(await second.store.load(second.result.run.id)).toBeNull();
  });
  it("never treats disconnected worker responses as oracle success", async () => {
    expect(
      (
        await evaluateRemoteDomain(() => {
          throw new Error("disconnected");
        })
      ).every((r) => r.status === "fail"),
    ).toBe(true);
    const rows = await evaluateRemoteHttp((data) =>
      (data as { op: string }).op === "new-http"
        ? "synthetic-http"
        : { status: 200, body: "{}", headers: [] },
    );
    expect(rows.some((r) => r.status === "fail")).toBe(true);
  });
});

describe("runtime admission", () => {
  it("defaults to disabled and never invokes sandbox tooling", async () => {
    const { config } = await setup();
    expect(config.enabled).toBe(false);
    await expect(createSbxAdapter(config).admit(hash)).rejects.toThrow(
      "disabled",
    );
    expect(() =>
      OperatorConfigSchema.parse({ ...config, maxSeconds: 0 }),
    ).toThrow();
    expect(() =>
      OperatorConfigSchema.parse({ ...config, arbitraryCommand: "echo pass" }),
    ).toThrow();
  });
  it("requires actual commitment/admission even if operator config enables execution", async () => {
    const { config } = await setup();
    config.enabled = true;
    const adapter = createSbxAdapter(config);
    await expect(adapter.admit(hash)).rejects.toThrow(
      "Exact pre-run commitment",
    );
    await expect(
      adapter.agent(randomUUID(), new AbortController().signal),
    ).rejects.toThrow("Wrong or stale run");
    await expect(adapter.finalizeAgent(randomUUID())).rejects.toThrow(
      "Wrong or stale run",
    );
  });
  it("requires current reviewed bytes bound to implementation/config/inventory and all observations", async () => {
    const { config, root } = await setup();
    config.enabled = true;
    const inventory = { vmId: "synthetic-vm", image: hash };
    const observation = path.join(root, "observations.json");
    await writeFile(
      observation,
      "SYNTHETIC development denial observations; no runtime attestation",
      { mode: 0o600 },
    );
    const review = {
      schemaVersion: "booking-isolation-review.v1",
      reviewedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 100000).toISOString(),
      configurationSha256: configurationDigest(config),
      implementationSha256: hash,
      inventorySha256: jsonDigest(inventory),
      authorizedTask: "booking-ownership-refactor-v1",
      authorizedModel: "gpt-5.6-sol",
      maxSpendUsd: 0.1,
      evidence: obligations.map((obligation) => ({
        obligation,
        path: observation,
        sha256: sha256(
          "SYNTHETIC development denial observations; no runtime attestation",
        ),
        reviewedObservation:
          "Synthetic test of review binding only; not a measured denial.",
      })),
    };
    const save = async (value: unknown) => {
      const bytes = JSON.stringify(value);
      await writeFile(config.reviewFile, bytes, { mode: 0o600 });
      config.reviewSha256 = sha256(bytes);
    };
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow();
    await save({ passed: true });
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow();
    await save(review);
    await expect(admitRuntime(config, inventory, hash)).resolves.toBeDefined();
    await expect(admitRuntime(config, { vmId: "wrong" }, hash)).rejects.toThrow(
      "inventory",
    );
    await expect(
      admitRuntime(config, inventory, "b".repeat(64)),
    ).rejects.toThrow("bind");
    config.maxSeconds++;
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow("bind");
    config.maxSeconds--;
    await save({
      ...review,
      expiresAt: new Date(Date.now() - 100).toISOString(),
    });
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow(
      "freshness",
    );
    await save({ ...review, evidence: review.evidence.slice(1) });
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow();
    await save(review);
    await writeFile(observation, "changed");
    await expect(admitRuntime(config, inventory, hash)).rejects.toThrow(
      "changed isolation evidence",
    );
  });
});

describe("bounded process lifecycle (reviewed harmless host children only)", () => {
  it("captures observed nonzero exits and missing binaries", async () => {
    expect(
      (
        await boundedProcess(process.execPath, ["-e", "process.exit(7)"], {
          milliseconds: 1000,
          maxBytes: 1024,
        })
      ).exitCode,
    ).toBe(7);
    expect(
      (
        await boundedProcess("/nonexistent/forecode", [], {
          milliseconds: 1000,
          maxBytes: 1024,
        })
      ).reason,
    ).toBe("spawn_error");
  });
  it("escalates timeout and cancellation against a process ignoring SIGTERM", async () => {
    const script = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
    const timeout = await boundedProcess(process.execPath, ["-e", script], {
      milliseconds: 100,
      maxBytes: 1024,
    });
    expect(timeout.reason).toBe("timed_out");
    expect(timeout.signal).toBe("SIGKILL");
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 100);
    const cancelled = await boundedProcess(process.execPath, ["-e", script], {
      milliseconds: 5000,
      maxBytes: 1024,
      signal: abort.signal,
    });
    expect(cancelled.reason).toBe("cancelled");
    expect(cancelled.signal).toBe("SIGKILL");
  });
  it("bounds output, handles pre-cancellation, and kills descendants", async () => {
    const output = await boundedProcess(
      process.execPath,
      ["-e", "setInterval(()=>process.stdout.write('x'.repeat(4096)),1)"],
      { milliseconds: 5000, maxBytes: 1024 },
    );
    expect(output.reason).toBe("output_limit");
    expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(1024);
    const abort = new AbortController();
    abort.abort();
    expect(
      (
        await boundedProcess(process.execPath, ["-e", "process.exit(99)"], {
          milliseconds: 1000,
          maxBytes: 1024,
          signal: abort.signal,
        })
      ).reason,
    ).toBe("cancelled");
    const { root } = await setup();
    const heartbeat = path.join(root, "descendant-heartbeat");
    const writer =
      "const {writeFileSync,renameSync}=require('node:fs');let n=0;const p=process.argv[1];const tick=()=>{writeFileSync(p+'.pending',String(++n));renameSync(p+'.pending',p)};tick();process.send('ready');setInterval(tick,10)";
    const parent = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(writer)},${JSON.stringify(heartbeat)}],{stdio:['ignore','inherit','inherit','ipc']});c.once('message',()=>console.log(c.pid));setInterval(()=>{},1000)`;
    const child = await boundedProcess(process.execPath, ["-e", parent], {
      milliseconds: 1000,
      maxBytes: 1024,
    });
    expect(child.reason).toBe("timed_out");
    await awaitProcessTermination(Number(child.stdout.trim()));
    const stopped = await readFile(heartbeat, "utf8");
    expect(Number(stopped)).toBeGreaterThan(0);
    await delay(200);
    expect(await readFile(heartbeat, "utf8")).toBe(stopped);
  });
});

describe("candidate and report data guards", () => {
  it("rejects traversal, duplicate paths, stale source and changed dependency configuration", async () => {
    const { root } = await setup();
    const runId = randomUUID();
    const baseline = {
      runId,
      files: [
        { path: "package.json", base64: Buffer.from("{}").toString("base64") },
      ],
    };
    for (const files of [
      [{ path: "../escape.ts", base64: "" }],
      [baseline.files[0]!, baseline.files[0]!],
      [
        {
          path: "package.json",
          base64: Buffer.from('{"scripts":{"build":"forged"}}').toString(
            "base64",
          ),
        },
      ],
    ]) {
      await expect(
        freezeCandidate(
          { runId, files },
          runId,
          path.join(root, randomUUID()),
          baseline,
        ),
      ).rejects.toThrow();
    }
    await expect(
      freezeCandidate(
        baseline,
        randomUUID(),
        path.join(root, randomUUID()),
        baseline,
      ),
    ).rejects.toThrow("stale");
  });
  it("rejects report substitution even with exit zero", () => {
    const identity = {
      runId: randomUUID(),
      evaluatedTreeSha256: hash,
      evaluatorSha256: hash,
      testSuiteSha256: hash,
      requiredPolicySha256: hash,
    };
    for (const key of Object.keys(identity))
      expect(() =>
        validateGradeReport(
          {
            schemaVersion: "booking-grade-observation.v1",
            ...identity,
            [key]: key === "runId" ? randomUUID() : "b".repeat(64),
            checks: [],
          },
          identity,
        ),
      ).toThrow();
  });
});
