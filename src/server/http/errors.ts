import "server-only";
import { randomUUID } from "node:crypto";
import { ApiErrorSchema, type ApiErrorCode } from "@/lib/contracts/errors";

const statuses: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_REFERENCE: 422,
  UNSUPPORTED_OPERATION: 422,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  UNTRUSTED_EVIDENCE: 422,
  INTERNAL_ERROR: 500,
};

const messages: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: "The request does not match the expected input.",
  PAYLOAD_TOO_LARGE: "The request exceeds the allowed size.",
  INVALID_REFERENCE: "A referenced record is missing or stale.",
  UNSUPPORTED_OPERATION: "This operation is not available.",
  RATE_LIMITED: "The request limit has been reached.",
  PROVIDER_UNAVAILABLE: "The model provider is unavailable.",
  UNTRUSTED_EVIDENCE: "Trusted evidence is required for this operation.",
  INTERNAL_ERROR: "The request could not be completed.",
};

export class RequestFailure extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code);
  }
}

export function apiErrorResponse(error: unknown): Response {
  const code = error instanceof RequestFailure ? error.code : "INTERNAL_ERROR";
  const body = ApiErrorSchema.parse({
    schemaVersion: "api-error.v1",
    error: {
      code,
      message: messages[code],
      requestId: randomUUID(),
      retryable: code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE",
    },
  });
  return Response.json(body, {
    status: statuses[code],
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
