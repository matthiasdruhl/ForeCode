import "server-only";
import { z } from "zod";
import { Sha256Schema, UtcTimestampSchema } from "@/lib/contracts/common";
import { RequestFailure } from "../http/errors";
import { ApiErrorCodeSchema } from "@/lib/contracts/errors";

// Trusted private composition only. Never serialize exceptions, provider text,
// headers, schema paths/unknown keys, credentials, or prompts into this channel.
export const ScientistFailureObservationSchema = z.strictObject({
  schemaVersion: z.literal("scientist-failure-observation.local.v1"),
  layer: z.enum(["transport", "flow", "operator"]),
  stage: z.enum([
    "configuration",
    "request",
    "limits",
    "fetch",
    "response",
    "envelope",
    "identity_usage",
    "revalidation",
    "content_json",
    "reference",
    "content_schema",
    "flow_validation",
    "continuation",
    "initial_custody",
  ]),
  step: z.enum([
    "propose",
    "hypothesize",
    "challenge",
    "interpret-evidence",
    "register",
  ]),
  at: UtcTimestampSchema,
  payloadSha256: Sha256Schema.nullable(),
  code: ApiErrorCodeSchema,
  httpStatus: z.number().int().min(100).max(599).optional(),
});
export type ScientistFailureObservation = z.infer<
  typeof ScientistFailureObservationSchema
>;
export type ScientistFailureObserver = (
  observation: Readonly<ScientistFailureObservation>,
) => void | Promise<void>;
export function scientistFailureCode(
  error: unknown,
): ScientistFailureObservation["code"] {
  return error instanceof RequestFailure ? error.code : "INTERNAL_ERROR";
}
// Observers cannot replace the original failure or interfere with cleanup.
// Synchronous trusted callbacks can durably journal metadata before returning.
export function observeScientistFailure(
  observer: ScientistFailureObserver | undefined,
  observation: ScientistFailureObservation,
): void {
  if (!observer) return;
  try {
    const parsed = ScientistFailureObservationSchema.parse(observation);
    const pending = observer(Object.freeze(parsed));
    if (pending) void Promise.resolve(pending).catch(() => {});
  } catch {
    // This diagnostic channel grants no validity, retry, or approval authority.
  }
}
