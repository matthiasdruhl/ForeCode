import "server-only";
import { randomUUID } from "node:crypto";
import {
  InterpretRequestSchema,
  InterpretationContentSchema,
  InterpretationResponseSchema,
  validateInterpretation,
  alternativeExplanations,
  assessmentExplanation,
  nextExperiments,
  type InterpretationResponse,
} from "@/lib/foresight/interpretation/contracts";
import { INTERPRET_PROMPT_VERSION } from "@/lib/foresight/interpretation/prompts";
import {
  createEvidenceAdapter,
  type EvidenceAdapter,
  type IssuedHypothesis,
} from "./evidence";
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
type ProposalBinding = Binding & { sourceContext: string; intentIds: string[] };
export function createForesightService(
  transport: ReturnType<typeof createMetaTransport>,
  now = Date.now,
  evidenceAdapter: EvidenceAdapter = createEvidenceAdapter(),
) {
  const issued = new Map<
    string,
    IssuedHypothesis & {
      proposalKey: string;
      intents: { id: string; sha256: string }[];
    }
  >();
  const currentIntents = new Map<string, string>();
  const proposals = new Map<string, ProposalBinding>();
  const hypotheses = new Map<string, Binding & { proposalKey: string }>();
  const base = (request: FlowRequest) => ({
    intents: request.intents,
    graph: request.graph,
  });
  function forgetProposal(key: string) {
    proposals.delete(key);
    for (const [id, record] of hypotheses)
      if (record.proposalKey === key) hypotheses.delete(id);
    for (const [id, record] of issued)
      if (record.proposalKey === key) issued.delete(id);
  }
  function prune() {
    for (const [key, record] of proposals)
      if (now() - record.at >= META_LIMITS.artifactTtlMs) forgetProposal(key);
    for (const [key, record] of hypotheses)
      if (now() - record.at >= META_LIMITS.artifactTtlMs)
        hypotheses.delete(key);
    for (const [id, record] of issued)
      if (now() - record.issuedAt >= META_LIMITS.artifactTtlMs)
        issued.delete(id);
    const activeIntentIds = new Set(
      [...proposals.values()].flatMap((p) => p.intentIds),
    );
    for (const id of currentIntents.keys())
      if (!activeIntentIds.has(id)) currentIntents.delete(id);
  }
  function resolveHypothesis(id: string): IssuedHypothesis {
    prune();
    const record = issued.get(id);
    if (
      !record ||
      now() - record.issuedAt >= META_LIMITS.artifactTtlMs ||
      proposals.get(record.proposalKey)?.goalContext !== record.contextSha256 ||
      record.intents.some((i) => currentIntents.get(i.id) !== i.sha256)
    ) {
      issued.delete(id);
      throw new RequestFailure("INVALID_REFERENCE");
    }
    return structuredClone(record);
  }
  async function interpret(
    raw: unknown,
    signal: AbortSignal,
  ): Promise<InterpretationResponse> {
    const parsed = InterpretRequestSchema.safeParse(raw);
    if (!parsed.success) throw new RequestFailure("INVALID_REQUEST");
    const request = parsed.data;
    const record = resolveHypothesis(request.hypothesisId);
    const evidence = await evidenceAdapter(
      request.evidenceSummaryId,
      record,
      now(),
    );
    resolveHypothesis(request.hypothesisId);
    const context = { hypothesis: record.hypothesis, evidence };
    const { content, provider } = await transport.call(
      "interpret-evidence",
      context,
      signal,
    );
    try {
      const analysis = InterpretationContentSchema.parse(content);
      validateInterpretation(analysis, context);
      if (
        provider.provider !== "meta" ||
        provider.mode !== "live" ||
        !provider.sourceEvidenceId ||
        provider.promptVersion !== INTERPRET_PROMPT_VERSION ||
        !["muse-spark-1.3", "muse-spark-1.3-contributor"].includes(
          provider.model ?? "",
        ) ||
        signal.aborted
      )
        throw new Error("Invalid provenance");
      // Recheck lifetime, revisions and fresh disclosure after model latency.
      resolveHypothesis(request.hypothesisId);
      const fresh = await evidenceAdapter(
        request.evidenceSummaryId,
        record,
        now(),
      );
      resolveHypothesis(request.hypothesisId);
      if (
        digest(fresh) !== digest(evidence) ||
        now() >= fresh.linkExpiresAt ||
        signal.aborted
      )
        throw new Error("Evidence changed");
      return InterpretationResponseSchema.parse({
        schemaVersion: "scientist-interpret-response.v2",
        interpretation: {
          ...analysis,
          id: randomUUID(),
          authority: "MODEL_INTERPRETATION_ONLY",
          originalPrediction: record.hypothesis.prediction,
          assessmentExplanation: assessmentExplanation(analysis, context),
          alternativeExplanationText:
            alternativeExplanations[analysis.alternativeExplanation],
          nextExperimentText: nextExperiments[analysis.nextExperiment],
          limitations: evidence.limitations,
          provider,
        },
        authenticatedVerification: evidence,
      });
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    }
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
    let selectedProposal: ProposalBinding | undefined;
    try {
      validateApprovedInput(request);
      if ("candidates" in request) {
        const context = {
          ...base(request),
          candidates: request.candidates,
          visibleScenarios: request.visibleScenarios,
        };
        const record = proposals.get(digest(context));
        // Goal belongs to the exact approved proposal snapshot as well.
        const expected =
          "goal" in request ? { ...context, goal: request.goal } : context;
        if (
          !record ||
          ("goal" in request ? record.goalContext : record.context) !==
            digest(expected)
        )
          throw new Error("Unissued context");
        selectedProposal = record;
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
            id: randomUUID(),
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
      prune();
      // Object identity is a server-owned acceptance generation. Even if an old
      // context is proposed again, in-flight work from its removed record stays stale.
      if (
        selectedProposal &&
        proposals.get(selectedProposal.context) !== selectedProposal
      )
        throw new RequestFailure("INVALID_REFERENCE");
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
        const key = digest(context);
        const goalContext = digest({ ...context, goal: request.goal });
        const sourceContext = digest(request.graph);
        const intentIds = request.intents.map((i) => i.id);
        // Intent identities within the reviewed source context are the existing
        // research scope, not authenticated user/session identities. Any overlap
        // supersedes the whole dependent context; disjoint intents may coexist.
        for (const [oldKey, record] of proposals)
          if (
            record.sourceContext === sourceContext &&
            record.intentIds.some((id) => intentIds.includes(id)) &&
            record.goalContext !== goalContext
          )
            forgetProposal(oldKey);
        const unchanged = proposals.get(key);
        if (unchanged) unchanged.at = now();
        else
          proposals.set(key, {
            at: now(),
            context: key,
            goalContext,
            sourceContext,
            intentIds,
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
          proposalKey: digest(context),
        });
      }
      if (step === "propose")
        for (const intent of request.intents)
          currentIntents.set(intent.id, digest(intent));
      if (
        result.schemaVersion === "scientist-hypotheses.v1" &&
        "candidates" in request &&
        "goal" in request
      ) {
        const contextSha256 = digest({
          intents: request.intents,
          graph: request.graph,
          candidates: request.candidates,
          visibleScenarios: request.visibleScenarios,
          goal: request.goal,
        });
        for (const hypothesis of result.hypotheses)
          issued.set(hypothesis.id, {
            hypothesis: structuredClone(hypothesis),
            issuedAt: now(),
            contextSha256,
            proposalKey: selectedProposal!.context,
            intents: request.intents.map((i) => ({
              id: i.id,
              sha256: digest(i),
            })),
          });
      }
      prune();
      return result;
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      throw new RequestFailure("PROVIDER_UNAVAILABLE");
    }
  }
  return { run, interpret };
}
