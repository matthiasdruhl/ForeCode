// Private trusted-broker metadata, separate from native process exit/status.
import { z } from "zod";
import { Sha256Schema } from "../../../src/lib/contracts/common";
export const BrokerStopSchema = z.strictObject({
  reasonCode: z.enum([
    "request-count",
    "iteration-count",
    "token-capacity",
    "money-capacity",
    "token-and-money-capacity",
    "deadline-or-request-bytes",
    "request-bytes",
    "history-nodes",
    "team-history-nodes",
    "unauthenticated-opaque-context",
    "tool-declaration",
    "history-tool",
    "provider-breaker",
    "invalid-request",
    "http-preflight",
    "upstream",
    "response-validation",
  ]),
  requestCount: z.number().int().min(0).max(100),
  refusalSha256: Sha256Schema,
});
