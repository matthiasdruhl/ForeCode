import { invariant } from "../../src/lib/contracts/validation";
import {
  RewardSchema,
  REWARD_VERSION,
  type Reward,
} from "../../src/lib/learning/contracts";
import { isAdmitted, type AdmittedObservation } from "./intake";

export function assessReward(
  observation: AdmittedObservation,
  mode: "AUTHENTIC" | "SYNTHETIC" = "AUTHENTIC",
): Reward[] {
  invariant(isAdmitted(observation), "Authenticated observation required.");
  const p = observation.projection;
  invariant(p.origin === mode, "Synthetic data isolation.");
  // v1 has no reviewed retry objective. Retain retries, but abstain rather than
  // reward a best-of-N selected outcome. Blocked/cancelled attempts are no labels.
  const eligible =
    p.comparison === "COMPARABLE" &&
    p.arms.every(
      (a) =>
        observation.correctness[a.action] !== null &&
        p.attempts.filter((t) => t.action === a.action).length === 1 &&
        p.attempts
          .filter((t) => t.action === a.action)
          .every((t) => t.status === "completed" || t.status === "failed"),
    );
  const allPass = p.arms.every((a) => observation.correctness[a.action] === 1);
  const allFail = p.arms.every((a) => observation.correctness[a.action] === 0);
  const costs = p.arms.map((a) =>
    a.costBasis === "authenticated_actual_usd" &&
    a.preparationCostUsd !== null &&
    a.downstreamCostUsd !== null
      ? a.preparationCostUsd + a.downstreamCostUsd
      : null,
  );
  const knownCosts = costs.every((x) => x !== null);
  const maxCost = knownCosts ? Math.max(...(costs as number[])) : null;
  return p.arms.map((a, i) => {
    const reasons: Reward["reasons"] = [];
    if (!eligible) reasons.push("INELIGIBLE");
    if (allPass) reasons.push("CORRECTNESS_TIE");
    if (allFail) reasons.push("BOTH_FAILED");
    if (!knownCosts) reasons.push("COST_UNKNOWN");
    if (observation.correctness[a.action] === 0)
      reasons.push("AUTHENTIC_FAILURE");
    return RewardSchema.parse({
      schemaVersion: REWARD_VERSION,
      observationSha256: observation.sha256,
      action: a.action,
      correctness: eligible ? observation.correctness[a.action] : null,
      // Never price a failing implementation against a correct one. Zero-cost
      // all-correct ties give every action the same efficiency (no complexity bias).
      efficiency:
        eligible && allPass && knownCosts
          ? maxCost === 0
            ? 1
            : 1 - costs[i]! / maxCost!
          : null,
      totalCostUsd: eligible ? costs[i] : null,
      reasons,
    });
  });
}
