import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import type { OperatorConfig } from "../isolation/config";
import { admitRuntime, reviewIsolation } from "../isolation/gate";
import { collectOfflineInventory } from "../isolation/offline-inventory";
import { ensureOfflineVmResources } from "../isolation/vm-resources";
import type { OfflineConfig } from "../isolation/offline-config";
import {
  captureReviewedTree,
  CandidateEnvelopeSchema,
} from "../artifacts/files";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import { boundedProcess, type ProcessResult } from "./process";
import { controllerFiles } from "../../evaluator/booking-v1/installed";
import { validateRestartObservation } from "./lifecycle-protocol";
import { fixedTask, type GradeInput } from "./protocol";
import { captureOfflineSource } from "../artifacts/offline-runs";
export type { GradeInput } from "./protocol";

export type ExecutionContext = {
  runId: string;
  repoCommit: string;
  commitmentSha256: string;
  fixtureSha256: string;
  assertOwned(): Promise<void>;
};
export type AgentFinalization = {
  runId: string;
  terminationConfirmed: boolean;
  restartAbsenceConfirmed: boolean;
  exportWithoutGuestExecution: boolean;
  candidate: unknown;
  candidateSha256: string;
};
const trustedFinalizations = new WeakSet<object>();
export function isTrustedAgentFinalization(
  value: unknown,
): value is AgentFinalization {
  return (
    typeof value === "object" &&
    value !== null &&
    trustedFinalizations.has(value)
  );
}
export type BookingAdapter = {
  kind: "sbx" | "synthetic-development";
  admit(
    implementationSha256: string,
    signal?: AbortSignal,
    context?: ExecutionContext,
  ): Promise<void>;
  prepare(
    runId: string,
    localExport: string,
    signal?: AbortSignal,
  ): Promise<void>;
  agent(runId: string, signal: AbortSignal): Promise<ProcessResult>;
  finalizeAgent(
    runId: string,
    signal?: AbortSignal,
  ): Promise<AgentFinalization>;
  grade(input: GradeInput, signal: AbortSignal): Promise<ProcessResult>;
  cleanup(): Promise<void>;
};
const FinalizationSchema = z.strictObject({
  runId: z.string().uuid(),
  nonce: z.string().uuid(),
  bootId: z.string().min(1),
  containerId: z.string().regex(/^[a-f0-9]{64}$/),
  requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  stage: z.literal("sealed"),
  candidate: CandidateEnvelopeSchema,
  candidateSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const ProcessSchema = z.strictObject({
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
const requireThat: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Only fixed sbx argument arrays and pinned, root-owned helpers. The agent runs
// in a nested network-none worker, NEVER in the outer VM's root namespace.
export function createSbxAdapter(
  configInput: OperatorConfig,
): BookingAdapter & {
  inspectRuntime(
    signal?: AbortSignal,
    ownership?: { assertOwned(): Promise<void> },
  ): Promise<unknown>;
} {
  const config = structuredClone(configInput);
  let context: ExecutionContext | undefined;
  let inspectionOwnership: { assertOwned(): Promise<void> } | undefined;
  let pin = "",
    fingerprint = "",
    prepared = false,
    started = false,
    finalized = false;
  let touched = false,
    graderTouched = false,
    signal: AbortSignal | undefined;
  let initial: Awaited<ReturnType<typeof inventory>> | undefined;
  let preparationDigest = "",
    sealedDigest = "",
    bootId = "",
    containerId = "";
  const nonce = randomUUID();
  const observedIds = new Map<string, string>();
  let foreignWorker = false;
  const execute = (
    args: string[],
    input?: string,
    limit = 1_048_576,
    timeout = 30_000,
    abort = signal,
  ) =>
    boundedProcess(config.sbx, args, {
      milliseconds: timeout,
      maxBytes: limit,
      signal: abort,
      input,
    });
  async function checked(args: string[], input?: string, limit?: number) {
    const result = await execute(args, input, limit);
    requireThat(
      result.reason === "completed" && result.exitCode === 0,
      "Sandbox control command failed.",
    );
    return result.stdout;
  }
  async function owned() {
    await (context ?? inspectionOwnership)?.assertOwned();
  }
  function offlineConfig(): OfflineConfig {
    requireThat(
      config.supervision,
      "Missing supervised runtime configuration.",
    );
    return {
      schemaVersion: "booking-offline-operator.v1",
      scope: "fixed-booking-grader-acceptance-no-inference",
      enabled: false,
      acceptanceEnabled: false,
      sbx: config.sbx,
      sbxSha256: config.supervision.sbxSha256,
      graderSandbox: config.graderSandbox,
      graderImage: config.graderImage,
      workerImage: config.workerImage,
      graderNodeSha256: config.graderNodeSha256,
      graderLockSha256: config.graderLockSha256,
      graderModulesSha256: config.graderModulesSha256,
      coordinationRoot: config.coordinationRoot,
      protectedRoot: config.protectedRoot,
      scratchRoot: config.scratchRoot,
      reviewFile: config.reviewFile,
      reviewSha256: config.reviewSha256,
      maxSeconds: config.maxSeconds,
      maxOutputBytes: Math.min(config.maxOutputBytes, 1_048_576),
      vmPids: config.supervision.vmPids,
      vmDiskBytes: config.supervision.vmDiskBytes,
    };
  }
  async function inventory() {
    requireThat(config.supervision, "Missing supervised worker inputs.");
    await owned();
    requireThat(
      sha256(await readFile(config.sbx)) === config.supervision.sbxSha256,
      "Sandbox CLI bytes changed.",
    );
    const version = (await checked(["version"])).trim();
    requireThat(
      version.startsWith("sbx version v0.50.0 "),
      "Unreviewed sandbox version.",
    );
    const list = JSON.parse(await checked(["ls", "--format", "json"])) as {
      name: string;
      id: string;
    }[];
    const inspect = async (name: string, image: string) => {
      const info = JSON.parse(await checked(["inspect", name, "--json"]));
      requireThat(
        info.image_digest === image &&
          info.cpus === 2 &&
          info.memory === "4g" &&
          info.runtime_mounts?.length === 0 &&
          info.sessions === 0 &&
          (!touched ? info.state === "stopped" : true),
        "Runtime image, mounts, sessions or resources changed.",
      );
      const id = list.find((item) => item.name === name)?.id;
      requireThat(typeof id === "string", "Missing runtime identity.");
      return {
        id,
        image,
        cpus: info.cpus,
        memory: info.memory,
        mounts: info.runtime_mounts,
        auth: info.auth_mode ?? null,
        policy: JSON.parse(await checked(["policy", "ls", name, "--json"])),
      };
    };
    const agent = await inspect(config.agentSandbox, config.agentImage);
    const grader = await inspect(config.graderSandbox, config.graderImage);
    for (const [name, id] of [
      [config.agentSandbox, agent.id],
      [config.graderSandbox, grader.id],
    ] as const) {
      requireThat(
        !observedIds.has(name) || observedIds.get(name) === id,
        "Runtime instance replaced during inventory.",
      );
      observedIds.set(name, id);
    }
    requireThat(
      agent.id !== grader.id && grader.auth === null,
      "Independent grader identity invalid.",
    );
    const ssh = (
      await checked(["settings", "get", "ssh.agentForwardingEnabled"])
    ).trim();
    const browser = (
      await checked(["settings", "get", "browser.enabled"])
    ).trim();
    const mcp = JSON.parse(await checked(["mcp", "ls", "--json"]));
    requireThat(
      ssh === "false" &&
        browser === "false" &&
        Array.isArray(mcp) &&
        mcp.length === 0,
      "Host integrations enabled.",
    );
    const script = await readFile(
      fileURLToPath(new URL("../isolation/runtime-files.py", import.meta.url)),
      "utf8",
    );
    touched = true;
    const agentFiles = JSON.parse(
      await checked([
        "exec",
        "-u",
        "root",
        config.agentSandbox,
        "python3",
        "-I",
        "-c",
        script,
        "agent",
      ]),
    ) as Record<string, string>;
    requireThat(
      agentFiles["/home/agent/.codex/config.toml"] ===
        config.agentConfigSha256 &&
        agentFiles["/usr/local/bin/codex"] === config.codexBinarySha256,
      "Agent tooling/configuration mismatch.",
    );
    for (const name of ["supervisor.py", "budget.py", "worker.mjs"]) {
      const local = await readFile(
        fileURLToPath(new URL(`../agent/${name}`, import.meta.url)),
      );
      requireThat(
        agentFiles[`/opt/forecode-agent/${name}`] === sha256(local),
        "Installed supervisor differs from reviewed bytes.",
      );
    }
    const workers = (
      await checked([
        "exec",
        config.agentSandbox,
        "docker",
        "ps",
        "-aq",
        "--filter",
        "label=forecode.booking.agent",
      ])
    ).trim();
    if (workers) {
      foreignWorker = true;
      throw new Error(
        "Existing agent worker requires independent owner recovery.",
      );
    }
    const vmResources = await ensureOfflineVmResources(
      { ...offlineConfig(), graderSandbox: config.agentSandbox },
      async (args) => checked(args),
      signal ?? new AbortController().signal,
    );
    const agentWorker = JSON.parse(
      await checked([
        "exec",
        config.agentSandbox,
        "docker",
        "image",
        "inspect",
        config.supervision.workerImage,
      ]),
    )[0];
    requireThat(
      agentWorker.Id === config.supervision.workerImage &&
        agentWorker.Os === "linux",
      "Agent worker image mismatch.",
    );
    graderTouched = true;
    const graderInventory = await collectOfflineInventory(
      offlineConfig(),
      async (args) => {
        await owned();
        return checked(args);
      },
      signal ?? new AbortController().signal,
      false,
      () => {
        graderTouched = true;
      },
    );
    // Existing installed-grader validator checks every controller byte and native closure.
    for (const name of controllerFiles)
      requireThat(
        graderInventory.files[`/opt/forecode-booking/controller/${name}`] ===
          sha256(
            await readFile(
              fileURLToPath(
                new URL(`../../evaluator/booking-v1/${name}`, import.meta.url),
              ),
            ),
          ),
        "Grader controller mismatch.",
      );
    return {
      version,
      sbxSha256: config.supervision.sbxSha256,
      agent,
      grader,
      ssh,
      browser,
      mcp,
      agentFiles,
      vmResources,
      agentWorker: {
        id: agentWorker.Id,
        os: agentWorker.Os,
        architecture: agentWorker.Architecture,
      },
      graderInventory,
      budgetPolicy: config.supervision.provider,
    };
  }
  async function guard() {
    requireThat(context && pin && fingerprint, "Runtime admission missing.");
    await context.assertOwned();
    const review = await reviewIsolation(config, pin);
    requireThat(
      review.execution?.runId === context.runId &&
        review.execution.repoCommit === context.repoCommit &&
        review.execution.commitmentSha256 === context.commitmentSha256,
      "Independent exact execution commitment missing or changed.",
    );
    requireThat(
      review.inventorySha256 === fingerprint,
      "Inventory admission changed.",
    );
    const list = JSON.parse(await checked(["ls", "--format", "json"])) as {
      name: string;
      id: string;
    }[];
    requireThat(
      list.find((i) => i.name === config.agentSandbox)?.id ===
        initial?.agent.id &&
        list.find((i) => i.name === config.graderSandbox)?.id ===
          initial?.grader.id,
      "Runtime instance replaced.",
    );
  }
  async function helper(
    operation: string,
    input: unknown = {},
    limit = 1_048_576,
  ) {
    requireThat(context, "Run ownership missing.");
    await guard();
    const payload =
      operation === "prepare"
        ? { operation, request: input }
        : { operation, runId: context.runId, nonce };
    return JSON.parse(
      await checked(
        [
          "exec",
          "-i",
          "-u",
          "root",
          config.agentSandbox,
          "python3",
          "-I",
          "/opt/forecode-agent/supervisor.py",
        ],
        JSON.stringify(payload),
        limit,
      ),
    );
  }
  function sameRun(runId: string) {
    requireThat(context?.runId === runId, "Wrong or stale run.");
  }
  return {
    kind: "sbx",
    async inspectRuntime(abort, ownership) {
      requireThat(
        ownership,
        "Explicit owned lease required for runtime inspection.",
      );
      inspectionOwnership = ownership;
      signal = abort;
      return inventory();
    },
    async admit(implementationSha256, abort, input) {
      requireThat(
        config.enabled,
        "Real execution disabled by operator configuration.",
      );
      requireThat(input, "Exact pre-run commitment and owned lease required.");
      context = input;
      signal = abort;
      pin = implementationSha256;
      await input.assertOwned();
      requireThat(
        config.supervision,
        "Supervised runtime configuration is not provisioned.",
      );
      const review = await reviewIsolation(config, pin); // Before any VM command.
      requireThat(
        review.execution?.runId === input.runId &&
          review.execution.repoCommit === input.repoCommit &&
          review.execution.commitmentSha256 === input.commitmentSha256,
        "Independent exact execution review missing.",
      );
      initial = await inventory();
      await admitRuntime(config, initial, pin);
      fingerprint = jsonDigest(initial);
    },
    async prepare(runId, localExport, abort) {
      sameRun(runId);
      signal = abort;
      requireThat(
        !prepared && config.supervision && context,
        "Preparation collision or missing admission.",
      );
      await guard();
      requireThat(
        (await snapshotTree(localExport)).treeSha256 === context.fixtureSha256,
        "Prepared source changed.",
      );
      const source = await captureOfflineSource(runId, context.fixtureSha256);
      requireThat(
        source.repoCommit === context.repoCommit,
        "Source commit changed before launch.",
      );
      const candidate = await captureReviewedTree(localExport, runId);
      const request = {
        runId,
        nonce,
        candidate,
        prompt: fixedTask.prompt,
        workerImage: config.supervision.workerImage,
        codexBinarySha256: config.codexBinarySha256,
        agentConfigSha256: config.agentConfigSha256,
        workerNodeSha256: config.supervision.workerNodeSha256,
        maxSeconds: config.maxSeconds,
        maxOutputBytes: config.maxOutputBytes,
        tokenLimit: config.tokenLimit,
        spendMicroUsd: Math.floor(config.spendUsd * 1_000_000),
        provider: config.supervision.provider,
      };
      preparationDigest = jsonDigest(request);
      // Mark touched before transport so a partial prepare cannot be forgotten.
      prepared = true;
      const result = await helper("prepare", request);
      requireThat(
        result.runId === runId &&
          result.stage === "prepared" &&
          result.requestSha256 === preparationDigest,
        "Source preparation unconfirmed.",
      );
    },
    async agent(runId, abort) {
      sameRun(runId);
      signal = abort;
      requireThat(prepared && !started, "One agent attempt per commitment.");
      await guard();
      requireThat(
        jsonDigest(await inventory()) === fingerprint,
        "Runtime drift before launch.",
      );
      started = true;
      await helper("start");
      for (;;) {
        if (abort.aborted)
          return {
            exitCode: null,
            signal: null,
            reason: "cancelled",
            stdout: "",
            stderr: "",
            elapsedMs: 0,
          };
        const state = await helper("status", {}, 16_000_000);
        requireThat(
          state.runId === runId &&
            state.nonce === nonce &&
            state.requestSha256 === preparationDigest,
          "Supervisor state mismatch.",
        );
        if (state.stage === "failed")
          throw new Error("Supervised agent failed; source unavailable.");
        if (state.stage === "terminated") {
          bootId = state.bootId;
          containerId = state.containerId;
          return ProcessSchema.parse(state.agent) as ProcessResult;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    },
    async finalizeAgent(runId, abort) {
      sameRun(runId);
      signal = abort;
      requireThat(
        started && !finalized && containerId,
        "Agent termination observation missing.",
      );
      const result = FinalizationSchema.parse(
        await helper("finalize", {}, 16_000_000),
      );
      requireThat(
        result.runId === runId &&
          result.nonce === nonce &&
          result.bootId === bootId &&
          result.containerId === containerId &&
          result.requestSha256 === preparationDigest &&
          result.candidateSha256 === jsonDigest(result.candidate),
        "Sealed source identity mismatch.",
      );
      finalized = true;
      sealedDigest = result.candidateSha256;
      const output: AgentFinalization = Object.freeze({
        runId,
        candidate: result.candidate,
        candidateSha256: result.candidateSha256,
        terminationConfirmed: true,
        restartAbsenceConfirmed: true,
        exportWithoutGuestExecution: true,
      });
      // Marker only after actual pinned trusted-helper transport/observations.
      trustedFinalizations.add(output);
      return output;
    },
    async grade(input, abort) {
      sameRun(input.runId);
      signal = abort;
      requireThat(
        finalized &&
          jsonDigest(input.candidate) === sealedDigest &&
          input.workerImage === config.workerImage,
        "Only the sealed candidate may be graded.",
      );
      await guard();
      requireThat(
        jsonDigest(await inventory()) === fingerprint,
        "Runtime drift before protected grading.",
      );
      graderTouched = true;
      return execute(
        [
          "exec",
          "-i",
          config.graderSandbox,
          "/opt/forecode-booking/bin/node",
          "--conditions=react-server",
          "--import",
          "/opt/forecode-booking/node_modules/tsx/dist/loader.mjs",
          "/opt/forecode-booking/controller/guest.ts",
        ],
        JSON.stringify(input),
        config.maxOutputBytes,
        Math.min(config.maxSeconds * 1000, 590_000),
        abort,
      );
    },
    async cleanup() {
      signal = AbortSignal.timeout(90_000); // Fresh bounded cleanup, independent of cancellation.
      await owned();
      if (!touched) return;
      requireThat(
        !foreignWorker,
        "Refuse cleanup of an existing foreign worker; owner recovery required.",
      );
      const currentInstances = JSON.parse(
        await checked(["ls", "--format", "json"]),
      ) as { name: string; id: string }[];
      for (const name of [config.agentSandbox, config.graderSandbox])
        requireThat(
          currentInstances.find((item) => item.name === name)?.id ===
            observedIds.get(name),
          "Refuse cleanup of replaced runtime.",
        );
      if (prepared && context) {
        // Cleanup remains possible after expiry/revocation; no new inference or
        // source capture is allowed. Recheck instance/ownership before recovery.
        const list = JSON.parse(await checked(["ls", "--format", "json"])) as {
          name: string;
          id: string;
        }[];
        requireThat(
          list.find((i) => i.name === config.agentSandbox)?.id ===
            initial?.agent.id,
          "Refuse cleanup of replaced runtime.",
        );
        const state = JSON.parse(
          await checked(
            [
              "exec",
              "-i",
              "-u",
              "root",
              config.agentSandbox,
              "python3",
              "-I",
              "/opt/forecode-agent/supervisor.py",
            ],
            JSON.stringify({
              operation: "cleanup",
              runId: context.runId,
              nonce,
            }),
          ),
        );
        requireThat(
          state.runId === context.runId && state.absent === true,
          "Worker cleanup unconfirmed.",
        );
      }
      if (graderTouched && context) {
        const args = [
          "exec",
          config.graderSandbox,
          "/opt/forecode-booking/bin/node",
          "/opt/forecode-booking/controller/lifecycle.mjs",
          "cleanup",
          context.runId,
        ];
        await checked(args);
        await checked(["stop", config.graderSandbox]);
        const current = await collectOfflineInventory(
          offlineConfig(),
          async (a) => {
            await owned();
            return checked(a);
          },
          signal,
          true,
          () => {},
        );
        requireThat(
          jsonDigest(current) === jsonDigest(initial?.graderInventory),
          "Protected grader changed during cleanup.",
        );
        validateRestartObservation(
          JSON.parse(await checked(args)),
          context.runId,
        );
      }
      await owned();
      await checked(["stop", config.agentSandbox, config.graderSandbox]);
      for (const name of [config.agentSandbox, config.graderSandbox])
        requireThat(
          JSON.parse(await checked(["inspect", name, "--json"])).state ===
            "stopped",
          "VM stop unconfirmed.",
        );
    },
  };
}
