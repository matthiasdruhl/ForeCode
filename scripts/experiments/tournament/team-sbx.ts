// Concrete fixed host dispatch. Production has no injected executables/adapters.
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import {
  validateGradeInput,
  validateGradeReport,
  baselineCheckIds,
  teamCheckIds,
  type GradeInput,
} from "../../evaluator/booking-v1/grade-profile";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
  type TrustedEvaluation,
  type EvaluationAllowlistEntry,
} from "../../../src/server/artifacts/evaluation-store";
import {
  captureReviewedTree,
  privateDirectory,
  disjoint,
  protectedRead,
} from "../artifacts/files";
import { publishEvaluation } from "../artifacts/publish";
import { boundedProcess } from "../runner/process";
import { ensureOfflineVmResources } from "../isolation/vm-resources";
import { validateRestartObservation } from "../runner/lifecycle-protocol";
import {
  createStudyCustodyStore,
  requireHeldRecord,
  immutable,
} from "./custody";
import { loadOperatorStudy } from "./operator";
import { isPreparedStudy, type PreparedStudy } from "./study";
import {
  pairedRuntimeSubject,
  sharedFutureTask,
  type Variant,
} from "./paired-inputs";
import {
  TeamRuntimeConfigSchema,
  loadRegisteredTeamRuntime,
  assertTeamRegistrationCurrent,
  teamCompositionDigest,
  type TeamRuntimeRegistration,
} from "./team-config";
import {
  TeamInventorySchema,
  supervisedTeamRuntimeSubject,
  type NoInferenceTeamControls,
} from "./supervised-team";
import { teamEnforcementPlan } from "./team-policy";
import { collectTeamInventory, teamInventoryProgram } from "./team-inventory";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const processSchema = z.strictObject({
  exitCode: z.number().int().nullable(),
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
const stateSchema = z.object({
  runId: uuid,
  nonce: uuid,
  requestSha256: hash,
  bootId: z.string().min(1),
  containerId: hash.nullable(),
  stage: z.enum([
    "prepared",
    "starting",
    "running",
    "terminated",
    "failed",
    "sealed",
    "cleaned",
  ]),
  agent: processSchema.optional(),
  terminationConfirmed: z.boolean().optional(),
  restartAbsenceConfirmed: z.boolean().optional(),
});
type Ownership = { assertOwned(): Promise<void> };
type Request = Parameters<NoInferenceTeamControls["prepare"]>[0];
type RunState = {
  request: Request;
  digest: string;
  bootId: string;
  containerId?: string;
  observed: boolean;
  startRequested?: boolean;
  cancelled?: boolean;
  cleaned: boolean;
  scratchRemoved: boolean;
  finalized?: unknown;
  pending?: {
    input: GradeInput;
    report: ReturnType<typeof validateGradeReport>;
    startedAt: string;
    finishedAt: string;
  };
  evaluation?: TrustedEvaluation;
  entry?: EvaluationAllowlistEntry;
  publicationFailed?: boolean;
};
type Dependencies = {
  run: typeof boundedProcess;
  cliBytes(): Promise<Buffer>;
  implementationIdentity(): Promise<string>;
  reloadStudy(): Promise<PreparedStudy>;
};
function buildControls(
  registration: TeamRuntimeRegistration,
  study: PreparedStudy,
  mode: "production" | "synthetic",
  deps: Dependencies,
) {
  invariant(isPreparedStudy(study), "Authenticated prepared study required.");
  const config = immutable(TeamRuntimeConfigSchema.parse(registration.runtime));
  const expected = immutable(
      TeamInventorySchema.parse(config.expectedInventory),
    ),
    plan = teamEnforcementPlan(study.definition);
  const studyConfig = {
    ...registration.study,
    custody: {
      ...registration.study.custody,
      entries: new Map(registration.study.custody.entries),
      workspaceRoots: [...registration.study.custody.workspaceRoots],
    },
  };
  const compositionSha256 = teamCompositionDigest(config);
  const implementation = expected.implementationSha256;
  invariant(
    expected.enforcementSha256 === jsonDigest(plan) &&
      (mode === "synthetic" ||
        (expected.enforcementObservationSha256 &&
          expected.graderWorkerImage === config.graderWorkerImage &&
          plan.profile.baselineEvaluatorSha256 === implementation)),
    "Complete production enforcement observations required.",
  );
  const ids = [
    ...Object.values(config.baselineRunIds),
    ...study.draft.plan.manifest.arms.map((a) => a.runId!),
  ];
  invariant(new Set(ids).size === 4, "Baseline/downstream UUID reuse.");
  const originals = Object.values(config.runtimeOriginalIds).flatMap((v) => [
    v.paired,
    v.installed,
  ]);
  invariant(new Set(originals).size === 4, "Runtime original reuse.");
  let ownership: Ownership | undefined,
    touched = false,
    foreign = false,
    recovering = false,
    failedCleanup = false;
  let installed: Awaited<ReturnType<typeof collectTeamInventory>> | undefined;
  let activeBaseline:
    | {
        variant: Variant;
        runId: string;
        gradeTouched: boolean;
        cleaned: boolean;
      }
    | undefined;
  const states = new Map<string, RunState>();
  const baselines = new Map<Variant, TrustedEvaluation>();
  const baselineAttempts = new Set<Variant>();
  const observations: {
    operation: string;
    commandSha256: string;
    reason: string;
    exitCode: number | null;
    stdoutSha256: string;
    stderrSha256: string;
  }[] = [];
  const now = () => new Date().toISOString();
  async function reloadRuntimeAuthorization(v: Variant) {
    return (await createStudyCustodyStore(studyConfig.custody)).load(
      config.runtimeOriginalIds[v].paired,
    );
  }
  async function reloadTeamAuthorization(v: Variant) {
    return (await createStudyCustodyStore(studyConfig.custody)).load(
      config.runtimeOriginalIds[v].installed,
    );
  }
  async function current() {
    invariant(
      (await deps.implementationIdentity()) === implementation,
      "Trusted implementation changed.",
    );
    const fresh = await deps.reloadStudy();
    invariant(
      isPreparedStudy(fresh) && jsonDigest(fresh) === jsonDigest(study),
      "Prepared study/revocation changed.",
    );
    for (const v of ["A", "B"] as const)
      invariant(
        (await snapshotTree(config.sources[v])).treeSha256 ===
          study.draft.plan.manifest.arms.find((a) => a.variant === v)!
            .initialTreeSha256,
        "Committed source changed.",
      );
  }
  async function authorize(signal: AbortSignal) {
    invariant(
      ownership && config.enabled && !signal.aborted && !failedCleanup,
      "Owned enabled composition required.",
    );
    await ownership.assertOwned();
    await current();
    invariant(
      sha256(await protectedRead(config.isolationFile)) ===
        expected.isolationObservationSha256,
      "Isolation observation changed.",
    );
    for (const v of ["A", "B"] as const) {
      const paired = requireHeldRecord(await reloadRuntimeAuthorization(v), {
        studyId: study.definition.protocol.studyId,
        kind: "runtime",
        subjectSha256: pairedRuntimeSubject(study, implementation, v),
        predecessorSha256: study.prepared.sha256,
        at: now(),
      });
      requireHeldRecord(await reloadTeamAuthorization(v), {
        studyId: study.definition.protocol.studyId,
        kind: "runtime",
        subjectSha256: supervisedTeamRuntimeSubject({
          study,
          variant: v,
          implementationSha256: implementation,
          inventorySha256: jsonDigest(expected),
          pairedAuthorizationSha256: paired.sha256,
          provider: expected.provider,
          compositionSha256,
        }),
        predecessorSha256: paired.sha256,
        at: now(),
      });
    }
  }
  async function raw(
    args: string[],
    signal: AbortSignal,
    input?: string,
    maxBytes = 8_000_000,
    milliseconds = 30000,
  ) {
    invariant(
      !signal.aborted &&
        sha256(await deps.cliBytes()) === expected.sandboxCliSha256,
      "CLI changed or operation cancelled.",
    );
    const result = await deps.run(config.sbx, args, {
      signal,
      input,
      maxBytes,
      milliseconds,
    });
    observations.push({
      operation: args[0]!,
      commandSha256: jsonDigest(args),
      reason: result.reason,
      exitCode: result.exitCode,
      stdoutSha256: sha256(result.stdout),
      stderrSha256: sha256(result.stderr),
    });
    invariant(
      result.reason === "completed" && result.exitCode === 0 && !signal.aborted,
      "Fixed sandbox command failed.",
    );
    return result.stdout;
  }
  async function instances(signal: AbortSignal) {
    const rows = JSON.parse(await raw(["ls", "--format", "json"], signal)) as {
      name: string;
      id: string;
    }[];
    invariant(
      rows.find((r) => r.name === config.agentSandbox)?.id ===
        expected.agentInstance &&
        rows.find((r) => r.name === config.graderSandbox)?.id ===
          expected.graderInstance,
      "Runtime instance replaced; refuse dispatch/cleanup.",
    );
  }
  async function exec(
    args: string[],
    signal: AbortSignal,
    input?: string,
    maxBytes?: number,
    milliseconds?: number,
  ) {
    if (recovering) {
      invariant(ownership, "Cleanup owner missing.");
      await ownership.assertOwned();
    } else await authorize(signal);
    if (args[0] === "exec" || args[0] === "stop") {
      await instances(signal);
      if (args[0] === "exec") touched = true;
    }
    return raw(args, signal, input, maxBytes, milliseconds);
  }
  async function inspect(signal: AbortSignal) {
    const result = await collectTeamInventory({
      config,
      study,
      plan,
      implementationSha256: implementation,
      exec,
      signal,
      initiallyStopped: !touched,
      onForeignState: () => {
        foreign = true;
      },
    });
    invariant(
      jsonDigest(result.inventory) === jsonDigest(expected),
      "Installed full inventory differs from independently admitted bytes.",
    );
    installed = result;
    return result.inventory;
  }
  async function verifyFiles(role: "agent" | "grader", signal: AbortSignal) {
    invariant(installed, "No verified installed control snapshot.");
    const name = role === "agent" ? config.agentSandbox : config.graderSandbox;
    const args = [
      "exec",
      "-u",
      "root",
      name,
      "python3",
      "-I",
      "-c",
      await teamInventoryProgram(),
      role,
      ...(role === "grader" ? [config.graderNodeSha256] : []),
    ];
    const value = JSON.parse(await exec(args, signal));
    const { scratchAbsent, installedPolicy, ...files } = value;
    void scratchAbsent;
    if (role === "agent")
      invariant(
        jsonDigest(installedPolicy) === jsonDigest(installed.policy),
        "Installed policy body changed.",
      );
    invariant(
      jsonDigest(files) ===
        jsonDigest(
          role === "agent" ? installed.agentFiles : installed.graderFiles,
        ),
      "Installed control custody changed; recovery refused.",
    );
    return value;
  }
  async function helper(
    operation: "prepare" | "start" | "status" | "finalize" | "cleanup",
    s: RunState,
    signal: AbortSignal,
  ) {
    await verifyFiles("agent", signal);
    const body =
      operation === "prepare"
        ? { operation, request: s.request }
        : { operation, runId: s.request.runId, nonce: s.request.nonce };
    const input = JSON.stringify(body);
    invariant(
      Buffer.byteLength(input) <= 12_000_000,
      "Team control input bound.",
    );
    return JSON.parse(
      await exec(
        [
          "exec",
          "-i",
          "-u",
          "root",
          config.agentSandbox,
          "python3",
          "-I",
          "/opt/forecode-agent/team-supervisor.py",
        ],
        signal,
        input,
        16_000_000,
      ),
    );
  }
  function state(runId: string, nonce: string) {
    const s = states.get(runId);
    invariant(s && s.request.nonce === nonce, "Unknown/foreign owned run.");
    return s;
  }
  function status(rawValue: unknown, s: RunState) {
    const value = stateSchema.parse(rawValue);
    invariant(
      value.runId === s.request.runId &&
        value.nonce === s.request.nonce &&
        value.requestSha256 === s.digest &&
        (!s.bootId || value.bootId === s.bootId),
      "Supervisor run/boot/request changed.",
    );
    if (value.containerId) {
      invariant(
        !s.containerId || s.containerId === value.containerId,
        "Worker instance changed.",
      );
      s.containerId = value.containerId;
    }
    return value;
  }
  async function gradeFixed(input: GradeInput, signal: AbortSignal) {
    await inspect(signal);
    // The study's runtime.workerImage is the coding worker. Protected checks
    // use the separately inventoried grader image bound by both installed
    // admissions through the composition/inventory digests, for both arms.
    const graderInput = validateGradeInput({
      ...input,
      workerImage: config.graderWorkerImage,
    });
    const result = await exec(
      [
        "exec",
        "-i",
        "-u",
        "root",
        config.graderSandbox,
        "/opt/forecode-booking/bin/node",
        "--conditions=react-server",
        "--import",
        "/opt/forecode-booking/node_modules/tsx/dist/loader.mjs",
        "/opt/forecode-booking/controller/guest.ts",
      ],
      signal,
      JSON.stringify(graderInput),
      1_048_576,
      590_000,
    );
    const {
      runId,
      evaluatedTreeSha256,
      evaluatorSha256,
      testSuiteSha256,
      requiredPolicySha256,
    } = input;
    const report = validateGradeReport(
      JSON.parse(result),
      {
        runId,
        evaluatedTreeSha256,
        evaluatorSha256,
        testSuiteSha256,
        requiredPolicySha256,
      },
      input.evaluationProfile,
    );
    invariant(
      sameIds(
        report.checks.map((c) => c.id),
        input.evaluationProfile ? teamCheckIds : baselineCheckIds,
      ),
      "Required protected observations absent.",
    );
    return { result, report };
  }
  async function cleanupRuntime(
    runId: string | null,
    s: RunState | undefined,
    signal: AbortSignal,
  ) {
    invariant(
      !foreign && ownership,
      "Foreign state or missing owner; manual recovery required.",
    );
    recovering = true;
    if (s) s.cancelled = true;
    try {
      await ownership.assertOwned();
      await instances(signal);
      if (s) {
        const ack = await helper("cleanup", s, signal);
        invariant(
          ack.runId === runId &&
            ack.nonce === s.request.nonce &&
            ack.absent === true &&
            ack.restartAbsenceConfirmed === true &&
            ack.scratchRemoved === true,
          "Worker/scratch cleanup unconfirmed.",
        );
      }
      if (runId) {
        await verifyFiles("grader", signal);
        const args = [
          "exec",
          "-u",
          "root",
          config.graderSandbox,
          "/opt/forecode-booking/bin/node",
          "/opt/forecode-booking/controller/lifecycle.mjs",
          "cleanup",
          runId,
        ];
        await exec(args, signal);
        await exec(["stop", config.graderSandbox], signal);
        // Reapply finite VM controls after restart before executing recovery.
        await ensureOfflineVmResources(
          {
            graderSandbox: config.graderSandbox,
            vmPids: plan.vm.pids,
            vmDiskBytes: plan.vm.diskBytes,
          },
          (a, abort) => exec(a, abort ?? signal),
          signal,
        );
        await verifyFiles("grader", signal);
        validateRestartObservation(JSON.parse(await exec(args, signal)), runId);
      }
      if (s) {
        await exec(["stop", config.agentSandbox], signal);
        await ensureOfflineVmResources(
          {
            graderSandbox: config.agentSandbox,
            vmPids: plan.vm.pids,
            vmDiskBytes: plan.vm.diskBytes,
          },
          (a, abort) => exec(a, abort ?? signal),
          signal,
        );
        const ack = await helper("cleanup", s, signal);
        invariant(
          ack.absent === true &&
            ack.scratchRemoved === true &&
            ack.runId === runId &&
            ack.nonce === s.request.nonce,
          "Restart absence unconfirmed.",
        );
      }
      if (installed) await inspect(signal); // Includes orphan scratch/foreign worker denial.
      await exec(["stop", config.agentSandbox, config.graderSandbox], signal);
      for (const name of [config.agentSandbox, config.graderSandbox])
        invariant(
          JSON.parse(await exec(["inspect", name, "--json"], signal)).state ===
            "stopped",
          "VM stop unconfirmed.",
        );
      if (s) {
        s.cleaned = true;
        s.scratchRemoved = true;
      }
    } catch (error) {
      failedCleanup = true;
      throw error;
    } finally {
      recovering = false;
    }
  }
  async function publish(
    input: GradeInput,
    report: ReturnType<typeof validateGradeReport>,
    startedAt: string,
    finishedAt: string,
  ) {
    await authorize(AbortSignal.timeout(30000));
    const directory = path.join(config.evaluationRoot, input.runId);
    await mkdir(directory, { mode: 0o700 });
    const identity = {
      runId: input.runId,
      evaluatedTreeSha256: input.evaluatedTreeSha256,
      fixtureSha256: plan.profile.fixtureSha256,
      evaluatorSha256: input.evaluatorSha256,
      testSuiteSha256: input.testSuiteSha256,
      requiredPolicySha256: input.requiredPolicySha256,
      requiredCheckIds: [
        ...(input.evaluationProfile ? teamCheckIds : baselineCheckIds),
      ],
    };
    const entry = await publishEvaluation(
      directory,
      identity,
      report,
      startedAt,
      finishedAt,
      {
        implementationSha256: implementation,
        inventorySha256: jsonDigest(expected),
        compositionSha256,
        evidenceOrigin:
          mode === "production"
            ? "protected_runtime_observation"
            : "synthetic_control",
      },
      input.evaluationProfile,
    );
    const store = await createProtectedEvaluationStore({
      root: config.evaluationRoot,
      agentWorkspaceRoot: config.sources.A,
      entries: new Map([[input.runId, entry]]),
    });
    const loaded = await store.load(input.runId);
    invariant(isTrustedEvaluation(loaded), "Protected original reload failed.");
    await current();
    return { entry, loaded };
  }
  async function reloadEvaluation(runId: string) {
    const s = states.get(runId);
    if (!s?.entry) return null;
    const store = await createProtectedEvaluationStore({
      root: config.evaluationRoot,
      agentWorkspaceRoot: config.sources.A,
      entries: new Map([[runId, s.entry]]),
    });
    return store.load(runId);
  }
  const controls: NoInferenceTeamControls = {
    inspect,
    async loadBaseline(variant, tree, signal) {
      const runId = config.baselineRunIds[variant];
      invariant(
        !activeBaseline && !baselineAttempts.has(variant),
        "Baseline attempt reuse.",
      );
      baselineAttempts.add(variant);
      activeBaseline = { variant, runId, gradeTouched: false, cleaned: false };
      const baseline = await captureReviewedTree(
        config.sources[variant],
        runId,
      );
      const oracle = study.draft.plan.baselineOracle;
      const input = validateGradeInput({
        runId,
        evaluatedTreeSha256: tree,
        evaluatorSha256: oracle.evaluatorSha256,
        testSuiteSha256: oracle.testSuiteSha256,
        requiredPolicySha256: oracle.requiredPolicySha256,
        candidate: baseline,
        workerImage: plan.runtime.workerImage,
      });
      const startedAt = now();
      activeBaseline.gradeTouched = true;
      const { report } = await gradeFixed(input, signal),
        finishedAt = now();
      await cleanupRuntime(runId, undefined, AbortSignal.timeout(90000));
      activeBaseline.cleaned = true;
      const { loaded } = await publish(input, report, startedAt, finishedAt);
      baselines.set(variant, loaded);
      return loaded;
    },
    async prepare(request, signal) {
      invariant(!recovering && !failedCleanup, "Cleanup fences preparation.");
      invariant(
        baselines.size === 2 && !states.has(request.runId),
        "Both protected baselines and unused UUID required.",
      );
      await inspect(signal);
      const s: RunState = {
        request: immutable(request),
        digest: jsonDigest(request),
        bootId: "",
        observed: false,
        cleaned: false,
        scratchRemoved: false,
      };
      states.set(request.runId, s); // Before any partial guest mutation.
      const ack = await helper("prepare", s, signal);
      const value = status(await helper("status", s, signal), s);
      invariant(value.stage === "prepared", "Prepared state unavailable.");
      s.bootId = value.bootId;
      return ack;
    },
    async agent(runId, nonce, signal) {
      const s = state(runId, nonce);
      invariant(
        !recovering && !s.cancelled && !s.startRequested,
        "One unfenced worker start required.",
      );
      s.startRequested = true;
      await inspect(signal);
      await helper("start", s, signal);
      for (;;) {
        invariant(!s.cancelled, "Owned worker cancelled for cleanup.");
        signal.throwIfAborted();
        const value = status(await helper("status", s, signal), s);
        invariant(
          value.stage !== "failed",
          "Trusted supervisor failed; cleanup required.",
        );
        if (value.stage === "terminated") {
          invariant(
            value.agent &&
              value.containerId &&
              value.terminationConfirmed &&
              value.restartAbsenceConfirmed,
            "Real termination observation incomplete.",
          );
          s.observed = mode === "production";
          return {
            runId,
            nonce,
            requestSha256: s.digest,
            bootId: s.bootId,
            containerId: value.containerId,
            process: value.agent,
            terminationConfirmed: true,
            restartAbsenceConfirmed: true,
          };
        }
        invariant(
          ["starting", "running"].includes(value.stage),
          "Unexpected supervisor transition.",
        );
        await new Promise((r) => setTimeout(r, 200));
      }
    },
    async finalize(runId, nonce, signal) {
      const s = state(runId, nonce);
      invariant(!recovering && !s.cancelled, "Cleanup fences export.");
      const result = await helper("finalize", s, signal);
      invariant(
        result.bootId === s.bootId && result.containerId === s.containerId,
        "Finalized worker identity changed.",
      );
      s.finalized = immutable(result);
      return result;
    },
    async grade(input, signal) {
      const s = states.get(input.runId);
      invariant(!recovering && !s?.cancelled, "Cleanup fences grading.");
      invariant(
        s?.finalized &&
          input.workerImage === plan.runtime.workerImage &&
          jsonDigest(input.evaluationProfile) === jsonDigest(plan.profile),
        "Only finalized fixed team source may be graded.",
      );
      const startedAt = now(),
        { result, report } = await gradeFixed(input, signal),
        finishedAt = now();
      s.pending = {
        input: immutable(input),
        report: immutable(report),
        startedAt,
        finishedAt,
      };
      return {
        exitCode: 0,
        signal: null,
        reason: "completed",
        stdout: result,
        stderr: "",
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      };
    },
    async cleanup(runId, nonce, signal) {
      invariant(nonce, "Run nonce required.");
      const s = state(runId, nonce);
      await cleanupRuntime(runId, s, signal);
      if (s.pending) {
        try {
          const { entry, loaded } = await publish(
            s.pending.input,
            s.pending.report,
            s.pending.startedAt,
            s.pending.finishedAt,
          );
          s.entry = entry;
          s.evaluation = loaded;
        } catch {
          s.publicationFailed = true;
        } // Cleanup success and evidence custody are distinct.
      }
      return { runId, nonce, absent: true, restartAbsenceConfirmed: true };
    },
  };
  return Object.freeze({
    kind:
      mode === "production"
        ? ("installed-team-controls" as const)
        : ("synthetic-team-controls" as const),
    config,
    expected,
    plan,
    compositionSha256,
    controls: Object.freeze(controls),
    lifecycleInput: {
      study,
      implementationSha256: implementation,
      inventorySha256: jsonDigest(expected),
      controls,
      compositionSha256,
      reloadStudy: deps.reloadStudy,
      implementationIdentity: deps.implementationIdentity,
      reloadRuntimeAuthorization,
      reloadTeamAuthorization,
    },
    async preflight(owner: Ownership, signal: AbortSignal) {
      invariant(!ownership, "Composition cannot be rebound to another lease.");
      ownership = owner;
      const roots = [
        config.protectedRoot,
        config.evaluationRoot,
        config.runtimeOriginalRoot,
        config.coordinationRoot,
        ...Object.values(config.sources),
        registration.studyRoot,
        studyConfig.custody.originalRoot,
      ];
      const repo = fileURLToPath(new URL("../../../", import.meta.url));
      for (const root of roots) {
        await privateDirectory(root);
        disjoint(root, repo);
        disjoint(root, path.resolve(repo, "../AgentHarness-Planning"));
      }
      for (let i = 0; i < roots.length; i++)
        for (let j = i + 1; j < roots.length; j++)
          disjoint(roots[i]!, roots[j]!);
      await authorize(signal); // No VM command until both exact originals pass.
    },
    async cleanupBaseline(variant: Variant) {
      if (!activeBaseline) {
        if (touched)
          await cleanupRuntime(null, undefined, AbortSignal.timeout(90000));
        return;
      }
      invariant(
        activeBaseline.variant === variant,
        "Foreign baseline cleanup.",
      );
      if (!activeBaseline.cleaned)
        await cleanupRuntime(
          activeBaseline.gradeTouched ? activeBaseline.runId : null,
          undefined,
          AbortSignal.timeout(90000),
        );
      activeBaseline = undefined;
    },
    reloadEvaluation,
    baseline: (v: Variant) => baselines.get(v),
    actualState: (runId: string) =>
      mode === "production" && states.get(runId)?.observed
        ? immutable({ runId, observed: true as const })
        : null,
    async recordOriginals(outcome: {
      studyId: string;
      attempts: import("./paired").PairedAttempt[];
      cleanupConfirmed: boolean;
      leaseReleased: boolean;
    }) {
      invariant(
        mode === "production" &&
          outcome.studyId === study.definition.protocol.studyId,
        "Synthetic controls cannot write actual originals.",
      );
      const { RuntimeObservationSchema } = await import("./measured");
      const records: { runId: string; sha256: string }[] = [];
      for (const attempt of outcome.attempts) {
        const s = states.get(attempt.run.id);
        if (!s?.observed) continue; // Retained controller journal is unconfirmed, never relabelled actual.
        await current();
        const baseline = baselines.get(attempt.variant);
        invariant(
          isTrustedEvaluation(baseline),
          "Actual baseline original missing.",
        );
        const future = await reloadEvaluation(attempt.run.id);
        invariant(
          future === null || isTrustedEvaluation(future),
          "Future original substituted.",
        );
        const initial = await snapshotTree(config.sources[attempt.variant]);
        let finalManifest = null;
        if (attempt.candidateTreeSha256) {
          const candidate = await snapshotTree(
            path.join(
              config.protectedRoot,
              `paired-${outcome.studyId}`,
              `candidate-${attempt.variant}`,
            ),
          );
          invariant(
            candidate.treeSha256 === attempt.candidateTreeSha256,
            "Sealed candidate changed after cleanup.",
          );
          finalManifest = candidate.files;
        }
        const paired = requireHeldRecord(
          await reloadRuntimeAuthorization(attempt.variant),
          {
            studyId: outcome.studyId,
            kind: "runtime",
            subjectSha256: pairedRuntimeSubject(
              study,
              implementation,
              attempt.variant,
            ),
            predecessorSha256: study.prepared.sha256,
            at: attempt.run.startedAt,
          },
        );
        const admission = requireHeldRecord(
          await reloadTeamAuthorization(attempt.variant),
          {
            studyId: outcome.studyId,
            kind: "runtime",
            subjectSha256: supervisedTeamRuntimeSubject({
              study,
              variant: attempt.variant,
              implementationSha256: implementation,
              inventorySha256: jsonDigest(expected),
              pairedAuthorizationSha256: paired.sha256,
              provider: expected.provider,
              compositionSha256,
            }),
            predecessorSha256: paired.sha256,
            at: attempt.run.startedAt,
          },
        );
        attempt.run.receiptId = future?.receipt.id ?? null;
        attempt.run.verificationId = future?.verification.id ?? null;
        const value = RuntimeObservationSchema.parse({
          schemaVersion: "tournament-runtime-original.local.v1",
          origin: "actual_supervised_agent",
          run: {
            ...attempt.run,
            receiptId: future?.receipt.id ?? null,
            verificationId: future?.verification.id ?? null,
          },
          implementationSha256: implementation,
          taskDefinitionSha256: study.draft.taskDefinitionSha256,
          sharedTaskSha256: jsonDigest(sharedFutureTask(study)),
          initialManifest: initial.files,
          finalManifest,
          baselineRunId: baseline.receipt.runId,
          deviations: [],
          finalization: {
            terminationConfirmed: attempt.finalizationConfirmed,
            restartAbsenceConfirmed: attempt.finalizationConfirmed,
            exportWithoutGuestExecution: attempt.finalizationConfirmed,
          },
          cleanup: {
            workersAbsent: s.cleaned,
            scratchRemoved: s.scratchRemoved,
            ownedLeaseReleased: outcome.leaseReleased,
          },
          installedRuntime: {
            admissionSha256: admission.sha256,
            compositionSha256,
            inventorySha256: jsonDigest(expected),
            enforcementSha256: jsonDigest(plan),
            provider: expected.provider,
          },
        });
        const directory = path.join(config.runtimeOriginalRoot, attempt.run.id);
        await mkdir(directory, { mode: 0o700 });
        const bytes = canonicalJson(value);
        const file = await open(
          path.join(directory, "runtime-observation.json"),
          "wx",
          0o400,
        );
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        const diagnostics = await open(
          path.join(directory, "control-observations.json"),
          "wx",
          0o400,
        );
        try {
          await diagnostics.writeFile(
            canonicalJson({
              observations,
              publicationFailed: s.publicationFailed ?? false,
              independentExecutionCustody: "REQUIRED",
            }),
          );
          await diagnostics.sync();
        } finally {
          await diagnostics.close();
        }
        records.push({ runId: attempt.run.id, sha256: sha256(bytes) });
      }
      return records;
    },
    observations: () => immutable(structuredClone(observations)),
    assertCurrent: current,
  });
}
export async function createInstalledTeamControls(study: PreparedStudy) {
  const id = study.definition.protocol.studyId;
  const loaded = await loadRegisteredTeamRuntime(id);
  invariant(
    loaded?.registration.runtime.enabled,
    "No code-owned enabled team composition.",
  );
  const registration = loaded.registration;
  return buildControls(registration, study, "production", {
    run: boundedProcess,
    cliBytes: () => readFile(registration.runtime.sbx),
    implementationIdentity: async () => (await freezeBooking()).evaluatorSha256,
    reloadStudy: async () => {
      await assertTeamRegistrationCurrent(id, loaded.sha256);
      return loadOperatorStudy(registration.studyRoot, registration.study);
    },
  });
}
// Test-only injection is permanently synthetic; it cannot create actual-state,
// a live transport marker, trusted finalization or an actual execution original.
export function createNoInferenceTeamSbxControls(
  registration: TeamRuntimeRegistration,
  study: PreparedStudy,
  deps: Dependencies,
) {
  return buildControls(registration, study, "synthetic", deps);
}
export type InstalledTeamControls = Awaited<
  ReturnType<typeof createInstalledTeamControls>
>;
