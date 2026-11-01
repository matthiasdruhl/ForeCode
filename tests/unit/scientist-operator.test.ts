// Disposable authenticated originals and local fake provider only.
import { randomUUID } from "node:crypto";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  stageScientistOperator,
  buildScientistPreselectionDraft,
  completeScientistCommitmentDraft,
  isLiveStagedRegistrationResolver,
  type ScientistSchedule,
} from "../../scripts/experiments/tournament/scientist-operator";
import { canonicalJson } from "@/lib/report/canonical";
import { sha256 } from "@/lib/report/digests";
import { digest } from "@/server/meta/transport";
import { META_LIMITS } from "@/lib/foresight/prompts";
import type { IssuedHypothesis } from "@/server/meta/evidence";
import type { RegistrationConfig } from "@/server/meta/registration-reader";
import { isAuthenticatedRegistration } from "@/server/meta/registration-reader";
import { scientistHarness } from "../support/scientist-harness";
import { publicationFixture } from "../support/tournament-publication";
import { envelope, syntheticContent } from "../support/foresight";
vi.mock("@/lib/foresight/booking-context", async (original) => ({
  ...(await original<typeof import("@/lib/foresight/booking-context")>()),
  bookingGraph: {
    ...(await original<typeof import("@/lib/foresight/booking-context")>())
      .bookingGraph,
    repoCommit: "1".repeat(40),
  },
}));
let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
});
afterAll(async () => {
  await rm(f.parent, { recursive: true, force: true });
});
const schedule: ScientistSchedule = {
  reasoningAndBindingMs: 60_000,
  preparationMs: 60_000,
  baselinesAndAdmissionMs: 60_000,
  finalizationAndMeasurementMs: 60_000,
  disclosureAndInterpretationMs: 60_000,
  safetyMarginMs: 60_000,
};
async function fixture(realTime = false) {
  const h = await scientistHarness(f);
  const startedAt = Date.now();
  let at = h.issued.proposalStartedAt!,
    seq = 0;
  const now = () =>
    realTime ? h.issued.proposalStartedAt! + Date.now() - startedAt : at;
  const initial = {
    protocolId: h.ids.protocolId,
    commitmentId: h.ids.commitmentId,
    custody: {
      ...h.config.custody,
      entries: new Map(
        [...h.config.custody.entries].filter(([id]) =>
          [h.ids.protocolId, h.ids.commitmentId].includes(id),
        ),
      ),
    },
  };
  const network = vi.fn<typeof fetch>(async (_url, init) => {
    const input = JSON.parse(
      JSON.parse(init!.body as string).messages[1].content,
    );
    const step =
      "hypotheses" in input
        ? "challenge"
        : "candidates" in input
          ? "hypothesize"
          : "propose";
    return Response.json(
      envelope(syntheticContent(step, input), {
        id: `staged-synthetic-${++seq}`,
        model: h.commitment.study.model,
      }),
    );
  });
  const env: Record<string, string | undefined> = {
    META_CALLS_ENABLED: "true",
    META_SPENDING_APPROVED: "true",
    META_MODEL_API_KEY: "synthetic-never-on-network",
    META_MODEL: h.commitment.study.model,
    META_API_BASE_URL: "https://api.meta.ai/v1",
  };
  const approved: string[] = [];
  const captured: IssuedHypothesis[] = [];
  async function binding(
    issued: Readonly<IssuedHypothesis>,
  ): Promise<RegistrationConfig> {
    expect(Object.isFrozen(issued.hypothesis.prediction)).toBe(true);
    captured.push(issued);
    const document = structuredClone(h.binding);
    document.hypothesis = structuredClone(issued.hypothesis);
    document.registration.hypothesisId = issued.hypothesis.id;
    document.registration.hypothesisSha256 = digest(issued.hypothesis);
    document.registration.issuedAt = issued.issuedAt;
    document.registration.registeredAt = now();
    document.registration.expiresAt =
      issued.issuedAt + META_LIMITS.artifactTtlMs;
    document.registration.context.candidates.forEach((candidate) => {
      candidate.modelId = h.commitment.study.model;
    });
    document.lineage.hypothesisId = issued.hypothesis.id;
    document.lineage.contextSha256 = issued.contextSha256;
    const {
      protocolSha256,
      studyProtocolSha256,
      sourceTreeSha256,
      sourceManifestSha256,
      variants,
      ...identities
    } = document.lineage;
    void protocolSha256;
    void studyProtocolSha256;
    void sourceTreeSha256;
    void sourceManifestSha256;
    void variants;
    document.lineage.protocolSha256 = digest({
      ...h.commitment.measurementPlan,
      ...identities,
    });
    const id = `staged-binding-${randomUUID()}`;
    await f.hold({
      id,
      kind: "scientist-registration",
      studyId: document.registration.study.studyId,
      subjectSha256: digest(document),
      predecessorSha256: document.commitmentOriginalSha256,
      heldAt: new Date(document.registration.registeredAt).toISOString(),
    });
    const bytes = await readFile(path.join(f.root, `${id}.json`));
    const documentBytes = canonicalJson(document);
    await writeFile(path.join(h.root, `${id}.json`), bytes, {
      mode: 0o400,
      flag: "wx",
    });
    await writeFile(path.join(h.root, `${id}-document.json`), documentBytes, {
      mode: 0o400,
      flag: "wx",
    });
    return {
      custody: {
        ...initial.custody,
        entries: new Map([
          ...initial.custody.entries,
          [
            id,
            {
              file: `${id}.json`,
              sha256: sha256(bytes),
              documentFile: `${id}-document.json`,
              documentSha256: sha256(documentBytes),
            },
          ],
        ]),
      },
      registrations: [
        {
          id: document.registration.id,
          studyId: document.registration.study.studyId,
          hypothesisId: issued.hypothesis.id,
          protocolId: initial.protocolId,
          commitmentId: initial.commitmentId,
          bindingId: id,
        },
      ],
    };
  }
  const options: Parameters<typeof stageScientistOperator>[0] = {
    registrationId: h.registration.id,
    initial,
    schedule,
    now,
    provider: { env: () => env, fetch: network },
    approveRequest: async (approval) => {
      approved.push(approval.payloadSha256);
      return true;
    },
    resolveBinding: binding,
  };
  async function throughChallenge(
    operator: Awaited<ReturnType<typeof stageScientistOperator>>,
  ) {
    await operator.propose(new AbortController().signal);
    if (realTime) await new Promise((resolve) => setTimeout(resolve, 10_020));
    else at += 11_000;
    await operator.hypothesize(new AbortController().signal);
    if (realTime) await new Promise((resolve) => setTimeout(resolve, 10_020));
    else at += 11_000;
    await operator.challenge(new AbortController().signal);
    if (!realTime) at += 1000;
  }
  return {
    h,
    options,
    initial,
    network,
    env,
    approved,
    captured,
    binding,
    now,
    throughChallenge,
    advance: (ms: number) => {
      at += ms;
    },
  };
}
describe("staged private Scientist operator", () => {
  it.each(["", "prospective-registration-20261101-01", "not-a-uuid"])(
    "rejects invalid planned registration %j before custody or provider use",
    async (registrationId) => {
      const x = await fixture();
      x.options.registrationId = registrationId;
      x.options.initial.custody.originalRoot = "/missing-planned-id-control";
      const resolveBinding = vi.fn(x.options.resolveBinding);
      x.options.resolveBinding = resolveBinding;
      await expect(stageScientistOperator(x.options)).rejects.toThrow(
        "Invalid UUID",
      );
      expect(x.network).not.toHaveBeenCalled();
      expect(resolveBinding).not.toHaveBeenCalled();
      expect(x.approved).toEqual([]);
    },
  );
  it("captures the planned enrollment UUID before generation and cannot retarget it later", async () => {
    const x = await fixture();
    const op = await stageScientistOperator(x.options);
    x.options.registrationId = randomUUID();
    await x.throughChallenge(op);
    const registered = await op.register(new AbortController().signal);
    expect(isAuthenticatedRegistration(registered)).toBe(true);
    expect(registered.registration.id).toBe(x.h.registration.id);
    expect(x.network).toHaveBeenCalledTimes(3);
  });
  it("prepares concrete review data without inventing owner confirmation, consent or custody", async () => {
    const x = await fixture();
    const draft = buildScientistPreselectionDraft({
      definition: f.study.definition,
      sourceManifest: x.h.commitment.sourceManifest,
      intent: x.h.input.intents[0]!,
      goal: x.h.input.goal,
    });
    expect(draft).toMatchObject({
      state: "UNSIGNED_UNCONFIRMED_NOT_AUTHORIZED",
      ownerConfirmation: null,
      consent: null,
      protocolOriginalSha256: null,
      measurementPlan: null,
    });
    expect(draft.proposedIntent).not.toHaveProperty("updatedAt");
    expect(draft.proposedIntent).not.toHaveProperty("status");
    expect(draft.proposedIntent).not.toHaveProperty("source");
    const completed = completeScientistCommitmentDraft(draft, {
      confirmedIntent: x.h.input.intents[0]!,
      consent: true,
      protocolOriginalSha256: x.h.commitment.study.protocolOriginalSha256,
      prediction: x.h.commitment.prediction,
      measurementPlan: x.h.commitment.measurementPlan,
    });
    expect(digest(completed)).toBe(digest(x.h.commitment));
    expect(x.network).not.toHaveBeenCalled();
  });
  it("rejects a different confirmed requirement when completing a review draft", async () => {
    const x = await fixture();
    const draft = buildScientistPreselectionDraft({
      definition: f.study.definition,
      sourceManifest: x.h.commitment.sourceManifest,
      intent: x.h.input.intents[0]!,
      goal: x.h.input.goal,
    });
    expect(() =>
      completeScientistCommitmentDraft(draft, {
        confirmedIntent: {
          ...x.h.input.intents[0]!,
          statement: "A different requirement.",
        },
        consent: true,
        protocolOriginalSha256: x.h.commitment.study.protocolOriginalSha256,
        prediction: x.h.commitment.prediction,
        measurementPlan: x.h.commitment.measurementPlan,
      }),
    ).toThrow("Confirmed requirement differs");
  });
  it("rejects a draft goal outside the actual proposal request limit", async () => {
    const x = await fixture();
    expect(() =>
      buildScientistPreselectionDraft({
        definition: f.study.definition,
        sourceManifest: x.h.commitment.sourceManifest,
        intent: x.h.input.intents[0]!,
        goal: "x".repeat(501),
      }),
    ).toThrow();
  });
  it("rehearses the real transport spacing and same-process handoff without any network", async () => {
    const started = performance.now(),
      x = await fixture(true);
    const op = await stageScientistOperator(x.options);
    expect(isLiveStagedRegistrationResolver(op.resolveRegistered)).toBe(false);
    expect(isLiveStagedRegistrationResolver(async () => x.h.binding)).toBe(
      false,
    );
    await x.throughChallenge(op);
    const registration = await op.register(new AbortController().signal);
    expect(isAuthenticatedRegistration(registration)).toBe(true);
    expect(await op.resolveRegistered()).toBeTruthy();
    expect(x.network).toHaveBeenCalledTimes(3);
    const elapsedMs = Math.ceil(performance.now() - started);
    expect(elapsedMs).toBeGreaterThanOrEqual(20_000);
    console.info(
      JSON.stringify({
        rehearsal: "ACTUAL_WALL_TIME_FAKE_PROVIDER_DISPOSABLE_ORIGINALS",
        elapsedMs,
        liveProvider: false,
        genuineCustody: false,
        downstreamExecution: false,
      }),
    );
  }, 30_000);
  it("authenticates initial originals before local fake generation and appends a binding without replacing the process", async () => {
    const started = performance.now(),
      x = await fixture();
    const op = await stageScientistOperator(x.options);
    expect(x.network).not.toHaveBeenCalled();
    expect(op.status()).toMatchObject({
      phase: "staged",
      execution: "DISABLED",
      scheduleEvidence: "UNVERIFIED_ESTIMATE",
    });
    await x.throughChallenge(op);
    const registered = await op.register(new AbortController().signal);
    expect(isAuthenticatedRegistration(registered)).toBe(true);
    expect(x.captured[0]?.issuedAt).toBe(
      x.h.issued.proposalStartedAt! + 11_000,
    );
    expect(x.captured[0]?.proposalStartedAt).toBe(x.h.issued.proposalStartedAt);
    expect(x.captured[0]?.proposalInputSha256).toBe(digest(x.h.input));
    expect(x.approved).toHaveLength(3);
    expect(x.network).toHaveBeenCalledTimes(3);
    expect((await op.resolveRegistered()).bindingOriginalSha256).toBe(
      registered.bindingOriginalSha256,
    );
    await expect(op.register(new AbortController().signal)).rejects.toThrow();
    // Actual local rehearsal time, explicitly not provider/custodian/runtime timing.
    console.info(
      JSON.stringify({
        rehearsal: "SYNTHETIC_NO_NETWORK",
        elapsedMs: Math.ceil(performance.now() - started),
        simulatedLifecycleMs: 23_000,
      }),
    );
  });
  it("requires genuine initial original pins before any provider request", async () => {
    const x = await fixture();
    x.options.initial.commitmentId = "missing-original";
    await expect(stageScientistOperator(x.options)).rejects.toThrow();
    expect(x.network).not.toHaveBeenCalled();
  });
  it("rejects schedules which cannot fit both maximum-duration arms", async () => {
    const x = await fixture();
    x.options.schedule = {
      ...schedule,
      preparationMs: META_LIMITS.artifactTtlMs,
    };
    await expect(stageScientistOperator(x.options)).rejects.toThrow(
      "Schedule exceeds",
    );
    expect(x.network).not.toHaveBeenCalled();
  });
  it("rejects zero mandatory overhead instead of declaring a timetable ready", async () => {
    const x = await fixture();
    x.options.schedule = { ...schedule, preparationMs: 0 };
    await expect(stageScientistOperator(x.options)).rejects.toThrow();
    expect(x.network).not.toHaveBeenCalled();
  });
  it("brands only the default-wall-clock staged resolver and still requires service enrollment", async () => {
    const x = await fixture(),
      entries = new Map(x.initial.custody.entries);
    entries.clear();
    async function holdDocument(
      kind: "protocol" | "scientist-commitment",
      document: unknown,
      predecessorSha256: string | null,
      heldAgoMs: number,
    ) {
      const id = `wall-clock-${randomUUID()}`,
        at = Date.now();
      await f.hold({
        id,
        kind,
        studyId: x.h.commitment.study.studyId,
        subjectSha256: digest(document),
        predecessorSha256,
        heldAt: new Date(at - heldAgoMs).toISOString(),
        expiresAt: new Date(at + 3600_000).toISOString(),
      });
      const bytes = await readFile(path.join(f.root, `${id}.json`)),
        doc = canonicalJson(document);
      await writeFile(path.join(x.h.root, `${id}.json`), bytes, {
        mode: 0o400,
        flag: "wx",
      });
      await writeFile(path.join(x.h.root, `${id}-document.json`), doc, {
        mode: 0o400,
        flag: "wx",
      });
      entries.set(id, {
        file: `${id}.json`,
        sha256: sha256(bytes),
        documentFile: `${id}-document.json`,
        documentSha256: sha256(doc),
      });
      return { id, sha256: sha256(bytes) };
    }
    const protocol = await holdDocument(
      "protocol",
      f.study.definition,
      null,
      2000,
    );
    const commitment = structuredClone(x.h.commitment);
    commitment.study.protocolOriginalSha256 = protocol.sha256;
    const held = await holdDocument(
      "scientist-commitment",
      commitment,
      protocol.sha256,
      1000,
    );
    x.options.initial = {
      protocolId: protocol.id,
      commitmentId: held.id,
      custody: { ...x.initial.custody, entries },
    };
    delete x.options.now;
    const injected = await stageScientistOperator(x.options);
    expect(isLiveStagedRegistrationResolver(injected.resolveRegistered)).toBe(
      false,
    );
    x.options.provider.fetch = globalThis.fetch;
    const operator = await stageScientistOperator(x.options);
    expect(isLiveStagedRegistrationResolver(operator.resolveRegistered)).toBe(
      true,
    );
    expect(
      isLiveStagedRegistrationResolver(() => operator.resolveRegistered()),
    ).toBe(false);
    await expect(operator.resolveRegistered()).rejects.toThrow(
      "Live enrollment required",
    );
    expect(x.network).not.toHaveBeenCalled();
  });
  it("withholds requests without exact consent and never silently retries a consumed stage", async () => {
    const x = await fixture();
    x.options.approveRequest = async () => false;
    const op = await stageScientistOperator(x.options);
    await expect(op.propose(new AbortController().signal)).rejects.toThrow();
    await expect(op.propose(new AbortController().signal)).rejects.toThrow();
    expect(op.status().phase).toBe("failed");
    expect(x.network).not.toHaveBeenCalled();
  });
  it.each(["model", "payload", "limit"])(
    "preserves narrower provider %s authority",
    async (mode) => {
      const x = await fixture();
      if (mode === "model") x.env.META_MODEL = "muse-spark-1.3-contributor";
      if (mode === "payload")
        x.env.META_APPROVED_PAYLOAD_SHA256 = "0".repeat(64);
      if (mode === "limit") x.env.META_APPROVED_CALL_LIMIT = "0";
      const op = await stageScientistOperator(x.options);
      await expect(op.propose(new AbortController().signal)).rejects.toThrow();
      expect(x.network).not.toHaveBeenCalled();
    },
  );
  it.each(["authority", "revocation", "inventory", "registration"])(
    "rejects %s substitution by the private continuation",
    async (mode) => {
      const x = await fixture();
      x.options.resolveBinding = async (issued) => {
        const config = await x.binding(issued);
        if (mode === "authority")
          config.custody.publicKeySha256 = "0".repeat(64);
        if (mode === "revocation")
          config.custody.revocationSha256 = "0".repeat(64);
        if (mode === "inventory")
          config.custody.entries = new Map(
            [...config.custody.entries].filter(
              ([id]) => id !== x.initial.commitmentId,
            ),
          );
        if (mode === "registration") config.registrations[0]!.id = randomUUID();
        return config;
      };
      const op = await stageScientistOperator(x.options);
      await x.throughChallenge(op);
      await expect(op.register(new AbortController().signal)).rejects.toThrow();
      await expect(op.resolveRegistered()).rejects.toThrow();
    },
  );
  it("does not admit a binding after expiry while the trusted continuation was pending", async () => {
    const x = await fixture();
    x.options.resolveBinding = async (issued) => {
      const c = await x.binding(issued);
      x.advance(META_LIMITS.artifactTtlMs);
      return c;
    };
    const op = await stageScientistOperator(x.options);
    await x.throughChallenge(op);
    await expect(op.register(new AbortController().signal)).rejects.toThrow();
    expect(op.status().remainingMs).toBe(0);
    await expect(op.resolveRegistered()).rejects.toThrow();
  });
  it("cancels a pending custody continuation without enabling enrollment", async () => {
    const x = await fixture();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    x.options.resolveBinding = async (issued) => {
      const config = await x.binding(issued);
      entered();
      await wait;
      return config;
    };
    const op = await stageScientistOperator(x.options);
    await x.throughChallenge(op);
    const controller = new AbortController(),
      pending = op.register(controller.signal);
    await ready;
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(op.status().phase).toBe("failed");
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(op.status().phase).toBe("failed");
    await expect(op.resolveRegistered()).rejects.toThrow();
  });
  it("freshly withholds enrollment after actual revocation bytes change", async () => {
    const x = await fixture(),
      op = await stageScientistOperator(x.options);
    await x.throughChallenge(op);
    await op.register(new AbortController().signal);
    const file = path.join(x.h.root, "revocations.json");
    await chmod(file, 0o600);
    await writeFile(
      file,
      canonicalJson({ revokedIds: [x.initial.commitmentId] }),
    );
    await chmod(file, 0o400);
    await expect(op.resolveRegistered()).rejects.toThrow();
  });
});
