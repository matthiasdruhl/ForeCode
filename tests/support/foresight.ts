// Newly authored synthetic inputs. Only tests import this module. No production
// flag, endpoint, dynamic injection or template fallback exposes it to the app.
import { bookingGraph } from "@/lib/foresight/booking-context";
import { confirmIntent } from "@/lib/intents/lifecycle";
import { PROMPT_VERSION } from "@/lib/foresight/prompts";
import type {
  FlowRequest,
  Step,
  ProposeResponse,
  HypothesizeResponse,
} from "@/lib/foresight/flow";
import { VisibleScenarioV1Schema } from "@/lib/contracts/architecture";

export function proposalRequest() {
  return {
    intents: [
      confirmIntent(
        {
          title: "Team permissions",
          statement:
            "Let team owners delegate booking cancellation while preserving individual ownership rules.",
          priority: "high",
          horizon: "near",
        },
        "intent-team",
        new Date("2026-10-27T18:00:00.000Z"),
      ),
    ],
    graph: structuredClone(bookingGraph),
    goal: "Assess a bounded permissions boundary.",
    consent: true as const,
  };
}
export function syntheticContent(step: Step, request: FlowRequest) {
  const baselineCommit = request.graph.repoCommit;
  const intentIds = request.intents.map((item) => item.id);
  if (step === "propose")
    return {
      candidates: [
        {
          schemaVersion: "architecture-candidate.v1",
          id: "candidate-a",
          label: "Synthetic: retain owner checks",
          baselineCommit,
          description:
            "Keep viewer and ownership decisions in booking-service with its current synchronous store.",
          changePlan: [],
          constraints: [],
          estimatedUpfrontCost: 0,
          estimatedCostUnit: "modeled_effort_points_v1",
          limitations: [
            "Synthetic test fixture; no inference or measured effect.",
          ],
        },
        {
          schemaVersion: "architecture-candidate.v1",
          id: "candidate-b",
          label: "Synthetic: isolate permission decisions",
          baselineCommit,
          description:
            "Introduce a permission decision boundary inside booking-service before storage operations.",
          changePlan: [
            {
              module: "src/server/booking-service.ts",
              action: "introduce_boundary",
              rationale:
                "Keep future team policy decisions separate from ownership and storage operations.",
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
          estimatedCostUnit: "modeled_effort_points_v1",
          limitations: [
            "Synthetic proposal; new policy abstraction may add unnecessary complexity.",
          ],
        },
      ],
      scenarios: [
        {
          schemaVersion: "scenario.v1",
          id: "scenario-team",
          intentIds,
          request:
            "Add delegated cancellation without widening personal booking access.",
          assumptions: [
            "Team ownership and membership are future requirements, not current fixture capabilities.",
          ],
          acceptanceIds: [],
          frozen: false,
          baselineCommit,
          origin: "meta_generated",
        },
      ],
    };
  if (!("candidates" in request))
    throw new Error("Synthetic request requires candidates.");
  if (step === "hypothesize")
    return {
      hypotheses: [
        {
          schemaVersion: "meta-hypothesis.v1",
          id: "hypothesis-permissions",
          baselineCommit,
          candidateId: request.candidates[1]!.id,
          intentIds,
          visibleScenarioIds: request.visibleScenarios.map((item) => item.id),
          statement:
            "Synthetic: B may reduce ownership regressions during delegated cancellation.",
          mechanism:
            "A permission decision boundary keeps policy changes from altering the shared store's overlap rules.",
          prediction: {
            metric: "regressions",
            direction: "lower",
            comparison: "candidate_vs_status_quo",
            expectedEffect:
              "Fewer ownership regressions for B under an equally scoped delegated-cancellation implementation.",
            falsifiedWhen:
              "B has equal or more ownership regressions than A under the same independent checks and task budget.",
          },
          assumptions: [
            "Both implementations use the same task budget and checks.",
          ],
          counterArguments: [
            "The existing owner check may already be simple enough; B adds indirection.",
          ],
          limitations: [
            "Synthetic fixture. No experiment, model benefit or measured result.",
          ],
        },
      ],
    };
  if (!("hypotheses" in request))
    throw new Error("Synthetic challenge requires hypothesis.");
  return {
    challenges: [
      {
        schemaVersion: "meta-challenge.v1",
        id: "challenge-membership",
        hypothesisId: request.hypotheses[0]!.id,
        targetCandidateId: request.hypotheses[0]!.candidateId,
        baselineCommit,
        change: {
          id: "change-expiry",
          request:
            "Proposed: revoke delegated cancellation immediately when team membership expires.",
          rationale:
            "A separate policy boundary could cache stale permissions.",
          acceptanceOutline: [
            "An expired delegate cannot cancel another member's booking.",
            "Personal owner cancellation still works.",
            "Active booking overlap rejection remains unchanged.",
          ],
          intentIds,
        },
        failureMechanism:
          "An extracted permission decision could become stale between lookup and cancellation.",
        potentialDisconfirmation:
          "B has at least as many membership or ownership regressions as A under identical frozen conditions.",
        reviewStatus: "proposed",
        visibility: "model_generated_not_heldout",
        limitations: [
          "Synthetic visible proposal, not an independent holdout or execution authority.",
        ],
      },
    ],
  };
}
export function envelope(
  content: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "chatcmpl-synthetic-17",
    object: "chat.completion",
    created: 1793124000,
    model: "muse-spark-1.3-contributor",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(content) },
      },
    ],
    usage: { prompt_tokens: 2000, completion_tokens: 900, total_tokens: 2900 },
    ...overrides,
  };
}
export function browserSyntheticResponse(step: Step, request: FlowRequest) {
  const provider = {
    provider: "template" as const,
    model: null,
    mode: "template" as const,
    promptVersion: PROMPT_VERSION,
    sourceEvidenceId: null,
  };
  const content = syntheticContent(step, request);
  if (content.candidates)
    return {
      schemaVersion: "foresight-proposals.v1",
      candidates: content.candidates.map((item) => ({
        ...item,
        metaProvenance: "template",
        modelId: null,
        promptVersion: PROMPT_VERSION,
      })),
      scenarios: content.scenarios,
      provider,
    };
  if (content.hypotheses)
    return {
      schemaVersion: "scientist-hypotheses.v1",
      hypotheses: content.hypotheses.map((item) => ({ ...item, provider })),
      provider,
    };
  return {
    schemaVersion: "scientist-challenges.v1",
    challenges: content.challenges.map((item) => ({ ...item, provider })),
    provider,
  };
}
export function hypothesisRequest(
  request: ReturnType<typeof proposalRequest>,
  proposal: ProposeResponse,
) {
  return {
    ...request,
    candidates: proposal.candidates,
    visibleScenarios: proposal.scenarios.map((scenario) =>
      VisibleScenarioV1Schema.parse(scenario),
    ),
  };
}
export function challengeRequest(
  request: ReturnType<typeof hypothesisRequest>,
  response: HypothesizeResponse,
) {
  return {
    intents: request.intents,
    graph: request.graph,
    candidates: request.candidates,
    visibleScenarios: request.visibleScenarios,
    hypotheses: response.hypotheses,
    consent: true as const,
  };
}
