import { z } from "zod";
import path from "node:path";
import {
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";

const absolute = z.string().refine((value) => path.isAbsolute(value));
export const BookingModelSchema = z.enum(["gpt-5.6-sol", "muse-spark-1.3"]);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
// Private runtime inputs, not additions to the frozen application contracts.
export const SupervisionConfigSchema = z.strictObject({
  schemaVersion: z.literal("booking-supervised-worker.v1"),
  sbxSha256: Sha256Schema,
  workerImage: digest,
  workerNodeSha256: Sha256Schema,
  vmDiskBytes: z
    .number()
    .int()
    .positive()
    .max(64 * 1024 ** 3),
  vmPids: z.number().int().min(128).max(4096),
  provider: z.strictObject({
    endpoint: z.enum([
      "https://api.openai.com/v1/responses",
      "https://api.meta.ai/v1/responses",
    ]),
    // Independently approved conservative tariff ceilings. The trusted broker
    // reserves these BEFORE sending a request; failed requests are not refunded.
    inputMicroUsdPerToken: z.number().int().min(1).max(1000),
    outputMicroUsdPerToken: z.number().int().min(1).max(10000),
    maxOutputTokens: z.number().int().min(1).max(8192),
  }),
});
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
export const OperatorConfigSchema = z
  .strictObject({
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
      .regex(/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/),
    coordinationRoot: absolute,
    protectedRoot: absolute,
    scratchRoot: absolute,
    reviewFile: absolute,
    reviewSha256: Sha256Schema,
    maxSeconds: z.number().int().min(1).max(600),
    maxOutputBytes: z.number().int().min(1024).max(8_000_000),
    tokenLimit: z.number().int().min(1).max(100_000),
    spendUsd: z.number().positive().max(10),
    authorizedModel: BookingModelSchema,
    supervision: SupervisionConfigSchema.optional(),
  })
  .superRefine((config, context) => {
    const endpoint =
      config.authorizedModel === "muse-spark-1.3"
        ? "https://api.meta.ai/v1/responses"
        : "https://api.openai.com/v1/responses";
    if (
      (config.authorizedModel === "muse-spark-1.3" && !config.supervision) ||
      (config.supervision && config.supervision.provider.endpoint !== endpoint)
    )
      context.addIssue({
        code: "custom",
        message: "Model and fixed provider endpoint must match.",
        path: ["supervision", "provider", "endpoint"],
      });
    if (
      config.authorizedModel === "muse-spark-1.3" &&
      config.supervision &&
      config.supervision.provider.maxOutputTokens < 16
    )
      context.addIssue({
        code: "custom",
        message: "Meta requires at least 16 output tokens.",
        path: ["supervision", "provider", "maxOutputTokens"],
      });
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
  authorizedModel: BookingModelSchema,
  maxSpendUsd: z.number().positive().max(10),
  execution: z
    .strictObject({
      runId: z.string().uuid(),
      repoCommit: z.string().regex(/^[a-f0-9]{40}$/),
      commitmentSha256: Sha256Schema,
      // Maintained by the independent reviewer. Removal/replacement revokes this
      // exact admission; its content is not itself a new approval system.
      revocationFile: absolute,
      revocationSha256: Sha256Schema,
    })
    .optional(),
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
