import { z } from "zod";
import path from "node:path";
import {
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";
const absolute = z.string().refine(path.isAbsolute);
export const offlineObligations = [
  "owner-authority-and-exclusive-lease",
  "sanitized-workspace",
  "host-read-write-denial",
  "credentials-ssh-socket-denial",
  "host-integrations-disabled",
  "offline-grader",
  "resource-limits",
  "termination-and-non-resumption",
  "oracle-result-custody",
  "booking-worker-boundary",
  "patched-image-trust-store",
] as const;
export const OfflineConfigSchema = z.strictObject({
  schemaVersion: z.literal("booking-offline-operator.v1"),
  scope: z.literal("fixed-booking-grader-acceptance-no-inference"),
  enabled: z.literal(false), // Cannot authorize the paid runner.
  acceptanceEnabled: z.boolean().default(false),
  sbx: z.literal("/opt/homebrew/bin/sbx"),
  sbxSha256: Sha256Schema,
  graderSandbox: z.literal("forecode-grader"),
  graderImage: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workerImage: z
    .string()
    .regex(/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/),
  graderNodeSha256: Sha256Schema,
  graderLockSha256: Sha256Schema,
  graderModulesSha256: Sha256Schema,
  coordinationRoot: absolute,
  protectedRoot: absolute,
  scratchRoot: absolute,
  reviewFile: absolute,
  reviewSha256: Sha256Schema,
  maxSeconds: z.number().int().min(1).max(3600),
  maxOutputBytes: z.number().int().min(4096).max(1_048_576),
  // Owner must attest actual enforced VM disk/process caps, not free space.
  vmDiskBytes: z
    .number()
    .int()
    .positive()
    .max(64 * 1024 ** 3),
  vmPids: z.number().int().positive().max(4096),
});
export type OfflineConfig = z.infer<typeof OfflineConfigSchema>;
export const OfflineReviewSchema = z.strictObject({
  schemaVersion: z.literal("booking-offline-isolation-review.v1"),
  scope: z.literal("fixed-booking-grader-acceptance-no-inference"),
  reviewedAt: UtcTimestampSchema,
  expiresAt: UtcTimestampSchema,
  configurationSha256: Sha256Schema,
  implementationSha256: Sha256Schema,
  inventorySha256: Sha256Schema,
  evidence: z
    .array(
      z.strictObject({
        obligation: z.enum(offlineObligations),
        path: absolute,
        sha256: Sha256Schema,
        reviewedObservation: z.string().min(30).max(1000),
      }),
    )
    .length(offlineObligations.length),
});
