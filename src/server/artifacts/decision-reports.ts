import "server-only";
import {
  assessDecisionReport,
  type DecisionReportAnalysis,
} from "@/lib/report/decision-report";
import {
  loadTournamentRecordings,
  type TournamentRecordingConfig,
} from "./tournament-recordings";

export type DecisionReportCatalog = {
  state: "empty" | "available" | "unavailable";
  reports: {
    provenance: "FRESH_APPROVED_TOURNAMENT_LOADER";
    support: "EVIDENCE_SUPPORTED" | "INCONCLUSIVE";
    analysis: DecisionReportAnalysis;
  }[];
  unavailableCount: number;
};

// No parsed report/projection input, authority flags, criterion overrides, cache
// or second authentication mechanism. Each call uses the existing fresh loader.
export async function loadDecisionReports(
  config: TournamentRecordingConfig | null,
  now = Date.now(),
): Promise<DecisionReportCatalog> {
  let catalog;
  try {
    catalog = await loadTournamentRecordings(config, now);
  } catch {
    // Also fail closed for malformed configuration supplied outside typed code.
    return { state: "unavailable", reports: [], unavailableCount: 1 };
  }
  const reports: DecisionReportCatalog["reports"] = [];
  let unavailableCount = catalog.unavailableCount;
  for (const study of catalog.studies) {
    // Approved publications currently carry no authenticated effort criterion.
    // In particular, complete telemetry cannot silently become a tie-breaker.
    const analysis = assessDecisionReport(study);
    if (analysis.identity === null) {
      unavailableCount++;
      continue;
    }
    reports.push(
      Object.freeze({
        provenance: "FRESH_APPROVED_TOURNAMENT_LOADER",
        support:
          analysis.decision === "INCONCLUSIVE"
            ? "INCONCLUSIVE"
            : "EVIDENCE_SUPPORTED",
        analysis,
      }),
    );
  }
  return {
    state: reports.length
      ? "available"
      : catalog.state === "empty"
        ? "empty"
        : "unavailable",
    reports,
    unavailableCount,
  };
}
