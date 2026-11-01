// Explicit private read-only composition. No configured production registrations.
import { createProtectedEvaluationStore } from "../../../src/server/artifacts/evaluation-store";
import { createStudyCustodyStore } from "./custody";
import { loadOperatorStudy } from "./operator";
import { loadTournamentArm } from "./measured";
import type { TournamentReportConfig } from "./report-operator";
import {
  createProtectedMetricObservationReader,
  type MetricObservationReaderConfig,
} from "./metric-observation";

export async function loadPrivateTournamentMetrics(
  studyRoot: string,
  report: TournamentReportConfig,
  metrics: Pick<
    MetricObservationReaderConfig,
    | "protocol"
    | "root"
    | "workspaceRoots"
    | "sources"
    | "commitmentId"
    | "observationId"
  >,
  assessmentAt = new Date().toISOString(),
) {
  const loadRecord = async (id: string) =>
    (await createStudyCustodyStore(report.study.custody)).load(id);
  const loadEvaluation = async (id: string) =>
    (await createProtectedEvaluationStore(report.evaluations)).load(id);
  return createProtectedMetricObservationReader({
    ...metrics,
    loadRecord,
    loadEvaluation,
    async loadContext() {
      const study = await loadOperatorStudy(studyRoot, report.study);
      const arms = [];
      for (const variant of ["A", "B"] as const) {
        const entry = report.arms.get(variant);
        if (entry) {
          const arm = await loadTournamentArm({
            study,
            variant,
            root: report.runtimeOriginalRoot,
            workspaceRoots: report.workspaceRoots,
            ...entry,
            loadRecord,
            loadEvaluation,
            assessmentAt,
          });
          if (!arm) throw new Error("Metric runtime original unavailable.");
          arms.push(arm);
        }
      }
      return { study, arms, history: await loadRecord(report.historyId) };
    },
  }).load(assessmentAt);
}
