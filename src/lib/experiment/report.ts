import { unknownMetrics, type ExperimentMetrics } from "./metrics";

export type TournamentArmSummary = {
  variant: "A" | "B";
  runId: string | null;
  verdict: "VERIFIED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  preparation: ExperimentMetrics;
  downstream: ExperimentMetrics;
  total: ExperimentMetrics;
};
export type TournamentSummary = {
  state: "NOT_PROVISIONED";
  comparability: "BLOCKED";
  correctness: "INCONCLUSIVE";
  arms: TournamentArmSummary[];
  blockers: string[];
  limitations: string[];
};

// Public code-owned state only. There is no tournament recording registration or
// disclosure approval. A local report is not a public evidence source.
export function unprovisionedTournament(): TournamentSummary {
  return {
    state: "NOT_PROVISIONED",
    comparability: "BLOCKED",
    correctness: "INCONCLUSIVE",
    arms: (["A", "B"] as const).map((variant) => ({
      variant,
      runId: null,
      verdict: "INSUFFICIENT_EVIDENCE",
      preparation: unknownMetrics(),
      downstream: unknownMetrics(),
      total: unknownMetrics(),
    })),
    blockers: [
      "Independent preregistration of the exact future task and trial policy is absent.",
      "Real coding-agent admission is unavailable for this study.",
      "Protected future-task checks and authentic linked A/B outcomes are absent.",
      "No tournament evidence has been approved for public disclosure.",
    ],
    limitations: [
      "The local worksheet models effort; it is not a measured architecture experiment.",
      "A Meta-generated challenge is a proposal, not an independent hidden test.",
      "A/B preparation alone cannot establish Meta's incremental benefit without an equally informed non-Meta control.",
      "Unknown metrics remain unknown, including B's upfront preparation.",
    ],
  };
}
