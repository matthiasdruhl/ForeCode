// Additive archival disclosure only. Frozen v1 projections/contracts and the
// deterministic Decision Report remain unchanged. Parsing grants no authority.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../contracts/common";
import { MetricSourcePathSchema } from "./prospective-metrics";
import { jsonDigest } from "../report/digests";
import {
  PublicTournamentSchema,
  type PublicTournament,
} from "./tournament-publication";
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        value.trim() === value &&
        !/[\u0000-\u001f\u007f]/u.test(value) &&
        !/(?:\/Users\/|\/private\/|\/home\/|\/root\/|\/tmp\/|[A-Za-z]:\\)/u.test(
          value,
        ),
    );
const count = z.number().int().nonnegative().max(10_000).nullable();
const stage = z.strictObject({
  stage: z.enum(["propose", "hypothesize", "challenge"]),
  provider: z.literal("meta"),
  mode: z.literal("live"),
  modelId: IdSchema,
  acceptedAt: UtcTimestampSchema,
  approvedRequestSha256: Sha256Schema,
  acceptedResponseSha256: Sha256Schema,
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reservedMicroUsd: z.number().int().nonnegative().nullable(),
  actualChargeUsd: z.null(),
});
const metricArm = z.strictObject({
  variant: z.enum(["A", "B"]),
  runId: IdSchema,
  status: z.enum(["completed", "failed", "cancelled", "timed_out", "blocked"]),
  baselineTreeSha256: Sha256Schema,
  finalTreeSha256: Sha256Schema.nullable(),
  baselineForbiddenEdges: count,
  finalForbiddenEdges: count,
  baselineAuthorization: z.literal("not_applicable_before_future_requirement"),
  finalAuthorizationFailures: z.number().int().min(0).max(4).nullable(),
});
export const ArchivalProspectiveMetricsSchema = z
  .strictObject({
    authority: z.literal("historical_live_authenticated_observation"),
    protocolVersion: z.literal("prospective-tournament-metrics.v3"),
    observationVersion: z.literal("prospective-tournament-observations.v3"),
    protocolSha256: Sha256Schema,
    metricOriginalSha256: Sha256Schema,
    retainedAuthenticatedResultSha256: Sha256Schema,
    recordedAt: UtcTimestampSchema,
    status: z.enum(["complete", "incomplete"]),
    comparability: PublicTournamentSchema.shape.comparability,
    boundaryRules: z
      .array(
        z.strictObject({
          id: IdSchema,
          from: MetricSourcePathSchema,
          to: MetricSourcePathSchema,
        }),
      )
      .min(1)
      .max(100),
    authorizationCaseIds: z.array(IdSchema).length(4),
    arms: z.array(metricArm).length(2),
    prediction: z.literal("B_fewer_final_forbidden_edges_than_A"),
    predictionAssessment: z.enum([
      "supported",
      "contradicted",
      "not_established",
    ]),
    independentSamples: z.union([z.literal(0), z.literal(1)]),
    authorizationScope: z.literal("four_selected_forbidden_rejection_sites"),
    authorizationCaseCount: z.literal(4),
    authorizationPreserved: z.boolean().nullable(),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.boundaryRules.map((rule) => rule.id)).size !==
        value.boundaryRules.length ||
      new Set(value.boundaryRules.map((rule) => `${rule.from}\0${rule.to}`))
        .size !== value.boundaryRules.length ||
      new Set(value.authorizationCaseIds).size !== 4 ||
      value.arms.some(
        (arm) =>
          (arm.baselineForbiddenEdges !== null &&
            arm.baselineForbiddenEdges > value.boundaryRules.length) ||
          (arm.finalForbiddenEdges !== null &&
            arm.finalForbiddenEdges > value.boundaryRules.length),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate scope or impossible distinct-pair count",
      });
    const [a, b] = value.arms;
    if (a!.variant !== "A" || b!.variant !== "B" || a!.runId === b!.runId)
      context.addIssue({
        code: "custom",
        message: "Exact distinct ordered A/B observations required",
      });
    const complete = value.arms.every(
      (arm) =>
        arm.status === "completed" &&
        arm.baselineForbiddenEdges !== null &&
        arm.finalForbiddenEdges !== null &&
        arm.finalAuthorizationFailures !== null &&
        arm.finalTreeSha256 !== null,
    );
    const comparable = complete && value.comparability === "COMPARABLE";
    const expected = comparable
      ? b!.finalForbiddenEdges! < a!.finalForbiddenEdges!
        ? "supported"
        : "contradicted"
      : "not_established";
    if (
      (value.status === "complete") !== complete ||
      value.predictionAssessment !== expected ||
      value.independentSamples !== (comparable ? 1 : 0) ||
      value.authorizationPreserved !==
        (complete
          ? value.arms.every((arm) => arm.finalAuthorizationFailures === 0)
          : null)
    )
      context.addIssue({
        code: "custom",
        message: "Disclosed counts/applicability do not support assessment",
      });
  });
export const ProspectivePublicationSchema = z
  .strictObject({
    schemaVersion: z.literal("tournament-prospective-evidence-publication.v1"),
    authority: z.literal("owner_approved_archival_disclosure"),
    studyId: IdSchema,
    reportSha256: Sha256Schema,
    projectionSha256: Sha256Schema,
    preparedOriginalSha256: Sha256Schema,
    scopeLimitations: z.array(text(1200)).min(1).max(20),
    reviewProvenance: z.strictObject({
      reviewAuthority: z.literal("owner_designated_ai_shared_host"),
      blinding: z.literal("not_blind"),
      priorStudyIds: z.array(IdSchema).max(100),
      priorExposureSummary: text(1600),
    }),
    lineage: z.strictObject({
      hypothesisId: z.uuid(),
      contextSha256: Sha256Schema,
      protocolOriginalSha256: Sha256Schema,
      commitmentOriginalSha256: Sha256Schema,
      registrationOriginalSha256: Sha256Schema,
      selectedCandidateId: IdSchema,
      registeredAt: UtcTimestampSchema,
      selectedAt: UtcTimestampSchema,
      proposalSummary: text(1200),
      hypothesisStatement: text(1200),
      challengeSummary: text(1600),
      challengeOrigin: z.literal("model_generated_not_heldout"),
      challengeRole: z.literal("advisory_does_not_replace_frozen_task"),
      stages: z.array(stage).length(3),
    }),
    metrics: ArchivalProspectiveMetricsSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.reviewProvenance.priorStudyIds).size !==
        value.reviewProvenance.priorStudyIds.length ||
      value.reviewProvenance.priorStudyIds.includes(value.studyId)
    )
      context.addIssue({
        code: "custom",
        message:
          "Prior study exposure inventory must be distinct and historical",
      });
    const stages = value.lineage.stages;
    if (
      stages.map((stage) => stage.stage).join(",") !==
        "propose,hypothesize,challenge" ||
      new Set(stages.map((stage) => stage.approvedRequestSha256)).size !== 3 ||
      new Set(stages.map((stage) => stage.acceptedResponseSha256)).size !== 3 ||
      stages.some(
        (stage, index) =>
          index > 0 &&
          Date.parse(stage.acceptedAt) <
            Date.parse(stages[index - 1]!.acceptedAt),
      ) ||
      Date.parse(value.lineage.registeredAt) <
        Date.parse(stages[2]!.acceptedAt) ||
      Date.parse(value.lineage.selectedAt) <
        Date.parse(value.lineage.registeredAt) ||
      (value.metrics &&
        Date.parse(value.metrics.recordedAt) <
          Date.parse(value.lineage.selectedAt))
    )
      context.addIssue({
        code: "custom",
        message: "Historical stage chronology mismatch",
      });
  });
export type PublicProspectiveEvidence = z.infer<
  typeof ProspectivePublicationSchema
>;
export type ArchivalProspectiveMetrics = z.infer<
  typeof ArchivalProspectiveMetricsSchema
>;
export function prospectiveDisclosureSubject(input: unknown) {
  return jsonDigest(ProspectivePublicationSchema.parse(input));
}
// Exact base join only; a signed supplement never grants a new receipt, live
// registration, runtime capability, C arm or deterministic verdict.
export function joinProspectivePublication(
  input: unknown,
  projection: PublicTournament,
  reportSha256: string,
) {
  const evidence = ProspectivePublicationSchema.parse(input);
  if (
    evidence.studyId !== projection.studyId ||
    evidence.reportSha256 !== reportSha256 ||
    evidence.projectionSha256 !== jsonDigest(projection) ||
    evidence.preparedOriginalSha256 !== projection.preparedOriginalSha256 ||
    evidence.lineage.protocolOriginalSha256 !==
      projection.protocolOriginalSha256
  )
    throw new Error("Prospective disclosure/base identity mismatch");
  if (
    projection.arms.some(
      (arm) =>
        arm.startedAt !== null &&
        Date.parse(evidence.lineage.selectedAt) >= Date.parse(arm.startedAt),
    )
  )
    throw new Error("Prospective selection follows coding");
  if (evidence.metrics) {
    if (evidence.metrics.comparability !== projection.comparability)
      throw new Error("Prospective comparison mismatch");
    for (const arm of evidence.metrics.arms) {
      const base = projection.arms.find((item) => item.variant === arm.variant);
      if (
        !base ||
        arm.runId !== base.runId ||
        arm.status !== base.status ||
        arm.baselineTreeSha256 !== base.initialTreeSha256 ||
        arm.finalTreeSha256 !== base.finalTreeSha256 ||
        (base.endedAt !== null &&
          Date.parse(evidence.metrics.recordedAt) < Date.parse(base.endedAt))
      )
        throw new Error("Prospective arm/source mismatch");
    }
  }
  return evidence;
}
