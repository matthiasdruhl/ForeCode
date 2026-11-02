import type { ProcessResult } from "../runner/process";

// A timed-out metadata read can be repeated without replaying a mutation or a
// provider call. The original absolute signal remains in force for both tries.
export async function runTeamPolicyRead(input: {
  args: readonly string[];
  roles: readonly string[];
  body?: string;
  milliseconds: number;
  signal: AbortSignal;
  recheck(ordinal: number): Promise<void>;
  execute(milliseconds: number): Promise<ProcessResult>;
  observe(result: ProcessResult, milliseconds: number): Promise<void>;
}) {
  const policyRead =
    input.body === undefined &&
    input.args.length === 4 &&
    input.args[0] === "policy" &&
    input.args[1] === "ls" &&
    input.roles.includes(input.args[2]!) &&
    input.args[3] === "--json";
  const milliseconds = policyRead
    ? Math.max(60_000, input.milliseconds)
    : input.milliseconds;
  for (let ordinal = 0; ordinal < (policyRead ? 2 : 1); ordinal++) {
    await input.recheck(ordinal);
    input.signal.throwIfAborted();
    const result = await input.execute(milliseconds);
    await input.observe(result, milliseconds);
    if (
      !policyRead ||
      ordinal !== 0 ||
      result.reason !== "timed_out" ||
      input.signal.aborted
    )
      return result;
  }
  throw new Error("Finite policy-read attempts exhausted.");
}
