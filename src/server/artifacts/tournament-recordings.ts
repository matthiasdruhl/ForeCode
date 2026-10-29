import "server-only";
import { invariant, sameIds } from "@/lib/contracts/validation";
import {
  tournamentRequiredChecks,
  type PublicTournament,
} from "@/lib/experiment/tournament-publication";
import {
  createProtectedEvaluationStore,
  createProtectedTournamentPublicationStore,
  isTrustedEvaluation,
  isTrustedTournamentPublication,
} from "./evaluation-store";
export type TournamentCatalog = {
  state: "empty" | "available" | "unavailable";
  studies: PublicTournament[];
  unavailableCount: number;
};
export type TournamentRecordingConfig = {
  publications: Parameters<typeof createProtectedTournamentPublicationStore>[0];
  evaluations: Parameters<typeof createProtectedEvaluationStore>[0];
  registrations: readonly {
    studyId: string;
    arms: ReadonlyMap<
      "A" | "B",
      { baselineEvaluationId: string; futureEvaluationId: string | null }
    >;
  }[];
};
export async function loadTournamentRecordings(
  config: TournamentRecordingConfig | null,
  now = Date.now(),
): Promise<TournamentCatalog> {
  if (!config || config.registrations.length === 0)
    return { state: "empty", studies: [], unavailableCount: 0 };
  try {
    invariant(
      config.registrations.length <= 20 &&
        new Set(config.registrations.map((x) => x.studyId)).size ===
          config.registrations.length,
      "Duplicate or excessive study registrations.",
    );
    const publications = await createProtectedTournamentPublicationStore(
        config.publications,
      ),
      evaluations = await createProtectedEvaluationStore(config.evaluations);
    const studies: PublicTournament[] = [];
    let unavailableCount = 0;
    for (const registration of config.registrations) {
      try {
        const publication = await publications.load(registration.studyId, now);
        invariant(
          isTrustedTournamentPublication(publication),
          "Current original disclosure required.",
        );
        const projection = publication.artifact.projection;
        invariant(
          sameIds(
            projection.arms.map((x) => x.variant),
            ["A", "B"],
          ),
          "Invalid pair projection.",
        );
        const fixtureSha256 = projection.arms.find(
          (x) => x.variant === "A",
        )!.initialTreeSha256;
        const baselineRuns = new Set<string>();
        for (const arm of projection.arms) {
          const entry = registration.arms.get(arm.variant);
          invariant(entry, "Arm registration missing.");
          const baseline = await evaluations.load(entry.baselineEvaluationId),
            future = entry.futureEvaluationId
              ? await evaluations.load(entry.futureEvaluationId)
              : null;
          invariant(
            isTrustedEvaluation(baseline),
            "Fresh original protected evidence required.",
          );
          const a = baseline.receipt;
          invariant(!baselineRuns.has(a.runId), "Baseline reuse.");
          baselineRuns.add(a.runId);
          invariant(
            a.id === arm.baselineReceiptId &&
              a.evaluatedTreeSha256 === arm.initialTreeSha256 &&
              a.fixtureSha256 === fixtureSha256 &&
              a.evaluatorSha256 === projection.baselineEvaluatorSha256 &&
              a.testSuiteSha256 === projection.baselineSuiteSha256 &&
              a.requiredPolicySha256 === projection.baselinePolicySha256 &&
              sameIds(
                a.requiredCheckIds,
                tournamentRequiredChecks.slice(0, 5),
              ) &&
              baseline.verification.verdict === arm.baselineVerdict,
            "Baseline projection differs from originals.",
          );
          if (arm.receiptId === null) {
            invariant(
              future === null &&
                arm.verdict === "INSUFFICIENT_EVIDENCE" &&
                arm.checks.every((check) => check.status === "not_run"),
              "Missing evidence cannot support a check claim.",
            );
            continue;
          }
          invariant(
            isTrustedEvaluation(future),
            "Original future evidence unavailable.",
          );
          const b = future.receipt;
          invariant(
            b.id === arm.receiptId &&
              b.runId === arm.runId &&
              b.evaluatedTreeSha256 === arm.finalTreeSha256 &&
              b.fixtureSha256 === fixtureSha256 &&
              b.evaluatorSha256 === projection.futureEvaluatorSha256 &&
              b.testSuiteSha256 === projection.futureSuiteSha256 &&
              b.requiredPolicySha256 === projection.futurePolicySha256 &&
              sameIds(b.requiredCheckIds, tournamentRequiredChecks) &&
              future.verification.verdict === arm.verdict,
            "Future projection differs from originals.",
          );
          invariant(
            sameIds(
              arm.checks.map((x) => x.id),
              tournamentRequiredChecks,
            ) &&
              arm.checks.every(
                (check) =>
                  check.status ===
                  (future.checks.find((x) => x.id === check.id)?.status ??
                    "not_run"),
              ),
            "Incomplete or altered checks projection.",
          );
        }
        studies.push(projection);
      } catch {
        unavailableCount++;
      }
    }
    return {
      state: studies.length ? "available" : "unavailable",
      studies,
      unavailableCount,
    };
  } catch {
    return {
      state: "unavailable",
      studies: [],
      unavailableCount: config.registrations.length,
    };
  }
}
