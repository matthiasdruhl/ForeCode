// Developer-local supervised team lifecycle. Live controls come only from the
// code-owned registration; injectable controls remain permanently synthetic.
import path from "node:path";
import { configuredTeamRuntimes } from "./team-config";
import {
  createInstalledTeamControls,
  type InstalledTeamControls,
} from "./team-sbx";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { isTrustedEvaluation } from "../../../src/server/artifacts/evaluation-store";
import { CandidateEnvelopeSchema } from "../artifacts/files";
import {
  validateGradeInput,
  validateGradeReport,
  teamCheckIds,
} from "../../evaluator/booking-v1/grade-profile";
import type { ProcessResult } from "../runner/process";
import { isPreparedStudy, sourceDiff, type PreparedStudy } from "./study";
import { immutable, requireHeldRecord } from "./custody";
import {
  pairedRuntimeSubject,
  sharedFutureTask,
  type Variant,
} from "./paired-inputs";
import type { PairedTransport } from "./paired";
import { teamEnforcementPlan, type TeamEnforcementPlan } from "./team-policy";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const processSchema = z.strictObject({
  exitCode: z.number().int().min(0).max(255).nullable(),
  signal: z.enum(["SIGINT", "SIGTERM", "SIGKILL"]).nullable(),
  reason: z.enum([
    "completed",
    "timed_out",
    "cancelled",
    "output_limit",
    "spawn_error",
  ]),
  stdout: z.string().max(8_000_000),
  stderr: z.string().max(8_000_000),
  elapsedMs: z.number().int().nonnegative(),
});
const identitySchema = z.strictObject({
  runId: z.string().uuid(),
  nonce: z.string().uuid(),
  requestSha256: hash,
  bootId: z.string().min(1).max(128),
  containerId: z.string().regex(/^[a-f0-9]{64}$/),
});
const finalizationSchema = identitySchema.extend({
  stage: z.literal("sealed"),
  candidate: CandidateEnvelopeSchema,
  candidateSha256: hash,
  terminationConfirmed: z.literal(true),
  restartAbsenceConfirmed: z.literal(true),
  exportWithoutGuestExecution: z.literal(true),
});
export const teamCompositionBlockers = [
  "TEAM_PRODUCTION_COMPOSITION_NOT_CONFIGURED",
  "TEAM_INSTALLATION_INVENTORY_AND_INERT_CONTROLS_REQUIRED",
] as const;

// No registration API, structural flag, serialized record, or synthetic factory
// can populate this set. Only the fixed registered production constructor below
// can add its own transport after loading source-pinned composition data.
const live = new WeakSet<object>();
const productionControls = new WeakMap<object, InstalledTeamControls>();
const teamFinalizations = new WeakSet<object>();
export function isTrustedSupervisedTeamFinalization(value: unknown) {
  return !!value && typeof value === "object" && teamFinalizations.has(value);
}
export function assertSupervisedControllerInputs(
  transport: object,
  input: {
    study: PreparedStudy;
    protectedRoot: string;
    coordinationRoot: string;
    sources: Record<Variant, string>;
  },
) {
  const installed = productionControls.get(transport);
  invariant(
    installed &&
      installed.config.protectedRoot === path.resolve(input.protectedRoot) &&
      installed.config.coordinationRoot ===
        path.resolve(input.coordinationRoot) &&
      jsonDigest(installed.config.sources) === jsonDigest(input.sources) &&
      jsonDigest(installed.lifecycleInput.study) === jsonDigest(input.study),
    "Controller roots or study differ from the code-owned composition.",
  );
}
export async function recordSupervisedTeamOutcome(
  transport: object,
  outcome: {
    studyId: string;
    attempts: import("./paired").PairedAttempt[];
    cleanupConfirmed: boolean;
    leaseReleased: boolean;
  },
) {
  const installed = productionControls.get(transport);
  invariant(
    installed && live.has(transport),
    "Concrete production composition required.",
  );
  return installed.recordOriginals(outcome);
}
export function isAdmittedSupervisedTeamTransport(value: object) {
  return live.has(value);
}

export function supervisedTeamRuntimeSubject(input: {
  study: PreparedStudy;
  variant: Variant;
  implementationSha256: string;
  inventorySha256: string;
  pairedAuthorizationSha256: string;
  compositionSha256?: string;
  provider: { inputMicroUsdPerToken: number; outputMicroUsdPerToken: number };
}) {
  return jsonDigest({
    purpose: "supervised-team-installed-enforcement-v1",
    pairedSubjectSha256: pairedRuntimeSubject(
      input.study,
      input.implementationSha256,
      input.variant,
    ),
    pairedAuthorizationSha256: hash.parse(input.pairedAuthorizationSha256),
    inventorySha256: hash.parse(input.inventorySha256),
    enforcementSha256: jsonDigest(teamEnforcementPlan(input.study.definition)),
    provider: providerSchema.parse(input.provider),
    ...(input.compositionSha256
      ? { compositionSha256: hash.parse(input.compositionSha256) }
      : {}),
  });
}
const providerSchema = z.strictObject({
  inputMicroUsdPerToken: z.number().int().min(1).max(1000),
  outputMicroUsdPerToken: z.number().int().min(1).max(10000),
});
// These are required observations, not caller assertions that create authority.
export const TeamInventorySchema = z.strictObject({
  schemaVersion: z.literal("supervised-team-inventory.local.v1"),
  implementationSha256: hash,
  enforcementSha256: hash,
  agentInstance: z.string().min(1),
  graderInstance: z.string().min(1),
  graderWorkerImage: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  runtime: z.strictObject({
    agentImage: z.string(),
    graderImage: z.string(),
    workerImage: z.string(),
    agentBinarySha256: hash,
    nodeSha256: hash,
    supervisorSha256: hash,
    brokerSha256: hash,
    graderExecutableSha256: hash,
  }),
  agentConfigSha256: hash,
  workerSha256: hash,
  sandboxCliSha256: hash,
  protectedInstallationSha256: hash,
  isolationObservationSha256: hash,
  enforcementObservationSha256: hash.optional(),
  provider: providerSchema,
  vm: z.strictObject({
    cpus: z.literal(2),
    memoryMiB: z.literal(4096),
    pids: z.literal(512),
    diskBytes: z.number().int().positive(),
  }),
  hostIntegrations: z.literal("disabled"),
  workerNetwork: z.literal("none"),
  workerCredentials: z.literal("absent"),
  restart: z.literal("no"),
});
type Ownership = { assertOwned(): Promise<void> };
type Request = Readonly<{
  runId: string;
  nonce: string;
  studyId: string;
  variant: Variant;
  sourceCommit: string;
  sourceTreeSha256: string;
  sharedTaskSha256: string;
  enforcement: TeamEnforcementPlan;
  candidate: z.infer<typeof CandidateEnvelopeSchema>;
}>;
// Fixed operations only. There is no executable/path/command/endpoint selector.
export type NoInferenceTeamControls = {
  retainFailure?: PairedTransport["retainFailure"];
  inspect(signal: AbortSignal): Promise<unknown>;
  loadBaseline(
    variant: Variant,
    tree: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  prepare(request: Request, signal: AbortSignal): Promise<unknown>;
  agent(runId: string, nonce: string, signal: AbortSignal): Promise<unknown>;
  finalize(runId: string, nonce: string, signal: AbortSignal): Promise<unknown>;
  grade(
    input: Parameters<PairedTransport["grade"]>[0],
    signal: AbortSignal,
  ): Promise<ProcessResult>;
  cleanup(
    runId: string,
    nonce: string | null,
    signal: AbortSignal,
  ): Promise<unknown>;
};

// Production entry deliberately has no injectable controls. Even independently
// signed study/runtime JSON is insufficient without an installed composition.
export async function createSupervisedTeamTransport(
  study: PreparedStudy,
): Promise<PairedTransport> {
  invariant(isPreparedStudy(study), "Authenticated prepared study required.");
  teamEnforcementPlan(study.definition);
  if (configuredTeamRuntimes.has(study.definition.protocol.studyId)) {
    const installed = await createInstalledTeamControls(study);
    const lifecycle = createTeamLifecycle(
      installed.lifecycleInput,
      installed.compositionSha256,
    );
    const transport: PairedTransport = Object.freeze({
      ...lifecycle,
      kind: "supervised-team" as const,
      preflight: installed.preflight,
      async finalizeAgent(runId, signal) {
        const result = await lifecycle.finalizeAgent(runId, signal);
        invariant(
          installed.actualState(runId),
          "Concrete terminated worker observation required.",
        );
        teamFinalizations.add(result);
        return result;
      },
      async cleanup(runId) {
        if (runId === "baseline-A" || runId === "baseline-B")
          await installed.cleanupBaseline(runId === "baseline-A" ? "A" : "B");
        else await lifecycle.cleanup(runId);
      },
    });
    productionControls.set(transport, installed);
    live.add(transport);
    return transport;
  }
  const refuse = async (): Promise<never> => {
    throw new Error(teamCompositionBlockers.join(";"));
  };
  return Object.freeze({
    kind: "supervised-team",
    baseline: refuse,
    admit: refuse,
    prepare: refuse,
    agent: refuse,
    finalizeAgent: refuse,
    grade: refuse,
    cleanup: refuse,
  });
}

// Executable contract for no-inference controls only. This factory cannot create
// a production transport, trusted finalization or measured observation.
type TeamLifecycleInput = {
  compositionSha256?: string;
  study: PreparedStudy;
  implementationSha256: string;
  inventorySha256: string;
  controls: NoInferenceTeamControls;
  now?: () => string;
  reloadStudy(): Promise<PreparedStudy>;
  implementationIdentity(): Promise<string>;
  reloadRuntimeAuthorization(variant: Variant): Promise<unknown>;
  reloadTeamAuthorization(variant: Variant): Promise<unknown>;
};
export function createNoInferenceTeamTransport(
  input: TeamLifecycleInput,
): PairedTransport {
  return createTeamLifecycle(input, input.compositionSha256);
}
function createTeamLifecycle(
  input: TeamLifecycleInput,
  compositionSha256?: string,
): PairedTransport {
  invariant(
    isPreparedStudy(input.study),
    "Authenticated prepared study required.",
  );
  const study = input.study,
    plan = teamEnforcementPlan(study.definition),
    controls = Object.freeze({ ...input.controls });
  const implementation = hash.parse(input.implementationSha256),
    inventoryPin = hash.parse(input.inventorySha256);
  const baselines = new Set<Variant>(),
    attempted = new Set<Variant>();
  type Session = {
    variant: Variant;
    runId: string;
    nonce: string;
    ownership: Ownership;
    requestSha256?: string;
    phase:
      | "admitted"
      | "preparing"
      | "prepared"
      | "started"
      | "terminated"
      | "sealing"
      | "sealed"
      | "grading"
      | "cleaned";
    bootId?: string;
    containerId?: string;
    candidateSha256?: string;
    originalManifest?: { path: string; sha256: string }[];
  };
  let session: Session | undefined,
    unsafe = false;
  const now = input.now ?? (() => new Date().toISOString());
  const arm = (v: Variant) =>
    study.draft.plan.manifest.arms.find((x) => x.variant === v)!;
  async function fresh(signal: AbortSignal, variant?: Variant) {
    invariant(
      !unsafe && !signal.aborted,
      "Team lifecycle interrupted or cleanup uncertain.",
    );
    const reloaded = await input.reloadStudy();
    invariant(
      jsonDigest(reloaded) === jsonDigest(study) &&
        isPreparedStudy(reloaded) &&
        (await input.implementationIdentity()) === implementation,
      "Study or implementation changed.",
    );
    if (session) await session.ownership.assertOwned();
    const inventory = TeamInventorySchema.parse(await controls.inspect(signal));
    invariant(
      jsonDigest(inventory) === inventoryPin &&
        inventory.implementationSha256 === implementation &&
        inventory.enforcementSha256 === jsonDigest(plan) &&
        jsonDigest(inventory.runtime) === jsonDigest(plan.runtime) &&
        inventory.agentConfigSha256 === plan.agentConfigSha256 &&
        jsonDigest(inventory.vm) === jsonDigest(plan.vm) &&
        inventory.agentInstance !== inventory.graderInstance,
      "Installed enforcement inventory changed.",
    );
    invariant(
      plan.spendMicroUsd >=
        plan.minimumInputReservation *
          inventory.provider.inputMicroUsdPerToken +
          16 * inventory.provider.outputMicroUsdPerToken,
      "Spend ceiling cannot cover even the fixed input at the admitted tariff.",
    );
    if (variant) {
      const paired = requireHeldRecord(
        await input.reloadRuntimeAuthorization(variant),
        {
          studyId: study.definition.protocol.studyId,
          kind: "runtime",
          subjectSha256: pairedRuntimeSubject(study, implementation, variant),
          predecessorSha256: study.prepared.sha256,
          at: now(),
        },
      );
      requireHeldRecord(await input.reloadTeamAuthorization(variant), {
        studyId: study.definition.protocol.studyId,
        kind: "runtime",
        subjectSha256: supervisedTeamRuntimeSubject({
          study,
          variant,
          implementationSha256: implementation,
          inventorySha256: inventoryPin,
          pairedAuthorizationSha256: paired.sha256,
          provider: inventory.provider,
          ...(compositionSha256 ? { compositionSha256 } : {}),
        }),
        predecessorSha256: paired.sha256,
        at: now(),
      });
    }
    invariant(!signal.aborted, "Team lifecycle interrupted.");
  }
  function current(runId: string, phase: Session["phase"]) {
    invariant(
      session?.runId === runId && session.phase === phase && !unsafe,
      "Wrong run, replay or lifecycle stage.",
    );
    return session;
  }
  return Object.freeze({
    kind: "synthetic-development" as const,
    async baseline(variant, tree, signal) {
      await fresh(signal);
      invariant(
        !attempted.size &&
          !baselines.has(variant) &&
          tree === arm(variant).initialTreeSha256,
        "Baseline source or order changed.",
      );
      const result = await controls.loadBaseline(variant, tree, signal);
      invariant(
        isTrustedEvaluation(result),
        "Original protected baseline required.",
      );
      const r = result.receipt,
        oracle = study.draft.plan.baselineOracle;
      invariant(
        result.verification.verdict === "VERIFIED" &&
          r.evaluatedTreeSha256 === tree &&
          r.fixtureSha256 === plan.profile.fixtureSha256 &&
          r.evaluatorSha256 === oracle.evaluatorSha256 &&
          r.testSuiteSha256 === oracle.testSuiteSha256 &&
          r.requiredPolicySha256 === oracle.requiredPolicySha256 &&
          sameIds(r.requiredCheckIds, oracle.requiredCheckIds),
        "Baseline rejected or substituted.",
      );
      baselines.add(variant);
      return result;
    },
    async admit(variant, subject, ownership, signal) {
      invariant(
        !session && baselines.size === 2 && !attempted.has(variant),
        "Both baselines and unused arm required.",
      );
      const order =
        study.draft.plan.trialPolicy.order === "A_then_B"
          ? ["A", "B"]
          : ["B", "A"];
      invariant(
        order[attempted.size] === variant &&
          subject === pairedRuntimeSubject(study, implementation, variant),
        "Wrong arm, order or runtime subject.",
      );
      await ownership.assertOwned();
      // BOTH installed/runtime/spending originals before either downstream run.
      for (const v of ["A", "B"] as const) await fresh(signal, v);
      attempted.add(variant);
      session = {
        variant,
        runId: arm(variant).runId!,
        nonce: randomUUID(),
        ownership,
        phase: "admitted",
      };
    },
    async prepare(runId, source, shared, signal) {
      const s = current(runId, "admitted");
      await fresh(signal, s.variant);
      invariant(
        jsonDigest(shared) === jsonDigest(sharedFutureTask(study)),
        "Complete common input changed.",
      );
      const candidate = CandidateEnvelopeSchema.parse(source);
      const manifest = candidate.files
        .map((f) => ({
          path: f.path,
          sha256: sha256(Buffer.from(f.base64, "base64")),
        }))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
      invariant(
        candidate.runId === runId &&
          jsonDigest(manifest) === arm(s.variant).initialTreeSha256,
        "Starting source changed.",
      );
      validateGradeInput({
        runId,
        evaluatedTreeSha256: arm(s.variant).initialTreeSha256,
        evaluatorSha256: plan.profile.baselineEvaluatorSha256,
        testSuiteSha256: study.draft.plan.baselineOracle.testSuiteSha256,
        requiredPolicySha256:
          study.draft.plan.baselineOracle.requiredPolicySha256,
        candidate,
        workerImage: plan.runtime.workerImage,
      });
      s.originalManifest = manifest;
      const request = immutable({
        runId,
        nonce: s.nonce,
        studyId: study.definition.protocol.studyId,
        variant: s.variant,
        sourceCommit: arm(s.variant).initialCommit,
        sourceTreeSha256: arm(s.variant).initialTreeSha256,
        sharedTaskSha256: jsonDigest(shared),
        enforcement: plan,
        candidate,
      });
      s.requestSha256 = jsonDigest(request);
      s.phase = "preparing"; // Partial control failure remains cleanup-owned; no retry.
      const result = z
        .strictObject({
          runId: z.string().uuid(),
          nonce: z.string().uuid(),
          stage: z.literal("prepared"),
          requestSha256: hash,
        })
        .parse(await controls.prepare(request, signal));
      invariant(
        result.runId === runId &&
          result.nonce === s.nonce &&
          result.requestSha256 === s.requestSha256,
        "Unconfirmed source transfer.",
      );
      s.phase = "prepared";
    },
    async agent(runId, signal) {
      const s = current(runId, "prepared");
      await fresh(signal, s.variant);
      s.phase = "started";
      const result = identitySchema
        .extend({
          process: processSchema,
          terminationConfirmed: z.literal(true),
          restartAbsenceConfirmed: z.literal(true),
        })
        .parse(await controls.agent(runId, s.nonce, signal));
      invariant(
        result.runId === runId &&
          result.nonce === s.nonce &&
          result.requestSha256 === s.requestSha256 &&
          Buffer.byteLength(result.process.stdout, "utf8") +
            Buffer.byteLength(result.process.stderr, "utf8") <=
            plan.resources.outputBytes &&
          (result.process.reason !== "completed" ||
            result.process.elapsedMs <= plan.maxSeconds * 1000) &&
          !signal.aborted,
        "Untrusted or interrupted agent termination.",
      );
      s.bootId = result.bootId;
      s.containerId = result.containerId;
      if (result.process.reason === "completed") s.phase = "terminated";
      return result.process;
    },
    async finalizeAgent(runId, signal) {
      const s = current(runId, "terminated");
      await fresh(signal, s.variant);
      s.phase = "sealing";
      const result = finalizationSchema.parse(
        await controls.finalize(runId, s.nonce, signal),
      );
      invariant(
        result.runId === runId &&
          result.nonce === s.nonce &&
          result.bootId === s.bootId &&
          result.containerId === s.containerId &&
          result.requestSha256 === s.requestSha256 &&
          result.candidate.runId === runId &&
          result.candidateSha256 === jsonDigest(result.candidate),
        "Finalization identity changed.",
      );
      const finalManifest = result.candidate.files
        .map((f) => ({
          path: f.path,
          sha256: sha256(Buffer.from(f.base64, "base64")),
        }))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
      sourceDiff(s.originalManifest!, finalManifest);
      s.phase = "sealed";
      s.candidateSha256 = result.candidateSha256;
      return immutable({
        runId,
        candidate: result.candidate,
        candidateSha256: result.candidateSha256,
        terminationConfirmed: true,
        restartAbsenceConfirmed: true,
        exportWithoutGuestExecution: true,
      });
    },
    async grade(raw, signal) {
      const s = current(raw.runId, "sealed");
      await fresh(signal, s.variant);
      const value = validateGradeInput(raw);
      invariant(
        jsonDigest(value.evaluationProfile) === jsonDigest(plan.profile) &&
          value.workerImage === plan.runtime.workerImage &&
          jsonDigest(value.candidate) === s.candidateSha256,
        "Fixed team profile or sealed source substituted.",
      );
      s.phase = "grading";
      const result = processSchema.parse(await controls.grade(value, signal));
      invariant(
        result.reason === "completed" &&
          result.exitCode === 0 &&
          !signal.aborted,
        "Protected grader incomplete.",
      );
      const report = validateGradeReport(
        JSON.parse(result.stdout),
        {
          runId: value.runId,
          evaluatedTreeSha256: value.evaluatedTreeSha256,
          evaluatorSha256: value.evaluatorSha256,
          testSuiteSha256: value.testSuiteSha256,
          requiredPolicySha256: value.requiredPolicySha256,
        },
        plan.profile,
      );
      invariant(
        sameIds(
          report.checks.map((x) => x.id),
          teamCheckIds,
        ),
        "All eight check observations required.",
      );
      return result; // Diagnostic process output; never a TrustedEvaluation.
    },
    retainFailure: controls.retainFailure,
    async cleanup(runId) {
      const s = session;
      invariant(!s || s.runId === runId, "Refuse cleanup of another run.");
      if (!s) {
        invariant(
          runId === "baseline-A" || runId === "baseline-B",
          "Unknown cleanup run.",
        );
        return;
      }
      try {
        await s.ownership.assertOwned();
        const result = z
          .strictObject({
            runId: z.string().uuid(),
            nonce: z.string().uuid(),
            absent: z.literal(true),
            restartAbsenceConfirmed: z.literal(true),
          })
          .parse(
            await controls.cleanup(runId, s.nonce, AbortSignal.timeout(90_000)),
          );
        invariant(
          result.runId === runId && result.nonce === s.nonce,
          "Owned cleanup unconfirmed.",
        );
        s.phase = "cleaned";
        session = undefined;
      } catch (error) {
        unsafe = true;
        throw error;
      }
    },
  } satisfies PairedTransport);
}
