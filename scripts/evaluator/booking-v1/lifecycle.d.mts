export const runLabel: string;
export function validRun(runId: string): void;
export function cleanupOwned(
  runId: string,
): Promise<{ runId: string; removed: number; remaining: number }>;

export function registerController(runId: string): Promise<void>;
export function unregisterController(runId: string): Promise<void>;
