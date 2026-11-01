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

// Separate additive private diagnostics. V1 observations and public error
// envelopes retain their original grammar. Never copy an error or Zod issue.
const privateIssueCodes = [
  "invalid_type",
  "too_big",
  "too_small",
  "invalid_format",
  "not_multiple_of",
  "unrecognized_keys",
  "invalid_union",
  "invalid_key",
  "invalid_element",
  "invalid_value",
  "custom",
  "OTHER",
] as const;
const privateErrorClasses = [
  "ZOD_ERROR",
  "REQUEST_FAILURE",
  "SYNTAX_ERROR",
  "TYPE_ERROR",
  "RANGE_ERROR",
  "ERROR",
  "UNKNOWN",
] as const;
export const ScientistPrivateFailureDiagnosticSchema = z
  .strictObject({
    schemaVersion: z.literal("scientist-private-failure-diagnostic.local.v2"),
    stage: z.enum(["content_parse", "response_mapping", "flow_validation"]),
    step: z.enum(["propose", "hypothesize", "challenge"]),
    at: UtcTimestampSchema,
    payloadSha256: Sha256Schema.nullable(),
    errorClass: z.enum(privateErrorClasses),
    issueCount: z.number().int().min(0).max(64),
    issuesTruncated: z.boolean(),
    issueCodes: z
      .array(
        z.strictObject({
          code: z.enum(privateIssueCodes),
          count: z.number().int().min(1).max(64),
        }),
      )
      .max(privateIssueCodes.length),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.issueCodes.map((item) => item.code)).size !==
        value.issueCodes.length ||
      value.issueCodes.reduce((sum, item) => sum + item.count, 0) !==
        value.issueCount ||
      (value.issuesTruncated && value.issueCount !== 64) ||
      (value.errorClass !== "ZOD_ERROR" &&
        (value.issueCount !== 0 || value.issuesTruncated))
    )
      ctx.addIssue({ code: "custom", message: "Invalid diagnostic counts" });
  });
export type ScientistPrivateFailureDiagnostic = z.infer<
  typeof ScientistPrivateFailureDiagnosticSchema
>;
export type ScientistPrivateFailureObserver = (
  diagnostic: Readonly<ScientistPrivateFailureDiagnostic>,
) => void | Promise<void>;
type PrivateFailureContext = Pick<
  ScientistPrivateFailureDiagnostic,
  "stage" | "step" | "at" | "payloadSha256"
>;
function privateErrorSummary(error: unknown) {
  const empty = {
    issueCount: 0,
    issuesTruncated: false,
    issueCodes: [] as ScientistPrivateFailureDiagnostic["issueCodes"],
  };
  try {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      if (!Array.isArray(issues)) return { ...empty, errorClass: "UNKNOWN" };
      const count = Math.min(issues.length, 64);
      const histogram = new Map<(typeof privateIssueCodes)[number], number>();
      for (let index = 0; index < count; index++) {
        let code: (typeof privateIssueCodes)[number] = "OTHER";
        try {
          const candidate: unknown = issues[index]?.code;
          if (typeof candidate === "string")
            code =
              privateIssueCodes.find((known) => known === candidate) ?? "OTHER";
        } catch {
          // A malformed issue must not escape or expose any of its values.
        }
        histogram.set(code, (histogram.get(code) ?? 0) + 1);
      }
      return {
        errorClass: "ZOD_ERROR",
        issueCount: count,
        issuesTruncated: issues.length > count,
        issueCodes: privateIssueCodes.flatMap((code) => {
          const count = histogram.get(code);
          return count ? [{ code, count }] : [];
        }),
      };
    }
    const errorClass =
      error instanceof RequestFailure
        ? "REQUEST_FAILURE"
        : error instanceof SyntaxError
          ? "SYNTAX_ERROR"
          : error instanceof TypeError
            ? "TYPE_ERROR"
            : error instanceof RangeError
              ? "RANGE_ERROR"
              : error instanceof Error
                ? "ERROR"
                : "UNKNOWN";
    return { ...empty, errorClass };
  } catch {
    // Even a hostile prototype/issue accessor has no effect on the failure.
    return { ...empty, errorClass: "UNKNOWN" };
  }
}
export function observeScientistPrivateFailure(
  observer: ScientistPrivateFailureObserver | undefined,
  context: PrivateFailureContext,
  error: unknown,
): void {
  // A trusted observer requiring durable journaling must finish that work
  // synchronously. Promise settlement is contained, not awaited by the flow.
  if (!observer) return;
  try {
    const diagnostic = ScientistPrivateFailureDiagnosticSchema.parse({
      schemaVersion: "scientist-private-failure-diagnostic.local.v2",
      ...context,
      ...privateErrorSummary(error),
    });
    diagnostic.issueCodes.forEach(Object.freeze);
    Object.freeze(diagnostic.issueCodes);
    const pending = observer(Object.freeze(diagnostic));
    if (pending) void Promise.resolve(pending).catch(() => {});
  } catch {
    // Private diagnostics grant no validity, retry or authorization authority.
  }
}
