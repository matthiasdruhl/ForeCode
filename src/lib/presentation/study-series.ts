import { z } from "zod";
import {
  PublicTournamentSchema,
  tournamentRequiredChecks,
  type PublicTournament,
} from "@/lib/experiment/tournament-public-projection";

export type StudyCatalog = {
  state: "empty" | "available" | "unavailable";
  studies: readonly PublicTournament[];
  unavailableCount: number;
};
const CatalogSchema = z.strictObject({
  state: z.enum(["empty", "available", "unavailable"]),
  studies: z.array(PublicTournamentSchema).max(20),
  unavailableCount: z.number().int().nonnegative().safe(),
});
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;

/** Presentation of an already authenticated catalog. Parsing grants no authority. */
export function projectStudySeries(input: StudyCatalog) {
  const parsed = CatalogSchema.safeParse(input);
  const catalog = parsed.success ? parsed.data : undefined;
  const valid =
    catalog &&
    catalog.studies.length + catalog.unavailableCount <= 20 &&
    (catalog.state === "available"
      ? catalog.studies.length > 0
      : catalog.studies.length === 0) &&
    (catalog.state !== "empty" || catalog.unavailableCount === 0) &&
    (catalog.state !== "unavailable" || catalog.unavailableCount > 0) &&
    unique(catalog.studies.map((study) => study.studyId)) &&
    catalog.studies.every(
      (study) =>
        unique(study.arms.map((arm) => arm.variant)) &&
        unique(study.attempts.map((attempt) => attempt.id)) &&
        unique(study.preparationAttempts.map((attempt) => attempt.id)) &&
        study.arms.every(
          (arm) =>
            unique(arm.checks.map((check) => check.id)) &&
            tournamentRequiredChecks.every((id) =>
              arm.checks.some((check) => check.id === id),
            ),
        ),
    );
  // Preserve only an explicitly safe aggregate on failure; disclose no rows or errors.
  const unavailableCount =
    Number.isSafeInteger(input?.unavailableCount) && input.unavailableCount >= 0
      ? input.unavailableCount
      : null;
  return {
    state: valid ? catalog.state : ("unavailable" as const),
    unavailableCount,
    catalogInvalid: !valid,
    entries: valid
      ? catalog.studies.map((study) => ({
          study,
          compatibility: "UNCLASSIFIED" as const,
        }))
      : [],
  };
}
