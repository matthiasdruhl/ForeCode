import {
  requestSchemas,
  validateApprovedInput,
  validateFlowOutput,
  type FlowRequest,
  type FlowResponse,
  type Step,
} from "./flow";
import {
  ScientistHypothesizeRequestSchema,
  ScientistChallengeRequestSchema,
} from "../contracts/api";

const provider = {
  provider: "template" as const,
  mode: "template" as const,
  model: null,
  promptVersion: "booking-template-1",
  sourceEvidenceId: null,
};
const limitations = [
  "Fixed local developer template; no Meta inference or recorded model response occurred.",
  "The partial booking graph omits runtime details. Review relevance to your confirmed requirement before using this proposal.",
  "No measured architecture benefit, evaluator result or Meta incremental advantage is established.",
];

/** Explicit local alternative only. Never called automatically on provider failure. */
export function createBookingTemplate(
  step: Step,
  raw: FlowRequest,
): FlowResponse {
  const request = requestSchemas[step].parse(raw);
  validateApprovedInput(request);
  const baselineCommit = request.graph.repoCommit;
  const intentIds = request.intents.map((intent) => intent.id);
  let response: FlowResponse;
  if (step === "propose") {
    const candidateBase = {
      schemaVersion: "architecture-candidate.v1" as const,
      baselineCommit,
      estimatedCostUnit: "modeled_effort_points_v1" as const,
      metaProvenance: "template" as const,
      modelId: null,
      promptVersion: provider.promptVersion,
      limitations,
    };
    response = {
      schemaVersion: "foresight-proposals.v1",
      provider,
      candidates: [
        {
          ...candidateBase,
          id: "template-booking-a",
          label: "Local template A: keep ownership checks",
          description:
            "Retain the existing booking-service ownership checks and synchronous overlap store. Implement a future policy directly when its requirements are known.",
          changePlan: [],
          constraints: [],
          estimatedUpfrontCost: 0,
        },
        {
          ...candidateBase,
          id: "template-booking-b",
          label: "Local template B: separate policy decisions",
          description:
            "Introduce an authorization decision boundary inside the existing booking service while retaining current owner-only behavior and storage checks. Team membership and persistence remain absent.",
          changePlan: [
            {
              module: "src/server/booking-service.ts",
              action: "introduce_boundary",
              rationale:
                "Review whether separating permission decisions from mutation makes a future delegated-booking policy easier to isolate without changing overlap semantics.",
            },
          ],
          constraints: [
            {
              kind: "forbid_import",
              from: "src/server/booking-store.ts",
              to: "src/server/booking-service.ts",
            },
          ],
          estimatedUpfrontCost: 3,
        },
      ],
      scenarios: [
        {
          schemaVersion: "scenario.v1",
          id: "template-booking-delegation",
          intentIds,
          request:
            "Roadmap template for review: add delegated booking cancellation with membership revocation while preserving personal ownership, listing isolation and overlap rejection. Confirm whether this scenario represents the selected intent before comparison.",
          assumptions: [
            "This fixed delegation scenario is a developer-tentative template, not an interpretation of arbitrary user text.",
            "Current booking behavior stays fixed; future team semantics need independent human specification.",
          ],
          acceptanceIds: [],
          frozen: false,
          baselineCommit,
          origin: "developer_tentative",
        },
      ],
    };
  } else if (step === "hypothesize") {
    const input = ScientistHypothesizeRequestSchema.parse(request);
    response = {
      schemaVersion: "scientist-hypotheses.v1",
      provider,
      hypotheses: [
        {
          schemaVersion: "meta-hypothesis.v1",
          id: "template-booking-hypothesis",
          baselineCommit,
          candidateId: input.candidates[1]!.id,
          intentIds,
          visibleScenarioIds: input.visibleScenarios.map(
            (scenario) => scenario.id,
          ),
          statement:
            "Local template hypothesis: the reviewed B boundary may reduce authorization regressions versus unchanged A when implementing the same future booking policy.",
          mechanism:
            "Isolating a permission decision can reduce the chance that policy edits also alter ownership or storage mutations. This requires B's reviewed change plan to establish that isolation; it is a conditional proposal.",
          prediction: {
            metric: "regressions",
            direction: "lower",
            comparison: "candidate_vs_status_quo",
            expectedEffect:
              "Under identical frozen task semantics, agent capability, budgets and independent checks, B has fewer authorization regressions than A.",
            falsifiedWhen:
              "B has the same or more authorization regressions than A under those matched conditions. Missing or incomparable evidence leaves the prediction untested.",
          },
          assumptions: [
            "B actually isolates the relevant policy; reviewers must reject this template if its mechanism does not fit the candidate.",
            "The future task and required checks are approved before either arm is observed.",
          ],
          counterArguments: [
            "A's current checks are small; extra indirection may add preparation cost without improving correctness.",
            "Membership revocation may require transaction or storage changes beyond the proposed boundary.",
          ],
          limitations,
          provider,
        },
      ],
    };
  } else {
    const input = ScientistChallengeRequestSchema.parse(request);
    response = {
      schemaVersion: "scientist-challenges.v1",
      provider,
      challenges: [
        {
          schemaVersion: "meta-challenge.v1",
          id: "template-booking-challenge",
          hypothesisId: input.hypotheses[0]!.id,
          targetCandidateId: input.hypotheses[0]!.candidateId,
          baselineCommit,
          change: {
            id: "template-booking-revocation",
            request:
              "Proposed counterexample: revoke a delegate's membership after a permission lookup but before cancellation completes.",
            rationale:
              "A separated permission boundary could return a stale authorization result, requiring cross-boundary coordination that the preparation did not anticipate.",
            acceptanceOutline: [
              "A revoked delegate cannot cancel another owner's booking.",
              "A personal owner can still cancel their own booking.",
              "Listing isolation and overlap rejection retain their existing behavior.",
            ],
            intentIds,
          },
          failureMechanism:
            "Permission freshness may depend on the mutation's timing and storage transaction; merely extracting policy can conceal that dependency.",
          potentialDisconfirmation:
            "If B introduces the same or more authorization regressions than A for the identical frozen revocation task, the proposed reduction is not supported.",
          reviewStatus: "proposed",
          visibility: "model_generated_not_heldout",
          limitations: [
            ...limitations,
            "Frozen challenge visibility uses model_generated_not_heldout as its non-heldout category; provider=template identifies this fixed developer-authored example.",
          ],
          provider,
        },
      ],
    };
  }
  return validateFlowOutput(step, request, response);
}
