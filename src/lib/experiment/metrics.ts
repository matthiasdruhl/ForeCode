import { MetricsSchema } from "../contracts/evidence";
import type { ExperimentRunV1 } from "../contracts/evidence";

export type ExperimentMetrics = ExperimentRunV1["metrics"];
export const metricNames = [
  "elapsedMs",
  "tokens",
  "costUsd",
  "iterations",
  "filesTouched",
] as const;

export function unknownMetrics(): ExperimentMetrics {
  return {
    elapsedMs: null,
    tokens: null,
    costUsd: null,
    iterations: null,
    filesTouched: null,
  };
}

// Missing measurement propagates. Files touched needs the union of actual paths;
// adding counts would double-count a file edited in both phases.
export function preparationInclusiveMetrics(
  preparationInput: ExperimentMetrics,
  downstreamInput: ExperimentMetrics,
): ExperimentMetrics {
  const preparation = MetricsSchema.parse(preparationInput);
  const downstream = MetricsSchema.parse(downstreamInput);
  const total = unknownMetrics();
  for (const key of ["elapsedMs", "tokens", "costUsd", "iterations"] as const) {
    const left = preparation[key];
    const right = downstream[key];
    const value = left === null || right === null ? null : left + right;
    // Preserve unknown on overflow instead of inventing a capped observation.
    total[key] =
      value !== null &&
      Number.isFinite(value) &&
      value <= (key === "costUsd" ? 1_000_000 : 2_147_483_647)
        ? value
        : null;
  }
  return MetricsSchema.parse(total);
}
