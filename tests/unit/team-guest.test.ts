import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamGradeData } from "../support/team-grade-data";
import { baselineCheckIds } from "../../scripts/evaluator/booking-v1/grade-profile";

// Runs reviewed guest control flow with entirely synthetic subprocess/lifecycle
// transports. No docker/sbx process, candidate import or private suite executes.
const state = vi.hoisted(() => ({
  input: "",
  commands: [] as { executable: string; args: string[]; input?: string }[],
  copies: [] as string[],
  output: "",
  packageAvailable: true,
  installationReads: 0,
  drift: false,
  failCleanup: false,
  interrupt: "",
  timeoutCheck: "",
  telemetryUnavailable: false,
  oracleStatus: 0,
  tempRoot: "",
  cleanup: vi.fn(async () => {}),
  register: vi.fn(async () => {}),
  unregister: vi.fn(async () => {}),
}));
// Match the existing Linux guest mount policy; do not relax it for macOS TMPDIR.
vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (
      filename: Parameters<typeof actual.readFileSync>[0],
      ...args: unknown[]
    ) =>
      filename === 0
        ? Buffer.from(state.input)
        : Reflect.apply(actual.readFileSync, actual, [filename, ...args]),
    mkdtempSync: (prefix: string) => {
      state.tempRoot = actual.mkdtempSync(prefix);
      return state.tempRoot;
    },
    writeFileSync: (filename: string, ...args: unknown[]) => {
      if (filename.includes("/bridge/"))
        state.copies.push(filename.split("/bridge/")[1]!);
      return Reflect.apply(actual.writeFileSync, actual, [filename, ...args]);
    },
  };
});
vi.mock("../../scripts/evaluator/booking-v1/team-diagnostics", () => ({
  retainTeamDiagnostic: vi.fn(), // No private guest filesystem in a host control.
}));
vi.mock("../../scripts/evaluator/booking-v1/team-installation", () => ({
  requireInstalledTeamProfile: vi.fn(async () => {
    if (!state.packageAvailable)
      throw new Error("Synthetic package unavailable");
    return {
      manifestSha256: (state.drift && state.installationReads++ > 0
        ? "c"
        : "a"
      ).repeat(64),
      oracleSha256: "b".repeat(64),
    };
  }),
}));
vi.mock(
  "../../scripts/evaluator/booking-v1/lifecycle.mjs",
  async (original) => ({
    ...(await original<
      typeof import("../../scripts/evaluator/booking-v1/lifecycle.mjs")
    >()),
    registerController: state.register,
    unregisterController: state.unregister,
    cleanupOwned: state.cleanup,
  }),
);
vi.mock("../../scripts/evaluator/booking-v1/runtime.mjs", () => ({
  successful: (result: {
    reason: string;
    status: number | null;
    signal: unknown;
  }) => result.reason === "completed" && result.status === 0 && !result.signal,
  command: vi.fn(
    async (
      executable: string,
      args: string[],
      options: { input?: string } = {},
    ) => {
      state.commands.push({ executable, args, input: options.input });
      const kind = args.find((arg) => arg.startsWith("team-permissions-"));
      if (kind && state.interrupt === kind) {
        process.emit("SIGTERM");
        return {
          reason: "cancelled",
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
          elapsedMs: 1,
        };
      }
      if (kind && state.timeoutCheck === kind)
        return {
          reason: "timed_out",
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
          elapsedMs: 1,
        };
      return {
        reason: "completed",
        status: kind
          ? state.oracleStatus
          : state.failCleanup && args[0] === "rm"
            ? 1
            : 0,
        signal: null,
        stdout:
          args[0] === "exec"
            ? '{"result":true}'
            : "Synthetic protected transport observation" +
              (kind && state.telemetryUnavailable
                ? " Authorization telemetry unavailable."
                : ""),
        stderr: "",
        elapsedMs: 1,
      };
    },
  ),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.commands = [];
  state.copies = [];
  state.output = "";
  state.packageAvailable = true;
  state.installationReads = 0;
  state.drift = false;
  state.failCleanup = false;
  state.interrupt = "";
  state.timeoutCheck = "";
  state.telemetryUnavailable = false;
  state.oracleStatus = 0;
  state.tempRoot = "";
  state.input = JSON.stringify(teamGradeData().input);
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    state.output += value.toString();
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
const run = () => import("../../scripts/evaluator/booking-v1/guest");

describe("trusted guest fixed profiles and lifecycle with synthetic transports", () => {
  it("selects all eight checks and sends no oracle source/assertions to workers", async () => {
    await run();
    const report = JSON.parse(state.output);
    expect(
      report.checks.map((check: { id: string }) => check.id).sort(),
    ).toEqual(
      [
        ...baselineCheckIds,
        "team-permissions-domain",
        "team-permissions-http",
        "team-permissions-adversarial",
      ].sort(),
    );
    expect(state.copies.sort()).toEqual([
      "client.mjs",
      "probe.mjs",
      "team-rpc.mjs",
      "worker.mjs",
    ]);
    const launches = state.commands.filter((item) => item.args[0] === "run");
    expect(
      launches.filter((item) => item.args.at(-1) === "rpc-team"),
    ).toHaveLength(3);
    expect(
      launches.every(
        (item) =>
          item.args.includes("none") &&
          item.args.includes("65534:65534") &&
          item.args.includes("64") &&
          !item.args.join(" ").includes("/future"),
      ),
    ).toBe(true);
    expect(state.cleanup).toHaveBeenCalledTimes(2);
    expect(state.unregister).toHaveBeenCalledOnce();
  });
  it.each([0, 1])(
    "preserves check exit %s and safe unavailable marker without raw diagnostics",
    async (exit) => {
      state.telemetryUnavailable = true;
      state.oracleStatus = exit;
      await run();
      const checks = JSON.parse(state.output).checks.filter(
        (c: { id: string }) => c.id.startsWith("team-permissions-"),
      );
      expect(checks).toHaveLength(3);
      for (const check of checks) {
        expect(check).toMatchObject({
          exitCode: exit,
          status: exit === 0 ? "pass" : "fail",
        });
        expect(check.detail).toBe(
          "Protected team oracle process observed; private diagnostics withheld. Authorization telemetry unavailable.",
        );
        expect(check.detail).not.toContain("Synthetic protected transport");
      }
    },
  );
  it("keeps baseline grading at five checks without requiring a private package", async () => {
    const input = JSON.parse(state.input);
    delete input.evaluationProfile;
    state.input = JSON.stringify(input);
    state.packageAvailable = false;
    await run();
    expect(
      JSON.parse(state.output)
        .checks.map((check: { id: string }) => check.id)
        .sort(),
    ).toEqual([...baselineCheckIds].sort());
    expect(state.commands.some((item) => item.args.includes("rpc-team"))).toBe(
      false,
    );
  });
  it("refuses missing package or malformed/wrong profile before registration or commands", async () => {
    state.packageAvailable = false;
    await expect(run()).rejects.toThrow("package unavailable");
    expect(state.register).not.toHaveBeenCalled();
    expect(state.commands).toEqual([]);
    expect(state.copies).toEqual([]);
  });
  it("rejects candidate digest substitution before private-package access or execution", async () => {
    const input = JSON.parse(state.input);
    input.evaluatedTreeSha256 = "0".repeat(64);
    state.input = JSON.stringify(input);
    await expect(run()).rejects.toThrow("Candidate identity");
    expect(state.commands).toEqual([]);
    expect(state.register).not.toHaveBeenCalled();
  });
  it("refuses a report when private installation freshness changes during grading", async () => {
    state.drift = true;
    await expect(run()).rejects.toThrow("changed during grading");
    expect(state.output).toBe("");
    expect(state.cleanup).toHaveBeenCalled();
  });
  it("retains a timed-out future observation as incomplete and cleans its worker", async () => {
    state.timeoutCheck = "team-permissions-http";
    await run();
    expect(
      JSON.parse(state.output).checks.find(
        (item: { id: string }) => item.id === state.timeoutCheck,
      ),
    ).toMatchObject({ status: "error", exitCode: null });
    expect(state.cleanup).toHaveBeenCalledTimes(2);
    expect(state.unregister).toHaveBeenCalledOnce();
  });
  it("cancels before further worker launches and emits no publishable report", async () => {
    state.interrupt = "team-permissions-domain";
    await expect(run()).rejects.toThrow("cancelled");
    expect(state.output).toBe("");
    expect(state.cleanup).toHaveBeenCalled();
    expect(state.unregister).toHaveBeenCalledOnce();
    expect(
      state.commands.filter(
        (item) => item.args[0] === "run" && item.args.at(-1) === "rpc-team",
      ),
    ).toHaveLength(1);
  });
  it("refuses publication when a worker removal fails while still requesting run-scoped cleanup", async () => {
    state.failCleanup = true;
    await expect(run()).rejects.toThrow("cleanup failed");
    expect(state.output).toBe("");
    expect(state.cleanup).toHaveBeenCalled();
    expect(state.unregister).toHaveBeenCalledOnce();
  });
});
