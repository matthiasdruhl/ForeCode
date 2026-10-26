import { z } from "zod";
import {
  CheckStatusSchema,
  GitCommitSchema,
  IdSchema,
  ids,
  text,
  texts,
} from "./common";
import { ProviderInfoSchema } from "./provider";

export const ScientistPredictionV1Schema = z.strictObject({
  metric: z.enum([
    "required_check_success",
    "regressions",
    "iterations",
    "elapsed_ms",
    "boundary_violations",
  ]),
  direction: z.enum(["lower", "higher", "no_regression"]),
  comparison: z.enum(["candidate_vs_status_quo", "candidate_vs_template"]),
  expectedEffect: text(500),
  falsifiedWhen: text(500),
});
export const MetaHypothesisV1Schema = z.strictObject({
  schemaVersion: z.literal("meta-hypothesis.v1"),
  id: IdSchema,
  baselineCommit: GitCommitSchema,
  candidateId: IdSchema,
  intentIds: ids(24, 1),
  visibleScenarioIds: ids(24),
  statement: text(700),
  mechanism: text(1000),
  prediction: ScientistPredictionV1Schema,
  assumptions: texts(320, 16),
  counterArguments: texts(500, 16, 1),
  limitations: texts(500, 16),
  provider: ProviderInfoSchema,
});
export const ScientistProposedChangeV1Schema = z.strictObject({
  id: IdSchema,
  request: text(1400),
  rationale: text(800),
  acceptanceOutline: texts(400, 12, 1),
  intentIds: ids(24, 1),
});
export const MetaChallengeV1Schema = z.strictObject({
  schemaVersion: z.literal("meta-challenge.v1"),
  id: IdSchema,
  hypothesisId: IdSchema,
  targetCandidateId: IdSchema,
  baselineCommit: GitCommitSchema,
  change: ScientistProposedChangeV1Schema,
  failureMechanism: text(900),
  potentialDisconfirmation: text(700),
  reviewStatus: z.literal("proposed"),
  visibility: z.literal("model_generated_not_heldout"),
  limitations: texts(500, 16),
  provider: ProviderInfoSchema,
});
export const ScientistObservedCheckV1Schema = z.strictObject({
  runId: IdSchema,
  checkId: IdSchema,
  status: CheckStatusSchema,
  scope: text(300),
});
export const ScientistEvidenceSummaryV1Schema = z.strictObject({
  schemaVersion: z.literal("scientist-evidence-summary.v1"),
  id: IdSchema,
  hypothesisId: IdSchema,
  baselineCommit: GitCommitSchema,
  runIds: ids(24, 1),
  receiptIds: ids(24, 1),
  observedChecks: z.array(ScientistObservedCheckV1Schema).min(1).max(64),
  limitations: texts(500, 24),
  source: z.literal("trusted_sanitized_recording"),
});
export const MetaEvidenceInterpretationV1Schema = z.strictObject({
  schemaVersion: z.literal("meta-evidence-interpretation.v1"),
  id: IdSchema,
  hypothesisId: IdSchema,
  evidenceSummaryId: IdSchema,
  assessment: z.enum([
    "consistent",
    "inconsistent",
    "mixed",
    "insufficient_evidence",
  ]),
  explanation: text(1600),
  counterEvidence: texts(450, 16),
  uncertainties: texts(450, 16),
  nextQuestion: text(700),
  authority: z.literal("model_interpretation_only"),
  provider: ProviderInfoSchema,
});

export type MetaHypothesisV1 = z.infer<typeof MetaHypothesisV1Schema>;
export type MetaChallengeV1 = z.infer<typeof MetaChallengeV1Schema>;
export type ScientistEvidenceSummaryV1 = z.infer<
  typeof ScientistEvidenceSummaryV1Schema
>;
export type MetaEvidenceInterpretationV1 = z.infer<
  typeof MetaEvidenceInterpretationV1Schema
>;
