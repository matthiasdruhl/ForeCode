import { z } from "zod";
import {
  ProposeRequestSchema,
  ProposeResponseSchema,
  ScientistHypothesizeRequestSchema,
  ScientistHypothesizeResponseSchema,
  ScientistChallengeRequestSchema,
  ScientistChallengeResponseSchema,
} from "../contracts/api";
import { invariant } from "../contracts/validation";
import { identical, validateApprovedInput, validateFlowOutput } from "./flow";

// This browser-local review is not a frozen experiment artifact or an admission
// credential. The controller must independently approve a real task and policy.
const researchSchema = z.strictObject({
  propose: z.strictObject({
    request: ProposeRequestSchema,
    response: ProposeResponseSchema,
  }),
  hypothesize: z.strictObject({
    request: ScientistHypothesizeRequestSchema,
    response: ScientistHypothesizeResponseSchema,
  }),
  challenge: z.strictObject({
    request: ScientistChallengeRequestSchema,
    response: ScientistChallengeResponseSchema,
  }),
});
export type ExperimentalResearch = z.infer<typeof researchSchema>;

export function createExperimentalHandoff(
  raw: unknown,
  review: { reviewed: true },
) {
  z.strictObject({ reviewed: z.literal(true) }).parse(review);
  const research = researchSchema.parse(raw);
  const { propose, hypothesize, challenge } = research;
  for (const step of ["propose", "hypothesize", "challenge"] as const) {
    validateApprovedInput(research[step].request);
    validateFlowOutput(step, research[step].request, research[step].response);
  }
  invariant(
    identical(hypothesize.request, {
      ...propose.request,
      candidates: propose.response.candidates,
      visibleScenarios: propose.response.scenarios,
    }),
    "Hypothesis review does not match its exact proposal snapshot.",
  );
  invariant(
    identical(challenge.request, {
      intents: hypothesize.request.intents,
      graph: hypothesize.request.graph,
      candidates: hypothesize.request.candidates,
      visibleScenarios: hypothesize.request.visibleScenarios,
      hypotheses: hypothesize.response.hypotheses,
      consent: true,
    }),
    "Challenge review does not match its exact hypothesis snapshot.",
  );
  return {
    schemaVersion: "foresight-experiment-review.v1" as const,
    authority: "planning_only" as const,
    reviewStatus: "developer_reviewed_proposal" as const,
    executionStatus: "NOT_AUTHORIZED" as const,
    evidenceStatus: "unverified_model_proposals" as const,
    research,
    stageProvenance: {
      propose: propose.response.provider,
      hypothesize: hypothesize.response.provider,
      challenge: challenge.response.provider,
    },
    requiredIndependentGates: [
      "Independent approval of the frozen task, acceptance policy and fair A/B preregistration before observing outcomes.",
      "Independent sandbox admission, exact source pins, execution limits and spending authorization.",
      "Protected evaluation of the exact agent-produced source and authenticated receipts.",
    ],
    limitations: [
      "Developer review records a research proposal; it grants no execution, spending, preregistration or verification authority.",
      "The challenge remains proposed and model_generated_not_heldout; its acceptance outline is not an evaluator policy or protected test.",
      "This local export validates relationships, not server issuance or genuine provider access. Preserve the provenance of each stage.",
      "No measured result, approved experiment, certificate or Meta benefit is established by this export.",
    ],
  };
}
export type ExperimentalHandoff = ReturnType<typeof createExperimentalHandoff>;
