// Private source composition only. No CLI, signer, file/env authority selector,
// browser endpoint, default provider or TTL extension is supplied here.
import { VisibleScenarioV1Schema } from "../../../src/lib/contracts/architecture";
import { z } from "zod";
import { IntentV1Schema } from "../../../src/lib/contracts/intents";
import { IntentInputSchema } from "../../../src/lib/intents/lifecycle";
import { OpaqueIdSchema } from "../../../src/lib/foresight/interpretation/contracts";
import { invariant } from "../../../src/lib/contracts/validation";
import {
  requestSchemas,
  validateApprovedInput,
  type FlowRequest,
  type Step,
} from "../../../src/lib/foresight/flow";
import {
  buildMetaPayload,
  META_LIMITS,
} from "../../../src/lib/foresight/prompts";
import { matchedConditionsDigest } from "../../../src/lib/experiment/study-identities";
import { futureTaskDigest } from "../../../src/lib/experiment/future-task";
import {
  createProtectedScientistCustodyStore,
  type ScientistCustodyConfig,
} from "../../../src/server/artifacts/evaluation-store";
import { ScientistCommitmentSchema } from "../../../src/server/meta/prospective-lineage";
import {
  createScientistRegistrationReader,
  type RegistrationConfig,
} from "../../../src/server/meta/registration-reader";
import type { IssuedHypothesis } from "../../../src/server/meta/evidence";
import { createForesightService } from "../../../src/server/meta/service";
import {
  observeScientistFailure,
  scientistFailureCode,
  type ScientistFailureObserver,
} from "../../../src/server/meta/failure-observation";
import {
  createMetaTransport,
  digest,
} from "../../../src/server/meta/transport";
import { immutable } from "./custody";
import { validateStudyDefinition } from "./study";
import { buildScientistPreselectionDraft } from "./scientist-preselection-draft";
export { buildScientistPreselectionDraft } from "./scientist-preselection-draft";

const intentFields = (value: z.infer<typeof IntentInputSchema>) =>
  IntentInputSchema.parse({
    title: value.title,
    statement: value.statement,
    priority: value.priority,
    horizon: value.horizon,
  });
const liveResolvers = new WeakMap<object, () => number>();
export function isLiveStagedRegistrationResolver(
  value: unknown,
): value is () => Promise<unknown> {
  return typeof value === "function" && liveResolvers.has(value);
}
export function liveStagedRegistrationDeadline(
  value: () => Promise<unknown>,
): number | null {
  return liveResolvers.get(value)?.() ?? null;
}

/** After the first real owner/protocol decisions, construct the exact unsigned
 * commitment for independent holding. Parsing/hashing supplies no authority. */
export function completeScientistCommitmentDraft(
  draft: ReturnType<typeof buildScientistPreselectionDraft>,
  input: {
    confirmedIntent: z.infer<typeof IntentV1Schema>;
    consent: true;
    protocolOriginalSha256: string;
    measurementPlan: Record<string, unknown>;
    prediction: z.infer<typeof ScientistCommitmentSchema>["prediction"];
  },
) {
  const checked = buildScientistPreselectionDraft({
    definition: draft.definition,
    sourceManifest: draft.sourceManifest,
    intent: draft.proposedIntent,
    goal: draft.goal,
  });
  invariant(
    digest(checked) === digest(draft),
    "Preselection review draft changed.",
  );
  const intent = IntentV1Schema.parse(input.confirmedIntent);
  const expected = draft.proposedIntent;
  invariant(
    intent.id === expected.id &&
      intent.revision === expected.revision &&
      digest(intentFields(intent)) === digest(intentFields(expected)),
    "Confirmed requirement differs from review draft.",
  );
  const preselection = requestSchemas.propose.parse({
    intents: [intent],
    graph: draft.graph,
    goal: draft.goal,
    consent: input.consent,
  });
  validateApprovedInput(preselection);
  const p = draft.definition.protocol;
  return immutable(
    ScientistCommitmentSchema.parse({
      schemaVersion: "scientist-initial-commitment.local.v1",
      study: {
        studyId: p.studyId,
        taskId: p.task.id,
        taskDefinitionSha256: futureTaskDigest(p.task),
        definitionSha256: digest(draft.definition),
        protocolOriginalSha256: input.protocolOriginalSha256,
        model: p.executionConditions[0]!.modelId,
        order: p.trialPolicy.order,
        baselineEvaluatorSha256: p.futureOracle.baselineOracle.evaluatorSha256,
        baselineSuiteSha256: p.futureOracle.baselineOracle.testSuiteSha256,
        baselinePolicySha256:
          p.futureOracle.baselineOracle.requiredPolicySha256,
        futureEvaluatorSha256: p.futureOracle.oracle.evaluatorSha256,
        futureSuiteSha256: p.futureOracle.oracle.testSuiteSha256,
        futurePolicySha256: p.futureOracle.oracle.requiredPolicySha256,
      },
      preselection,
      prediction: input.prediction,
      studyProtocolSha256: digest(p),
      matchedConditionsSha256: matchedConditionsDigest(draft.definition),
      measurementPlan: input.measurementPlan,
      sourceManifest: draft.sourceManifest,
    }),
  );
}

const duration = z.number().int().min(0).max(META_LIMITS.artifactTtlMs);
const scheduleSchema = z.strictObject({
  reasoningAndBindingMs: duration.refine((ms) => ms > 0),
  preparationMs: duration.refine((ms) => ms > 0),
  baselinesAndAdmissionMs: duration.refine((ms) => ms > 0),
  finalizationAndMeasurementMs: duration.refine((ms) => ms > 0),
  disclosureAndInterpretationMs: duration,
  safetyMarginMs: duration.refine((ms) => ms > 0),
});
export type ScientistSchedule = z.infer<typeof scheduleSchema>;
export type ScientistInitialOriginals = {
  custody: ScientistCustodyConfig;
  protocolId: string;
  commitmentId: string;
};
export type ScientistRequestApproval = Readonly<{
  step: Step;
  request: FlowRequest;
  payload: ReturnType<typeof buildMetaPayload>;
  payloadSha256: string;
}>;
function snapshotCustody(
  input: ScientistCustodyConfig,
): ScientistCustodyConfig {
  return {
    ...input,
    workspaceRoots: [...input.workspaceRoots],
    entries: new Map([...input.entries].map(([id, e]) => [id, { ...e }])),
  };
}
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("Scientist operator stopped.");
  let abort!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("Scientist operator stopped."));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([work, stopped]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Stage before generation using independently held exact originals. Callbacks
 * are trusted private operator code, never request-supplied configuration.
 * Callback readiness and schedule estimates are not experimental authority. */
export async function stageScientistOperator(options: {
  // Fix and validate the enrollment identity before any generation can occur.
  registrationId: string;
  initial: ScientistInitialOriginals;
  schedule: ScientistSchedule;
  provider: { env(): Record<string, string | undefined>; fetch: typeof fetch };
  observeFailure?: ScientistFailureObserver;
  approveRequest(
    approval: ScientistRequestApproval,
    signal: AbortSignal,
  ): Promise<boolean>;
  resolveBinding(
    issued: Readonly<IssuedHypothesis>,
    signal: AbortSignal,
  ): Promise<RegistrationConfig>;
  now?: () => number;
}) {
  const registrationId = OpaqueIdSchema.parse(options.registrationId);
  const now = options.now ?? Date.now;
  const wallClock = options.now === undefined;
  const concreteProvider = options.provider.fetch === globalThis.fetch;
  const { approveRequest, resolveBinding } = options;
  const provider = { ...options.provider };
  const observeFailure = options.observeFailure;
  const initial = {
    ...options.initial,
    custody: snapshotCustody(options.initial.custody),
  };
  const store = await createProtectedScientistCustodyStore(initial.custody);
  const protocol = await store.load(initial.protocolId),
    held = await store.load(initial.commitmentId);
  invariant(protocol && held, "Initial independent originals unavailable.");
  const commitment = immutable(ScientistCommitmentSchema.parse(held.document));
  const definition = immutable(validateStudyDefinition(protocol.document));
  const study = commitment.study;
  invariant(
    protocol.record.kind === "protocol" &&
      protocol.record.predecessorSha256 === null &&
      held.record.kind === "scientist-commitment" &&
      held.record.predecessorSha256 === protocol.sha256 &&
      protocol.record.studyId === study.studyId &&
      held.record.studyId === study.studyId &&
      protocol.sha256 === study.protocolOriginalSha256 &&
      digest(definition) === study.definitionSha256 &&
      digest(definition.protocol) === commitment.studyProtocolSha256 &&
      matchedConditionsDigest(definition) ===
        commitment.matchedConditionsSha256 &&
      definition.protocol.studyId === study.studyId &&
      futureTaskDigest(definition.protocol.task) ===
        study.taskDefinitionSha256 &&
      definition.protocol.task.id === study.taskId &&
      definition.protocol.trialPolicy.order === study.order &&
      definition.protocol.executionConditions.every(
        (c) => c.modelId === study.model,
      ),
    "Initial study identity changed.",
  );
  validateApprovedInput(commitment.preselection);
  invariant(
    commitment.preselection.graph.repoCommit ===
      definition.protocol.conditions[0]!.originalCommit &&
      digest(commitment.sourceManifest) === definition.protocol.fixtureSha256 &&
      commitment.sourceManifest.every(
        (file, i) =>
          !file.path.startsWith("/") &&
          !file.path.includes("\\") &&
          file.path
            .split("/")
            .every(
              (segment) => segment && segment !== "." && segment !== "..",
            ) &&
          (i === 0 || commitment.sourceManifest[i - 1]!.path < file.path),
      ) &&
      commitment.preselection.intents.some(
        (i) =>
          i.id === definition.protocol.intentRevision.id &&
          i.revision === definition.protocol.intentRevision.revision,
      ),
    "Initial source or confirmed intent changed.",
  );
  for (const [prefix, oracle] of [
    ["baseline", definition.protocol.futureOracle.baselineOracle],
    ["future", definition.protocol.futureOracle.oracle],
  ] as const)
    invariant(
      study[`${prefix}EvaluatorSha256`] === oracle.evaluatorSha256 &&
        study[`${prefix}SuiteSha256`] === oracle.testSuiteSha256 &&
        study[`${prefix}PolicySha256`] === oracle.requiredPolicySha256,
      "Initial evaluator identity changed.",
    );
  for (const id of initial.custody.entries.keys()) {
    const original = await store.load(id);
    invariant(original, "Incomplete initial inventory.");
    invariant(
      original.record.studyId !== study.studyId ||
        ![
          "scientist-registration",
          "preparation",
          "prepared",
          "runtime",
          "execution",
        ].includes(original.record.kind),
      "Study selection or downstream work already began.",
    );
    if (original.record.studyId === study.studyId) {
      if (original.record.kind === "protocol")
        invariant(id === initial.protocolId, "Study protocol reassigned.");
      if (original.record.kind === "scientist-commitment")
        invariant(id === initial.commitmentId, "Study commitment reassigned.");
    }
  }
  const initialExpiry = Math.min(
    ...[protocol, held].map((o) => Date.parse(o.record.expiresAt)),
  );
  const executionMs = definition.protocol.conditions.reduce(
    (sum, arm) => sum + arm.budget.maxSeconds * 1000,
    0,
  );
  const schedule = immutable(scheduleSchema.parse(options.schedule));
  const estimatedTotalMs =
    executionMs + Object.values(schedule).reduce((sum, ms) => sum + ms, 0);
  invariant(
    estimatedTotalMs < META_LIMITS.artifactTtlMs,
    "Schedule exceeds live Scientist window.",
  );
  let phase:
    | "staged"
    | "proposed"
    | "hypothesized"
    | "challenged"
    | "registered"
    | "failed" = "staged";
  let active = false,
    proposalStartedAt: number | null = null;
  let approvedPayload: string | null = null;
  let bindingSignal: AbortSignal | null = null;
  let bindingReader: ReturnType<
    typeof createScientistRegistrationReader
  > | null = null;
  let hypothesisId: string | null = null;
  let hypothesisInput: ReturnType<
    typeof requestSchemas.hypothesize.parse
  > | null = null;
  let hypotheses:
    | (Awaited<ReturnType<typeof service.run>> & {
        schemaVersion: "scientist-hypotheses.v1";
      })
    | null = null;
  const deadline = () =>
    Math.min(
      initialExpiry,
      (proposalStartedAt ?? now()) + META_LIMITS.artifactTtlMs,
    );
  function live() {
    invariant(now() < deadline(), "Scientist window expired.");
  }
  async function currentInitial() {
    live();
    for (const original of [protocol!, held!]) {
      const fresh = await store.load(original.record.id);
      invariant(
        fresh &&
          fresh.sha256 === original.sha256 &&
          Date.parse(fresh.record.heldAt) < now() &&
          now() < Date.parse(fresh.record.expiresAt),
        "Initial originals changed or expired.",
      );
    }
  }
  const transport = createMetaTransport({
    now,
    observeFailure,
    fetch: provider.fetch,
    env: () => {
      const env = provider.env();
      // Internal payload pin is set only after exact trusted callback approval.
      // Existing narrower provider limits/pins remain authoritative.
      if (
        !approvedPayload ||
        env.META_MODEL !== study.model ||
        (env.META_APPROVED_PAYLOAD_SHA256 &&
          env.META_APPROVED_PAYLOAD_SHA256 !== approvedPayload)
      )
        return { ...env, META_SPENDING_APPROVED: "false" };
      const limit =
        env.META_APPROVED_CALL_LIMIT === undefined
          ? 3
          : Number(env.META_APPROVED_CALL_LIMIT);
      return {
        ...env,
        META_APPROVED_PAYLOAD_SHA256: approvedPayload,
        META_APPROVED_CALL_LIMIT: String(
          Number.isInteger(limit) &&
            limit > 0 &&
            limit <= META_LIMITS.totalPerProcess
            ? Math.min(limit, 3)
            : 0,
        ),
      };
    },
  });
  const service = createForesightService(
    transport,
    now,
    undefined,
    async (id, issued) => {
      invariant(
        id === registrationId,
        "Planned registration identity changed.",
      );
      if (!bindingReader) {
        invariant(
          bindingSignal && !bindingSignal.aborted && phase === "challenged",
          "Trusted binding continuation required.",
        );
        const config = await bounded(
          resolveBinding(immutable(structuredClone(issued)), bindingSignal),
          bindingSignal,
        );
        live();
        const custody = snapshotCustody(config.custody);
        for (const key of [
          "originalRoot",
          "publicKeyPem",
          "publicKeySha256",
          "revocationSha256",
          "workspaceRoots",
        ] as const)
          invariant(
            digest(custody[key]) === digest(initial.custody[key]),
            "Initial custody authority changed.",
          );
        for (const [key, entry] of initial.custody.entries)
          invariant(
            digest(custody.entries.get(key)) === digest(entry),
            "Initial inventory removed or changed.",
          );
        invariant(
          config.registrations.length === 1 &&
            config.registrations[0]!.id === id &&
            config.registrations[0]!.studyId === study.studyId &&
            config.registrations[0]!.hypothesisId === issued.hypothesis.id &&
            config.registrations[0]!.protocolId === initial.protocolId &&
            config.registrations[0]!.commitmentId === initial.commitmentId,
          "Binding selected another initial study.",
        );
        bindingReader = createScientistRegistrationReader(
          { custody, registrations: config.registrations },
          now,
        );
      }
      return bindingReader.resolveRegistration(id, issued);
    },
    observeFailure,
  );
  async function operation<T>(
    expected: typeof phase,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    invariant(
      !active && phase === expected,
      "Scientist phase already consumed or unavailable.",
    );
    active = true;
    const remaining = deadline() - now();
    const scoped = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.max(0, Math.min(remaining, 2_147_483_647))),
    ]);
    let stage: "initial_custody" | "continuation" = "initial_custody";
    try {
      await currentInitial();
      invariant(!scoped.aborted, "Scientist operator stopped.");
      stage = "continuation";
      return await bounded(work(scoped), scoped);
    } catch (error) {
      phase = "failed";
      observeScientistFailure(observeFailure, {
        schemaVersion: "scientist-failure-observation.local.v1",
        layer: "operator",
        stage,
        step:
          expected === "staged"
            ? "propose"
            : expected === "proposed"
              ? "hypothesize"
              : expected === "hypothesized"
                ? "challenge"
                : "register",
        at: new Date(now()).toISOString(),
        payloadSha256: approvedPayload,
        code: scientistFailureCode(error),
      });
      throw new Error("Staged Scientist operation unavailable.");
    } finally {
      approvedPayload = null;
      active = false;
    }
  }
  async function run(step: Step, raw: unknown, signal: AbortSignal) {
    const request = requestSchemas[step].parse(raw);
    const payload = buildMetaPayload(step, request, study.model);
    const sha = digest(payload);
    invariant(
      await bounded(
        approveRequest(
          immutable(
            structuredClone({ step, request, payload, payloadSha256: sha }),
          ),
          signal,
        ),
        signal,
      ),
      "Exact request approval absent.",
    );
    await currentInitial();
    invariant(!signal.aborted, "Scientist operator stopped.");
    approvedPayload = sha;
    return service.run(step, request, signal);
  }
  await currentInitial();
  const resolveRegistered = async () => {
    invariant(
      phase === "registered" && !active && registrationId && hypothesisId,
      "Live enrollment required.",
    );
    live();
    return service.resolveRegistered(registrationId, hypothesisId);
  };
  if (wallClock && concreteProvider)
    liveResolvers.set(resolveRegistered, deadline);
  return Object.freeze({
    previewProposal: () => {
      const request = structuredClone(commitment.preselection);
      const payload = buildMetaPayload("propose", request, study.model);
      return immutable({
        step: "propose" as const,
        request,
        payload,
        payloadSha256: digest(payload),
      });
    },
    // Metadata-only defensive copy, including valid usage observed before a later flow failure.
    transportObservations: () => transport.observations(),
    status: () =>
      Object.freeze({
        phase,
        execution: "DISABLED" as const,
        estimatedTotalMs,
        executionMs,
        remainingMs: Math.max(0, deadline() - now()),
        scheduleEvidence: "UNVERIFIED_ESTIMATE" as const,
      }),
    propose: (signal: AbortSignal) =>
      operation("staged", signal, async (scoped) => {
        proposalStartedAt = now();
        invariant(
          estimatedTotalMs < deadline() - now(),
          "Initial originals expire before estimated completion.",
        );
        const result = await run("propose", commitment.preselection, scoped);
        invariant(
          !scoped.aborted && phase === "staged",
          "Proposal continuation stopped.",
        );
        invariant(
          result.schemaVersion === "foresight-proposals.v1",
          "Unexpected proposal.",
        );
        hypothesisInput = requestSchemas.hypothesize.parse({
          ...commitment.preselection,
          candidates: result.candidates,
          visibleScenarios: result.scenarios.map((s) =>
            VisibleScenarioV1Schema.parse(s),
          ),
        });
        phase = "proposed";
        return result;
      }),
    hypothesize: (signal: AbortSignal) =>
      operation("proposed", signal, async (scoped) => {
        const result = await run("hypothesize", hypothesisInput, scoped);
        invariant(
          !scoped.aborted && phase === "proposed",
          "Hypothesis continuation stopped.",
        );
        invariant(
          result.schemaVersion === "scientist-hypotheses.v1",
          "Unexpected hypothesis.",
        );
        invariant(
          digest(commitment.prediction) ===
            digest({
              metric: result.hypotheses[0]!.prediction.metric,
              direction: result.hypotheses[0]!.prediction.direction,
              comparison: result.hypotheses[0]!.prediction.comparison,
            }),
          "Issued prediction differs from initial commitment.",
        );
        hypotheses = result;
        hypothesisId = result.hypotheses[0]!.id;
        phase = "hypothesized";
        return result;
      }),
    challenge: (signal: AbortSignal) =>
      operation("hypothesized", signal, async (scoped) => {
        const { intents, graph, candidates, visibleScenarios } =
          hypothesisInput!;
        const result = await run(
          "challenge",
          {
            intents,
            graph,
            candidates,
            visibleScenarios,
            hypotheses: hypotheses!.hypotheses,
            consent: true,
          },
          scoped,
        );
        invariant(
          !scoped.aborted && phase === "hypothesized",
          "Challenge continuation stopped.",
        );
        phase = "challenged";
        return result;
      }),
    register: (signal: AbortSignal) =>
      operation("challenged", signal, async (scoped) => {
        bindingSignal = scoped;
        try {
          const result = await service.register(registrationId, hypothesisId!);
          live();
          invariant(
            !scoped.aborted && phase === "challenged",
            "Registration continuation stopped.",
          );
          phase = "registered";
          return result;
        } finally {
          bindingSignal = null;
        }
      }),
    resolveRegistered,
  });
}
