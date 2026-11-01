import "server-only";
import { jsonDigest } from "@/lib/report/digests";
import type { ProspectiveEvidenceCatalog } from "./prospective-publication";
import { projectTournamentReplayCatalog } from "@/lib/replay";
import type { TournamentCatalog } from "./tournament-recordings";
import type { DecisionReportCatalog } from "./decision-reports";

/** Join only freshly loaded, approved catalogs. This grants no input authority. */
export function composeReplayPresentation(
  tournaments: TournamentCatalog,
  reports: DecisionReportCatalog,
  prospectiveEvidence: ProspectiveEvidenceCatalog = {
    state: "empty",
    evidence: [],
    unavailableCount: 0,
  },
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
  const matchedEvidence = prospectiveEvidence.evidence.filter((evidence) =>
    tournaments.studies.some(
      (study) =>
        study.studyId === evidence.studyId &&
        jsonDigest(study) === evidence.projectionSha256 &&
        study.preparedOriginalSha256 === evidence.preparedOriginalSha256,
    ),
  );
  const missing =
    prospectiveEvidence.unavailableCount +
    prospectiveEvidence.evidence.length -
    matchedEvidence.length;
  const evidence: ProspectiveEvidenceCatalog = {
    state: matchedEvidence.length
      ? "available"
      : prospectiveEvidence.state === "empty"
        ? "empty"
        : "unavailable",
    evidence: matchedEvidence,
    unavailableCount: missing,
  };
  return {
    tournaments,
    replays,
    reports: joined,
    prospectiveEvidence: evidence,
  };
}
