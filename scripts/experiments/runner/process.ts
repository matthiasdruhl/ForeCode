import { spawn } from "node:child_process";

export type ProcessResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  reason:
    "completed" | "timed_out" | "cancelled" | "output_limit" | "spawn_error";
  stdout: string;
  stderr: string;
  elapsedMs: number;
};
// Fixed executable/argument arrays are selected by the trusted adapter only.
export async function boundedProcess(
  executable: string,
  args: readonly string[],
  options: {
    milliseconds: number;
    maxBytes: number;
    signal?: AbortSignal;
    input?: string;
  },
): Promise<ProcessResult> {
  const start = Date.now();
  if (options.signal?.aborted)
    return {
      exitCode: null,
      signal: null,
      reason: "cancelled",
      stdout: "",
      stderr: "",
      elapsedMs: 0,
    };
  return new Promise((resolve) => {
    let reason: ProcessResult["reason"] = "completed";
    let used = 0;
    const out: Buffer[] = [],
      err: Buffer[] = [];
    const child = spawn(executable, [...args], {
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        NODE_ENV: "production",
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        HOME: process.env.HOME,
      },
    });
    let escalation: ReturnType<typeof setTimeout> | undefined;
    function kill(signal: NodeJS.Signals) {
      if (child.pid) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* already gone */
        }
      }
    }
    function stop(cause: ProcessResult["reason"]) {
      if (reason !== "completed") return;
      reason = cause;
      kill("SIGTERM");
      escalation = setTimeout(() => kill("SIGKILL"), 100);
    }
    function collect(target: Buffer[], bytes: Buffer) {
      const remaining = Math.max(0, options.maxBytes - used);
      target.push(bytes.subarray(0, remaining));
      used += bytes.length;
      if (used > options.maxBytes) stop("output_limit");
    }
    child.stdout.on("data", (bytes: Buffer) => collect(out, bytes));
    child.stderr.on("data", (bytes: Buffer) => collect(err, bytes));
    const timer = setTimeout(() => stop("timed_out"), options.milliseconds);
    const abort = () => stop("cancelled");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdin.on("error", () => {
      /* a closed guest input is reflected in exit */
    });
    child.stdin.end(options.input);
    child.on("error", () => {
      reason = "spawn_error";
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (escalation) clearTimeout(escalation);
      // Also reap descendants whose parent exited before them.
      kill("SIGKILL");
      options.signal?.removeEventListener("abort", abort);
      resolve({
        exitCode,
        signal,
        reason,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        elapsedMs: Date.now() - start,
      });
    });
  });
}
