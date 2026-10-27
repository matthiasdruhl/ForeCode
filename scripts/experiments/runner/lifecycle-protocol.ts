import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Sha256Schema } from "../../../src/lib/contracts/common";
import {
  lifecycleCases,
  lifecycleRequestDigest,
  sentinelSha256,
  type LifecycleRequest,
} from "../../evaluator/booking-v1/lifecycle-protocol.mjs";
export { lifecycleCases, type LifecycleRequest };
const summary = z.strictObject({
  status: z.number().int().min(0).max(255).nullable(),
  signal: z.enum(["SIGTERM", "SIGINT", "SIGKILL"]).nullable(),
  reason: z.enum([
    "completed",
    "timed_out",
    "cancelled",
    "output_limit",
    "spawn_error",
  ]),
  elapsedMs: z.number().int().min(0).max(120000),
  capturedOutputBytes: z.number().int().min(0).max(8192),
  stdoutSha256: Sha256Schema,
  stderrSha256: Sha256Schema,
});
const driver = z.strictObject({
  schemaVersion: z.literal("booking-lifecycle-driver.v1"),
  runId: z.string().uuid(),
  receivedSignal: z.enum(["SIGINT", "SIGTERM"]).nullable(),
  worker: summary,
});
export const LifecycleReportSchema = z.strictObject({
  schemaVersion: z.literal("booking-lifecycle-observation.v1"),
  suiteId: z.string().uuid(),
  implementationSha256: Sha256Schema,
  workerImage: z.string(),
  requestSha256: Sha256Schema,
  cleanupConfirmed: z.boolean(),
  failure: z.string().max(200).nullable(),
  cases: z
    .array(
      z.strictObject({
        id: z.enum(lifecycleCases),
        runId: z.string().uuid(),
        status: z.enum(["observed", "error"]),
        transport: summary.nullable(),
        driver: driver.nullable(),
        heartbeat: z
          .tuple([z.number().int().positive(), z.number().int().positive()])
          .nullable(),
        sentSignal: z.enum(["SIGINT", "SIGTERM", "SIGKILL"]).nullable(),
        cleanupRefused: z.boolean(),
        sourceBeforeSha256: Sha256Schema,
        sourceAfterSha256: Sha256Schema,
        recovered: z.boolean(),
        failure: z.string().max(200).nullable(),
      }),
    )
    .max(lifecycleCases.length),
});
export function createLifecycleRequest(
  suiteId: string,
  implementationSha256: string,
  workerImage: string,
): LifecycleRequest {
  return {
    schemaVersion: "booking-lifecycle-request.v1",
    suiteId,
    implementationSha256,
    workerImage,
    runs: Object.fromEntries(
      lifecycleCases.map((id) => [id, randomUUID()]),
    ) as LifecycleRequest["runs"],
  };
}
export function validateLifecycleReport(
  raw: unknown,
  expected: LifecycleRequest,
) {
  const report = LifecycleReportSchema.parse(raw);
  if (
    report.suiteId !== expected.suiteId ||
    report.implementationSha256 !== expected.implementationSha256 ||
    report.workerImage !== expected.workerImage ||
    report.requestSha256 !== lifecycleRequestDigest(expected)
  )
    throw new Error("Wrong or stale lifecycle observation");
  if (!report.cleanupConfirmed || report.failure !== null)
    throw new Error("Lifecycle cleanup incomplete");
  if (
    report.cases.length !== lifecycleCases.length ||
    new Set(report.cases.map((c) => c.id)).size !== lifecycleCases.length
  )
    throw new Error("Missing lifecycle cases");
  for (const row of report.cases) {
    if (
      row.runId !== expected.runs[row.id] ||
      row.status !== "observed" ||
      row.failure !== null ||
      !row.recovered ||
      row.sourceBeforeSha256 !== sentinelSha256 ||
      row.sourceAfterSha256 !== sentinelSha256 ||
      !row.transport
    )
      throw new Error("Lifecycle identity, termination or source check failed");
    const p = row.transport,
      worker = row.driver?.worker;
    const normalTransport =
      p.reason === "completed" && p.status === 0 && p.signal === null;
    if (row.driver && row.driver.runId !== row.runId)
      throw new Error("Wrong lifecycle driver");
    if (row.cleanupRefused !== (row.id === "cleanup-refusal"))
      throw new Error("Unexpected cleanup fault evidence");
    const active = [
      "timeout",
      "sigint",
      "sigterm",
      "detached-descendant",
      "cleanup-refusal",
    ].includes(row.id);
    if (active && (!row.heartbeat || row.heartbeat[1] <= row.heartbeat[0]))
      throw new Error("Missing running descendant observation");
    if (!active && row.heartbeat !== null)
      throw new Error("Unexpected heartbeat observation");
    if (p.signal !== null && p.status !== null)
      throw new Error("Invalid observed exit/signal pair");
    if (row.id === "timeout") {
      if (
        p.reason !== "timed_out" ||
        p.signal !== "SIGKILL" ||
        p.status !== null ||
        row.driver !== null ||
        row.sentSignal !== null
      )
        throw new Error("Timeout not observed");
    } else if (row.id === "detached-descendant") {
      if (
        p.reason !== "completed" ||
        p.status !== null ||
        p.signal !== "SIGKILL" ||
        row.sentSignal !== "SIGKILL" ||
        row.driver !== null
      )
        throw new Error("Detached driver interruption not observed");
    } else {
      if (!normalTransport || !worker || !row.driver)
        throw new Error("Missing protected driver observation");
      if (row.id === "normal-exit" || row.id === "worker-failure") {
        if (
          worker.reason !== "completed" ||
          worker.signal !== null ||
          worker.status !== (row.id === "normal-exit" ? 0 : 7) ||
          row.sentSignal !== null ||
          row.driver.receivedSignal !== null
        )
          throw new Error("Worker exit not observed");
      } else if (row.id === "output-limit") {
        if (
          worker.reason !== "output_limit" ||
          worker.capturedOutputBytes < 1 ||
          worker.capturedOutputBytes > 4096 ||
          row.sentSignal !== null ||
          row.driver.receivedSignal !== null
        )
          throw new Error("Output cap not observed");
      } else {
        const sig = row.id === "sigint" ? "SIGINT" : "SIGTERM";
        if (
          row.sentSignal !== sig ||
          row.driver.receivedSignal !== sig ||
          worker.reason !== "cancelled"
        )
          throw new Error("Signal cancellation not observed");
      }
    }
  }
  return report;
}
export function validateRestartCleanup(
  raw: unknown,
  runIds: readonly string[],
) {
  const value = z
    .object({
      touched: z.literal(true),
      restartChecked: z.literal(true),
      absentRunIds: z.array(z.string().uuid()),
      observations: z.array(z.unknown()),
    })
    .parse(raw);
  if (
    new Set(value.absentRunIds).size !== runIds.length ||
    value.absentRunIds.length !== runIds.length ||
    runIds.some((id) => !value.absentRunIds.includes(id))
  )
    throw new Error("Restart absence evidence missing");
  return value;
}

export function validateRestartObservation(raw: unknown, runId: string) {
  const observed = z
    .strictObject({
      runId: z.string().uuid(),
      removed: z.literal(0),
      remaining: z.literal(0),
      controllerRecovered: z.literal(false),
    })
    .parse(raw);
  if (observed.runId !== runId)
    throw new Error("Restart observation run mismatch");
  return observed;
}
