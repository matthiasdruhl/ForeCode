import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Test-only liveness check. kill(pid, 0) tests PID existence/permissions; Linux
// can keep a dead child as a zombie until its new parent reaps it.
// https://man7.org/linux/man-pages/man2/kill.2.html
// https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html
export function linuxProcessIsTerminated(stat: string) {
  const end = stat.lastIndexOf(")");
  const state = stat
    .slice(end + 1)
    .trim()
    .split(/\s+/)[0];
  if (
    !/^\d+ \(/.test(stat) ||
    end < 0 ||
    !state ||
    !/^[RSDZTtWXxKPI]$/.test(state)
  )
    throw new Error("Invalid process state observation");
  // Sleeping/stopped/traced processes are still live and must fail the check.
  return ["Z", "X", "x"].includes(state);
}
export async function awaitProcessTermination(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw new Error("Invalid child process identity");
  const deadline = Date.now() + 1500;
  do {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
    if (process.platform === "linux") {
      try {
        if (
          linuxProcessIsTerminated(await readFile(`/proc/${pid}/stat`, "utf8"))
        )
          return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    }
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error("Descendant remains live after bounded termination wait");
}
