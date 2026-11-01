// Entirely synthetic inference and operator-owned fixtures. No real evidence,
// provider credentials, graders, experiments or external network are used.
import { randomUUID } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createEvidenceAdapter,
  type EvidenceLink,
  type IssuedHypothesis,
} from "@/server/meta/evidence";
import type { ProspectiveRegistration } from "@/server/meta/prospective-lineage";
import { createForesightService } from "@/server/meta/service";
import { createForesightHttp } from "@/server/meta/http";
import { createMetaTransport, digest } from "@/server/meta/transport";
import { loadDecisionReports } from "@/server/artifacts/decision-reports";
import { loadApprovedDecisionReports } from "@/server/artifacts/recording-catalog";
import { META_LIMITS } from "@/lib/foresight/prompts";
import {
  InterpretationResponseSchema,
  validateInterpretation,
  type InterpretationContent,
  type InterpretationContext,
} from "@/lib/foresight/interpretation/contracts";
import type {
  ProposeResponse,
  HypothesizeResponse,
  FlowRequest,
  Step,
} from "@/lib/foresight/flow";
import {
  proposalRequest,
  hypothesisRequest,
  challengeRequest,
  syntheticContent,
  envelope,
} from "../support/foresight";
import { scientistFixture } from "../support/scientist-registration";
import { publicationFixture } from "../support/tournament-publication";

// Test-local reviewed source identity for the existing inert signed fixture.
// Original graph and production validators are exercised in foresight.test.ts.
vi.mock("@/lib/foresight/booking-context", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/foresight/booking-context")>();
  return {
    ...original,
    bookingGraph: { ...original.bookingGraph, repoCommit: "1".repeat(40) },
  };
});
type Fixture = Awaited<ReturnType<typeof publicationFixture>>;
const fixtures: Fixture[] = [];
const origin = "http://127.0.0.1:3189";
const environment = {
  FORECODE_ORIGIN: origin,
  FORECODE_RESEARCH_MODE: "local-single-operator",
  FORECODE_RESEARCH_PROCESSES: "1",
  META_CALLS_ENABLED: "true",
  META_SPENDING_APPROVED: "true",
  META_MODEL_API_KEY: "synthetic-secret",
  META_MODEL: "muse-spark-1.3-contributor",
  META_API_BASE_URL: "https://api.meta.ai/v1",
};
beforeAll(async () => {
  for (const options of [
    {},
    { failA: true },
    { failB: true },
    { failA: true, failB: true },
    { noFutureB: true },
    { deviation: true },
    { telemetry: true },
  ])
    fixtures.push(await publicationFixture(options));
});
afterAll(async () => {
  await Promise.all(
    fixtures.map((f) => rm(f.parent, { recursive: true, force: true })),
  );
});
afterEach(() => vi.useRealTimers());
const contentFor = (context: InterpretationContext): InterpretationContent => ({
  hypothesisId: context.hypothesis.id,
  evidenceSummaryId: context.evidence.id,
  assessment: "not_established",
  observedChecks: context.evidence.arms.flatMap((a) =>
    a.checks.map((c) => ({ variant: a.variant, ...c })),
  ),
  alternativeExplanation: "implementation_variation",
  nextExperiment: "repeat_matched_trials",
  uncertaintyAcknowledged: true,
  metaUniqueValue: "not_established",
  proposedChallengeIsHoldout: false,
});
async function harness(
  f = fixtures[0]!,
  options: {
    production?: boolean;
    proposal?: (request: FlowRequest) => ReturnType<typeof syntheticContent>;
    afterCall?: (step: Step | "interpret-evidence") => Promise<void>;
    response?: (c: InterpretationContext) => unknown | Promise<Response>;
  } = {},
) {
  let at = Date.parse("2026-10-28T12:00:00.000Z");
  let seq = 0;
  let link: EvidenceLink | null = null;
  let registration: ProspectiveRegistration | null = null;
  let catalog = () => loadDecisionReports(f.config, at);
  const loadReports = vi.fn(() => catalog());
  const adapter = createEvidenceAdapter({
    loadReports,
    resolveLink: async (id, record) =>
      link && digest(link) === linkPin
        ? originals.linkReader.resolveLink(id, record)
        : null,
    resolveRegistration: async (id, record) =>
      registration && digest(registration) === registrationPin
        ? originals.registrationReader.resolveRegistration(id, record)
        : null,
  });
  const env: Record<string, string | undefined> = { ...environment };
  const network = vi.fn<typeof fetch>(async (_url, init) => {
    const payload = JSON.parse(init!.body as string);
    const request = JSON.parse(payload.messages[1].content);
    let content;
    if ("evidence" in request) {
      const response = options.response?.(request) ?? contentFor(request);
      if (response instanceof Promise) return response;
      content = response;
    } else {
      const step =
        "hypotheses" in request
          ? "challenge"
          : "candidates" in request
            ? "hypothesize"
            : "propose";
      content =
        step === "propose" && options.proposal
          ? options.proposal(request)
          : syntheticContent(step, request);
    }
    return Response.json(
      envelope(content, { id: `synthetic-interpret-${++seq}` }),
    );
  });
  const transport = createMetaTransport({
    env: () => env,
    fetch: network,
    now: () => at,
  });
  // Hold a real, validated synthetic reply after the transport has released its
  // network lock, allowing a newer accepted proposal before service continuation.
  const serviceTransport = {
    ...transport,
    call: async (
      step: Step | "interpret-evidence",
      request: FlowRequest | InterpretationContext,
      signal: AbortSignal,
    ) => {
      const result =
        step === "interpret-evidence"
          ? await transport.call(step, request as InterpretationContext, signal)
          : await transport.call(step, request as FlowRequest, signal);
      await options.afterCall?.(step);
      return result;
    },
  };
  const service = createForesightService(
    serviceTransport,
    () => at,
    options.production ? undefined : adapter,
    async (id, record) =>
      originals.registrationReader.resolveRegistration(id, record),
  );
  const http = createForesightHttp(service, () => env);
  async function post(
    step: "propose" | "hypothesize" | "challenge" | "interpret-evidence",
    data: unknown,
    signal?: AbortSignal,
  ) {
    at += 11_000;
    return http(
      step,
      new Request(origin + "/api/foresight/" + step, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(data),
        signal,
      }),
    );
  }
  const input = proposalRequest();
  input.intents[0]!.id = f.study.definition.protocol.intentRevision.id;
  input.intents[0]!.revision =
    f.study.definition.protocol.intentRevision.revision;
  const proposal = (await (
    await post("propose", input)
  ).json()) as ProposeResponse;
  const hypothesisInput = hypothesisRequest(input, proposal);
  const hypothesis = (await (
    await post("hypothesize", hypothesisInput)
  ).json()) as HypothesizeResponse;
  const h = hypothesis.hypotheses[0]!;
  const issued: IssuedHypothesis = {
    hypothesis: h,
    issuedAt: at,
    proposalStartedAt: at - 11_000,
    proposalInputSha256: digest(input),
    contextSha256: digest({
      intents: hypothesisInput.intents,
      graph: hypothesisInput.graph,
      candidates: hypothesisInput.candidates,
      visibleScenarios: hypothesisInput.visibleScenarios,
      goal: hypothesisInput.goal,
    }),
  };
  const report = (await loadDecisionReports(f.config, f.now)).reports[0]!;
  link = {
    prospectiveRegistrationId: randomUUID(),
    evidenceSummaryId: randomUUID(),
    hypothesisId: h.id,
    hypothesisSha256: digest(h),
    contextSha256: issued.contextSha256,
    projectionSha256: report.analysis.evidenceReferences!.projectionSha256,
    candidateId: h.candidateId,
    baselineCommit: h.baselineCommit,
    studyId: report.analysis.identity!.studyId,
    taskId: report.analysis.identity!.taskId,
    publicationApprovedAt: f.now,
    registeredAt: at + 1000,
    expiresAt: Date.parse("2026-10-28T12:30:00.000Z"),
  };
  const {
    preparedOriginalSha256,
    comparability,
    correctness,
    ...prospectiveStudy
  } = report.analysis.identity!;
  void preparedOriginalSha256;
  void comparability;
  void correctness;
  registration = {
    schemaVersion: "scientist-prospective-registration.v1",
    id: link.prospectiveRegistrationId,
    hypothesisId: h.id,
    hypothesisSha256: digest(h),
    issuedAt: issued.issuedAt,
    registeredAt: link.registeredAt,
    expiresAt: issued.issuedAt + META_LIMITS.artifactTtlMs,
    context: structuredClone(hypothesisInput),
    study: prospectiveStudy,
  };
  const originals = await scientistFixture(
    f,
    registration,
    link,
    issued,
    () => at,
  );
  const registrationPin = digest(registration);
  const linkPin = digest(link);
  at = f.now;
  const request = {
    schemaVersion: "scientist-interpret-request.v2",
    hypothesisId: h.id,
    evidenceSummaryId: link.evidenceSummaryId,
    consent: true,
  };
  network.mockClear();
  return {
    request,
    issued,
    adapter,
    originals,
    network,
    env,
    transport,
    service,
    http,
    post,
    loadReports,
    input,
    proposal,
    hypothesisInput,
    hypothesis,
    link: () => link!,
    registration: () => registration!,
    setRegistration: (value: ProspectiveRegistration | null) => {
      registration = value;
    },
    setLink: (value: EvidenceLink | null) => {
      link = value;
    },
    setCatalog: (value: Awaited<ReturnType<typeof catalog>>) => {
      catalog = async () => value;
    },
    advance: (ms: number) => {
      at += ms;
    },
    now: () => at,
  };
}

describe("authenticated interpretation through #45 loader and synthetic Meta transport", () => {
  it.each([
    "missing",
    "revoked",
    "expired",
    "wrong-study",
    "wrong-context",
    "wrong-candidate",
    "wrong-source",
    "late-registration",
    "wrong-protocol",
    "wrong-policy",
  ])("rejects prospective registration %s before inference", async (kind) => {
    const h = await harness(),
      r = h.registration();
    if (kind === "missing" || kind === "revoked") h.setRegistration(null);
    if (kind === "expired") r.expiresAt = h.now();
    if (kind === "wrong-study") r.study.studyId = "wrong-study";
    if (kind === "wrong-context") r.context.goal += " changed";
    if (kind === "wrong-candidate") r.context.candidates[1]!.id += "-changed";
    if (kind === "wrong-source") r.context.graph.repoCommit = "f".repeat(40);
    if (kind === "late-registration") r.registeredAt = h.now();
    if (kind === "wrong-protocol")
      r.study.protocolOriginalSha256 = "f".repeat(64);
    if (kind === "wrong-policy") r.study.futurePolicySha256 = "f".repeat(64);
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });

  it.each([
    [0, "INCONCLUSIVE", "VERIFIED", "VERIFIED"],
    [1, "REFACTOR", "REJECTED", "VERIFIED"],
    [2, "KEEP", "VERIFIED", "REJECTED"],
    [3, "INCONCLUSIVE", "REJECTED", "REJECTED"],
    [5, "INCONCLUSIVE", "VERIFIED", "VERIFIED"],
    [6, "INCONCLUSIVE", "VERIFIED", "VERIFIED"],
  ] as const)(
    "preserves outcome %# and deterministic authority",
    async (index, decision, a, b) => {
      const h = await harness(fixtures[index]);
      const before = JSON.stringify(
        await loadDecisionReports(
          fixtures[index]!.config,
          fixtures[index]!.now,
        ),
      );
      const response = await h.post("interpret-evidence", h.request);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const result = InterpretationResponseSchema.parse(await response.json());
      expect(result.interpretation.authority).toBe("MODEL_INTERPRETATION_ONLY");
      expect(result.interpretation.originalPrediction).toEqual(
        h.issued.hypothesis.prediction,
      );
      expect(result.interpretation.provider).toMatchObject({
        provider: "meta",
        mode: "live",
        model: environment.META_MODEL,
        promptVersion: "scientist-interpretation-2",
      });
      expect(result.authenticatedVerification.deterministicDecision).toEqual({
        author: "DETERMINISTIC_REPORT_NOT_MODEL",
        decision,
      });
      expect(
        result.authenticatedVerification.arms.map((x) => x.verdict),
      ).toEqual([a, b]);
      expect(result.interpretation.assessment).toBe("not_established"); // regressions not mapped
      expect(result.interpretation.observedChecks).toHaveLength(16);
      expect(h.loadReports).toHaveBeenCalledTimes(2);
      expect(h.network).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(
          await loadDecisionReports(
            fixtures[index]!.config,
            fixtures[index]!.now,
          ),
        ),
      ).toBe(before);
      const prompt = h.network.mock.calls[0]![1]!.body as string;
      for (const forbidden of [
        fixtures[index]!.parent,
        "PRIVATE_SENTINEL",
        "sourceComparison",
        "evidencePath",
        "reservedMicroUsd",
        environment.META_MODEL_API_KEY,
        "// inert",
        "reviewedProposal",
        "acceptanceOutline",
      ])
        expect(prompt).not.toContain(forbidden);
      if (index === 0) {
        expect(
          result.authenticatedVerification.arms[1]!.total.costUsd,
        ).toBeNull();
        expect(result.authenticatedVerification.missingMeasurements).toContain(
          "costUsd",
        );
      }
      if (index === 6)
        expect(result.authenticatedVerification.arms[1]!.total.costUsd).toBe(
          0.6,
        );
      expect(
        (
          await h.post(
            "challenge",
            challengeRequest(h.hypothesisInput, h.hypothesis),
          )
        ).status,
      ).toBe(200);
    },
  );
  it("keeps the real production catalog and missing lineage safely unavailable", async () => {
    expect((await loadApprovedDecisionReports()).state).toBe("empty");
    const h = await harness(undefined, { production: true });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it.each(["none", "empty", "unavailable", "unsigned", "duplicate"])(
    "rejects %s approved publication before inference",
    async (kind) => {
      const h = await harness();
      const catalog = structuredClone(
        await loadDecisionReports(fixtures[0]!.config, fixtures[0]!.now),
      );
      if (kind === "none") h.setLink(null);
      else if (kind === "empty" || kind === "unavailable")
        h.setCatalog({ state: kind, reports: [], unavailableCount: 0 });
      else if (kind === "unsigned") {
        Object.assign(catalog.reports[0]!, { provenance: "CLIENT_JSON" });
        h.setCatalog(catalog);
      } else {
        catalog.reports.push(catalog.reports[0]!);
        h.setCatalog(catalog);
      }
      expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
      expect(h.network).not.toHaveBeenCalled();
    },
  );
  it.each([
    "hypothesisId",
    "hypothesisSha256",
    "contextSha256",
    "candidateId",
    "baselineCommit",
    "studyId",
    "taskId",
    "projectionSha256",
    "expired-link",
    "retroactive",
    "unissued",
    "expired-hypothesis",
    "expired-proposal",
  ])("fails closed for %s", async (kind) => {
    const h = await harness();
    if (kind === "expired-hypothesis") h.advance(META_LIMITS.artifactTtlMs);
    else if (kind === "expired-proposal")
      h.advance(
        META_LIMITS.artifactTtlMs - (h.now() - h.issued.issuedAt) - 11_000,
      );
    else if (kind === "unissued") h.request.hypothesisId = randomUUID();
    else if (kind === "expired-link") h.link().expiresAt = h.now();
    else if (kind === "retroactive") h.link().registeredAt = h.now() - 1;
    else
      Object.assign(h.link(), {
        [kind]: kind.endsWith("Sha256")
          ? "f".repeat(64)
          : kind === "hypothesisId"
            ? randomUUID()
            : kind === "baselineCommit"
              ? "f".repeat(40)
              : "wrong-identity",
      });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it("invalidates earlier intent snapshots when a new revision is accepted", async () => {
    const h = await harness();
    const updated = structuredClone(h.input);
    updated.intents[0]!.revision++;
    expect((await h.post("propose", updated)).status).toBe(200);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it.each([
    "evidence",
    "receipts",
    "runs",
    "hypothesis",
    "instructions",
    "provider",
    "endpoint",
    "digest",
    "consent",
  ])("rejects client-authored %s", async (kind) => {
    const h = await harness();
    const input = {
      ...h.request,
      [kind]: kind === "consent" ? false : "CLIENT_PRIVATE_SENTINEL",
    };
    const response = await h.post("interpret-evidence", input);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("CLIENT_PRIVATE_SENTINEL");
    expect(h.network).not.toHaveBeenCalled();
  });
  it("rejects absent consent and incomplete protected receipts", async () => {
    const h = await harness(fixtures[4]);
    const missing: Record<string, unknown> = { ...h.request };
    delete missing.consent;
    expect((await h.post("interpret-evidence", missing)).status).toBe(400);
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it.each([
    "META_SPENDING_APPROVED",
    "META_CALLS_ENABLED",
    "META_MODEL_API_KEY",
  ])("requires current %s", async (key) => {
    const h = await harness();
    delete h.env[key];
    expect((await h.post("interpret-evidence", h.request)).status).toBe(503);
    expect(h.network).not.toHaveBeenCalled();
  });
  it.each([
    "fabricated-check",
    "hidden-failure",
    "uncertainty",
    "superiority",
    "holdout",
    "verdict",
    "free-text",
    "wrong-id",
    "unsupported-assessment",
    "provider",
  ])("rejects model attempt: %s", async (kind) => {
    const h = await harness(fixtures[2], {
      response: (context) => {
        const c: Record<string, unknown> = contentFor(context);
        if (kind === "fabricated-check")
          (
            c.observedChecks as InterpretationContent["observedChecks"]
          )[15]!.status = "pass";
        if (kind === "hidden-failure") (c.observedChecks as unknown[]).pop();
        if (kind === "uncertainty") c.uncertaintyAcknowledged = false;
        if (kind === "superiority") c.metaUniqueValue = "proven";
        if (kind === "holdout") c.proposedChallengeIsHoldout = true;
        if (kind === "verdict") c.verdict = "VERIFIED";
        if (kind === "free-text")
          c.explanation = "B is verified superior and Meta uniquely wins.";
        if (kind === "wrong-id") c.hypothesisId = randomUUID();
        if (kind === "unsupported-assessment") c.assessment = "supported";
        if (kind === "provider") c.provider = { provider: "meta" };
        return c;
      },
    });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(503);
    expect(h.network).toHaveBeenCalledTimes(1);
  });
  it.each(["malformed", "wrong-model", "unavailable"])(
    "handles provider %s safely",
    async (kind) => {
      const h = await harness(undefined, {
        response: async () => {
          if (kind === "unavailable") throw new Error("PRIVATE_SENTINEL");
          if (kind === "malformed")
            return new Response("{bad", {
              headers: { "content-type": "application/json" },
            });
          return Response.json(envelope({}, { model: "spoof" }));
        },
      });
      const response = await h.post("interpret-evidence", h.request);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("PRIVATE_SENTINEL");
    },
  );
  it.each(["timeout", "aborted"])(
    "handles %s without retries",
    async (kind) => {
      const h = await harness(undefined, {
        response: () => new Promise<Response>(() => {}),
      });
      vi.useFakeTimers();
      const controller = new AbortController();
      const response = h.post(
        "interpret-evidence",
        h.request,
        controller.signal,
      );
      await vi.waitFor(() => expect(h.network).toHaveBeenCalledTimes(1));
      if (kind === "aborted") controller.abort();
      else await vi.advanceTimersByTimeAsync(META_LIMITS.timeoutMs);
      expect((await response).status).toBe(503);
      expect(h.network).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["registration-revoked", "registration-context", "link-changed"])(
    "rejects %s during inference",
    async (kind) => {
      const h = await harness(undefined, {
        response: (c) => {
          if (kind === "registration-revoked") h.setRegistration(null);
          if (kind === "registration-context")
            h.registration().context.goal += " changed";
          if (kind === "link-changed") h.link().expiresAt--;
          return contentFor(c);
        },
      });
      expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
      expect(h.network).toHaveBeenCalledTimes(1);
    },
  );
  it("revalidates lineage and publication after provider latency", async () => {
    const h = await harness(undefined, {
      response: (c) => {
        h.setLink(null);
        return contentFor(c);
      },
    });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).toHaveBeenCalledTimes(1);
  });
  it.each(["spending", "model", "hypothesis-expiry", "link-expiry"])(
    "rejects %s changing during inference",
    async (kind) => {
      const h = await harness(undefined, {
        response: (c) => {
          if (kind === "spending") h.env.META_SPENDING_APPROVED = "false";
          if (kind === "model") h.env.META_MODEL = "muse-spark-1.3";
          if (kind === "hypothesis-expiry")
            h.advance(META_LIMITS.artifactTtlMs);
          if (kind === "link-expiry") h.link().expiresAt = h.now();
          return contentFor(c);
        },
      });
      const response = await h.post("interpret-evidence", h.request);
      expect(response.status).toBe(
        kind === "link-expiry" || kind === "hypothesis-expiry" ? 422 : 503,
      );
      expect(h.network).toHaveBeenCalledTimes(1);
    },
  );
  it("invalidates an issued hypothesis when the proposal goal changes", async () => {
    const h = await harness();
    const changed = { ...h.input, goal: "A different approved goal" };
    expect((await h.post("propose", changed)).status).toBe(200);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it("rejects actual revoked/expired disclosures through the existing loader", async () => {
    const f = await publicationFixture();
    fixtures.push(f);
    const h = await harness(f);
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    await chmod(f.revocationFile, 0o600);
    await writeFile(
      f.revocationFile,
      JSON.stringify({ revokedIds: ["public-disclosure"] }),
    );
    await chmod(f.revocationFile, 0o400);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
    expect(
      (
        await loadDecisionReports(
          fixtures[0]!.config,
          Date.parse("2026-11-01T00:00:00Z"),
        )
      ).state,
    ).toBe("unavailable");
  });
  it("rejects actual custody revocation during synthetic inference", async () => {
    const h = await harness(undefined, {
      afterCall: async (step) => {
        if (step !== "interpret-evidence") return;
        const file = `${h.originals.root}/revocations.json`;
        await chmod(file, 0o600);
        await writeFile(
          file,
          JSON.stringify({ revokedIds: [h.originals.ids.bindingId] }),
        );
        await chmod(file, 0o400);
      },
    });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).toHaveBeenCalledTimes(1);
  });
  it("does not weaken the shared process budget and gives interpretation only the existing per-endpoint allowance", async () => {
    const h = await harness();
    for (let n = 0; n < 4; n++)
      expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    expect((await h.post("interpret-evidence", h.request)).status).toBe(429);
    // propose+hypothesize consumed two calls before the four interpretations.
    h.env.META_APPROVED_CALL_LIMIT = "6";
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(429);
    expect(h.network).toHaveBeenCalledTimes(4);
    expect(
      h.transport.observations().filter((o) => o.step === "interpret-evidence"),
    ).toHaveLength(4);
  });
});

describe("accepted research context lifecycle", () => {
  it.each(["interpret-evidence", "hypothesize", "challenge"] as const)(
    "rejects pending %s after same-context hypothesis replacement",
    async (stage) => {
      let hold = false,
        release!: () => void,
        entered!: () => void;
      const pending = new Promise<void>((r) => {
        release = r;
      });
      const started = new Promise<void>((r) => {
        entered = r;
      });
      const h = await harness(undefined, {
        afterCall: async (step) => {
          if (hold && step === stage) {
            hold = false;
            entered();
            await pending;
          }
        },
      });
      hold = true;
      const input =
        stage === "interpret-evidence"
          ? h.request
          : stage === "hypothesize"
            ? h.hypothesisInput
            : challengeRequest(h.hypothesisInput, h.hypothesis);
      const old = h.post(stage, input);
      try {
        await started;
        expect((await h.post("hypothesize", h.hypothesisInput)).status).toBe(
          200,
        );
      } finally {
        release();
      }
      expect((await old).status).toBe(422);
    },
  );

  it("retires earlier hypotheses when a fresh hypothesis is accepted for the same context", async () => {
    const h = await harness();
    const next = await h.post("hypothesize", h.hypothesisInput);
    expect(next.status).toBe(200);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, await next.json()),
        )
      ).status,
    ).toBe(200);
  });
  it("rejects an older pending proposal after a newer overlapping proposal is accepted", async () => {
    let hold = false,
      release!: () => void,
      entered!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const h = await harness(undefined, {
      afterCall: async (step) => {
        if (hold && step === "propose") {
          hold = false;
          entered();
          await pending;
        }
      },
    });
    hold = true;
    const old = h.post("propose", {
      ...h.input,
      goal: "Older pending replacement",
    });
    try {
      await started;
      expect(
        (
          await h.post("propose", {
            ...h.input,
            goal: "Newer accepted replacement",
          })
        ).status,
      ).toBe(200);
    } finally {
      release();
    }
    expect((await old).status).toBe(422);
  });
  it("does not share issued identities between isolated service processes", async () => {
    const a = await harness(),
      b = await harness();
    b.network.mockClear();
    expect((await b.post("interpret-evidence", a.request)).status).toBe(422);
    expect(
      (
        await b.post(
          "challenge",
          challengeRequest(a.hypothesisInput, a.hypothesis),
        )
      ).status,
    ).toBe(422);
    expect(b.network).not.toHaveBeenCalled();
  });

  it.each([
    "goal",
    "candidate-id",
    "candidate-content",
    "goal-and-candidates",
    "intent-revision",
    "overlapping-intents",
  ])(
    "retires %s changes and prevents old candidate-array replay",
    async (kind) => {
      let replace = false;
      const h = await harness(undefined, {
        proposal: (request) => {
          const c = syntheticContent("propose", request);
          if (replace && c.candidates) {
            if (kind === "candidate-id" || kind === "goal-and-candidates")
              c.candidates[1]!.id += "-new";
            if (kind === "candidate-content" || kind === "goal-and-candidates")
              c.candidates[1]!.description += " Changed policy approach.";
          }
          return c;
        },
      });
      expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
      replace = true;
      const updated = structuredClone(h.input);
      if (kind === "goal" || kind === "goal-and-candidates")
        updated.goal += " New research goal.";
      if (kind === "intent-revision") updated.intents[0]!.revision++;
      if (kind === "overlapping-intents")
        updated.intents.push({
          ...updated.intents[0]!,
          id: "intent-additional",
        });
      const replacement = await h.post("propose", updated);
      expect(replacement.status).toBe(200);
      const proposal = (await replacement.json()) as ProposeResponse;
      h.network.mockClear();
      expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
      expect((await h.post("hypothesize", h.hypothesisInput)).status).toBe(422);
      expect(
        (
          await h.post(
            "challenge",
            challengeRequest(h.hypothesisInput, h.hypothesis),
          )
        ).status,
      ).toBe(422);
      expect(h.network).not.toHaveBeenCalled();
      const newInput = hypothesisRequest(updated, proposal);
      const next = await h.post("hypothesize", newInput);
      expect(next.status).toBe(200);
      const hypothesis = (await next.json()) as HypothesizeResponse;
      expect(
        (await h.post("challenge", challengeRequest(newInput, hypothesis)))
          .status,
      ).toBe(200);
    },
  );
  it("keeps unchanged accepted context usable without replacing hypothesis identity/provenance or extending its TTL", async () => {
    const h = await harness();
    const again = await h.post("propose", h.input);
    expect(again.status).toBe(200);
    expect((await again.json()).candidates).toEqual(h.proposal.candidates);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    const payload = JSON.parse(h.network.mock.calls[0]![1]!.body as string);
    expect(JSON.parse(payload.messages[1].content).hypothesis).toEqual(
      h.issued.hypothesis,
    );
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(200);
    h.link().expiresAt += META_LIMITS.artifactTtlMs;
    h.advance(META_LIMITS.artifactTtlMs - (h.now() - h.issued.issuedAt));
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
  });
  it("preserves disjoint intent contexts even when their candidate arrays are identical", async () => {
    const h = await harness();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    const unrelated = structuredClone(h.input);
    unrelated.intents[0]!.id = "intent-unrelated";
    unrelated.goal = "Separate requirement research";
    const response = await h.post("propose", unrelated);
    expect(response.status).toBe(200);
    const proposal = (await response.json()) as ProposeResponse;
    expect(proposal.candidates).toEqual(h.proposal.candidates);
    const input = hypothesisRequest(unrelated, proposal);
    const next = await h.post("hypothesize", input);
    expect(next.status).toBe(200);
    const hypothesis = (await next.json()) as HypothesizeResponse;
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(200);
    expect(
      (await h.post("challenge", challengeRequest(input, hypothesis))).status,
    ).toBe(200);
  });
  it.each([
    "provider-failure",
    "malformed-output",
    "invalid-output",
    "aborted-before",
    "aborted-after",
    "missing-consent",
    "rejected-intent",
  ])("does not supersede valid context after %s replacement", async (kind) => {
    let replace = false;
    const controller = new AbortController();
    const h = await harness(undefined, {
      proposal: (request) => {
        const c = syntheticContent("propose", request);
        if (replace) {
          if (kind === "provider-failure") throw new Error("Synthetic failure");
          if (kind === "malformed-output" && c.candidates)
            c.candidates[1]!.description = "";
          if (kind === "invalid-output" && c.candidates)
            c.candidates[1]!.baselineCommit = "f".repeat(40);
          if (kind === "aborted-after") controller.abort();
        }
        return c;
      },
    });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    replace = true;
    const updated = {
      ...structuredClone(h.input),
      goal: "Replacement research",
    };
    if (kind === "aborted-before") controller.abort();
    if (kind === "missing-consent") Object.assign(updated, { consent: false });
    if (kind === "rejected-intent") updated.intents[0]!.status = "rejected";
    expect((await h.post("propose", updated, controller.signal)).status).toBe(
      kind === "missing-consent" ? 400 : kind === "rejected-intent" ? 422 : 503,
    );
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    expect(h.network).toHaveBeenCalledTimes(1);
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(200);
  });
  it("never revives a retired hypothesis when the old context is later proposed again", async () => {
    const h = await harness();
    expect(
      (await h.post("propose", { ...h.input, goal: "Replacement goal" }))
        .status,
    ).toBe(200);
    expect((await h.post("propose", h.input)).status).toBe(200);
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(
      (
        await h.post(
          "challenge",
          challengeRequest(h.hypothesisInput, h.hypothesis),
        )
      ).status,
    ).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
    const next = await h.post("hypothesize", h.hypothesisInput);
    expect(next.status).toBe(200);
    expect((await next.json()).hypotheses[0].id).not.toBe(
      h.request.hypothesisId,
    );
  });
  it.each(["interpret-evidence", "hypothesize", "challenge"] as const)(
    "rejects %s if its context is superseded before the async reply is consumed",
    async (stage) => {
      let release!: () => void;
      let entered!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let hold = false;
      const h = await harness(undefined, {
        afterCall: async (step) => {
          if (hold && step === stage) {
            entered();
            await pending;
          }
        },
      });
      const input =
        stage === "interpret-evidence"
          ? h.request
          : stage === "hypothesize"
            ? h.hypothesisInput
            : challengeRequest(h.hypothesisInput, h.hypothesis);
      hold = true;
      const response = h.post(stage, input);
      try {
        await started;
        const replacement = await h.post("propose", {
          ...h.input,
          goal: "Changed during pending response",
        });
        expect(replacement.status).toBe(200);
      } finally {
        release();
      }
      expect((await response).status).toBe(422);
      h.network.mockClear();
      expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
      expect(h.network).not.toHaveBeenCalled();
    },
  );
  it("rejects a superseded hypothesis after genuinely different goal and candidates", async () => {
    let replace = false;
    const h = await harness(undefined, {
      proposal: (request) => {
        const content = syntheticContent("propose", request);
        if (replace && content.candidates)
          for (const candidate of content.candidates) {
            candidate.id += "-replacement";
            candidate.description += " Replacement architecture context.";
          }
        return content;
      },
    });
    expect((await h.post("interpret-evidence", h.request)).status).toBe(200);
    replace = true;
    const updated = {
      ...h.input,
      goal: "A genuinely different approved research goal",
    };
    const replacement = await h.post("propose", updated);
    expect(replacement.status).toBe(200);
    const proposal = (await replacement.json()) as ProposeResponse;
    expect(proposal.candidates.map((c) => c.id)).not.toEqual(
      h.proposal.candidates.map((c) => c.id),
    );
    h.network.mockClear();
    expect((await h.post("interpret-evidence", h.request)).status).toBe(422);
    expect(h.network).not.toHaveBeenCalled();
    const input = hypothesisRequest(updated, proposal);
    const response = await h.post("hypothesize", input);
    expect(response.status).toBe(200);
    const hypothesis = (await response.json()) as HypothesizeResponse;
    expect(
      (await h.post("challenge", challengeRequest(input, hypothesis))).status,
    ).toBe(200);
  });
});

describe("conservative assessment semantics", () => {
  it("allows only the directly observed directional required-check prediction", async () => {
    const h = await harness(fixtures[1]);
    const evidence = await h.adapter(
      h.request.evidenceSummaryId,
      h.issued,
      h.now(),
    );
    const context: InterpretationContext = {
      hypothesis: structuredClone(h.issued.hypothesis),
      evidence: structuredClone(evidence),
    };
    context.hypothesis.prediction.metric = "required_check_success";
    context.hypothesis.prediction.direction = "higher";
    // Unit-only counterfactual: no omitted publication-specific limitations.
    context.evidence.conditions.withheldPublicationLimitationCount = 0;
    const c = contentFor(context);
    c.assessment = "supported";
    expect(() => validateInterpretation(c, context)).not.toThrow();
    c.assessment = "contradicted";
    expect(() => validateInterpretation(c, context)).toThrow();
    context.hypothesis.prediction.direction = "lower";
    expect(() => validateInterpretation(c, context)).not.toThrow();
    for (const comparability of [
      "NOT_COMPARABLE",
      "INSUFFICIENT_EVIDENCE",
    ] as const) {
      context.evidence.comparability = comparability;
      expect(() => validateInterpretation(c, context)).toThrow();
      c.assessment = "not_established";
      expect(() => validateInterpretation(c, context)).not.toThrow();
      c.assessment = "contradicted";
    }
  });
  it("does not turn a correctness tie into superiority or hide omitted limitations", async () => {
    const h = await harness();
    const evidence = await h.adapter(
      h.request.evidenceSummaryId,
      h.issued,
      h.now(),
    );
    const context: InterpretationContext = {
      hypothesis: structuredClone(h.issued.hypothesis),
      evidence,
    };
    context.hypothesis.prediction.metric = "required_check_success";
    context.hypothesis.prediction.direction = "higher";
    context.evidence.conditions.withheldPublicationLimitationCount = 0;
    const c = contentFor(context);
    c.assessment = "supported";
    expect(() => validateInterpretation(c, context)).toThrow();
    c.assessment = "contradicted";
    expect(() => validateInterpretation(c, context)).not.toThrow();
    context.evidence.conditions.withheldPublicationLimitationCount = 1;
    expect(() => validateInterpretation(c, context)).toThrow();
  });
});
