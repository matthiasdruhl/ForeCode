import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import {
  DatasetSchema,
  EvidenceReferenceSchema,
  RewardSchema,
} from "../../src/lib/learning/contracts";
import { DecisionSchema } from "../../src/lib/learning/features";
import { LedgerAnchorSchema, LedgerRecordSchema } from "./ledger";
import { PolicySchema } from "./policy";

// Local research interfaces. No existing frozen v1 contract is changed.
export const ShadowPlanSchema = z.strictObject({
  schemaVersion: z.literal("learning-shadow-plan.local.v1"),
  id: IdSchema,
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  frozenAt: UtcTimestampSchema,
  ledgerHead: LedgerAnchorSchema,
  trainerSha256: Sha256Schema,
  seed: PolicySchema.shape.seed,
  config: PolicySchema.shape.config,
  // Replay the complete prefix from zero, never trust serialized weights as
  // reward authority. Original batch order is part of the approved plan.
  batches: z.array(DatasetSchema).max(1000),
});
export type ShadowPlan = z.infer<typeof ShadowPlanSchema>;

export const TrainerSourceSchema = z.strictObject({
  schemaVersion: z.literal("learning-trainer-source.local.v1"),
  node: z.string().regex(/^v\d+\.\d+\.\d+$/),
  sources: z
    .array(
      z.strictObject({
        file: z.string().regex(/^[a-zA-Z0-9_./-]{1,200}$/),
        sha256: Sha256Schema,
      }),
    )
    .min(1)
    .max(32),
});

export const ShadowReportSchema = z.strictObject({
  schemaVersion: z.literal("learning-shadow-replay.local.v1"),
  planSha256: Sha256Schema,
  ledgerHead: LedgerAnchorSchema,
  trainerSha256: Sha256Schema,
  trainerManifest: TrainerSourceSchema,
  assessedAt: UtcTimestampSchema,
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  status: z.enum(["NOT_TRAINED", "SHADOW"]),
  initialPolicySha256: Sha256Schema,
  policySha256: Sha256Schema,
  audit: z
    .array(
      z.strictObject({
        sequence: LedgerRecordSchema.shape.sequence,
        entrySha256: Sha256Schema,
        sourceId: IdSchema,
        status: LedgerRecordSchema.shape.status,
        reason: LedgerRecordSchema.shape.reason,
        observationSha256: Sha256Schema.nullable(),
      }),
    )
    .max(10000),
  steps: z
    .array(
      z.strictObject({
        snapshotSha256: Sha256Schema,
        previousPolicySha256: Sha256Schema,
        policySha256: Sha256Schema,
        updated: z.boolean(),
      }),
    )
    .max(1000),
  observations: z
    .array(
      z.strictObject({
        sourceId: IdSchema,
        observationSha256: Sha256Schema,
        snapshotSha256: Sha256Schema,
        split: z.enum(["train", "validation", "test"]),
        rewards: z.array(RewardSchema).max(3),
      }),
    )
    .max(1000),
  trainingRepositoryFamilies: z.number().int().nonnegative(),
  trainingTaskFamilies: z.number().int().nonnegative(),
  conclusion: z.literal("NO_INDEPENDENT_EVALUATION"),
  execution: z.literal("DISABLED"),
  promotion: z.literal("DISABLED"),
});
export type ShadowReport = z.infer<typeof ShadowReportSchema>;

export const ShadowDecisionSchema = z.strictObject({
  schemaVersion: z.literal("learning-shadow-decision-draft.local.v1"),
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  replaySha256: Sha256Schema,
  policySha256: Sha256Schema,
  contextSha256: Sha256Schema,
  candidateSetSha256: Sha256Schema,
  proposalSha256: Sha256Schema.nullable(),
  recordedAt: UtcTimestampSchema,
  fixed: DecisionSchema,
  learned: DecisionSchema,
  memory: z.strictObject({
    status: z.enum(["CASES_AVAILABLE", "ABSTAIN"]),
    repositoryFamilies: z.number().int().nonnegative(),
    taskFamilies: z.number().int().nonnegative(),
    cases: z
      .array(
        z.strictObject({
          observationSha256: Sha256Schema,
          evidence: EvidenceReferenceSchema,
          distance: z.number().finite().nonnegative(),
          missingFeatures: z.number().int().min(0).max(8),
          rewards: z.array(RewardSchema).max(3),
        }),
      )
      .max(1000),
  }),
  authority: z.literal("DRAFT_ONLY"),
  outcome: z.literal("UNOBSERVED"),
  independentCommitment: z.literal("REQUIRED"),
});
