import { randomUUID } from "node:crypto";
import { createMetaTransport, digest } from "@/server/meta/transport";
import { createForesightService } from "@/server/meta/service";
import { META_LIMITS } from "@/lib/foresight/prompts";
import type {
  HypothesizeResponse,
  ProposeResponse,
} from "@/lib/foresight/flow";
import type { IssuedHypothesis } from "@/server/meta/evidence";
import type { RegistrationResolver } from "@/server/meta/registration-reader";
import type {
  ProspectiveRegistration,
  EvidenceLink,
} from "@/server/meta/prospective-lineage";
import {
  proposalRequest,
  hypothesisRequest,
  syntheticContent,
  envelope,
} from "./foresight";
import { scientistFixture } from "./scientist-registration";
import type { publicationFixture } from "./tournament-publication";
export async function scientistHarness(
  f: Awaited<ReturnType<typeof publicationFixture>>,
) {
  let at = Date.parse("2026-10-28T12:00:11.000Z"),
    sequence = 0;
  const now = () => at;
  const transport = createMetaTransport({
    now,
    env: () => ({
      META_CALLS_ENABLED: "true",
      META_SPENDING_APPROVED: "true",
      META_MODEL_API_KEY: "synthetic-never-used-on-network",
      META_MODEL: "muse-spark-1.3-contributor",
      META_API_BASE_URL: "https://api.meta.ai/v1",
    }),
    fetch: async (_url, init) => {
      const data = JSON.parse(
        JSON.parse(init!.body as string).messages[1].content,
      );
      const step =
        "hypotheses" in data
          ? "challenge"
          : "candidates" in data
            ? "hypothesize"
            : "propose";
      return Response.json(
        envelope(syntheticContent(step, data), {
          id: `synthetic-${++sequence}`,
        }),
      );
    },
  });
  let resolver: RegistrationResolver = (id, issued) =>
    originals.registrationReader.resolveRegistration(id, issued);
  const service = createForesightService(
    transport,
    now,
    undefined,
    (id, issued) => resolver(id, issued),
  );
  const signal = new AbortController().signal,
    input = proposalRequest();
  input.intents[0]!.id = f.study.definition.protocol.intentRevision.id;
  input.intents[0]!.revision =
    f.study.definition.protocol.intentRevision.revision;
  const proposal = (await service.run(
    "propose",
    input,
    signal,
  )) as ProposeResponse;
  const hypothesisInput = hypothesisRequest(input, proposal);
  at += 11_000;
  const response = (await service.run(
    "hypothesize",
    hypothesisInput,
    signal,
  )) as HypothesizeResponse;
  const hypothesis = response.hypotheses[0]!;
  const { consent, ...context } = hypothesisInput;
  void consent;
  const issued: IssuedHypothesis = {
    hypothesis,
    issuedAt: at,
    contextSha256: digest(context),
    proposalStartedAt: at - 11_000,
    proposalInputSha256: digest(input),
  };
  const { preparedOriginalSha256, comparability, correctness, ...study } =
    f.artifact.projection;
  void preparedOriginalSha256;
  void comparability;
  void correctness;
  // Pick the exact prospective report identity, without copying public metadata.
  const registration: ProspectiveRegistration = {
    schemaVersion: "scientist-prospective-registration.v1",
    id: randomUUID(),
    hypothesisId: hypothesis.id,
    hypothesisSha256: digest(hypothesis),
    issuedAt: at,
    registeredAt: at + 1000,
    expiresAt: at + META_LIMITS.artifactTtlMs,
    context: hypothesisInput,
    study: Object.fromEntries(
      [
        "studyId",
        "taskId",
        "taskDefinitionSha256",
        "definitionSha256",
        "protocolOriginalSha256",
        "model",
        "order",
        "baselineEvaluatorSha256",
        "baselineSuiteSha256",
        "baselinePolicySha256",
        "futureEvaluatorSha256",
        "futureSuiteSha256",
        "futurePolicySha256",
      ].map((k) => [k, study[k as keyof typeof study]]),
    ) as ProspectiveRegistration["study"],
  };
  const link: EvidenceLink = {
    evidenceSummaryId: randomUUID(),
    prospectiveRegistrationId: registration.id,
    hypothesisId: hypothesis.id,
    hypothesisSha256: digest(hypothesis),
    contextSha256: issued.contextSha256,
    projectionSha256: digest(f.artifact.projection),
    studyId: study.studyId,
    taskId: study.taskId,
    baselineCommit: hypothesis.baselineCommit,
    candidateId: hypothesis.candidateId,
    publicationApprovedAt: f.now,
    registeredAt: registration.registeredAt,
    expiresAt: registration.expiresAt,
  };
  const originals = await scientistFixture(f, registration, link, issued, now);
  at = f.now;
  return {
    ...originals,
    f,
    registration,
    link,
    issued,
    service,
    input,
    hypothesisInput,
    now,
    signal,
    setResolver: (next: RegistrationResolver) => {
      resolver = next;
    },
    advance: (ms: number) => {
      at += ms;
    },
  };
}
