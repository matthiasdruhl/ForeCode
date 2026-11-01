import { ResearchExperience } from "@/components/v6/research-experience";
import {
  loadApprovedTournamentRecordings,
  loadApprovedDecisionReports,
  loadApprovedProspectiveEvidence,
} from "@/server/artifacts/recording-catalog";
import { publicForesightConfiguration } from "@/server/meta/configuration";
import { composeReplayPresentation } from "@/server/artifacts/replay-presentation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tournaments, reports, prospectiveEvidence] = await Promise.all([
    loadApprovedTournamentRecordings(),
    loadApprovedDecisionReports(),
    loadApprovedProspectiveEvidence(),
  ]);
  const presentation = composeReplayPresentation(
    tournaments,
    reports,
    prospectiveEvidence,
  );
  return (
    <ResearchExperience
      {...presentation}
      configuration={publicForesightConfiguration(process.env)}
    />
  );
}
