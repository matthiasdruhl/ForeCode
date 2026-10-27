import {
  ScoreBasisSchema,
  type DecisionV1,
  type Score,
} from "../contracts/architecture";
import {
  actionWeights,
  invariant,
  normalizedPath,
  unique,
  validateDecision,
  validateResearchContext,
  type ResearchContext,
} from "../contracts/validation";
import { researchKey, WorksheetSchema } from "./worksheet";

export function rankDecision(decision: DecisionV1) {
  return decision.candidateIds
    .map((id) => {
      const scores = decision.perScenario.filter(
        (score) => score.candidateId === id,
      );
      return {
        id,
        upfront: scores[0]!.upfrontCost,
        worst: Math.max(...scores.map((score) => score.regret)),
      };
    })
    .sort(
      (a, b) =>
        a.worst - b.worst ||
        a.upfront - b.upfront ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
export function recommendationReason(decision: DecisionV1): string {
  if (!decision.perScenario.length) return "ForeCode abstains.";
  const ranked = rankDecision(decision);
  const tied = ranked.filter((entry) => entry.worst === ranked[0]!.worst);
  if (tied.length === 1) return "Smallest worst scenario regret.";
  const upfrontTied = tied.filter(
    (entry) => entry.upfront === tied[0]!.upfront,
  );
  return upfrontTied.length === 1
    ? "Worst regret tied; lower upfront cost breaks the tie."
    : "Worst regret and upfront cost tied; lexically lowest candidate ID breaks the tie.";
}

export function compareReviewed(
  contextInput: ResearchContext,
  worksheetInput: unknown,
): DecisionV1 {
  const context = validateResearchContext(contextInput);
  const sheet = WorksheetSchema.parse(worksheetInput);
  invariant(
    sheet.contextKey === researchKey(context),
    "Worksheet does not match exact research content.",
  );
  invariant(
    context.scenarios.length > 0,
    "Comparison requires at least one scenario.",
  );
  const paths = new Set(context.graph.modules.map((item) => item.path));
  for (const candidate of context.candidates) {
    for (const entry of candidate.changePlan)
      invariant(paths.has(entry.module), "Unreviewed plan path in this slice.");
    for (const entry of candidate.constraints)
      invariant(
        paths.has(entry.from) && paths.has(entry.to),
        "Unreviewed constraint path in this slice.",
      );
  }
  unique(
    sheet.pairs.map((pair) => `${pair.candidateId}:${pair.scenarioId}`),
    "worksheet pairs",
  );
  unique(
    sheet.unknowns.map((entry) => entry.unknown),
    "unknown reviews",
  );
  for (const entry of sheet.unknowns)
    invariant(
      context.graph.unknowns.includes(entry.unknown),
      "Unknown review reference mismatch.",
    );
  const limitations: string[] = [];
  if (!sheet.scope.trim())
    limitations.push("Comparison scope has not been reviewed.");
  if (sheet.comparability !== "shared_scope")
    limitations.push(
      sheet.comparability === "incomparable"
        ? "Alternatives are incomparable under the reviewed scope."
        : "A shared scope for every alternative and scenario has not been reviewed.",
    );
  for (const unknown of new Set(context.graph.unknowns)) {
    const review = sheet.unknowns.find((entry) => entry.unknown === unknown);
    if (
      !review ||
      review.disposition !== "out_of_scope" ||
      !review.rationale.trim()
    )
      limitations.push(
        `Relevant or unreviewed graph unknown: ${unknown}`.slice(0, 500),
      );
  }
  // Validate even incomplete rows before considering abstention: malformed data
  // must never be disguised as an otherwise valid inconclusive comparison.
  for (const pair of sheet.pairs) {
    invariant(
      context.candidates.some((item) => item.id === pair.candidateId) &&
        context.scenarios.some((item) => item.id === pair.scenarioId),
      "Dangling worksheet pair reference.",
    );
    if (pair.basis.projectedChangedModules !== null) {
      unique(pair.basis.projectedChangedModules, "projected paths");
      for (const path of pair.basis.projectedChangedModules) {
        normalizedPath(path);
        invariant(paths.has(path), "Unreviewed projected path in this slice.");
      }
    }
  }
  for (const scenario of context.scenarios)
    for (const candidate of context.candidates) {
      const pair = sheet.pairs.find(
        (entry) =>
          entry.candidateId === candidate.id &&
          entry.scenarioId === scenario.id,
      );
      const label = `${candidate.id} / ${scenario.id}`;
      if (
        !pair ||
        !pair.reviewed ||
        !pair.rationale.trim() ||
        Object.values(pair.basis).includes(null)
      )
        limitations.push(
          `Incomplete reviewed basis: ${label}. Paths, integer counts (including zero) and rationale require explicit review.`,
        );
      if (pair?.relevantUnknown.trim())
        limitations.push(
          `Unknown relevant basis for ${label}: ${pair.relevantUnknown}`.slice(
            0,
            500,
          ),
        );
    }
  const decision: DecisionV1 = {
    schemaVersion: "decision.v1",
    id: "reviewed-comparison",
    graphId: context.graph.id,
    baselineCommit: context.graph.repoCommit,
    scenarioIds: context.scenarios.map((item) => item.id),
    candidateIds: context.candidates.map((item) => item.id),
    scoringVersion: "modeled_effort_points_v1",
    assumptions: [
      "Developer-reviewed assumptions; not observed future effort or an independently verified recommendation.",
      ...(sheet.scope.trim() ? [sheet.scope.trim()] : []),
    ],
    perScenario: [],
    recommendationId: null,
    limitations: limitations.length
      ? [limitations[0]!, ...limitations.slice(1, 31)]
      : [
          "Bounded to the reviewed scope and existing graph paths; no runtime integration, measured architecture benefit, Meta incremental advantage or protected verification is established.",
        ],
  };
  if (limitations.length) return validateDecision(decision, context);
  const scores: Score[] = context.scenarios.flatMap((scenario) =>
    context.candidates.map((candidate) => {
      const review = sheet.pairs.find(
        (pair) =>
          pair.candidateId === candidate.id && pair.scenarioId === scenario.id,
      )!;
      const basis = ScoreBasisSchema.parse(review.basis);
      const upfrontCost = candidate.changePlan.reduce(
        (sum, entry) => sum + actionWeights[entry.action],
        0,
      );
      const downstreamCost =
        2 * basis.projectedChangedModules.length +
        basis.projectedRouteChanges +
        2 * basis.unresolvedRelevantDependencies;
      return {
        candidateId: candidate.id,
        scenarioId: scenario.id,
        costUnit: "modeled_effort_points_v1",
        upfrontCost,
        downstreamCost,
        totalCost: upfrontCost + downstreamCost,
        regret: 0,
        rationale: review.rationale.trim(),
        basis,
      };
    }),
  );
  decision.perScenario = scores.map((score) => ({
    ...score,
    regret:
      score.totalCost -
      Math.min(
        ...scores
          .filter((other) => other.scenarioId === score.scenarioId)
          .map((other) => other.totalCost),
      ),
  }));
  decision.recommendationId = rankDecision(decision)[0]!.id;
  return validateDecision(decision, context);
}
