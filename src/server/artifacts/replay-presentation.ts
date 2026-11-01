import "server-only";
import { projectTournamentReplayCatalog } from "@/lib/replay";
import type { TournamentCatalog } from "./tournament-recordings";
import type { DecisionReportCatalog } from "./decision-reports";

/** Join only freshly loaded, approved catalogs. This grants no input authority. */
export function composeReplayPresentation(
  tournaments: TournamentCatalog,
  reports: DecisionReportCatalog,
) {
  let replays;
  try {
    replays = projectTournamentReplayCatalog(tournaments);
  } catch {
    // A malformed projection must not leave an older study or decision visible.
    tournaments = { state: "unavailable", studies: [], unavailableCount: 1 };
    replays = projectTournamentReplayCatalog(tournaments);
  }
  const matching =
    reports.state === "available"
      ? reports.reports.filter((report) =>
          replays.replays.some(
            (replay) =>
              report.analysis.identity?.studyId === replay.studyId &&
              report.analysis.evidenceReferences?.projectionSha256 ===
                replay.projectionSha256,
          ),
        )
      : [];
  const unavailableCount =
    reports.unavailableCount + reports.reports.length - matching.length;
  const joined: DecisionReportCatalog = {
    state: matching.length
      ? "available"
      : reports.state === "empty" && tournaments.state === "empty"
        ? "empty"
        : "unavailable",
    reports: matching,
    unavailableCount,
  };
  return { tournaments, replays, reports: joined };
}
