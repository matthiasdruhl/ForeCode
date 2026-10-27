import { z } from "zod";
import {
  ProposeRequestSchema,
  ProposeResponseSchema,
  ScientistHypothesizeRequestSchema,
  ScientistHypothesizeResponseSchema,
  ScientistChallengeRequestSchema,
  ScientistChallengeResponseSchema,
} from "../contracts/api";
import { canonicalJson } from "../report/canonical";
import {
  invariant,
  sameIds,
  unique,
  validateResearchContext,
  validateHypothesis,
  validateChallenge,
  type ResearchContext,
} from "../contracts/validation";
import { bookingGraph } from "./booking-context";

export type Step = "propose" | "hypothesize" | "challenge";
export const requestSchemas = {
  propose: ProposeRequestSchema,
  hypothesize: ScientistHypothesizeRequestSchema,
  challenge: ScientistChallengeRequestSchema,
};
export const responseSchemas = {
  propose: ProposeResponseSchema,
  hypothesize: ScientistHypothesizeResponseSchema,
  challenge: ScientistChallengeResponseSchema,
};
export type ProposeRequest = z.infer<typeof ProposeRequestSchema>;
export type ProposeResponse = z.infer<typeof ProposeResponseSchema>;
export type HypothesizeRequest = z.infer<
  typeof ScientistHypothesizeRequestSchema
>;
export type HypothesizeResponse = z.infer<
  typeof ScientistHypothesizeResponseSchema
>;
export type ChallengeRequest = z.infer<typeof ScientistChallengeRequestSchema>;
export type ChallengeResponse = z.infer<
  typeof ScientistChallengeResponseSchema
>;
export type FlowRequest =
  ProposeRequest | HypothesizeRequest | ChallengeRequest;
export type FlowResponse =
  ProposeResponse | HypothesizeResponse | ChallengeResponse;

export const identical = (a: unknown, b: unknown) =>
  canonicalJson(a) === canonicalJson(b);
export function validateApprovedInput(request: FlowRequest): void {
  invariant(
    identical(request.graph, bookingGraph),
    "Unreviewed or stale graph.",
  );
  unique(
    request.intents.map((intent) => intent.id),
    "intent IDs",
  );
  for (const intent of request.intents)
    invariant(
      intent.status === "confirmed" && intent.source.kind === "user_confirmed",
      "Unconfirmed intent.",
    );
  if ("candidates" in request) {
    validateSliceContext(toResearchContext(request));
    if ("hypotheses" in request) {
      invariant(
        request.hypotheses.length === 1,
        "Select one current hypothesis.",
      );
      validateSliceHypothesis(
        request.hypotheses[0]!,
        toResearchContext(request),
      );
    }
  }
}
export function toResearchContext(
  request: HypothesizeRequest | ChallengeRequest,
): ResearchContext {
  return {
    intents: request.intents,
    graph: request.graph,
    candidates: request.candidates,
    scenarios: request.visibleScenarios,
  };
}
export function validateSliceContext(context: ResearchContext): void {
  validateResearchContext(context);
  invariant(
    context.candidates.length === 2,
    "Review one status quo and one alternative.",
  );
  const a = context.candidates[0]!;
  const b = context.candidates[1]!;
  invariant(
    a.changePlan.length === 0 &&
      a.constraints.length === 0 &&
      a.estimatedUpfrontCost === 0,
    "A must preserve the status quo.",
  );
  invariant(
    b.changePlan.some((item) => item.action !== "leave_unchanged"),
    "B must change a boundary.",
  );
  const paths = new Set(context.graph.modules.map((module) => module.path));
  for (const candidate of context.candidates) {
    invariant(candidate.limitations.length > 0, "State proposal limitations.");
    for (const change of candidate.changePlan)
      invariant(paths.has(change.module), "Unreviewed plan path.");
    for (const constraint of candidate.constraints) {
      invariant(
        paths.has(constraint.from) && paths.has(constraint.to),
        "Unreviewed constraint path.",
      );
      invariant(constraint.from !== constraint.to, "Self constraint.");
    }
  }
  invariant(
    context.scenarios.length > 0 && context.scenarios.length <= 3,
    "Review one to three visible scenarios.",
  );
  for (const scenario of context.scenarios)
    invariant(
      scenario.origin === "meta_generated" &&
        scenario.frozen === false &&
        scenario.acceptanceIds.length === 0,
      "Only visible unfrozen proposed scenarios.",
    );
}
export function validateSliceHypothesis(
  hypothesis: HypothesizeResponse["hypotheses"][number],
  context: ResearchContext,
): void {
  validateHypothesis(hypothesis, context);
  invariant(
    hypothesis.candidateId === context.candidates[1]!.id,
    "Hypothesis must target B.",
  );
  invariant(
    sameIds(
      hypothesis.intentIds,
      context.intents.map((x) => x.id),
    ) &&
      sameIds(
        hypothesis.visibleScenarioIds,
        context.scenarios.map((x) => x.id),
      ),
    "Incomplete hypothesis snapshot.",
  );
  invariant(
    hypothesis.prediction.comparison === "candidate_vs_status_quo" &&
      hypothesis.assumptions.length > 0 &&
      hypothesis.limitations.length > 0,
    "State assumptions, limits and A/B comparison.",
  );
}
export function validateFlowOutput(
  step: Step,
  input: FlowRequest,
  raw: unknown,
): FlowResponse {
  const result = responseSchemas[step].parse(raw);
  if (step === "propose") {
    const response = ProposeResponseSchema.parse(result);
    validateSliceContext({
      intents: input.intents,
      graph: input.graph,
      candidates: response.candidates,
      scenarios: response.scenarios,
    });
    for (const candidate of response.candidates) {
      const expectedMode = response.provider.mode;
      invariant(
        candidate.metaProvenance === expectedMode &&
          candidate.modelId === response.provider.model &&
          candidate.promptVersion === response.provider.promptVersion,
        "Candidate provenance mismatch.",
      );
    }
  } else if (step === "hypothesize") {
    const request = ScientistHypothesizeRequestSchema.parse(input);
    const response = ScientistHypothesizeResponseSchema.parse(result);
    invariant(response.hypotheses.length === 1, "One hypothesis required.");
    for (const hypothesis of response.hypotheses) {
      validateSliceHypothesis(hypothesis, toResearchContext(request));
      invariant(
        identical(hypothesis.provider, response.provider),
        "Hypothesis provenance mismatch.",
      );
    }
  } else {
    const request = ScientistChallengeRequestSchema.parse(input);
    const response = ScientistChallengeResponseSchema.parse(result);
    invariant(response.challenges.length === 1, "One challenge required.");
    for (const challenge of response.challenges) {
      validateChallenge(
        challenge,
        request.hypotheses,
        toResearchContext(request),
      );
      invariant(
        challenge.limitations.length > 0 &&
          sameIds(challenge.change.intentIds, request.hypotheses[0]!.intentIds),
        "Incomplete challenge snapshot.",
      );
      invariant(
        identical(challenge.provider, response.provider),
        "Challenge provenance mismatch.",
      );
    }
  }
  return result;
}
