import { ResearchExperience } from "@/components/v6/research-experience";
import {
  loadApprovedTournamentRecordings,
  loadApprovedDecisionReports,
} from "@/server/artifacts/recording-catalog";
import { publicForesightConfiguration } from "@/server/meta/configuration";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tournaments, reports] = await Promise.all([
    loadApprovedTournamentRecordings(),
    loadApprovedDecisionReports(),
  ]);
  return (
    <ResearchExperience
      tournaments={tournaments}
      reports={reports}
      configuration={publicForesightConfiguration(process.env)}
    />
  );
}
