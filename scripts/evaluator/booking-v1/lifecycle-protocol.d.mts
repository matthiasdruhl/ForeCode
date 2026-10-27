import type { Observation } from "./runtime.mjs";
export const lifecycleCases: readonly [
  "normal-exit",
  "worker-failure",
  "timeout",
  "sigint",
  "sigterm",
  "output-limit",
  "detached-descendant",
  "cleanup-refusal",
];
export const lifecycleModes: Readonly<
  Record<(typeof lifecycleCases)[number], string>
>;
export const sentinel: string;
export const sentinelSha256: string;
export function digest(bytes: string | Buffer): string;
export type LifecycleRequest = {
  schemaVersion: "booking-lifecycle-request.v1";
  suiteId: string;
  implementationSha256: string;
  workerImage: string;
  runs: Record<(typeof lifecycleCases)[number], string>;
};
export function validateLifecycleRequest(input: unknown): LifecycleRequest;
export function lifecycleRequestDigest(input: LifecycleRequest): string;
export function processSummary(input: Observation): {
  status: number | null;
  signal: NodeJS.Signals | null;
  reason: string;
  elapsedMs: number;
  capturedOutputBytes: number;
  stdoutSha256: string;
  stderrSha256: string;
};
