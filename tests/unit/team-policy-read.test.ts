import { describe, expect, it } from "vitest";
import { runTeamPolicyRead } from "../../scripts/experiments/tournament/team-policy-read";
import type { ProcessResult } from "../../scripts/experiments/runner/process";
const timedOut: ProcessResult = {
  exitCode: null,
  signal: "SIGTERM",
  reason: "timed_out",
  stdout: "partial metadata",
  stderr: "",
  elapsedMs: 60_000,
};
const complete: ProcessResult = {
  exitCode: 0,
  signal: null,
  reason: "completed",
  stdout: '{"rules":[]}',
  stderr: "",
  elapsedMs: 1,
};
function fixture(
  args = ["policy", "ls", "forecode-team-grader", "--json"],
  body?: string,
) {
  const controller = new AbortController(),
    limits: number[] = [],
    observations: ProcessResult[] = [],
    checks: number[] = [];
  let execute: (limit: number) => Promise<ProcessResult> = async () => complete;
  let recheck: (ordinal: number) => Promise<void> = async () => {};
  return {
    controller,
    limits,
    observations,
    checks,
    setExecute(fn: typeof execute) {
      execute = fn;
    },
    setRecheck(fn: typeof recheck) {
      recheck = fn;
    },
    run: () =>
      runTeamPolicyRead({
        args,
        body,
        roles: ["forecode-team-agent", "forecode-team-grader"],
        signal: controller.signal,
        milliseconds: 30_000,
        recheck: async (ordinal) => {
          checks.push(ordinal);
          await recheck(ordinal);
        },
        execute: async (limit) => {
          limits.push(limit);
          return execute(limit);
        },
        observe: async (result) => {
          observations.push(result);
        },
      }),
  };
}
describe("bounded read-only team policy metadata", () => {
  it("retains a timed-out read, rechecks custody and uses only the fresh complete reply", async () => {
    const f = fixture();
    f.setExecute(async () => (f.limits.length === 1 ? timedOut : complete));
    expect(await f.run()).toBe(complete);
    expect(f.limits).toEqual([60000, 60000]);
    expect(f.checks).toEqual([0, 1]);
    expect(f.observations).toEqual([timedOut, complete]);
  });
  it("stops after two timeouts without a third command", async () => {
    const f = fixture();
    f.setExecute(async () => timedOut);
    expect(await f.run()).toBe(timedOut);
    expect(f.limits).toHaveLength(2);
    expect(f.observations).toEqual([timedOut, timedOut]);
  });
  it.each([
    ["policy", "add", "forecode-team-grader", "--json"],
    ["policy", "rm", "forecode-team-grader", "--json"],
    ["policy", "ls", "foreign-role", "--json"],
    ["exec", "forecode-team-grader", "true"],
    ["policy", "ls", "forecode-team-grader", "--json", "extra"],
  ])("never retries other commands: %j", async (...args) => {
    const f = fixture(args);
    f.setExecute(async () => timedOut);
    expect(await f.run()).toBe(timedOut);
    expect(f.limits).toEqual([30000]);
  });
  it("refuses replay when input accompanies the command", async () => {
    const f = fixture(undefined, "payload");
    f.setExecute(async () => timedOut);
    await f.run();
    expect(f.limits).toEqual([30000]);
  });
  it("does not retry cancellation or a complete nonzero response", async () => {
    for (const result of [
      { ...timedOut, reason: "cancelled" as const },
      { ...complete, exitCode: 1 },
    ]) {
      const f = fixture();
      f.setExecute(async () => result);
      expect(await f.run()).toBe(result);
      expect(f.limits).toHaveLength(1);
    }
  });
  it("keeps the same absolute abort signal and stops before retry after cancellation", async () => {
    const f = fixture();
    f.setExecute(async () => {
      f.controller.abort();
      return timedOut;
    });
    await f.run();
    expect(f.limits).toHaveLength(1);
    expect(f.observations).toEqual([timedOut]);
  });
  it("rejects changed lease/source/CLI before a second command", async () => {
    const f = fixture();
    f.setExecute(async () => timedOut);
    f.setRecheck(async (n) => {
      if (n === 1) throw Error("custody changed");
    });
    await expect(f.run()).rejects.toThrow("custody changed");
    expect(f.limits).toHaveLength(1);
    expect(f.observations).toEqual([timedOut]);
  });
});
