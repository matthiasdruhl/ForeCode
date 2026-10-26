import { z } from "zod";
import { IdSchema, EffortUnitSchema, text } from "./common";
import { IntentV1Schema, IntentDraftV1Schema } from "./intents";
import {
  ArchitectureCandidateV1Schema,
  GraphV1Schema,
  ScenarioV1Schema,
  VisibleScenarioV1Schema,
} from "./architecture";
import {
  CertificateV1Schema,
  CheckResultV1Schema,
  ExperimentRunV1Schema,
  VerificationV1Schema,
} from "./evidence";
import { ProviderInfoSchema } from "./provider";
import {
  MetaChallengeV1Schema,
  MetaEvidenceInterpretationV1Schema,
  MetaHypothesisV1Schema,
} from "./scientist";

const approvedContext = {
  intents: z.array(IntentV1Schema).min(1).max(24),
  graph: GraphV1Schema,
  consent: z.literal(true),
};
const scientistContext = {
  ...approvedContext,
  candidates: z.array(ArchitectureCandidateV1Schema).min(2).max(4),
  visibleScenarios: z.array(VisibleScenarioV1Schema).max(12),
};
export const InterpretResponseSchema = z.strictObject({
  schemaVersion: z.literal("intent-suggestions.v1"),
  suggestions: z.array(IntentDraftV1Schema).max(12),
  provider: ProviderInfoSchema,
});
export const ProposeRequestSchema = z.strictObject({
  ...approvedContext,
  goal: text(500),
});
export const ProposeResponseSchema = z.strictObject({
  schemaVersion: z.literal("foresight-proposals.v1"),
  candidates: z.array(ArchitectureCandidateV1Schema).min(2).max(4),
  scenarios: z.array(ScenarioV1Schema).min(1).max(12),
  provider: ProviderInfoSchema,
});
export const EvaluateRequestSchema = z.strictObject({
  graph: GraphV1Schema,
  candidates: z.array(ArchitectureCandidateV1Schema).min(2).max(12),
  scenarios: z.array(ScenarioV1Schema).min(1).max(24),
  scoringVersion: EffortUnitSchema,
});
export const DemoResponseSchema = z.strictObject({
  schemaVersion: z.literal("demo.v1"),
  runs: z.array(ExperimentRunV1Schema).max(40),
  certificates: z.array(CertificateV1Schema).max(20),
  mode: z.literal("recorded"),
});
export const VerifyPreviewRequestSchema = z.strictObject({
  runId: IdSchema,
  checks: z.array(CheckResultV1Schema).max(100),
  mode: z.literal("untrusted_preview"),
});
export const VerifyPreviewResponseSchema = z.strictObject({
  schemaVersion: z.literal("verify-preview.v1"),
  verification: VerificationV1Schema,
  authoritative: z.literal(false),
});
export const ScientistHypothesizeRequestSchema = z.strictObject({
  ...scientistContext,
  goal: text(500),
});
export const ScientistHypothesizeResponseSchema = z.strictObject({
  schemaVersion: z.literal("scientist-hypotheses.v1"),
  hypotheses: z.array(MetaHypothesisV1Schema).min(1).max(4),
  provider: ProviderInfoSchema,
});
export const ScientistChallengeRequestSchema = z.strictObject({
  ...scientistContext,
  hypotheses: z.array(MetaHypothesisV1Schema).min(1).max(4),
});
export const ScientistChallengeResponseSchema = z.strictObject({
  schemaVersion: z.literal("scientist-challenges.v1"),
  challenges: z.array(MetaChallengeV1Schema).min(1).max(6),
  provider: ProviderInfoSchema,
});
export const ScientistInterpretRequestSchema = z.strictObject({
  hypothesisId: IdSchema,
  evidenceSummaryId: IdSchema,
  consent: z.literal(true),
});
export const ScientistInterpretResponseSchema = z.strictObject({
  schemaVersion: z.literal("scientist-interpretations.v1"),
  interpretation: MetaEvidenceInterpretationV1Schema,
  provider: ProviderInfoSchema,
});
