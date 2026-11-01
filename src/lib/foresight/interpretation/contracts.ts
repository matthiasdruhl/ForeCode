// Supplementary contracts. Frozen scientist/API v1 schemas remain unchanged.
import { z } from "zod";
import { MetaHypothesisV1Schema } from "@/lib/contracts/scientist";
import { ProviderInfoSchema } from "@/lib/contracts/provider";
import { IdSchema, Sha256Schema } from "@/lib/contracts/common";
import { MetricsSchema } from "@/lib/contracts/evidence";
import { tournamentRequiredChecks } from "@/lib/experiment/tournament-publication";

export const OpaqueIdSchema = z.string().uuid();
export const InterpretRequestSchema = z.strictObject({
  schemaVersion: z.literal("scientist-interpret-request.v2"),
  hypothesisId: OpaqueIdSchema,
  evidenceSummaryId: OpaqueIdSchema,
  consent: z.literal(true),
});
const CheckSchema = z.strictObject({
  id: z.enum(tournamentRequiredChecks),
  status: z.enum(["pass", "fail", "not_run", "invalid"]),
});
export const EvidenceSummarySchema = z.strictObject({
  schemaVersion: z.literal("scientist-evidence-summary.v2"),
  id: OpaqueIdSchema,
  hypothesisId: OpaqueIdSchema,
  publicationSha256: Sha256Schema,
  linkExpiresAt: z.number().int().nonnegative(),
  studyId: IdSchema,
  taskId: IdSchema,
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
  arms: z
    .array(
      z.strictObject({
        variant: z.enum(["A", "B"]),
        runId: IdSchema.nullable(),
        receiptId: IdSchema.nullable(),
        verdict: z.enum(["VERIFIED", "REJECTED", "INSUFFICIENT_EVIDENCE"]),
        checks: z.array(CheckSchema).length(8),
        preparation: MetricsSchema,
        downstream: MetricsSchema,
        total: MetricsSchema,
      }),
    )
    .length(2),
  metricUnits: z.strictObject({
    elapsedMs: z.literal("milliseconds"),
    tokens: z.literal("tokens"),
    costUsd: z.literal("USD"),
    iterations: z.literal("iterations"),
    filesTouched: z.literal("files_per_phase_not_additive"),
  }),
  missingMeasurements: z
    .array(
      z.enum(["elapsedMs", "tokens", "costUsd", "iterations", "filesTouched"]),
    )
    .max(5),
  conditions: z.strictObject({
    model: IdSchema,
    order: z.enum(["A_then_B", "B_then_A"]),
    withheldPublicationLimitationCount: z.number().int().nonnegative(),
    completedArms: z.boolean(),
    blockerCount: z.number().int().nonnegative(),
    deviationCount: z.number().int().nonnegative(),
  }),
  deterministicDecision: z.strictObject({
    author: z.literal("DETERMINISTIC_REPORT_NOT_MODEL"),
    decision: z.enum(["KEEP", "REFACTOR", "INCONCLUSIVE"]),
  }),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
});

// No arbitrary model prose is accepted. Codes select bounded, evidence-scoped
// explanations; this prevents fabricated verdicts/holdouts/superiority in text.
export const InterpretationContentSchema = z.strictObject({
  hypothesisId: OpaqueIdSchema,
  evidenceSummaryId: OpaqueIdSchema,
  assessment: z.enum(["supported", "contradicted", "mixed", "not_established"]),
  observedChecks: z
    .array(
      z.strictObject({ variant: z.enum(["A", "B"]), ...CheckSchema.shape }),
    )
    .max(16),
  alternativeExplanation: z.enum([
    "implementation_variation",
    "single_task_sampling",
    "preparation_overhead",
  ]),
  nextExperiment: z.enum([
    "repeat_matched_trials",
    "measure_preparation_inclusive_effort",
    "equally_informed_non_meta_control",
  ]),
  uncertaintyAcknowledged: z.literal(true),
  metaUniqueValue: z.literal("not_established"),
  proposedChallengeIsHoldout: z.literal(false),
});
export const InterpretationResponseSchema = z.strictObject({
  schemaVersion: z.literal("scientist-interpret-response.v2"),
  interpretation: InterpretationContentSchema.extend({
    id: OpaqueIdSchema,
    authority: z.literal("MODEL_INTERPRETATION_ONLY"),
    originalPrediction: MetaHypothesisV1Schema.shape.prediction,
    assessmentExplanation: z.string().min(1).max(500),
    alternativeExplanationText: z.string().min(1).max(500),
    nextExperimentText: z.string().min(1).max(500),
    limitations: EvidenceSummarySchema.shape.limitations,
    provider: ProviderInfoSchema,
  }),
  authenticatedVerification: EvidenceSummarySchema,
});
export const InterpretationContextSchema = z.strictObject({
  hypothesis: MetaHypothesisV1Schema,
  evidence: EvidenceSummarySchema,
});
export type InterpretationContext = z.infer<typeof InterpretationContextSchema>;
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
export type InterpretationContent = z.infer<typeof InterpretationContentSchema>;
export type InterpretationResponse = z.infer<
  typeof InterpretationResponseSchema
>;

export const alternativeExplanations = {
  implementation_variation:
    "The particular implementation attempts may explain the difference; one A/B pair cannot isolate architecture as its cause.",
  single_task_sampling:
    "A single frozen task may favor one architecture by chance; other requirements may behave differently.",
  preparation_overhead:
    "Preparing B may add effort that downstream measurements alone do not capture; unknown measurements cannot be treated as zero.",
} as const;
export const nextExperiments = {
  repeat_matched_trials:
    "Under separate authorization, repeat matched trials with frozen tasks, source identities, independent checks and equal budgets, including preparation.",
  measure_preparation_inclusive_effort:
    "Under separate authorization, preregister an effort criterion and collect complete preparation and downstream measurements under comparable conditions.",
  equally_informed_non_meta_control:
    "Under separate authorization, compare with an equally informed strong non-Meta control using matched tasks, budgets and independent checks, including Meta inference and iteration costs.",
} as const;

export function validateInterpretation(
  content: InterpretationContent,
  context: InterpretationContext,
): void {
  const { hypothesis: h, evidence: e } = context;
  if (
    content.hypothesisId !== h.id ||
    content.evidenceSummaryId !== e.id ||
    e.hypothesisId !== h.id
  )
    throw new Error("Identity mismatch");
  const keys = content.observedChecks.map((c) => `${c.variant}:${c.id}`);
  if (
    new Set(keys).size !== keys.length ||
    content.observedChecks.some(
      (c) =>
        e.arms
          .find((a) => a.variant === c.variant)
          ?.checks.find((x) => x.id === c.id)?.status !== c.status,
    )
  )
    throw new Error("Altered check observation");
  // Only overall required-check success is mapped by this publication. It does
  // not measure regressions, boundary violations, or a predeclared effort effect.
  let allowed: InterpretationContent["assessment"][] = ["not_established"];
  if (
    e.comparability === "COMPARABLE" &&
    e.conditions.blockerCount === 0 &&
    e.conditions.completedArms &&
    e.conditions.withheldPublicationLimitationCount === 0 &&
    e.conditions.deviationCount === 0 &&
    h.prediction.metric === "required_check_success" &&
    h.prediction.comparison === "candidate_vs_status_quo"
  ) {
    const a = e.arms.find((x) => x.variant === "A")!,
      b = e.arms.find((x) => x.variant === "B")!;
    if (
      [a, b].every((x) => x.verdict !== "INSUFFICIENT_EVIDENCE") &&
      e.correctness !== "BOTH_REJECTED"
    ) {
      const difference =
        Number(b.verdict === "VERIFIED") - Number(a.verdict === "VERIFIED");
      const supported =
        h.prediction.direction === "no_regression"
          ? difference >= 0
          : h.prediction.direction === "higher"
            ? difference > 0
            : difference < 0;
      allowed = ["not_established", supported ? "supported" : "contradicted"];
    }
  }
  if (!allowed.includes(content.assessment))
    throw new Error("Unsupported assessment");
  // Every available check must remain visible; the model cannot omit failures.
  if (content.observedChecks.length !== 16)
    throw new Error("Incomplete observations");
}

export function assessmentExplanation(
  content: InterpretationContent,
  context: InterpretationContext,
): string {
  if (content.assessment === "not_established") {
    if (context.evidence.comparability !== "COMPARABLE")
      return "The comparison is invalid or insufficient; these observations do not establish the original prediction.";
    if (context.evidence.conditions.withheldPublicationLimitationCount > 0)
      return "Publication-specific limitations were withheld from this model context; the prediction remains not established. Review the approved report separately.";
    if (context.hypothesis.prediction.metric !== "required_check_success")
      return "Overall required-check success does not directly measure the original predicted metric; no directional effect is established.";
    return "Available scoped observations do not establish the prediction. Missing outcomes or unresolved conditions cannot be treated as evidence of an advantage.";
  }
  return content.assessment === "supported"
    ? "The scoped required-check outcomes are consistent with the original directional prediction for this task. This is model interpretation, not a verification or general superiority claim."
    : "The scoped required-check outcomes contradict the original directional prediction for this task. Independent verdicts and the deterministic recommendation remain unchanged.";
}
