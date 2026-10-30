// Synthetic originals and test-owned signatures only. No production catalog.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { learningFixture, t } from "./learning";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import {
  createApprovedEvidenceSource,
  decisionCommitmentSubject,
  type SourceEntry,
} from "../../scripts/learning/source";
import type { DraftExportRequest } from "../../scripts/learning/export";
import { isPreparedStudy } from "../../scripts/experiments/tournament/study";
import { buildTournamentReport } from "../../scripts/experiments/tournament/report";
import { invariant } from "../../src/lib/contracts/validation";

// Test bridge uses ACTUAL existing trust predicates/report code, never mocks.
// The production bridge remains owned by the core export's separate review.
export const mainDraftSource = {
  inspect(request: DraftExportRequest) {
    invariant(
      isPreparedStudy(request.study),
      "Existing authenticated prepared study required.",
    );
    const study = request.study,
      plan = study.draft.plan;
    const report = buildTournamentReport({
      plan,
      attempts: request.attempts,
      baselines: request.baselines,
      evaluations: request.evaluations,
    });
    return {
      schemaVersion: "learning-draft-source.local.v1",
      studyId: report.studyId,
      decisionAt: study.evidence.selectionAt,
      originalTreeSha256: plan.conditions[0]!.originalTreeSha256,
      visibleRoadmapSha256: plan.visibleRoadmapSha256,
      protocolOriginalSha256: study.protocol.sha256,
      preparedOriginalSha256: study.prepared.sha256,
      sourceReportSha256: jsonDigest(report),
      sourceComparability: report.comparability,
      preparationHistorySha256: jsonDigest(study.evidence.attempts),
      preparationAttempts: study.evidence.attempts.map((a) => ({
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        endedAt: a.finishedAt,
      })),
      arms: report.arms.map((a) => ({
        variant: a.variant,
        runId: a.runId,
        receiptId: a.receiptId,
        initialTreeSha256: a.initialTreeSha256,
        finalTreeSha256: a.finalTreeSha256,
        baselineVerdict: a.baselineVerdict,
        futureVerdict: a.verdict,
      })),
      attempts: report.attempts.map((a) => ({
        id: a.id,
        variant: a.variant,
        status: a.status,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
      })),
      blockers: [
        ...new Set([
          ...report.blockers,
          ...report.runtimeBlockers,
          ...report.deviations,
        ]),
      ],
    };
  },
};

export async function learningSourceFixture(
  cleanup: string[],
  options: Parameters<typeof learningFixture>[1] = {},
) {
  const f = await learningFixture(cleanup, options),
    root = path.join(f.parent, "exports");
  await mkdir(root, { mode: 0o700 });
  const p = f.projection;
  const decision = (await f.hold({
    schemaVersion: "tournament-custodian-record.local.v1",
    id: "learning-decision",
    studyId: p.studyId,
    kind: "disclosure",
    subjectSha256: decisionCommitmentSubject(p),
    predecessorSha256: p.protocolOriginalSha256,
    heldAt: p.decisionAt,
    expiresAt: "2026-10-29T12:00:00.000Z",
  }))!;
  const packet = {
    schemaVersion: "approved-learning-export.local.v1",
    sourceReportSha256: jsonDigest({ synthetic: true }),
    projection: p,
  };
  const approval = (await f.hold({
    schemaVersion: "tournament-custodian-record.local.v1",
    id: "learning-export",
    studyId: p.studyId,
    kind: "disclosure",
    subjectSha256: jsonDigest(packet),
    predecessorSha256: p.protocolOriginalSha256,
    heldAt: t(12),
    expiresAt: "2026-10-29T12:00:00.000Z",
  }))!;
  const bytes = canonicalJson(packet),
    file = "approved.json";
  await writeFile(path.join(root, file), bytes, { mode: 0o400 });
  const entry: SourceEntry = {
    file,
    bytesSha256: sha256(bytes),
    packetSha256: jsonDigest(packet),
    projectionSha256: jsonDigest(p),
    studyId: p.studyId,
    origin: "SYNTHETIC",
    protocolId: f.input.protocolId,
    decisionRecordId: decision.record.id,
    projectionApprovalId: f.input.approvalId,
    exportApprovalId: approval.record.id,
  };
  const config = {
    root,
    excludedRoots: [f.root, path.join(f.parent, "worker")],
    entries: new Map([["approved-unit", entry]]),
    loadRecord: f.input.loadRecord,
    loadEvaluation: f.input.loadEvaluation,
    mode: "SYNTHETIC" as const,
  };
  return {
    ...f,
    sourceRoot: root,
    file: path.join(root, file),
    config,
    packet,
    entry,
    source: () => createApprovedEvidenceSource(config),
  };
}
