// Supplementary read-only presentation data, outside the 49 frozen contracts.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  GitCommitSchema,
  UtcTimestampSchema,
  VerdictSchema,
} from "../contracts/common";
import { MetricsSchema } from "../contracts/evidence";
import { jsonDigest } from "../report/digests";
const publicText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v));
export const TournamentPublicMetadataSchema = z.strictObject({
  title: publicText(120),
  futureProblem: publicText(500),
  reviewedProposal: publicText(800),
  hypothesis: publicText(500),
  publishSourcePaths: z
    .array(z.string().regex(/^src\/[A-Za-z0-9_./-]+$/))
    .max(100),
});
const CheckSchema = z.strictObject({
  id: IdSchema,
  status: z.enum(["pass", "fail", "not_run", "invalid"]),
});
const ArmSchema = z.strictObject({
  variant: z.enum(["A", "B"]),
  runId: IdSchema.nullable(),
  status: z.enum([
    "completed",
    "failed",
    "cancelled",
    "timed_out",
    "blocked",
    "not_run",
  ]),
  baselineVerdict: VerdictSchema,
  verdict: VerdictSchema,
  initialCommit: GitCommitSchema,
  initialTreeSha256: Sha256Schema,
  finalTreeSha256: Sha256Schema.nullable(),
  receiptId: IdSchema.nullable(),
  baselineReceiptId: IdSchema.nullable(),
  preparation: MetricsSchema,
  downstream: MetricsSchema,
  total: MetricsSchema,
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reservedMicroUsd: z.number().int().nonnegative().nullable(),
  changedFileCount: z.number().int().nonnegative().nullable(),
  totalChangedFileCount: z.number().int().nonnegative().nullable(),
  checks: z.array(CheckSchema).length(8),
  startedAt: UtcTimestampSchema.nullable(),
  endedAt: UtcTimestampSchema.nullable(),
});
export const PublicTournamentSchema = z.strictObject({
  schemaVersion: z.literal("tournament-public-projection.v1"),
  studyId: IdSchema,
  taskId: IdSchema,
  title: publicText(120),
  futureProblem: publicText(500),
  reviewedProposal: publicText(800),
  hypothesis: publicText(500),
  taskDefinitionSha256: Sha256Schema,
  definitionSha256: Sha256Schema,
  protocolOriginalSha256: Sha256Schema,
  preparedOriginalSha256: Sha256Schema,
  model: IdSchema,
  order: z.enum(["A_then_B", "B_then_A"]),
  comparability: z.enum([
    "COMPARABLE",
    "NOT_COMPARABLE",
    "INSUFFICIENT_EVIDENCE",
  ]),
  correctness: z.enum([
    "INCONCLUSIVE",
    "BOTH_VERIFIED",
    "A_ONLY_VERIFIED",
    "B_ONLY_VERIFIED",
    "BOTH_REJECTED",
  ]),
  baselineEvaluatorSha256: Sha256Schema,
  futureEvaluatorSha256: Sha256Schema,
  futureSuiteSha256: Sha256Schema,
  futurePolicySha256: Sha256Schema,
  arms: z.array(ArmSchema).length(2),
  sourceComparison: z
    .array(
      z.strictObject({
        path: z.string().regex(/^src\/[A-Za-z0-9_./-]+$/),
        beforeSha256: Sha256Schema.nullable(),
        afterSha256: Sha256Schema.nullable(),
      }),
    )
    .max(100)
    .nullable(),
  preparationAttempts: z
    .array(
      z.strictObject({
        id: IdSchema,
        status: z.enum([
          "completed",
          "failed",
          "cancelled",
          "timed_out",
          "blocked",
        ]),
        startedAt: UtcTimestampSchema,
        finishedAt: UtcTimestampSchema,
      }),
    )
    .max(100),
  blockers: z.array(IdSchema).max(100),
  deviations: z.array(IdSchema).max(100),
  limitations: z.array(publicText(500)).max(20),
});
export type PublicTournament = z.infer<typeof PublicTournamentSchema>;
export const PublicationArtifactSchema = z.strictObject({
  reportSha256: Sha256Schema,
  projection: PublicTournamentSchema,
});
// Same signed original format as operator custody; pure validation only.
export const DisclosureEnvelopeSchema = z.strictObject({
  record: z.strictObject({
    schemaVersion: z.literal("tournament-custodian-record.local.v1"),
    id: IdSchema,
    studyId: IdSchema,
    kind: z.literal("disclosure"),
    subjectSha256: Sha256Schema,
    predecessorSha256: Sha256Schema.nullable(),
    heldAt: UtcTimestampSchema,
    expiresAt: UtcTimestampSchema,
  }),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
export function disclosureSubject(
  artifact: z.infer<typeof PublicationArtifactSchema>,
) {
  return jsonDigest(PublicationArtifactSchema.parse(artifact));
}
