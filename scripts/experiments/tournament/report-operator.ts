// Fresh operator composition; no request-selected evidence/root/authority.
import { createProtectedEvaluationStore } from "../../../src/server/artifacts/evaluation-store";
import { loadOperatorStudy, type OperatorStudyConfig } from "./operator";
import { createStudyCustodyStore } from "./custody";
import { loadTournamentArm, buildMeasuredTournamentReport } from "./measured";
import type { Variant } from "./paired";
export type TournamentReportConfig = {
  study: OperatorStudyConfig;
  runtimeOriginalRoot: string;
  workspaceRoots: readonly string[];
  evaluations: Parameters<typeof createProtectedEvaluationStore>[0];
  arms: ReadonlyMap<
    Variant,
    { admissionId: string; executionId: string; telemetryId?: string }
  >;
  historyId: string;
};
export const configuredTournamentReports: ReadonlyMap<
  string,
  TournamentReportConfig
> = new Map();
export async function loadPrivateTournamentReport(
  root: string,
  config: TournamentReportConfig,
  assessmentAt = new Date().toISOString(),
) {
  const study = await loadOperatorStudy(root, config.study);
  const custody = await createStudyCustodyStore(config.study.custody);
  const evaluations = await createProtectedEvaluationStore(config.evaluations);
  const arms = [];
  for (const variant of ["A", "B"] as const) {
    const arm = config.arms.get(variant);
    arms.push(
      arm
        ? await loadTournamentArm({
            study,
            variant,
            root: config.runtimeOriginalRoot,
            workspaceRoots: config.workspaceRoots,
            loadRecord: custody.load,
            ...arm,
            loadEvaluation: evaluations.load,
            assessmentAt,
          })
        : null,
    );
  }
  return buildMeasuredTournamentReport({
    study,
    arms,
    history: await custody.load(config.historyId),
    assessmentAt,
  });
}
