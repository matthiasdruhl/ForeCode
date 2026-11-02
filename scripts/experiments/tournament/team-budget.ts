import { jsonDigest } from "../../../src/lib/report/digests";
import type { StudyDefinition } from "./study";

// Defaults for fresh, unsigned studies. Existing definitions are never edited.
export const maximumTeamBudget = Object.freeze({
  maxSeconds: 1800,
  maxRequests: 1000,
  maxIterations: 1000,
  tokenLimit: 1_000_000_000,
  maxOutputTokens: 65536,
  nativeRolloutTokenLimit: 1_000_000_000,
  spendUsd: 1000,
  maxTransientRetries: 2,
});

export const maximumTeamBudgetAssumption =
  "Per arm coding bounds:1800s,1000 requests/iterations,1B reserved tokens,1B native guard,65536 output tokens/response. Retry definite HTTP503 up to twice; each attempt consumes the same call/token/money/time budgets without refunds. Other failures are not retried. Proposed limits grant no runtime admission.";

/** Apply only while constructing a fresh definition, before any commitment. */
export function applyMaximumTeamBudget(definition: StudyDefinition): void {
  definition.restrictions.maxRequests = maximumTeamBudget.maxRequests;
  definition.restrictions.maxOutputTokens = maximumTeamBudget.maxOutputTokens;
  definition.restrictions.nativeRolloutTokenLimit =
    maximumTeamBudget.nativeRolloutTokenLimit;
  definition.restrictions.maxTransientRetries =
    maximumTeamBudget.maxTransientRetries;
  definition.protocol.scenario.assumptions = [
    ...definition.protocol.scenario.assumptions.filter(
      (text) => !text.startsWith("Per arm coding bounds:"),
    ),
    maximumTeamBudgetAssumption,
  ];
  const taskSha256 = jsonDigest({
    taskId: definition.protocol.task.id,
    request: definition.protocol.scenario.request,
    assumptions: definition.protocol.scenario.assumptions,
    acceptanceIds: definition.protocol.scenario.acceptanceIds,
  });
  for (const condition of definition.protocol.conditions) {
    Object.assign(condition.budget, {
      maxSeconds: maximumTeamBudget.maxSeconds,
      maxIterations: maximumTeamBudget.maxIterations,
      tokenLimit: maximumTeamBudget.tokenLimit,
      spendUsd: maximumTeamBudget.spendUsd,
    });
    condition.taskSha256 = taskSha256;
  }
}
