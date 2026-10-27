import "server-only";
import {
  requestSchemas,
  validateApprovedInput,
  validateFlowOutput,
  type Step,
  type FlowRequest,
  type FlowResponse,
} from "@/lib/foresight/flow";
import { META_LIMITS, contentSchemas } from "@/lib/foresight/prompts";
import { RequestFailure } from "../http/errors";
import { createMetaTransport, digest } from "./transport";

type Binding = { at: number; context: string; goalContext?: string };
export function createForesightService(
  transport: ReturnType<typeof createMetaTransport>,
  now = Date.now,
) {
  const proposals = new Map<string, Binding>();
  const hypotheses = new Map<string, Binding>();
  const base = (request: FlowRequest) => ({
    intents: request.intents,
    graph: request.graph,
  });
  function prune() {
    for (const records of [proposals, hypotheses])
      for (const [key, record] of records)
        if (now() - record.at >= META_LIMITS.artifactTtlMs) records.delete(key);
  }
  async function run(
    step: Step,
    raw: unknown,
    signal: AbortSignal,
  ): Promise<FlowResponse> {
    let request: FlowRequest;
    try {
      request = requestSchemas[step].parse(raw);
    } catch {
      throw new RequestFailure("INVALID_REQUEST");
    }
    prune();
    try {
      validateApprovedInput(request);
      if ("candidates" in request) {
        const record = proposals.get(digest(request.candidates));
        const context = {
          ...base(request),
          candidates: request.candidates,
          visibleScenarios: request.visibleScenarios,
        };
        // Goal belongs to the exact approved proposal snapshot as well.
        const expected =
          "goal" in request ? { ...context, goal: request.goal } : context;
        if (
          !record ||
          ("goal" in request ? record.goalContext : record.context) !==
            digest(expected)
        )
          throw new Error("Unissued context");
        if ("hypotheses" in request) {
          const hypothesis = hypotheses.get(digest(request.hypotheses));
          if (!hypothesis || hypothesis.context !== digest(context))
            throw new Error("Unissued hypothesis");
        }
      }
    } catch {
      throw new RequestFailure("INVALID_REFERENCE");
    }
    const { content, provider } = await transport.call(step, request, signal);
    try {
      let response: FlowResponse;
      if (step === "propose") {
        const data = contentSchemas.propose.parse(content);
        response = {
          schemaVersion: "foresight-proposals.v1",
          provider,
          candidates: data.candidates.map((candidate) => ({
            ...candidate,
            metaProvenance: "live",
            modelId: provider.model,
            promptVersion: provider.promptVersion,
          })),
          scenarios: data.scenarios,
        };
      } else if (step === "hypothesize") {
        const data = contentSchemas.hypothesize.parse(content);
        response = {
          schemaVersion: "scientist-hypotheses.v1",
          provider,
          hypotheses: data.hypotheses.map((hypothesis) => ({
            ...hypothesis,
            provider,
          })),
        };
      } else {
        const data = contentSchemas.challenge.parse(content);
        response = {
          schemaVersion: "scientist-challenges.v1",
          provider,
          challenges: data.challenges.map((challenge) => ({
            ...challenge,
            provider,
          })),
        };
      }
      const result = validateFlowOutput(step, request, response);
      if (signal.aborted) throw new Error("Obsolete response");
      if (
        result.schemaVersion === "foresight-proposals.v1" &&
        "goal" in request
      ) {
        const context = {
          ...base(request),
          candidates: result.candidates,
          visibleScenarios: result.scenarios,
        };
        // Separate bindings for the two frozen downstream request shapes; the
        // challenge request intentionally has no goal field.
        proposals.set(digest(result.candidates), {
          at: now(),
          context: digest(context),
          goalContext: digest({ ...context, goal: request.goal }),
        });
      }
      if (
        result.schemaVersion === "scientist-hypotheses.v1" &&
        "candidates" in request
      ) {
        const context = {
          ...base(request),
          candidates: request.candidates,
          visibleScenarios: request.visibleScenarios,
        };
        hypotheses.set(digest(result.hypotheses), {
          at: now(),
          context: digest(context),
        });
      }
      return result;
    } catch {
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    }
  }
  return { run };
}
