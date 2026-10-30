import { invariant } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import {
  PublicTournamentSchema,
  TournamentPublicMetadataSchema,
  disclosureSubject,
} from "../../../src/lib/experiment/tournament-publication";
import { isMeasuredTournamentReport } from "./measured";
import { requireHeldRecord, immutable } from "./custody";

// Preparing a projection does not authorize publishing it. Approval must bind
// these exact bytes AND the authentic original private report's digest.
export function prepareTournamentPublication(
  report: unknown,
  metadataInput: unknown,
) {
  invariant(
    isMeasuredTournamentReport(report),
    "Original authenticated private report required.",
  );
  const metadata = TournamentPublicMetadataSchema.parse(metadataInput);
  invariant(
    new Set(metadata.publishSourcePaths).size ===
      metadata.publishSourcePaths.length,
    "Duplicate source disclosure.",
  );
  const evidence = report.preparationEvidence;
  const changed = report.preparedChangedFiles;
  invariant(
    metadata.publishSourcePaths.every((p) => changed.includes(p)),
    "Source projection is not an actual prepared diff.",
  );
  const projection = PublicTournamentSchema.parse({
    schemaVersion: "tournament-public-projection.v1",
    studyId: report.studyId,
    taskId: report.taskId,
    title: metadata.title,
    futureProblem: metadata.futureProblem,
    reviewedProposal: metadata.reviewedProposal,
    hypothesis: metadata.hypothesis,
    taskDefinitionSha256: report.taskDefinitionSha256,
    definitionSha256: report.definitionSha256,
    protocolOriginalSha256: report.protocolOriginalSha256,
    preparedOriginalSha256: report.preparedOriginalSha256,
    model: report.model,
    order: report.order,
    comparability: report.comparability,
    correctness: report.correctness,
    baselineEvaluatorSha256: report.baselineEvaluator.evaluatorSha256,
    baselineSuiteSha256: report.baselineEvaluator.testSuiteSha256,
    baselinePolicySha256: report.baselineEvaluator.requiredPolicySha256,
    futureEvaluatorSha256: report.futureEvaluator.evaluatorSha256,
    futureSuiteSha256: report.futureEvaluator.testSuiteSha256,
    futurePolicySha256: report.futureEvaluator.requiredPolicySha256,
    arms: report.arms.map((a) => ({
      variant: a.variant,
      runId: a.runId,
      status: a.status,
      baselineVerdict: a.baselineVerdict,
      verdict: a.verdict,
      initialCommit: a.initialCommit,
      initialTreeSha256: a.initialTreeSha256,
      finalTreeSha256: a.finalTreeSha256,
      receiptId: a.receiptId,
      baselineReceiptId: a.baselineReceiptId,
      preparation: a.preparation,
      downstream: a.downstream,
      total: a.total,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      reservedMicroUsd: a.reservedMicroUsd,
      changedFileCount: a.changedFiles?.length ?? null,
      totalChangedFileCount: a.totalChangedFiles?.length ?? null,
      checks: a.checks,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
    })),
    sourceComparison: metadata.publishSourcePaths.length
      ? metadata.publishSourcePaths.map((path) => ({
          path,
          beforeSha256:
            evidence.originalManifest.find((x) => x.path === path)?.sha256 ??
            null,
          afterSha256:
            evidence.preparedManifest.find((x) => x.path === path)?.sha256 ??
            null,
        }))
      : null,
    attempts: report.attempts.map((a) => ({
      id: a.id,
      variant: a.variant,
      status: a.status,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
    })),
    preparationAttempts: report.preparationAttempts,
    blockers: report.blockers,
    deviations: report.deviations,
    limitations: report.limitations.filter(
      (x) => x !== "Private report; no publication authority is implied.",
    ),
  });
  return immutable({ reportSha256: jsonDigest(report), projection });
}
export function authorizeTournamentPublication(
  report: unknown,
  metadata: unknown,
  approval: unknown,
  at: string,
) {
  const artifact = prepareTournamentPublication(report, metadata);
  requireHeldRecord(approval, {
    studyId: artifact.projection.studyId,
    kind: "disclosure",
    subjectSha256: disclosureSubject(artifact),
    predecessorSha256: artifact.projection.preparedOriginalSha256,
    at,
  });
  return artifact;
}
