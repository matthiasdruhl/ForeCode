// SYNTHETIC development protocol data only. Never admitted as runtime evidence.
import { sha256 } from "../../src/lib/report/digests";
import {
  lifecycleCases,
  lifecycleRequestDigest,
  sentinelSha256,
  type LifecycleRequest,
} from "../../scripts/evaluator/booking-v1/lifecycle-protocol.mjs";
export function syntheticLifecycleReport(input: LifecycleRequest) {
  const observation = {
    status: 0,
    signal: null,
    reason: "completed",
    elapsedMs: 1,
    capturedOutputBytes: 100,
    stdoutSha256: sha256("SYNTHETIC"),
    stderrSha256: sha256(""),
  };
  return {
    schemaVersion: "booking-lifecycle-observation.v1",
    suiteId: input.suiteId,
    implementationSha256: input.implementationSha256,
    workerImage: input.workerImage,
    requestSha256: lifecycleRequestDigest(input),
    cleanupConfirmed: true,
    failure: null,
    cases: lifecycleCases.map((id) => {
      const heartbeat = [
        "timeout",
        "sigint",
        "sigterm",
        "detached-descendant",
        "cleanup-refusal",
      ].includes(id)
        ? [1, 2]
        : null;
      const sentSignal =
        id === "sigint"
          ? "SIGINT"
          : ["sigterm", "cleanup-refusal"].includes(id)
            ? "SIGTERM"
            : id === "detached-descendant"
              ? "SIGKILL"
              : null;
      const worker = {
        ...observation,
        status:
          id === "worker-failure"
            ? 7
            : ["sigint", "sigterm", "cleanup-refusal", "output-limit"].includes(
                  id,
                )
              ? null
              : 0,
        reason:
          id === "output-limit"
            ? "output_limit"
            : ["sigint", "sigterm", "cleanup-refusal"].includes(id)
              ? "cancelled"
              : "completed",
        capturedOutputBytes: id === "output-limit" ? 4096 : 100,
      };
      return {
        id,
        runId: input.runs[id],
        status: "observed",
        transport: {
          ...observation,
          status: ["timeout", "detached-descendant"].includes(id) ? null : 0,
          reason: id === "timeout" ? "timed_out" : "completed",
          signal: ["timeout", "detached-descendant"].includes(id)
            ? "SIGKILL"
            : null,
        },
        driver: ["timeout", "detached-descendant"].includes(id)
          ? null
          : {
              schemaVersion: "booking-lifecycle-driver.v1",
              runId: input.runs[id],
              receivedSignal: sentSignal,
              worker,
            },
        heartbeat,
        sentSignal,
        cleanupRefused: id === "cleanup-refusal",
        sourceBeforeSha256: sentinelSha256,
        sourceAfterSha256: sentinelSha256,
        recovered: true,
        failure: null,
      };
    }),
  };
}
