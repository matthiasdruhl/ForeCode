// Synthetic signed originals and fixed inert command replies; never a real VM.
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { studyFixture } from "./tournament-study";
import {
  teamAgentId,
  teamCredentialPolicy,
  teamNetworkPolicy,
  teamRoadmapDigest,
  teamEnforcementPlan,
} from "../../scripts/experiments/tournament/team-policy";
import {
  teamCompositionDigest,
  type TeamRuntimeConfig,
  type TeamRuntimeRegistration,
} from "../../scripts/experiments/tournament/team-config";
import { collectTeamInventory } from "../../scripts/experiments/tournament/team-inventory";
import {
  TeamInventorySchema,
  supervisedTeamRuntimeSubject,
  createNoInferenceTeamTransport,
} from "../../scripts/experiments/tournament/supervised-team";
import { createNoInferenceTeamSbxControls } from "../../scripts/experiments/tournament/team-sbx";
import {
  pairedRuntimeSubject,
  sharedFutureTask,
  type PairedTransport,
  type Variant,
} from "../../scripts/experiments/tournament/paired";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";
import { validateGradeInput } from "../../scripts/evaluator/booking-v1/grade-profile";
import type { ProcessResult } from "../../scripts/experiments/runner/process";
export const fakeCli = Buffer.from("synthetic fixed CLI bytes");
export async function compositionFixture(
  options: { graderWorkerImage?: string } = {},
) {
  const sources: Record<string, string> = Object.fromEntries(
    await Promise.all(
      ["supervisor.py", "budget.py", "worker.mjs", "team-supervisor.py"].map(
        async (name) => [
          name,
          sha256(await readFile(`scripts/experiments/agent/${name}`)),
        ],
      ),
    ),
  );
  const guestSha = sha256(
    await readFile("scripts/evaluator/booking-v1/guest.ts"),
  );
  const configSha = sha256(
    await readFile("scripts/experiments/agent/team-config.toml"),
  );
  const f = await studyFixture({
    configure(d, draft) {
      d.runtime.supervisorSha256 = sources["team-supervisor.py"]!;
      d.runtime.brokerSha256 = sources["budget.py"]!;
      d.runtime.graderExecutableSha256 = guestSha;
      for (const c of d.protocol.conditions) {
        c.agentConfigSha256 = configSha;
        c.seed = null;
        c.budget.tokenLimit = 100000;
        c.networkPolicySha256 = jsonDigest(teamNetworkPolicy);
        c.credentialPolicySha256 = jsonDigest(teamCredentialPolicy);
        c.visibleRoadmapSha256 = teamRoadmapDigest(d);
        c.runtimeSha256 = jsonDigest(d.runtime);
      }
      for (const e of d.protocol.executionConditions) e.agentId = teamAgentId;
      draft.plan.conditions = structuredClone(d.protocol.conditions);
      draft.executionConditions = structuredClone(
        d.protocol.executionConditions,
      );
      draft.plan.manifest.budget = structuredClone(
        d.protocol.conditions[0]!.budget,
      );
      draft.plan.manifest.agentConfigSha256 = configSha;
      draft.plan.visibleRoadmapSha256 =
        d.protocol.conditions[0]!.visibleRoadmapSha256;
    },
  });
  const plan = teamEnforcementPlan(f.study.definition),
    implementation = "a".repeat(64);
  const dirs = Object.fromEntries(
    await Promise.all(
      [
        "protectedRoot",
        "evaluationRoot",
        "runtimeOriginalRoot",
        "coordinationRoot",
      ].map(async (key) => {
        const root = path.join(f.parent, key);
        await mkdir(root, { mode: 0o700 });
        return [key, root];
      }),
    ),
  );
  const isolationFile = path.join(f.root, "isolation-observation.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(isolationFile, "synthetic isolation observation", {
    mode: 0o400,
  });
  const expected = TeamInventorySchema.parse({
    schemaVersion: "supervised-team-inventory.local.v1",
    implementationSha256: implementation,
    enforcementSha256: jsonDigest(plan),
    agentInstance: "synthetic-agent",
    graderInstance: "synthetic-grader",
    runtime: plan.runtime,
    agentConfigSha256: plan.agentConfigSha256,
    workerSha256: sources["worker.mjs"],
    sandboxCliSha256: sha256(fakeCli),
    protectedInstallationSha256: "b".repeat(64),
    isolationObservationSha256: sha256("synthetic isolation observation"),
    enforcementObservationSha256: "c".repeat(64),
    provider: { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1 },
    vm: plan.vm,
    hostIntegrations: "disabled",
    workerNetwork: "none",
    workerCredentials: "absent",
    restart: "no",
  });
  const config: TeamRuntimeConfig = {
    schemaVersion: "supervised-team-composition.local.v1",
    enabled: true,
    sbx: "/opt/homebrew/bin/sbx",
    agentSandbox: "forecode-team-agent",
    graderSandbox: "forecode-team-grader",
    graderWorkerImage: options.graderWorkerImage ?? plan.runtime.workerImage,
    expectedInventory: expected,
    graderNodeSha256: "d".repeat(64),
    graderLockSha256: "e".repeat(64),
    graderModulesSha256: "f".repeat(64),
    installedPolicySha256: "9".repeat(64),
    isolationFile,
    protectedRoot: dirs.protectedRoot!,
    evaluationRoot: dirs.evaluationRoot!,
    runtimeOriginalRoot: dirs.runtimeOriginalRoot!,
    coordinationRoot: dirs.coordinationRoot!,
    sources: f.sources,
    baselineRunIds: {
      A: "33333333-3333-4333-8333-333333333333",
      B: "44444444-4444-4444-8444-444444444444",
    },
    runtimeOriginalIds: {
      A: { paired: "paired-A", installed: "installed-A" },
      B: { paired: "paired-B", installed: "installed-B" },
    },
  };
  const policy = {
    schemaVersion: "supervised-team-installed-policy.v1",
    enabled: true,
    implementationSha256: implementation,
    enforcementSha256: jsonDigest(plan),
    studyId: f.study.definition.protocol.studyId,
    arms: f.study.draft.plan.manifest.arms.map((a) => ({
      variant: a.variant,
      runId: a.runId!,
      sourceCommit: a.initialCommit,
      sourceTreeSha256: a.initialTreeSha256,
      sharedTaskSha256: jsonDigest(sharedFutureTask(f.study)),
    })),
    provider: expected.provider,
  };
  const agentFiles: Record<string, string> = {
    "/home/agent/.codex/config.toml": plan.agentConfigSha256,
    "/usr/local/bin/codex": plan.runtime.agentBinarySha256,
    "/usr/local/bin/node": plan.runtime.nodeSha256,
    "/opt/forecode-agent/team-policy.json": config.installedPolicySha256,
    "executable:docker": "1".repeat(64),
    "executable:python3": "2".repeat(64),
    runtime_metadata: "3".repeat(64),
    team_runtime_metadata: "4".repeat(64),
  };
  for (const [name, hash] of Object.entries(sources))
    agentFiles[`/opt/forecode-agent/${name}`] = String(hash);
  const graderFiles: Record<string, string> = {
    "/opt/forecode-booking/bin/node": config.graderNodeSha256,
    "/opt/forecode-booking/package-lock.json": config.graderLockSha256,
    node_modules: config.graderModulesSha256,
    "/opt/forecode-booking/package.json": sha256(
      await readFile("scripts/evaluator/booking-v1/toolchain/package.json"),
    ),
    runtime_metadata: "1".repeat(64),
    team_runtime_metadata: "2".repeat(64),
    "executable:docker": "3".repeat(64),
    "executable:python3": "4".repeat(64),
    "executable:ldd": "5".repeat(64),
    "native:/lib/fixed.so": "6".repeat(64),
  };
  for (const name of [...controllerFiles, "team-profile-inventory.ts"])
    graderFiles[`/opt/forecode-booking/controller/${name}`] = sha256(
      await readFile(`scripts/evaluator/booking-v1/${name}`),
    );
  const calls: { args: string[]; input?: string }[] = [];
  const vm = new Map<string, string>([
    [config.agentSandbox, "stopped"],
    [config.graderSandbox, "stopped"],
  ]);
  const requests = new Map<string, Parameters<PairedTransport["prepare"]>[1]>();
  const runs = new Map<
    string,
    { request: Record<string, unknown>; stage: string; candidate: unknown }
  >();
  const faults = {
    inventory: false,
    foreign: false,
    scratch: false,
    cleanup: false,
    grade: false,
    boot: false,
    nonce: false,
    timeout: false,
    missingCheck: false,
    sourceOutside: false,
  };
  async function reply(args: string[], input?: string): Promise<string> {
    calls.push({ args: [...args], ...(input ? { input } : {}) });
    if (args[0] === "version") return "sbx version v0.50.0 synthetic";
    if (args[0] === "ls")
      return JSON.stringify([
        { name: config.agentSandbox, id: "synthetic-agent" },
        { name: config.graderSandbox, id: "synthetic-grader" },
      ]);
    if (args[0] === "inspect")
      return JSON.stringify({
        image_digest:
          args[1] === config.agentSandbox
            ? plan.runtime.agentImage
            : plan.runtime.graderImage,
        cpus: 2,
        memory: "4g",
        sessions: 0,
        runtime_mounts: [],
        auth_mode: null,
        state: vm.get(args[1]!),
      });
    if (args[0] === "policy")
      return JSON.stringify({
        deny: ["all"],
        allow: args[2] === config.agentSandbox ? ["fixed-meta-proxy"] : [],
      });
    if (args[0] === "settings") return "false";
    if (args[0] === "mcp") return "[]";
    if (args[0] === "stop") {
      for (const name of args.slice(1)) vm.set(name, "stopped");
      return "";
    }
    if (args[0] !== "exec") throw new Error("Unreviewed synthetic command");
    const name = args.includes(config.agentSandbox)
      ? config.agentSandbox
      : config.graderSandbox;
    vm.set(name, "running");
    const program = args[args.indexOf("-c") + 1];
    if (args.includes("-c") && program?.includes("def ensure_resources"))
      return JSON.stringify({
        schemaVersion: "booking-vm-resources.v1",
        kernelThreadsMax: 512,
        parentPidsMax: 512,
        sandboxPidsMax: 512,
        kernelPidAllocationMax: 4194304,
        blockDevices: [{ name: "vda", bytes: plan.vm.diskBytes }],
        blockDeviceBytes: plan.vm.diskBytes,
      });
    if (args.includes("-c") && program?.includes("collect_team_runtime"))
      return JSON.stringify(
        name === config.agentSandbox
          ? {
              ...agentFiles,
              installedPolicy: policy,
              ...(faults.inventory
                ? { "/opt/forecode-agent/team-supervisor.py": "0".repeat(64) }
                : {}),
            }
          : { ...graderFiles, scratchAbsent: !faults.scratch },
      );
    if (args.includes("image") && args.includes("inspect"))
      return JSON.stringify([
        {
          Id:
            name === config.graderSandbox
              ? config.graderWorkerImage
              : plan.runtime.workerImage,
          Os: "linux",
          Architecture: "arm64",
          RepoDigests: [],
        },
      ]);
    if (args.includes("ps"))
      return faults.foreign ? "synthetic-foreign-worker" : "";
    if (args.some((a) => a.endsWith("team-profile-inventory.ts")))
      return JSON.stringify({
        manifestSha256: "7".repeat(64),
        oracleSha256: plan.profile.testSuiteSha256,
      });
    if (args.some((a) => a.endsWith("lifecycle.mjs"))) {
      if (faults.cleanup) throw new Error("Synthetic cleanup failure");
      return JSON.stringify({
        runId: args.at(-1),
        removed: 0,
        remaining: 0,
        controllerRecovered: false,
      });
    }
    if (args.some((a) => a.endsWith("team-supervisor.py"))) {
      const body = JSON.parse(input!);
      if (body.operation === "prepare") {
        const request = body.request;
        const candidate = structuredClone(request.candidate);
        candidate.files.find(
          (f: { path: string }) => f.path === "src/service.ts",
        ).base64 = Buffer.from("// inert future candidate").toString("base64");
        if (faults.sourceOutside)
          candidate.files[0].base64 =
            Buffer.from("changed lock").toString("base64");
        runs.set(request.runId, { request, stage: "prepared", candidate });
        requests.set(request.runId, request.candidate);
        return JSON.stringify({
          runId: request.runId,
          nonce: request.nonce,
          stage: "prepared",
          requestSha256: jsonDigest(request),
        });
      }
      const s = runs.get(body.runId)!;
      if (!s) throw new Error("Unknown mock owned run");
      if (body.operation === "start") {
        s.stage = "terminated";
        return JSON.stringify({ runId: body.runId, stage: "starting" });
      }
      const identity = {
        runId: body.runId,
        nonce: faults.nonce ? config.baselineRunIds.A : body.nonce,
        requestSha256: jsonDigest(s.request),
        bootId:
          faults.boot && s.stage !== "prepared" ? "changed-boot" : "fixed-boot",
        containerId: s.stage === "prepared" ? null : "8".repeat(64),
      };
      if (body.operation === "status")
        return JSON.stringify({
          ...identity,
          stage: s.stage,
          ...(s.stage === "terminated"
            ? {
                agent: {
                  reason: faults.timeout ? "timed_out" : "completed",
                  exitCode: faults.timeout ? null : 0,
                  signal: null,
                  stdout: "synthetic diagnostic",
                  stderr: "",
                  elapsedMs: 1,
                },
                terminationConfirmed: true,
                restartAbsenceConfirmed: true,
              }
            : {}),
        });
      if (body.operation === "finalize")
        return JSON.stringify({
          ...identity,
          stage: "sealed",
          candidate: s.candidate,
          candidateSha256: jsonDigest(s.candidate),
          terminationConfirmed: true,
          restartAbsenceConfirmed: true,
          exportWithoutGuestExecution: true,
        });
      if (body.operation === "cleanup") {
        if (faults.cleanup) throw new Error("Synthetic cleanup denied");
        return JSON.stringify({
          runId: body.runId,
          nonce: body.nonce,
          absent: true,
          restartAbsenceConfirmed: true,
          scratchRemoved: true,
        });
      }
      throw new Error("Unknown synthetic operation");
    }
    if (args.some((a) => a.endsWith("guest.ts"))) {
      if (faults.grade) throw new Error("Synthetic grader interrupted");
      const value = validateGradeInput(JSON.parse(input!));
      const checkIds = value.evaluationProfile
        ? [...teamCheckIds]
        : [...baselineCheckIds];
      if (faults.missingCheck) checkIds.pop();
      return JSON.stringify({
        schemaVersion: "booking-grade-observation.v1",
        runId: value.runId,
        evaluatedTreeSha256: value.evaluatedTreeSha256,
        evaluatorSha256: value.evaluatorSha256,
        testSuiteSha256: value.testSuiteSha256,
        requiredPolicySha256: value.requiredPolicySha256,
        ...(value.evaluationProfile
          ? { evaluationProfile: value.evaluationProfile }
          : {}),
        checks: checkIds.map((id) => ({
          id,
          exitCode: 0,
          status: "pass",
          detail: "synthetic protected observation",
        })),
      });
    }
    throw new Error("Unknown fixed synthetic control");
  }
  const directExec = async (
    args: string[],
    _signal: AbortSignal,
    input?: string,
  ) => reply(args, input);
  const initial = await collectTeamInventory({
    config,
    study: f.study,
    plan,
    implementationSha256: implementation,
    exec: directExec,
    signal: new AbortController().signal,
    initiallyStopped: true,
  });
  config.expectedInventory = initial.inventory;
  for (const name of vm.keys()) vm.set(name, "stopped");
  calls.length = 0;
  const store = await import("../../scripts/experiments/tournament/custody");
  for (const variant of ["A", "B"] as const) {
    const paired = (await f.hold({
      id: config.runtimeOriginalIds[variant].paired,
      studyId: f.study.definition.protocol.studyId,
      kind: "runtime",
      subjectSha256: pairedRuntimeSubject(f.study, implementation, variant),
      predecessorSha256: f.study.prepared.sha256,
      heldAt: "2026-10-28T12:05:30.000Z",
    }))!;
    await f.hold({
      id: config.runtimeOriginalIds[variant].installed,
      studyId: f.study.definition.protocol.studyId,
      kind: "runtime",
      subjectSha256: supervisedTeamRuntimeSubject({
        study: f.study,
        variant,
        implementationSha256: implementation,
        inventorySha256: jsonDigest(initial.inventory),
        pairedAuthorizationSha256: paired.sha256,
        provider: initial.inventory.provider,
        compositionSha256: teamCompositionDigest(config),
      }),
      predecessorSha256: paired.sha256,
      heldAt: "2026-10-28T12:05:30.000Z",
    });
  }
  const registration: TeamRuntimeRegistration = {
    studyRoot: f.studyRoot,
    study: f.operatorConfig,
    runtime: config,
  };
  const deps = {
    run: async (
      _exe: string,
      args: readonly string[],
      options: { input?: string },
    ): Promise<ProcessResult> => ({
      reason: "completed",
      exitCode: 0,
      signal: null,
      stdout: await reply([...args], options.input),
      stderr: "",
      elapsedMs: 1,
    }),
    cliBytes: async () => fakeCli,
    implementationIdentity: async () => implementation,
    reloadStudy: async () => f.study,
  };
  const installed = createNoInferenceTeamSbxControls(
    registration,
    f.study,
    deps,
  );
  const inner = createNoInferenceTeamTransport({
    ...installed.lifecycleInput,
    now: () => "2026-10-28T12:06:00.000Z",
  });
  const transport: PairedTransport = Object.freeze({
    ...inner,
    preflight: installed.preflight,
    cleanup: async (runId) => {
      if (runId === "baseline-A" || runId === "baseline-B")
        await installed.cleanupBaseline(runId === "baseline-A" ? "A" : "B");
      else await inner.cleanup(runId);
    },
  });
  const input = {
    study: f.study,
    transport,
    protectedRoot: config.protectedRoot,
    coordinationRoot: config.coordinationRoot,
    sources: config.sources,
    reloadStudy: deps.reloadStudy,
    implementationIdentity: deps.implementationIdentity,
    reloadRuntimeAuthorization: async (v: Variant) =>
      (await store.createStudyCustodyStore(f.config)).load(
        config.runtimeOriginalIds[v].paired,
      ),
    signal: new AbortController().signal,
    syntheticNow: () => "2026-10-28T12:06:00.000Z",
  };
  return {
    ...f,
    config,
    registration,
    plan,
    initial,
    agentFiles,
    graderFiles,
    calls,
    faults,
    vm,
    deps,
    installed,
    transport,
    input,
    implementation,
  };
}
import {
  baselineCheckIds,
  teamCheckIds,
} from "../../scripts/evaluator/booking-v1/grade-profile";
