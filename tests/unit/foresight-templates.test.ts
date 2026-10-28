import { describe, expect, it, vi } from "vitest";
import { createBookingTemplate } from "@/lib/foresight/templates";
import { createExperimentalHandoff } from "@/lib/foresight/handoff";
import type {
  ProposeResponse,
  HypothesizeResponse,
} from "@/lib/foresight/flow";
import { createForesightService } from "@/server/meta/service";
import { createMetaTransport } from "@/server/meta/transport";
import {
  proposalRequest,
  hypothesisRequest,
  challengeRequest,
} from "../support/foresight";

describe("explicit local booking templates", () => {
  it("completes a labeled local research review with exact inherited context and no inference", () => {
    const request = proposalRequest();
    const proposal = createBookingTemplate(
      "propose",
      request,
    ) as ProposeResponse;
    const hypRequest = hypothesisRequest(request, proposal);
    const hypothesis = createBookingTemplate(
      "hypothesize",
      hypRequest,
    ) as HypothesizeResponse;
    const chRequest = challengeRequest(hypRequest, hypothesis);
    const challenge = createBookingTemplate("challenge", chRequest);
    const handoff = createExperimentalHandoff(
      {
        propose: { request, response: proposal },
        hypothesize: { request: hypRequest, response: hypothesis },
        challenge: { request: chRequest, response: challenge },
      },
      { reviewed: true },
    );
    for (const value of Object.values(handoff.stageProvenance)) {
      expect(value).toMatchObject({
        provider: "template",
        mode: "template",
        model: null,
        sourceEvidenceId: null,
      });
    }
    expect(
      proposal.candidates.map((candidate) => candidate.estimatedUpfrontCost),
    ).toEqual([0, 3]);
    expect(proposal.scenarios[0]!.origin).toBe("developer_tentative");
    expect(hypothesis.hypotheses[0]!.prediction.falsifiedWhen).toContain(
      "same or more",
    );
    expect(handoff.executionStatus).toBe("NOT_AUTHORIZED");
    expect(
      handoff.research.challenge.response.challenges[0]!.limitations.join(" "),
    ).toContain("provider=template");
  });
  it("rejects revoked intents and unreviewed source before producing local suggestions", () => {
    const revoked = proposalRequest();
    revoked.intents[0]!.status = "rejected";
    expect(() => createBookingTemplate("propose", revoked)).toThrow();
    const stale = proposalRequest();
    stale.graph.repoCommit = "1".repeat(40);
    expect(() => createBookingTemplate("propose", stale)).toThrow();
  });
  it("cannot send a local template proposal or hypothesis through server-issued live lineage", async () => {
    const network = vi.fn<typeof fetch>();
    const transport = createMetaTransport({ env: () => ({}), fetch: network });
    const service = createForesightService(transport);
    const request = proposalRequest();
    const proposal = createBookingTemplate(
      "propose",
      request,
    ) as ProposeResponse;
    const hypRequest = hypothesisRequest(request, proposal);
    await expect(
      service.run("hypothesize", hypRequest, new AbortController().signal),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    const hypothesis = createBookingTemplate(
      "hypothesize",
      hypRequest,
    ) as HypothesizeResponse;
    await expect(
      service.run(
        "challenge",
        challengeRequest(hypRequest, hypothesis),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(network).not.toHaveBeenCalled();
  });
});
