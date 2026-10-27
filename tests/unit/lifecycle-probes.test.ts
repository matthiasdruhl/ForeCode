import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import * as runtime from "../../scripts/evaluator/booking-v1/runtime.mjs";
import * as lifecycle from "../../scripts/evaluator/booking-v1/lifecycle.mjs";
import { exerciseLifecycle } from "../../scripts/evaluator/booking-v1/lifecycle-probes.mjs";
import {
  workerArguments,
  workerLimits,
} from "../../scripts/evaluator/booking-v1/worker-policy.mjs";
import {
  validateLifecycleRequest,
  lifecycleRequestDigest,
  processSummary,
} from "../../scripts/evaluator/booking-v1/lifecycle-protocol.mjs";
import {
  createLifecycleRequest,
  validateLifecycleReport,
  validateRestartCleanup,
  validateRestartObservation,
} from "../../scripts/experiments/runner/lifecycle-protocol";
import { syntheticLifecycleReport } from "../helpers/synthetic-lifecycle";
const image = `sha256:${"a".repeat(64)}`,
  hash = "a".repeat(64),
  roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const request = () => createLifecycleRequest(randomUUID(), hash, image);

describe("fixed lifecycle protocol — SYNTHETIC development observations", () => {
  it("rejects unknown operations, duplicate runs, arbitrary commands and stale request bindings", () => {
    const input = request(),
      report = syntheticLifecycleReport(input);
    expect(validateLifecycleRequest(input)).toBe(input);
    expect(validateLifecycleReport(report, input).cases).toHaveLength(8);
    for (const raw of [
      { ...input, command: "true" },
      { ...input, runs: { ...input.runs, shell: randomUUID() } },
      { ...input, runs: { ...input.runs, timeout: input.runs.sigint } },
      { ...input, workerImage: "some-tag" },
    ])
      expect(() => validateLifecycleRequest(raw)).toThrow();
    expect(() => validateLifecycleReport(report, request())).toThrow("stale");
    expect(lifecycleRequestDigest(input)).not.toBe(
      lifecycleRequestDigest({
        ...input,
        implementationSha256: "b".repeat(64),
      }),
    );
  });
  it.each([
    "missing",
    "duplicate",
    "wrong-run",
    "source-mutation",
    "missing-recovery",
    "false-timeout",
    "false-signal",
    "false-output-limit",
    "missing-heartbeat",
    "missing-refusal",
    "error",
    "suite-cleanup",
    "timeout-escalation",
  ])("rejects %s even when all reported statuses claim success", (mode) => {
    const input = request(),
      report = syntheticLifecycleReport(input);
    if (mode === "missing") report.cases.pop();
    if (mode === "duplicate") report.cases[1] = report.cases[0]!;
    if (mode === "wrong-run") report.cases[0]!.runId = randomUUID();
    if (mode === "source-mutation") report.cases[0]!.sourceAfterSha256 = hash;
    if (mode === "missing-recovery") report.cases[0]!.recovered = false;
    if (mode === "false-timeout")
      report.cases.find((c) => c.id === "timeout")!.transport.reason =
        "completed";
    if (mode === "false-signal")
      report.cases.find((c) => c.id === "sigint")!.driver!.receivedSignal =
        "SIGTERM";
    if (mode === "false-output-limit")
      report.cases.find((c) => c.id === "output-limit")!.driver!.worker.reason =
        "completed";
    if (mode === "missing-heartbeat")
      report.cases.find((c) => c.id === "detached-descendant")!.heartbeat =
        null;
    if (mode === "missing-refusal")
      report.cases.find((c) => c.id === "cleanup-refusal")!.cleanupRefused =
        false;
    if (mode === "suite-cleanup") report.cleanupConfirmed = false;
    if (mode === "timeout-escalation")
      report.cases.find((c) => c.id === "timeout")!.transport.signal =
        "SIGTERM";
    if (mode === "error") report.cases[0]!.status = "error";
    expect(() => validateLifecycleReport(report, input)).toThrow();
  });
  it("requires complete actual stop/restart absence observations", () => {
    const ids = [randomUUID(), randomUUID()];
    const cleanup = {
      touched: true,
      restartChecked: true,
      absentRunIds: ids,
      observations: [],
    };
    expect(validateRestartCleanup(cleanup, ids)).toBeDefined();
    for (const raw of [
      { ...cleanup, restartChecked: false },
      { ...cleanup, absentRunIds: ids.slice(1) },
      { ...cleanup, absentRunIds: [ids[0], ids[0]] },
      { passed: true },
    ])
      expect(() => validateRestartCleanup(raw, ids)).toThrow();
  });
  it("rejects revived controllers, leftover workers and substituted restart identities", () => {
    const id = randomUUID(),
      clean = {
        runId: id,
        removed: 0,
        remaining: 0,
        controllerRecovered: false,
      };
    expect(validateRestartObservation(clean, id)).toEqual(clean);
    for (const raw of [
      { ...clean, runId: randomUUID() },
      { ...clean, removed: 1 },
      { ...clean, remaining: 1 },
      { ...clean, controllerRecovered: true },
      { passed: true },
    ])
      expect(() => validateRestartObservation(raw, id)).toThrow();
  });
  it("uses identical finite worker boundaries for booking and harmless fixtures", () => {
    const id = randomUUID(),
      root = `/tmp/booking-lifecycle-${id}`;
    const base = {
      name: `forecode-booking-${id}`,
      runId: id,
      image,
      source: `${root}/source`,
      bridge: `${root}/bridge`,
    };
    const booking = workerArguments({
      ...base,
      script: "worker.mjs",
      mode: "rpc",
    });
    const probe = workerArguments({
      ...base,
      script: "lifecycle-worker.mjs",
      mode: "detached",
    });
    expect(probe.slice(0, -2)).toEqual(booking.slice(0, -2));
    for (const arg of [
      "none",
      "--read-only",
      "--cap-drop",
      "no-new-privileges:true",
      "65534:65534",
      "768m",
      "64",
      "nofile=256:256",
    ])
      expect(probe).toContain(arg);
    expect(probe.join(" ")).not.toMatch(/docker.sock|privileged|network host/);
    expect(
      Object.values(workerLimits).every((n) => Number.isFinite(n) && n > 0),
    ).toBe(true);
    expect(() =>
      workerArguments({ ...base, script: "worker.mjs", mode: "shell" }),
    ).toThrow();
    expect(() =>
      workerArguments({
        ...base,
        source: "/Users/sensitive",
        script: "worker.mjs",
        mode: "rpc",
      }),
    ).toThrow();
  });
  it("refuses a controlled cleanup fault before removing the owned worker", async () => {
    const runId = randomUUID();
    const command = vi
      .spyOn(runtime, "command")
      .mockImplementation(async (_exe, args) => ({
        status: 0,
        signal: null,
        reason: "completed",
        stdout:
          args[0] === "ps"
            ? "a".repeat(12)
            : JSON.stringify({ "forecode.booking.run": runId }),
        stderr: "",
        elapsedMs: 0,
      }));
    await expect(
      lifecycle.cleanupOwned(runId, { probeRefusal: true }),
    ).rejects.toThrow("FIXED_PROBE_REMOVAL_REFUSED");
    expect(command.mock.calls.some((c) => c[1][0] === "rm")).toBe(false);
  });
});

// Exercise the actual protected suite orchestration with fake Docker/process
// observations. No VM, candidate source, Docker engine or provider is accessed.
function syntheticGuest(
  input: ReturnType<typeof request>,
  failure?: "heartbeat" | "cleanup",
) {
  let beat = 0,
    nextPid = 900000;
  const driverByPid = new Map<
    number,
    { id: string; finish: (signal?: string) => void }
  >();
  const active = new Set<string>(),
    registered = new Set<string>();
  const reply = (
    stdout = "",
    status: number | null = 0,
  ): runtime.Observation => ({
    status,
    signal: null,
    reason: "completed",
    stdout,
    stderr: "",
    elapsedMs: 1,
  });
  vi.spyOn(lifecycle, "registerController").mockImplementation(async (id) => {
    registered.add(id);
  });
  vi.spyOn(lifecycle, "unregisterController").mockImplementation(async (id) => {
    registered.delete(id);
  });
  const recover = vi
    .spyOn(lifecycle, "recoverOwned")
    .mockImplementation(async (id) => {
      if (failure === "cleanup" && active.has(id))
        throw new Error("synthetic removal failed");
      for (const state of driverByPid.values())
        if (state.id === id) state.finish("SIGTERM");
      active.delete(id);
      registered.delete(id);
      return {
        runId: id,
        removed: 0,
        remaining: 0,
        controllerRecovered: false,
      };
    });
  const absent = vi
    .spyOn(lifecycle, "assertAbsent")
    .mockImplementation(async (id) => {
      if (active.has(id) || registered.has(id))
        throw new Error("synthetic survivor");
      return { runId: id, remaining: 0, controllerAbsent: true };
    });
  vi.spyOn(lifecycle, "cleanupOwned").mockImplementation(
    async (_id, options) => {
      if (options?.probeRefusal) throw new Error("FIXED_PROBE_REMOVAL_REFUSED");
      throw new Error("unexpected cleanup route");
    },
  );
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw new Error("No real host signal permitted in synthetic suite");
  });
  vi.spyOn(lifecycle, "signalOwnedDriver").mockImplementation(
    async (id, pid, signal) => {
      const child = driverByPid.get(pid);
      if (!child || child.id !== id)
        throw new Error("Unexpected process target");
      child.finish(String(signal));
    },
  );
  const command = vi
    .spyOn(runtime, "command")
    .mockImplementation(async (exe, args, options) => {
      if (exe === "docker") {
        expect(args[0]).toBe("exec");
        return reply(
          JSON.stringify({
            beats: ++beat,
            denied: failure === "heartbeat" ? 0 : beat,
          }),
        );
      }
      expect(exe).toBe(process.execPath);
      expect(args[0]).toMatch(/lifecycle-driver\.mjs$/);
      const id = args[2]!,
        kind = Object.entries(input.runs).find(([, runId]) => runId === id)![0];
      active.add(id);
      registered.add(id);
      return new Promise<runtime.Observation>((resolve) => {
        const pid = ++nextPid;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let finished = false;
        const finish = (sig?: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (kind === "detached-descendant") {
            const p = reply("", null);
            p.signal = "SIGKILL";
            resolve(p);
            return;
          }
          if (kind === "timeout") {
            const p = reply("", null);
            p.reason = "timed_out";
            p.signal = "SIGKILL";
            resolve(p);
            return;
          }
          const worker = reply(
            kind === "output-limit" ? "x".repeat(4096) : "fixed",
            kind === "worker-failure" ? 7 : 0,
          );
          if (["sigint", "sigterm", "cleanup-refusal"].includes(kind))
            worker.reason = "cancelled";
          if (kind === "output-limit") worker.reason = "output_limit";
          active.delete(id);
          registered.delete(id);
          resolve(
            reply(
              JSON.stringify({
                schemaVersion: "booking-lifecycle-driver.v1",
                runId: id,
                receivedSignal: sig ?? null,
                worker: processSummary(worker),
              }),
            ),
          );
        };
        driverByPid.set(pid, { id, finish });
        options?.onSpawn?.(pid);
        if (["normal-exit", "worker-failure", "output-limit"].includes(kind))
          finish();
        if (kind === "timeout") timer = setTimeout(finish, 180);
      });
    });
  return { command, recover, absent, active };
}

describe("trusted process observation hooks — fixed harmless host child only", () => {
  it("reports a failed observer hook and still terminates its child", async () => {
    const result = await runtime.command(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      {
        milliseconds: 1000,
        onSpawn: () => {
          throw new Error("fixed observer failure");
        },
      },
    );
    expect(result.reason).toBe("spawn_error");
    expect(result.elapsedMs).toBeLessThan(1500);
  });
});

describe("protected lifecycle orchestration — SYNTHETIC Docker/process transport", () => {
  it("runs fixed cases, checks advancing descendants and recovers before each following case", async () => {
    const input = request();
    roots.push(`/tmp/booking-lifecycle-${input.suiteId}`);
    const fake = syntheticGuest(input);
    const report = validateLifecycleReport(
      await exerciseLifecycle(input),
      input,
    );
    expect(report.cases).toHaveLength(8);
    expect(fake.active.size).toBe(0);
    expect(fake.absent.mock.calls.length).toBeGreaterThan(16);
    expect(fake.recover).toHaveBeenCalledWith(
      input.runs["detached-descendant"],
    );
    expect(
      report.cases.find((row) => row.id === "cleanup-refusal")?.cleanupRefused,
    ).toBe(true);
    await expect(
      readFile(`${roots[0]}/source/export-marker`),
    ).rejects.toThrow();
  });
  it.each(["heartbeat", "cleanup"] as const)(
    "cannot turn %s failure into accepted runtime evidence",
    async (failure) => {
      const input = request();
      roots.push(`/tmp/booking-lifecycle-${input.suiteId}`);
      syntheticGuest(input, failure);
      const raw = await exerciseLifecycle(input);
      expect(() => validateLifecycleReport(raw, input)).toThrow();
    },
  );
});
