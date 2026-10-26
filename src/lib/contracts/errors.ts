import { z } from "zod";
import { IdSchema } from "./common";

export const ApiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "INVALID_REFERENCE",
  "UNSUPPORTED_OPERATION",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "UNTRUSTED_EVIDENCE",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.strictObject({
  schemaVersion: z.literal("api-error.v1"),
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z.string().min(1).max(400),
    requestId: IdSchema,
    retryable: z.boolean(),
  }),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
