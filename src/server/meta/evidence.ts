import "server-only";
import { approvedScientistLineage } from "./approved-scientist-lineage";
import { isAuthenticatedRegistration } from "./registration-reader";
import { isAuthenticatedEvidenceLink } from "./evidence-link-reader";
import { validateProspectiveRegistration } from "./prospective-lineage";
import { z } from "zod";
import { MetaHypothesisV1Schema } from "@/lib/contracts/scientist";
import { DecisionReportAnalysisSchema } from "@/lib/report/decision-report";
import { EvidenceSummarySchema } from "@/lib/foresight/interpretation/contracts";
import { loadApprovedDecisionReports } from "@/server/artifacts/recording-catalog";
import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";
import { digest } from "./transport";
import { RequestFailure } from "../http/errors";

export type IssuedHypothesis = {
  hypothesis: z.infer<typeof MetaHypothesisV1Schema>;
  issuedAt: number;
  contextSha256: string;
  proposalStartedAt: number;
  proposalInputSha256: string;
};
// An operator registration is a prerequisite, NOT a receipt or substitute trust
// root. It can only narrow an already freshly authenticated #45 publication.
export { EvidenceLinkSchema, type EvidenceLink } from "./prospective-lineage";
import { EvidenceLinkSchema } from "./prospective-lineage";

const limitations = [
  "MODEL INTERPRETATION is advisory; AUTHENTICATED VERIFICATION and the deterministic report decision remain unchanged.",
  "One frozen task and particular implementation attempts do not establish general architectural superiority or causation.",
  "A/B alone does not establish Meta's incremental value; an equally informed independent non-Meta control is required.",
  "Proposed Meta counterexamples are visible proposals, not evidence that a protected holdout was tested.",
  "Unknown measurements remain unknown, not zero. Preparation and downstream metrics are separate and totals include preparation where measured.",
  "The publication has no authenticated predeclared effort criterion. Reservation limits are not actual spending; files touched are not additive.",
  "Publication-specific free-text limitations are withheld from model context. When present, the prediction remains not established; review the approved report separately.",
  "Regressions and boundary-violation counts are not established by overall required-check success.",
];

export function createEvidenceAdapter(
  options: {
    loadReports?: () => Promise<DecisionReportCatalog>;
    // Both resolvers must freshly authenticate existing server-owned custody,
    // authorization and revocations. Never expose them as request dependencies.
    resolveLink?: (id: string, issued: IssuedHypothesis) => Promise<unknown>;
    resolveRegistration?: (
      id: string,
      issued: IssuedHypothesis,
    ) => Promise<unknown>;
  } = {},
) {
  const loadReports = options.loadReports ?? loadApprovedDecisionReports;
  // #45 has no hypothesis/candidate/context lineage. No text matching, client
  // digest, environment switch or historical backfill can enable production.
  const resolveLink =
    options.resolveLink ?? approvedScientistLineage.resolveLink;
  const resolveRegistration =
    options.resolveRegistration ?? approvedScientistLineage.resolveRegistration;
  return async (id: string, issued: IssuedHypothesis, now: number) => {
    try {
      const originalLink = await resolveLink(id, issued);
      if (!isAuthenticatedEvidenceLink(originalLink))
        throw new Error("Unauthenticated link");
      const link = EvidenceLinkSchema.parse(originalLink.link);
      const originalRegistration = await resolveRegistration(
        link.prospectiveRegistrationId,
        issued,
      );
      if (!isAuthenticatedRegistration(originalRegistration))
        throw new Error("Unauthenticated registration");
      const registration = validateProspectiveRegistration(
        originalRegistration.registration,
        issued,
        now,
      );
      if (
        digest(originalLink.lineage) !== digest(originalRegistration.lineage) ||
        registration.id !== link.prospectiveRegistrationId ||
        registration.registeredAt !== link.registeredAt ||
        link.expiresAt > registration.expiresAt
      )
        throw new Error("Unregistered lineage");
      const h = issued.hypothesis;
      if (
        link.evidenceSummaryId !== id ||
        link.hypothesisId !== h.id ||
        link.hypothesisSha256 !== digest(h) ||
        link.contextSha256 !== issued.contextSha256 ||
        link.candidateId !== h.candidateId ||
        link.baselineCommit !== h.baselineCommit ||
        link.registeredAt < issued.issuedAt ||
        link.registeredAt > now ||
        link.expiresAt <= now ||
        link.publicationApprovedAt < link.registeredAt ||
        link.publicationApprovedAt > now
      )
        throw new Error("Unbound lineage");
      const catalog = await loadReports(); // Always fresh; never cache disclosure.
      if (catalog.state !== "available") throw new Error("Unavailable");
      const matches = catalog.reports.filter(
        (r) =>
          r.provenance === "FRESH_APPROVED_TOURNAMENT_LOADER" &&
          r.analysis.evidenceReferences?.projectionSha256 ===
            link.projectionSha256,
      );
      if (matches.length !== 1)
        throw new Error("Ambiguous or absent publication");
      const report = DecisionReportAnalysisSchema.parse(matches[0]!.analysis);
      const i = report.identity,
        o = report.observations,
        refs = report.evidenceReferences;
      if (
        !i ||
        !o ||
        !refs ||
        i.studyId !== link.studyId ||
        i.taskId !== link.taskId ||
        refs.studyId !== i.studyId ||
        refs.taskId !== i.taskId ||
        report.assumedCriterion !== null
      )
        throw new Error("Wrong study");
      for (const [key, value] of Object.entries(registration.study))
        if (i[key as keyof typeof i] !== value)
          throw new Error("Prospective study changed");
      const starts = [
        ...o.attempts.map((a) => a.startedAt),
        ...o.preparationAttempts.map((a) => a.startedAt),
      ].map(Date.parse);
      if (
        !starts.length ||
        starts.some((t) => !Number.isFinite(t) || t <= link.registeredAt)
      )
        throw new Error("Prospective registration required");
      const ends = [
        ...o.attempts.map((a) => a.endedAt),
        ...o.preparationAttempts.map((a) => a.finishedAt),
      ].map(Date.parse);
      if (
        ends.some((t) => !Number.isFinite(t) || t > link.publicationApprovedAt)
      )
        throw new Error("Publication approval precedes outcomes");
      if (
        o.arms.length !== 2 ||
        new Set(o.arms.map((a) => a.variant)).size !== 2 ||
        o.arms.some(
          (a) =>
            !a.runId ||
            !a.receiptId ||
            !a.baselineReceiptId ||
            !a.finalTreeSha256 ||
            a.baselineVerdict !== "VERIFIED",
        ) ||
        o.arms.find((a) => a.variant === "A")?.initialCommit !==
          h.baselineCommit
      )
        throw new Error("Incomplete receipts or source mismatch");
      if (
        new Set(o.arms.map((a) => a.runId)).size !== 2 ||
        new Set(o.arms.flatMap((a) => [a.receiptId, a.baselineReceiptId]))
          .size !== 4
      )
        throw new Error("Reused receipts");
      // Allowlist only: no metadata prose, source paths, attempts, operator
      // diagnostics, proposed commands, private prompts or raw report records.
      return EvidenceSummarySchema.parse({
        schemaVersion: "scientist-evidence-summary.v2",
        id,
        hypothesisId: h.id,
        publicationSha256: link.projectionSha256,
        linkExpiresAt: link.expiresAt,
        studyId: i.studyId,
        taskId: i.taskId,
        comparability: i.comparability,
        correctness: i.correctness,
        arms: o.arms.map((a) => ({
          variant: a.variant,
          runId: a.runId,
          receiptId: a.receiptId,
          verdict: a.verdict,
          checks: a.checks,
          preparation: a.preparation,
          downstream: a.downstream,
          total: a.total,
        })),
        metricUnits: {
          elapsedMs: "milliseconds",
          tokens: "tokens",
          costUsd: "USD",
          iterations: "iterations",
          filesTouched: "files_per_phase_not_additive",
        },
        missingMeasurements: (
          [
            "elapsedMs",
            "tokens",
            "costUsd",
            "iterations",
            "filesTouched",
          ] as const
        ).filter((k) =>
          o.arms.some(
            (a) =>
              a.preparation[k] === null ||
              a.downstream[k] === null ||
              a.total[k] === null,
          ),
        ),
        conditions: {
          model: i.model,
          order: i.order,
          withheldPublicationLimitationCount: o.limitations.length,
          completedArms: o.arms.every((a) => a.status === "completed"),
          blockerCount: o.blockers.length,
          deviationCount: o.deviations.length,
        },
        deterministicDecision: {
          author: "DETERMINISTIC_REPORT_NOT_MODEL",
          decision: report.decision,
        },
        limitations,
      });
    } catch {
      throw new RequestFailure("UNTRUSTED_EVIDENCE");
    }
  };
}
export type EvidenceAdapter = ReturnType<typeof createEvidenceAdapter>;
