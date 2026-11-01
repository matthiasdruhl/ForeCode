// Explicit counterfactual public disclosure fixture. No genuine trial/Meta data.
import { jsonDigest } from "../../src/lib/report/digests";
import { ProspectivePublicationSchema } from "../../src/lib/experiment/prospective-publication";
import type { PublicTournament } from "../../src/lib/experiment/tournament-publication";
export function syntheticProspectivePublication(
  projection: PublicTournament,
  reportSha256 = "f".repeat(64),
) {
  return ProspectivePublicationSchema.parse({
    schemaVersion: "tournament-prospective-evidence-publication.v1",
    authority: "owner_approved_archival_disclosure",
    studyId: projection.studyId,
    reportSha256,
    projectionSha256: jsonDigest(projection),
    preparedOriginalSha256: projection.preparedOriginalSha256,
    scopeLimitations: [
      "Counterfactual fixture only; no actual experiment or provider operation is represented.",
    ],
    reviewProvenance: {
      reviewAuthority: "owner_designated_ai_shared_host",
      blinding: "not_blind",
      priorStudyIds: ["synthetic-prior-study"],
      priorExposureSummary:
        "Synthetic fixture: prior proposal and source observations were known; no blinding is claimed.",
    },
    lineage: {
      hypothesisId: "11111111-1111-4111-8111-111111111111",
      contextSha256: "1".repeat(64),
      protocolOriginalSha256: projection.protocolOriginalSha256,
      commitmentOriginalSha256: "2".repeat(64),
      registrationOriginalSha256: "3".repeat(64),
      selectedCandidateId: "synthetic-permission-interface",
      registeredAt: "2026-10-28T12:00:10.000Z",
      selectedAt: "2026-10-28T12:01:00.000Z",
      proposalSummary:
        "Synthetic fixture: isolate existing personal permission operations behind a typed contract.",
      hypothesisStatement:
        "Synthetic fixture: B has strictly fewer final forbidden edges than A.",
      challengeSummary:
        "Synthetic fixture: a revoked member may attempt an unauthorized cancellation; this is advisory model text.",
      challengeOrigin: "model_generated_not_heldout",
      challengeRole: "advisory_does_not_replace_frozen_task",
      stages: (["propose", "hypothesize", "challenge"] as const).map(
        (stage, index) => ({
          stage,
          provider: "meta",
          mode: "live",
          modelId: "synthetic-meta-model",
          acceptedAt: `2026-10-28T12:00:0${index + 1}.000Z`,
          approvedRequestSha256: String(index + 4).repeat(64),
          acceptedResponseSha256: String(index + 7).repeat(64),
          inputTokens: index === 0 ? 0 : null,
          outputTokens: null,
          reservedMicroUsd: 10000,
          actualChargeUsd: null,
        }),
      ),
    },
    metrics: {
      authority: "historical_live_authenticated_observation",
      protocolVersion: "prospective-tournament-metrics.v3",
      observationVersion: "prospective-tournament-observations.v3",
      protocolSha256: "a".repeat(64),
      metricOriginalSha256: "b".repeat(64),
      retainedAuthenticatedResultSha256: "c".repeat(64),
      recordedAt: "2026-10-28T12:10:00.000Z",
      status: "complete",
      comparability: projection.comparability,
      boundaryRules: [
        {
          id: "http-store",
          from: "src/server/http.ts",
          to: "src/server/booking-store.ts",
        },
      ],
      authorizationCaseIds: [
        "rejection-site-001",
        "rejection-site-003",
        "rejection-site-005",
        "rejection-site-007",
      ],
      arms: (["A", "B"] as const).map((variant) => {
        const arm = projection.arms.find((arm) => arm.variant === variant)!;
        return {
          variant,
          runId: arm.runId,
          status: arm.status,
          baselineTreeSha256: arm.initialTreeSha256,
          finalTreeSha256: arm.finalTreeSha256,
          baselineForbiddenEdges: 0,
          finalForbiddenEdges: variant === "A" ? 1 : 0,
          baselineAuthorization: "not_applicable_before_future_requirement",
          finalAuthorizationFailures: 0,
        };
      }),
      prediction: "B_fewer_final_forbidden_edges_than_A",
      predictionAssessment:
        projection.comparability === "COMPARABLE"
          ? "supported"
          : "not_established",
      independentSamples: projection.comparability === "COMPARABLE" ? 1 : 0,
      authorizationScope: "four_selected_forbidden_rejection_sites",
      authorizationCaseCount: 4,
      authorizationPreserved: true,
    },
  });
}
