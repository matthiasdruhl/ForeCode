import { z } from "zod";
import {
  CheckStatusSchema,
  GitCommitSchema,
  IdSchema,
  RelativePathSchema,
  Sha256Schema,
  UtcTimestampSchema,
  VerdictSchema,
  count,
  ids,
  text,
  texts,
} from "./common";
import { IntentRevisionSchema } from "./intents";

export const CheckResultV1Schema = z
  .strictObject({
    schemaVersion: z.literal("check-result.v1"),
    id: IdSchema,
    runId: IdSchema,
    kind: z.enum([
      "typecheck",
      "build",
      "acceptance",
      "regression",
      "boundary",
      "integration",
    ]),
    status: CheckStatusSchema,
    exitCode: count(255).nullable(),
    evidencePath: RelativePathSchema.nullable(),
    scope: text(250),
    artifactSha256: Sha256Schema.nullable(),
  })
  .superRefine((check, ctx) => {
    const observed = check.status === "pass" || check.status === "fail";
    if (
      observed &&
      (check.evidencePath === null ||
        check.artifactSha256 === null ||
        check.exitCode === null ||
        (check.status === "pass" ? check.exitCode !== 0 : check.exitCode === 0))
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Observed checks require evidence and a matching process exit status.",
      });
    }
    if (
      check.status === "not_run" &&
      (check.exitCode !== null ||
        check.evidencePath !== null ||
        check.artifactSha256 !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "An unrun check has no process result or artifact.",
      });
    }
  });
export const ReceiptIntegritySchema = z.strictObject({
  kind: z.literal("trusted-local-artifact"),
  manifestSha256: Sha256Schema,
});
export const EvaluatorReceiptV1Schema = z.strictObject({
  schemaVersion: z.literal("evaluator-receipt.v1"),
  id: IdSchema,
  runId: IdSchema,
  evaluatedTreeSha256: Sha256Schema,
  fixtureSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  testSuiteSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  requiredCheckIds: ids(64, 1),
  checkArtifactSha256: Sha256Schema,
  startedAt: UtcTimestampSchema,
  finishedAt: UtcTimestampSchema,
  issuer: z.literal("trusted-local-evaluator"),
  integrity: ReceiptIntegritySchema,
});
export const VerificationV1Schema = z
  .strictObject({
    schemaVersion: z.literal("verification.v1"),
    id: IdSchema,
    runId: IdSchema,
    verdict: VerdictSchema,
    requiredCheckIds: ids(64, 1),
    checks: z.array(CheckResultV1Schema).max(100),
    receiptId: IdSchema.nullable(),
    origin: z.enum(["trusted_evaluator", "untrusted_preview"]),
    scope: text(512),
    limitations: texts(500, 40),
  })
  .superRefine((verification, ctx) => {
    if (
      verification.origin === "untrusted_preview" &&
      (verification.verdict !== "INSUFFICIENT_EVIDENCE" ||
        verification.receiptId !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "An untrusted preview cannot authenticate a verdict or receipt.",
      });
    }
  });
export const MetricsSchema = z.strictObject({
  elapsedMs: count().nullable(),
  tokens: count().nullable(),
  costUsd: z.number().min(0).max(1_000_000).nullable(),
  iterations: count().nullable(),
  filesTouched: count().nullable(),
});
export const ExperimentRunV1Schema = z.strictObject({
  schemaVersion: z.literal("experiment-run.v1"),
  id: IdSchema,
  variant: z.enum(["A", "B", "C"]),
  status: z.enum(["completed", "failed", "cancelled", "timed_out", "blocked"]),
  repoCommit: GitCommitSchema,
  evaluatedTreeSha256: Sha256Schema.nullable(),
  fixtureSha256: Sha256Schema,
  agentConfigSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  isolationAttestationId: IdSchema.nullable(),
  seed: count().nullable(),
  startedAt: UtcTimestampSchema,
  endedAt: UtcTimestampSchema,
  verificationId: IdSchema.nullable(),
  receiptId: IdSchema.nullable(),
  metrics: MetricsSchema,
  evidenceOrigin: z.enum(["measured", "none"]),
  presentationMode: z.enum(["recorded", "live"]),
  limitations: texts(500, 32),
});
export const CertificateV1Schema = z.strictObject({
  schemaVersion: z.literal("certificate.v1"),
  id: IdSchema,
  baselineCommit: GitCommitSchema,
  intentRevisions: z.array(IntentRevisionSchema).max(32),
  scenarioIds: ids(24),
  decisionId: IdSchema.nullable(),
  experimentRunIds: ids(100),
  verificationIds: ids(100),
  receiptIds: ids(100),
  conclusion: text(1500),
  limitations: texts(500, 40),
  generatedAt: UtcTimestampSchema,
  evidenceOrigin: z.enum(["measured", "none"]),
  presentationMode: z.enum(["recorded", "live"]),
  artifactSha256: Sha256Schema,
});
export const BudgetSchema = z.strictObject({
  maxSeconds: z.number().int().min(1).max(86_400),
  maxIterations: z.number().int().min(1).max(100),
  tokenLimit: z.number().int().min(1).max(100_000_000).nullable(),
  spendUsd: z.number().min(0).max(10_000).nullable(),
});
export const PairArmSchema = z.strictObject({
  variant: z.enum(["A", "B"]),
  initialCommit: GitCommitSchema,
  initialTreeSha256: Sha256Schema,
  runId: IdSchema.nullable(),
  upfrontMetrics: MetricsSchema,
});
export const PairManifestV1Schema = z.strictObject({
  schemaVersion: z.literal("pair-manifest.v1"),
  id: IdSchema,
  taskId: IdSchema,
  scenarioId: IdSchema,
  fixtureSha256: Sha256Schema,
  agentConfigSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  toolAllowlistSha256: Sha256Schema,
  budget: BudgetSchema,
  arms: z.array(PairArmSchema).length(2),
  frozenAt: UtcTimestampSchema,
  limitations: texts(500, 32),
});
export const MetaComparisonManifestV1Schema = z.strictObject({
  schemaVersion: z.literal("meta-comparison-manifest.v1"),
  id: IdSchema,
  contextSha256: Sha256Schema,
  scenarioId: IdSchema,
  metaCandidateId: IdSchema,
  templateCandidateId: IdSchema,
  metaProviderModel: text(160),
  metaPromptVersion: IdSchema,
  fixtureSha256: Sha256Schema,
  agentConfigSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  toolAllowlistSha256: Sha256Schema,
  budget: BudgetSchema,
  metaRunId: IdSchema.nullable(),
  templateRunId: IdSchema.nullable(),
  frozenAt: UtcTimestampSchema,
  limitations: texts(500, 32),
});

export type CheckResultV1 = z.infer<typeof CheckResultV1Schema>;
export type EvaluatorReceiptV1 = z.infer<typeof EvaluatorReceiptV1Schema>;
export type VerificationV1 = z.infer<typeof VerificationV1Schema>;
export type ExperimentRunV1 = z.infer<typeof ExperimentRunV1Schema>;
export type CertificateV1 = z.infer<typeof CertificateV1Schema>;
export type PairManifestV1 = z.infer<typeof PairManifestV1Schema>;
export type MetaComparisonManifestV1 = z.infer<
  typeof MetaComparisonManifestV1Schema
>;
