import { z } from "zod";
import path from "node:path";
import {
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";

const absolute = z.string().refine((value) => path.isAbsolute(value));
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const obligations = [
  "sanitized-workspace",
  "host-read-write-denial",
  "credentials-ssh-socket-denial",
  "host-integrations-disabled",
  "restricted-inference-egress",
  "offline-grader",
  "resource-limits",
  "termination-and-export",
  "oracle-result-custody",
  "booking-worker-boundary",
  "patched-image-trust-store",
  "provider-hard-budget",
] as const;
export const OperatorConfigSchema = z.strictObject({
  schemaVersion: z.literal("booking-operator.v1"),
  enabled: z.boolean().default(false),
  sbx: z.literal("/opt/homebrew/bin/sbx"),
  agentSandbox: z.literal("forecode-experiments"),
  graderSandbox: z.literal("forecode-grader"),
  agentImage: digest,
  graderImage: digest,
  agentConfigSha256: Sha256Schema,
  codexBinarySha256: Sha256Schema,
  graderNodeSha256: Sha256Schema,
  graderLockSha256: Sha256Schema,
  graderModulesSha256: Sha256Schema,
  workerImage: z
    .string()
    .regex(/^forecode-booking-toolchain@sha256:[a-f0-9]{64}$/),
  protectedRoot: absolute,
  scratchRoot: absolute,
  reviewFile: absolute,
  reviewSha256: Sha256Schema,
  maxSeconds: z.number().int().min(1).max(600),
  maxOutputBytes: z.number().int().min(1024).max(8_000_000),
  tokenLimit: z.number().int().min(1).max(100_000),
  spendUsd: z.number().positive().max(10),
  authorizedModel: z.literal("gpt-5.6-sol"),
});
export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;
// This is a private, operator-reviewed record, NOT an infrastructure PASS field.
export const IsolationReviewSchema = z.strictObject({
  schemaVersion: z.literal("booking-isolation-review.v1"),
  reviewedAt: UtcTimestampSchema,
  expiresAt: UtcTimestampSchema,
  configurationSha256: Sha256Schema,
  inventorySha256: Sha256Schema,
  implementationSha256: Sha256Schema,
  authorizedTask: z.literal("booking-ownership-refactor-v1"),
  authorizedModel: z.literal("gpt-5.6-sol"),
  maxSpendUsd: z.number().positive().max(10),
  evidence: z
    .array(
      z.strictObject({
        obligation: z.enum(obligations),
        path: absolute,
        sha256: Sha256Schema,
        // The reviewer must inspect actual commands, observed exits and denials.
        reviewedObservation: z.string().min(30).max(1000),
      }),
    )
    .length(obligations.length),
});
export type IsolationReview = z.infer<typeof IsolationReviewSchema>;
