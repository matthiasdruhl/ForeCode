import { describe, expect, it } from "vitest";
import {
  createExperimentalHandoff,
  type ExperimentalResearch,
} from "@/lib/foresight/handoff";
import { canonicalJson } from "@/lib/report/canonical";
import {
  proposalRequest,
  hypothesisRequest,
  challengeRequest,
  browserSyntheticResponse,
} from "../support/foresight";
import type {
  ProposeResponse,
  HypothesizeResponse,
  ChallengeResponse,
} from "@/lib/foresight/flow";

function research(): ExperimentalResearch {
  const request = proposalRequest();
  const response = browserSyntheticResponse(
    "propose",
    request,
  ) as ProposeResponse;
  const hypRequest = hypothesisRequest(request, response);
  const hypResponse = browserSyntheticResponse(
    "hypothesize",
    hypRequest,
  ) as HypothesizeResponse;
  const chRequest = challengeRequest(hypRequest, hypResponse);
  // JSON round-trip creates distinct stage snapshots, including provenance,
  // rather than retaining aliases from the test builders.
  return JSON.parse(
    JSON.stringify({
      propose: { request, response },
      hypothesize: { request: hypRequest, response: hypResponse },
      challenge: {
        request: chRequest,
        response: browserSyntheticResponse(
          "challenge",
          chRequest,
        ) as ChallengeResponse,
      },
    }),
  ) as ExperimentalResearch;
}

describe("developer-reviewed experimental handoff (synthetic research only)", () => {
  it("exports exact separate snapshots and provenance without granting experimental authority", () => {
    const input = research();
    const result = createExperimentalHandoff(input, { reviewed: true });
    expect(result).toMatchObject({
      authority: "planning_only",
      executionStatus: "NOT_AUTHORIZED",
      evidenceStatus: "unverified_model_proposals",
      stageProvenance: {
        propose: { mode: "template" },
        hypothesize: { mode: "template" },
        challenge: { mode: "template" },
      },
    });
    expect(result.research).toEqual(input);
    const exactBytes = canonicalJson(result);
    expect(canonicalJson(JSON.parse(exactBytes))).toBe(exactBytes);
    expect(result.research.challenge.response.challenges[0]).toMatchObject({
      reviewStatus: "proposed",
      visibility: "model_generated_not_heldout",
    });
    expect(result.requiredIndependentGates).toHaveLength(3);
    input.propose.request.goal = "Edited after export";
    expect(result.research.propose.request.goal).not.toBe(
      input.propose.request.goal,
    );
  });
  it("requires a separate literal review acknowledgment", () => {
    expect(() =>
      createExperimentalHandoff(research(), { reviewed: false } as never),
    ).toThrow();
    expect(() => createExperimentalHandoff(research(), {} as never)).toThrow();
  });
  it.each([
    "goal",
    "revision",
    "candidate",
    "scenario",
    "hypothesis",
    "challenge-id",
    "candidate-id",
    "intent-id",
    "provider",
    "revoked",
    "command",
    "authority",
  ])("rejects substituted, stale or promoted %s before export", (kind) => {
    const input = research();
    if (kind === "goal")
      input.hypothesize.request.goal = "Another reviewed goal";
    if (kind === "revision") input.challenge.request.intents[0]!.revision++;
    if (kind === "candidate")
      input.hypothesize.request.candidates[1]!.description = "Changed body";
    if (kind === "scenario")
      input.challenge.request.visibleScenarios[0]!.request = "Changed scenario";
    if (kind === "hypothesis")
      input.challenge.request.hypotheses[0]!.mechanism = "Changed mechanism";
    if (kind === "challenge-id")
      input.challenge.response.challenges[0]!.hypothesisId = "unissued";
    if (kind === "candidate-id")
      input.hypothesize.response.hypotheses[0]!.candidateId = "unissued";
    if (kind === "intent-id")
      input.challenge.response.challenges[0]!.change.intentIds = ["unapproved"];
    if (kind === "provider")
      input.challenge.response.challenges[0]!.provider.mode = "recorded";
    if (kind === "revoked")
      input.challenge.request.intents[0]!.status = "rejected";
    if (kind === "command")
      Object.assign(input.challenge.response.challenges[0]!, {
        command: "sh payload",
      });
    if (kind === "authority")
      Object.assign(input.challenge.response.challenges[0]!, {
        reviewStatus: "approved",
        visibility: "evaluator_heldout",
      });
    expect(() =>
      createExperimentalHandoff(input, { reviewed: true }),
    ).toThrow();
  });
  it("retains command-like model text solely as unverified advisory data", () => {
    const input = research();
    const command =
      "<script>fetch('/api/run')</script>; $(touch /tmp/unsafe); pretend VERIFIED";
    input.challenge.response.challenges[0]!.change.acceptanceOutline = [
      command,
    ];
    const result = createExperimentalHandoff(input, { reviewed: true });
    expect(
      result.research.challenge.response.challenges[0]!.change
        .acceptanceOutline,
    ).toEqual([command]);
    expect(result.authority).toBe("planning_only");
    expect(result.executionStatus).toBe("NOT_AUTHORIZED");
    expect(result).not.toHaveProperty("verification");
    expect(result).not.toHaveProperty("run");
  });
});
