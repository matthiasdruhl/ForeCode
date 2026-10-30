// Private sidecar versions. Deliberately outside the 49 frozen app contracts.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../contracts/common";

export const ACTION_VERSION = "learning-actions.v1" as const;
export const FEATURE_VERSION = "architecture-features.v1" as const;
export const REWARD_VERSION = "correctness-conditional-cost.v1" as const;
export const StrategySchema = z.enum(["KEEP", "BOUNDARY", "ADAPTER"]);
export type Strategy = z.infer<typeof StrategySchema>;
export const strategies = StrategySchema.options;
export const ActionSetSchema = z
  .strictObject({
    schemaVersion: z.literal(ACTION_VERSION),
    reviewSha256: Sha256Schema,
    eligible: z.array(StrategySchema).min(1).max(3),
  })
  .refine(
    (x) => new Set(x.eligible).size === x.eligible.length,
    "Duplicate actions.",
  );

const count = z.number().int().min(0).max(1_000_000);
const fraction = z.number().min(0).max(1);
export const ContextSchema = z.strictObject({
  schemaVersion: z.literal("learning-context.v1"),
  id: IdSchema,
  sourceSha256: Sha256Schema,
  intentSha256: Sha256Schema,
  repositoryFamily: Sha256Schema,
  taskFamily: Sha256Schema,
  frozenAt: UtcTimestampSchema,
  actions: ActionSetSchema,
  facts: z.strictObject({
    repositoryFiles: count.nullable(),
    moduleCount: count.nullable(),
    meanFanOut: z.number().min(0).max(1_000_000).nullable(),
    boundaryPresent: z.boolean().nullable(),
    requirement: z.enum(["authorization", "dependency", "other", "unknown"]),
    estimatedChangedModules: count.nullable(),
    testCoverage: fraction.nullable(),
    uncertainty: fraction.nullable(),
    budgetMinutes: z.number().min(0).max(100_000).nullable(),
  }),
});
export type LearningContext = z.infer<typeof ContextSchema>;

// Every nullable numeric/boolean fact has a distinct missingness coordinate.
// Raw identifiers, paths, source text and receipt facts never enter this vector.
export const FEATURE_DIMENSION = 21;
export const FeaturesSchema = z.strictObject({
  schemaVersion: z.literal(FEATURE_VERSION),
  contextSha256: Sha256Schema,
  values: z.array(z.number().min(-1).max(1)).length(FEATURE_DIMENSION),
  missingCount: z.number().int().min(0).max(8),
});
export type Features = z.infer<typeof FeaturesSchema>;

const commonProvenance = {
  schemaVersion: z.literal("learning-model-provenance.v1"),
  promptSha256: Sha256Schema,
  inputSha256: Sha256Schema,
  responseSha256: Sha256Schema,
  consentSha256: Sha256Schema,
  rightsReviewSha256: Sha256Schema,
  temperature: z.number().min(0).max(2),
  seed: z.number().int().nonnegative().nullable(),
};
export const ModelProvenanceSchema = z.discriminatedUnion("provider", [
  z.strictObject({
    ...commonProvenance,
    provider: z.literal("meta_model_api"),
    modelId: z.enum(["muse-spark-1.3", "muse-spark-1.3-contributor"]),
    apiProfileSha256: Sha256Schema,
    // An API profile is never a local fine-tuned checkpoint.
    adaptation: z.literal("none"),
  }),
  z
    .strictObject({
      ...commonProvenance,
      provider: z.literal("open_weight_local"),
      modelId: z.literal("meta-models/Muse-Glimmer-30B"),
      revision: z.string().regex(/^[a-f0-9]{40}$/),
      tokenizerRevision: z.string().regex(/^[a-f0-9]{40}$/),
      adaptation: z.enum(["none", "qlora_sft"]),
      adapterSha256: Sha256Schema.nullable(),
    })
    .refine(
      (x) => (x.adaptation === "none") === (x.adapterSha256 === null),
      "Adapter identity mismatch.",
    ),
]);
export const ProposalSchema = z
  .strictObject({
    schemaVersion: z.literal("learning-proposal.v1"),
    contextSha256: Sha256Schema,
    candidateSetSha256: Sha256Schema,
    proposed: z.array(StrategySchema).min(1).max(3),
    provenance: ModelProvenanceSchema,
    authority: z.literal("proposal_only"),
  })
  .refine(
    (x) => new Set(x.proposed).size === x.proposed.length,
    "Duplicate proposals.",
  );

export const EvidenceReferenceSchema = z.strictObject({
  schemaVersion: z.literal("learning-evidence-reference.v1"),
  studyId: IdSchema,
  projectionSha256: Sha256Schema,
  approvalId: IdSchema,
  approvalHeldAt: UtcTimestampSchema,
  protocolOriginalSha256: Sha256Schema,
  receiptIds: z.array(IdSchema).min(2).max(6),
});
export const RewardSchema = z.strictObject({
  schemaVersion: z.literal(REWARD_VERSION),
  observationSha256: Sha256Schema,
  action: StrategySchema,
  correctness: fraction.nullable(),
  // Conditional cost efficiency only; never added to correctness.
  efficiency: fraction.nullable(),
  totalCostUsd: z.number().nonnegative().nullable(),
  reasons: z
    .array(
      z.enum([
        "INELIGIBLE",
        "CORRECTNESS_TIE",
        "BOTH_FAILED",
        "COST_UNKNOWN",
        "AUTHENTIC_FAILURE",
      ]),
    )
    .max(8),
});
export type Reward = z.infer<typeof RewardSchema>;

export const DatasetRowSchema = z.strictObject({
  observationSha256: Sha256Schema,
  contextSha256: Sha256Schema,
  repositoryFamily: Sha256Schema,
  taskFamily: Sha256Schema,
  split: z.enum(["train", "validation", "test"]),
  evidence: EvidenceReferenceSchema,
});
export const DatasetSchema = z.strictObject({
  schemaVersion: z.literal("learning-dataset.v1"),
  featureVersion: z.literal(FEATURE_VERSION),
  actionVersion: z.literal(ACTION_VERSION),
  rewardVersion: z.literal(REWARD_VERSION),
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  frozenAt: UtcTimestampSchema,
  splitReviewSha256: Sha256Schema,
  rows: z.array(DatasetRowSchema).max(10000),
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const EvaluationOutcomeSchema = z.strictObject({
  schemaVersion: z.literal("learning-evaluation.v1"),
  protocolSha256: Sha256Schema,
  datasetSha256: Sha256Schema,
  policySha256: Sha256Schema,
  independentRepositoryFamilies: z.number().int().nonnegative(),
  independentTaskFamilies: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  abstained: z.number().int().nonnegative(),
  coverage: fraction.nullable(),
  totalCostUsd: z.number().nonnegative().nullable(),
  avoidableRefactorRate: fraction.nullable(),
  regressionRate: fraction.nullable(),
  meanLatencyMs: z.number().nonnegative().nullable(),
  brierScore: fraction.nullable(),
  conclusion: z.literal("DESCRIPTIVE_ONLY"),
});
