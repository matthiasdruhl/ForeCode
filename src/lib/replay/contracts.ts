import type { PublicTournament } from "../experiment/tournament-publication";

export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type ReplayVariant = "A" | "B";
export const replayStages = [
  "hypothesis",
  "preparation",
  "coding",
  "verification",
  "decision",
] as const;
export type ReplayStage = (typeof replayStages)[number];
export type ReplayAvailability =
  | "observed_in_projection"
  | "metadata_only"
  | "not_run"
  | "blocked"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "unknown"
  | "publication_unavailable";
export type ReplayTiming = {
  startedAt: string | null;
  endedAt: string | null;
  state: "recorded_interval" | "partial_interval" | "unknown" | "inconsistent";
  issues: ("END_BEFORE_START" | "ARM_ATTEMPT_TIME_MISMATCH")[];
};

/** A selector into this projection, never a URL or a certificate. Baseline run
 * identity is deliberately absent: the public arm has only the future run ID. */
export type ReplayEvidenceReference = DeepReadonly<{
  studyId: string;
  selector:
    | { kind: "study" }
    | { kind: "arm"; variant: ReplayVariant }
    | { kind: "attempt"; attemptId: string; variant: ReplayVariant }
    | { kind: "preparation_attempt"; attemptId: string }
    | { kind: "baseline"; variant: ReplayVariant }
    | { kind: "future"; variant: ReplayVariant }
    | { kind: "check"; variant: ReplayVariant; checkId: string }
    | { kind: "source_comparison"; index: number };
  variant: ReplayVariant | null;
  runId: string | null;
  receiptId: string | null;
  sourceTreeSha256: string | null;
  checkId: string | null;
  comparison: {
    path: string;
    beforeSha256: string | null;
    afterSha256: string | null;
  } | null;
}>;

type EventData =
  | { kind: "research_context"; hypothesis: string; reviewedProposal: string }
  | {
      kind: "architecture_preparation";
      role: "original" | "prepared_alternative";
    }
  | {
      kind: "preparation_attempt";
      attemptId: string;
      status: PublicTournament["preparationAttempts"][number]["status"];
    }
  | {
      kind: "coding_attempt";
      attemptId: string;
      status: PublicTournament["attempts"][number]["status"];
    }
  | { kind: "arm_outcome"; status: PublicTournament["arms"][number]["status"] }
  | {
      kind: "independent_verification";
      phase: "baseline" | "future";
      verdict: PublicTournament["arms"][number]["verdict"];
    }
  | {
      kind: "independent_check";
      checkId: string;
      status: PublicTournament["arms"][number]["checks"][number]["status"];
    }
  | {
      kind: "source_comparison";
      comparisons: NonNullable<PublicTournament["sourceComparison"]>;
    }
  | {
      kind: "engineering_decision";
      comparability: PublicTournament["comparability"];
      correctness: PublicTournament["correctness"];
      report: "not_supplied";
    }
  | {
      kind: "evidence_unavailable";
      reason: "ATTEMPT_HISTORY_ABSENT" | "SOURCE_COMPARISON_ABSENT";
    };

export type ReplayEvent = DeepReadonly<{
  id: string;
  studyId: string;
  stage: ReplayStage;
  variant: ReplayVariant | null;
  label: string;
  description: string;
  availability: ReplayAvailability;
  basis:
    | "projection_observation"
    | "approved_metadata_context"
    | "unavailable_stage";
  timing: ReplayTiming;
  evidence: ReplayEvidenceReference[];
  data: EventData;
}>;
export type ReplayChronology = DeepReadonly<{
  commonClock: "not_established";
  globalOrder: "conceptual_stages_only";
  /** No inter-track time ordering, overlap or concurrency claim. */
  tracks: {
    eventId: string;
    state: ReplayTiming["state"];
    observations: { boundary: "start" | "end"; recordedAt: string }[];
    issues: ReplayTiming["issues"];
  }[];
}>;
export type TournamentReplay = DeepReadonly<{
  schemaVersion: "tournament-replay.v1";
  provenance: "UNAUTHENTICATED_PROJECTION";
  recordingAvailability: "supplied_projection";
  projectionSha256: string;
  studyId: string;
  taskId: string;
  taskDefinitionSha256: string;
  definitionSha256: string;
  protocolOriginalSha256: string;
  preparedOriginalSha256: string;
  title: string;
  futureProblem: string;
  model: string;
  declaredOrder: PublicTournament["order"];
  comparability: PublicTournament["comparability"];
  correctness: PublicTournament["correctness"];
  arms: PublicTournament["arms"];
  evaluators: {
    baseline: {
      evaluatorSha256: string;
      suiteSha256: string;
      policySha256: string;
    };
    future: {
      evaluatorSha256: string;
      suiteSha256: string;
      policySha256: string;
    };
  };
  stages: { stage: ReplayStage; eventIds: string[] }[];
  events: ReplayEvent[];
  chronology: ReplayChronology;
  missing: {
    code: string;
    eventId: string | null;
    variant: ReplayVariant | null;
  }[];
  blockers: string[];
  deviations: string[];
  limitations: string[];
  decisionReference: {
    state: "not_supplied";
    studyId: string;
    projectionSha256: string;
  };
}>;

/** Structural compatibility with the existing loader's catalog; no server import. */
export type ReplayCatalogInput = {
  state: "empty" | "available" | "unavailable";
  studies: readonly PublicTournament[];
  unavailableCount: number;
};
export type TournamentReplayCatalog = DeepReadonly<{
  state: ReplayCatalogInput["state"];
  provenance: "UNAUTHENTICATED_PROJECTION";
  replays: TournamentReplay[];
  unavailableCount: number;
  stages: {
    stage: ReplayStage;
    availability: "unknown" | "publication_unavailable";
  }[];
}>;
