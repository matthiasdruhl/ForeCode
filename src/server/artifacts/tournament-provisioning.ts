import "server-only";
import { IdSchema, Sha256Schema } from "@/lib/contracts/common";
import { invariant, sameIds } from "@/lib/contracts/validation";
import {
  loadDecisionReports,
  type DecisionReportCatalog,
} from "./decision-reports";
import {
  inspectTournamentRecordings,
  loadTournamentRecordings,
  type TournamentCatalog,
  type TournamentInspection,
  type TournamentRecordingConfig,
} from "./tournament-recordings";

export type ApprovedTournamentConfig = Omit<
  TournamentRecordingConfig,
  "registrations"
> & {
  registrations: readonly (TournamentRecordingConfig["registrations"][number] & {
    // Pins the entire approved task, conditions, arm identities and history.
    projectionSha256: string;
  })[];
};

// Source/operator composition only. This checks registration relationships;
// signatures and all original bytes remain authenticated by the existing stores.
function validateProvisioning(config: ApprovedTournamentConfig) {
  invariant(config.registrations.length <= 20, "Excessive registrations.");
  const studies = new Set<string>();
  const evaluations = new Set<string>();
  const runs = new Set<string>();
  for (const registration of config.registrations) {
    IdSchema.parse(registration.studyId);
    Sha256Schema.parse(registration.projectionSha256);
    invariant(!studies.has(registration.studyId), "Duplicate study.");
    studies.add(registration.studyId);
    invariant(
      config.publications.entries.has(registration.studyId) &&
        sameIds([...registration.arms.keys()], ["A", "B"]),
      "Exact approved study and arms required.",
    );
    for (const arm of registration.arms.values()) {
      for (const id of [arm.baselineEvaluationId, arm.futureEvaluationId]) {
        if (id === null) continue;
        IdSchema.parse(id);
        const entry = config.evaluations.entries.get(id);
        invariant(
          entry && !evaluations.has(id),
          "Unknown or reused evaluation.",
        );
        IdSchema.parse(entry.identity.runId);
        invariant(!runs.has(entry.identity.runId), "Reused run.");
        evaluations.add(id);
        runs.add(entry.identity.runId);
      }
    }
  }
  invariant(
    sameIds([...config.publications.entries.keys()], [...studies]) &&
      sameIds([...config.evaluations.entries.keys()], [...evaluations]),
    "Unregistered custody entries.",
  );
}

// Construct only in source-owned server composition (or synthetic tests).
// The returned read operations accept no request data or verification clock.
// Validation and original authentication repeat on EVERY read; no result cache.
export function createTournamentPublicationReader(
  config: ApprovedTournamentConfig | null,
) {
  function currentConfig() {
    if (config !== null) validateProvisioning(config);
    return config;
  }
  return Object.freeze({
    async loadTournaments(): Promise<TournamentCatalog> {
      try {
        return await loadTournamentRecordings(currentConfig());
      } catch {
        return { state: "unavailable", studies: [], unavailableCount: 1 };
      }
    },
    async loadReports(): Promise<DecisionReportCatalog> {
      try {
        return await loadDecisionReports(currentConfig());
      } catch {
        return { state: "unavailable", reports: [], unavailableCount: 1 };
      }
    },
    async inspect(): Promise<TournamentInspection> {
      try {
        return await inspectTournamentRecordings(currentConfig());
      } catch {
        return {
          state: "unavailable",
          availableCount: 0,
          unavailableCount: 1,
          failures: [
            { registrationIndex: null, code: "CONFIGURATION_INVALID" },
          ],
        };
      }
    },
  });
}
