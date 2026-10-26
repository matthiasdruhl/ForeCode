// Trusted controller process primitive; never accepts candidate-selected commands.
import { spawn } from "node:child_process";
export function command(
  executable,
  args,
  { input, milliseconds = 5000, maxBytes = 1048576, signal } = {},
) {
  return new Promise((resolve) => {
    const started = Date.now();
    if (signal?.aborted)
      return resolve({
        status: null,
        signal: null,
        reason: "cancelled",
        stdout: "",
        stderr: "",
        elapsedMs: 0,
      });
    const child = spawn(executable, args, {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });
    let reason = "completed",
      used = 0,
      escalation;
    const out = [],
      err = [];
    const kill = (sig) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        /* exited */
      }
    };
    const stop = (why) => {
      if (reason !== "completed") return;
      reason = why;
      kill("SIGTERM");
      escalation = setTimeout(() => kill("SIGKILL"), 100);
    };
    const collect = (target, bytes) => {
      target.push(bytes.subarray(0, Math.max(0, maxBytes - used)));
      used += bytes.length;
      if (used > maxBytes) stop("output_limit");
    };
    child.stdout.on("data", (bytes) => collect(out, bytes));
    child.stderr.on("data", (bytes) => collect(err, bytes));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("error", () => {
      reason = "spawn_error";
    });
    const timer = setTimeout(() => stop("timed_out"), milliseconds);
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    child.on("close", (status, sig) => {
      clearTimeout(timer);
      clearTimeout(escalation);
      kill("SIGKILL");
      signal?.removeEventListener("abort", abort);
      resolve({
        status,
        signal: sig,
        reason,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
        elapsedMs: Date.now() - started,
      });
    });
  });
}
export const successful = (p) =>
  p.reason === "completed" && p.status === 0 && !p.signal;
