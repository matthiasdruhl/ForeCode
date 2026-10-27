// Fixed local protocol, separate from frozen application receipt/check contracts.
import { createHash } from "node:crypto";
import { validRun } from "./lifecycle.mjs";
export const lifecycleCases = Object.freeze([
  "normal-exit",
  "worker-failure",
  "timeout",
  "sigint",
  "sigterm",
  "output-limit",
  "detached-descendant",
  "cleanup-refusal",
]);
export const lifecycleModes = Object.freeze({
  "normal-exit": "complete",
  "worker-failure": "fail",
  timeout: "hang",
  sigint: "hang",
  sigterm: "hang",
  "output-limit": "flood",
  "detached-descendant": "detached",
  "cleanup-refusal": "hang",
});
export const sentinel = "FORECODE-HARMLESS-READONLY-EXPORT\n";
export const sentinelSha256 = createHash("sha256")
  .update(sentinel)
  .digest("hex");
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function validateLifecycleRequest(input) {
  if (
    !input ||
    Object.keys(input).sort().join() !==
      [
        "schemaVersion",
        "suiteId",
        "implementationSha256",
        "workerImage",
        "runs",
      ]
        .sort()
        .join() ||
    input.schemaVersion !== "booking-lifecycle-request.v1" ||
    !/^[a-f0-9]{64}$/.test(input.implementationSha256) ||
    !/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/.test(
      input.workerImage,
    )
  )
    throw new Error("Invalid lifecycle request");
  validRun(input.suiteId);
  if (
    !input.runs ||
    Object.keys(input.runs).sort().join() !== [...lifecycleCases].sort().join()
  )
    throw new Error("Invalid fixed lifecycle cases");
  const ids = [input.suiteId, ...lifecycleCases.map((id) => input.runs[id])];
  for (const id of ids) validRun(id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate lifecycle identity");
  return input;
}
export function lifecycleRequestDigest(input) {
  validateLifecycleRequest(input);
  return digest(
    JSON.stringify([
      input.schemaVersion,
      input.suiteId,
      input.implementationSha256,
      input.workerImage,
      ...lifecycleCases.map((id) => [id, input.runs[id]]),
    ]),
  );
}
export function processSummary(p) {
  return {
    status: p.status,
    signal: p.signal,
    reason: p.reason,
    elapsedMs: p.elapsedMs,
    capturedOutputBytes:
      Buffer.byteLength(p.stdout) + Buffer.byteLength(p.stderr),
    stdoutSha256: digest(p.stdout),
    stderrSha256: digest(p.stderr),
  };
}
