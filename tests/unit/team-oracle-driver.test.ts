import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamGradeData } from "../support/team-grade-data";
import ts from "typescript";
import { publicBoundaryDiagnostics } from "../../scripts/experiments/agent/team-public-boundary.mjs";

// Reviewed driver only, with inert synthetic private-module and Docker seams.
const state = vi.hoisted(() => ({
  input: "",
  output: "",
  diagnostics: "",
  outcome: "pass",
  authorizationAvailable: true,
  calls: [] as string[],
  privateKinds: [] as string[],
  authorizationIdentities: [] as unknown[],
  argv: [] as string[],
  exit: undefined as typeof process.exitCode,
}));
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
  };
});
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(
    (_command: string, args: string[], options: { input: string }) => {
      state.calls.push(options.input);
      expect(args).toContain("/bridge/client.mjs");
      return { status: 0, signal: null, stdout: '{"result":"1"}', stderr: "" };
    },
  ),
}));
vi.mock("../../scripts/evaluator/booking-v1/team-installation", () => ({
  runInstalledTeamCheck: vi.fn(
    async (
      kind: string,
      _profile: unknown,
      rpc: (input: unknown) => unknown,
      authorizationIdentity?: unknown,
      reportAvailability?: (available: boolean) => void,
    ) => {
      reportAvailability?.(state.authorizationAvailable);
      state.privateKinds.push(kind);
      state.authorizationIdentities.push(authorizationIdentity);
      if (state.outcome === "assert") {
        const { AssertionError } = await import("node:assert");
        throw new AssertionError({
          message:
            "synthetic private expectation must stay out of observations",
        });
      }
      if (state.outcome === "error")
        throw new Error("synthetic missing export/package/runtime");
      if (state.outcome === "unsupported") rpc({ op: "exec", command: "no" });
      else expect(rpc({ op: "team-new" })).toBe("1");
    },
  ),
}));
beforeEach(() => {
  vi.resetModules();
  state.output = "";
  state.diagnostics = "";
  state.calls = [];
  state.privateKinds = [];
  state.authorizationIdentities = [];
  state.outcome = "pass";
  state.authorizationAvailable = true;
  state.argv = process.argv;
  state.exit = process.exitCode;
  const data = teamGradeData();
  state.input = JSON.stringify(data.profile);
  process.argv = [
    process.execPath,
    "oracle-driver.ts",
    "team-permissions-domain",
    `forecode-booking-${data.input.runId}-${data.input.runId}`,
  ];
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    state.output += value.toString();
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((value) => {
    state.diagnostics += value.toString();
    return true;
  });
});
afterEach(() => {
  process.argv = state.argv;
  process.exitCode = state.exit;
  vi.restoreAllMocks();
});
const run = () => import("../../scripts/evaluator/booking-v1/oracle-driver");

describe("fixed protected oracle driver; synthetic module/worker transport", () => {
  it.each([
    ['import { value } from "../domain/booking";', true],
    ['const value = await import("../domain/booking");', false],
    ['export * from "node:fs/promises";', false],
    ['import fs from "fs";', false],
    ['import x from "../../evaluator/hidden";', false],
    ['import x from "../../../outside";', false],
    ['require("local");', false],
    ['eval("1");', false],
    ['Function("return 1");', false],
    ['new Function("return 1");', false],
    ['process.getBuiltinModule("fs");', false],
    ['// import("local")\nconst example = "eval(1)";', true],
  ])(
    "matches public boundary feedback to the frozen checker: %s",
    async (source, safe) => {
      const file = "src/server/public-control.ts";
      const diagnostics = publicBoundaryDiagnostics(file, source, ts);
      expect(diagnostics.length === 0).toBe(safe);
      process.argv[2] = "boundary";
      state.input = JSON.stringify([
        { path: file, base64: Buffer.from(source).toString("base64") },
      ]);
      await run();
      expect(process.exitCode).toBe(safe ? 0 : 1);
      expect(state.privateKinds).toEqual([]);
      expect(state.calls).toEqual([]);
    },
  );
  it("returns bounded public file/line diagnostics without source snippets", () => {
    const diagnostics = publicBoundaryDiagnostics(
      "src/server/control.ts",
      '\nawait import("./local");\n'.repeat(40),
      ts,
    );
    expect(diagnostics).toHaveLength(20);
    expect(diagnostics[0]).toEqual({
      file: "src/server/control.ts",
      line: 2,
      column: 7,
      rule: "DYNAMIC_IMPORT_USE_STATIC_IMPORT",
    });
    expect(
      publicBoundaryDiagnostics("notes.json", 'import("local")', ts),
    ).toEqual([]);
  });
  it.each([
    "team-permissions-domain",
    "team-permissions-http",
    "team-permissions-adversarial",
  ])(
    "dispatches %s and sends only behavior requests to the client",
    async (kind) => {
      process.argv[2] = kind;
      await run();
      expect(state.privateKinds).toEqual([kind]);
      expect(process.exitCode).toBe(0);
      expect(state.calls).toEqual(['{"op":"team-new"}']);
      expect(state.calls.join("")).not.toContain("policy");
      expect(state.output).toBe("Protected team check completed.");
      expect(state.diagnostics).toBe("");
    },
  );
  it.each([
    ["assert", 1],
    ["error", 2],
    ["unsupported", 2],
  ] as const)(
    "distinguishes %s from a passing check without disclosing private diagnostics",
    async (outcome, exit) => {
      state.outcome = outcome;
      await run();
      expect(process.exitCode).toBe(exit);
      expect(state.output).toBe("Protected team check did not pass.");
      expect(state.calls).toEqual([]);
      expect(JSON.parse(state.diagnostics)).toMatchObject({
        category: outcome === "assert" ? "assertion" : "runtime",
        teamNewOrdinal: 0,
        rpcOrdinal: 0,
        lastOp: null,
      });
      expect(state.output).not.toContain("synthetic private expectation");
    },
  );
  it.each([
    ["pass", 0],
    ["assert", 1],
    ["error", 2],
  ] as const)(
    "preserves %s verdict while signaling supplementary storage unavailable",
    async (outcome, exit) => {
      state.authorizationAvailable = false;
      state.outcome = outcome;
      await run();
      expect(process.exitCode).toBe(exit);
      expect(state.output).toMatch(/ Authorization telemetry unavailable\.$/);
      expect(state.output).not.toContain("synthetic");
    },
  );
  it("refuses unknown operations and malformed profile input before a transport or private check", async () => {
    process.argv[2] = "arbitrary-command";
    await expect(run()).rejects.toThrow("Invalid oracle operation");
    expect(state.privateKinds).toEqual([]);
    expect(state.calls).toEqual([]);
  });
  it("bounds profile input before private package access", async () => {
    state.input = "x".repeat(8193);
    await expect(run()).rejects.toThrow("input bound");
    expect(state.privateKinds).toEqual([]);
    expect(state.calls).toEqual([]);
  });
  it("carries only the exact trusted grading identity through the private sidecar channel", async () => {
    const data = teamGradeData();
    process.argv[3] = `forecode-booking-${data.identity.runId}-${data.identity.runId}`;
    state.input = JSON.stringify({
      profile: data.profile,
      authorizationIdentity: data.identity,
    });
    await run();
    expect(state.authorizationIdentities).toEqual([data.identity]);
    expect(state.calls).toEqual(['{"op":"team-new"}']);
    expect(state.output).toBe("Protected team check completed.");
    expect(state.output).not.toContain("authorization");
  });
  it.each(["run", "suite"])(
    "rejects a substituted authorization %s before worker/private access",
    async (defect) => {
      const data = teamGradeData();
      process.argv[3] = `forecode-booking-${data.identity.runId}-${data.identity.runId}`;
      if (defect === "run")
        data.identity.runId = "22222222-2222-4222-8222-222222222222";
      else data.identity.testSuiteSha256 = "0".repeat(64);
      state.input = JSON.stringify({
        profile: data.profile,
        authorizationIdentity: data.identity,
      });
      await expect(run()).rejects.toThrow();
      expect(state.calls).toEqual([]);
      expect(state.privateKinds).toEqual([]);
    },
  );
});
