export const runLabel: string;
export function validRun(runId: string): void;
export function cleanupOwned(
  runId: string,
  options?: { probeRefusal?: boolean },
): Promise<{ runId: string; removed: number; remaining: number }>;

export function registerController(
  runId: string,
  kind?: "grade" | "lifecycle-driver" | "lifecycle-suite",
): Promise<void>;
export function unregisterController(runId: string): Promise<void>;

export function recoverOwned(
  runId: string,
  options?: { skipController?: boolean },
): Promise<{
  runId: string;
  removed: number;
  remaining: number;
  controllerRecovered: boolean;
}>;
export function assertAbsent(
  runId: string,
): Promise<{ runId: string; remaining: number; controllerAbsent: true }>;

export function signalOwnedDriver(
  runId: string,
  expectedPid: number,
  signal: "SIGINT" | "SIGTERM" | "SIGKILL",
): Promise<void>;
