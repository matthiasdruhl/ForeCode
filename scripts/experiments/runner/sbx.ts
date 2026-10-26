import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import type { CandidateEnvelope } from "../artifacts/files";
import { admitRuntime, reviewIsolation } from "../isolation/gate";
import type { OperatorConfig } from "../isolation/config";
import { boundedProcess, type ProcessResult } from "./process";
import { fixedTask } from "./protocol";

export type GradeInput = {
  runId: string;
  evaluatedTreeSha256: string;
  evaluatorSha256: string;
  testSuiteSha256: string;
  requiredPolicySha256: string;
  candidate: CandidateEnvelope;
  workerImage: string;
};
export type BookingAdapter = {
  kind: "sbx" | "synthetic-development";
  admit(implementationSha256: string, signal?: AbortSignal): Promise<void>;
  prepare(
    runId: string,
    localExport: string,
    signal?: AbortSignal,
  ): Promise<void>;
  agent(runId: string, signal: AbortSignal): Promise<ProcessResult>;
  collect(runId: string, signal?: AbortSignal): Promise<unknown>;
  grade(input: GradeInput, signal: AbortSignal): Promise<ProcessResult>;
  cleanup(): Promise<void>;
};
// Installed sbx 0.50.0 help reviewed: exec -i/-w, cp, inspect --json,
// policy ls --json, settings get, mcp ls --json, stop. No shell interpolation.
export function createSbxAdapter(
  config: OperatorConfig,
): BookingAdapter & { inspectRuntime(signal?: AbortSignal): Promise<unknown> } {
  let stageSignal: AbortSignal | undefined;
  const execute = (
    args: string[],
    signal: AbortSignal | undefined = stageSignal,
    input?: string,
    maxBytes = config.maxOutputBytes,
    milliseconds = config.maxSeconds * 1000,
  ) =>
    boundedProcess(config.sbx, args, { milliseconds, maxBytes, signal, input });
  const checked = async (args: string[]) => {
    const result = await execute(args, undefined, undefined, 1_048_576, 30_000);
    if (result.reason !== "completed" || result.exitCode !== 0)
      throw new Error("Sandbox control command failed.");
    return result.stdout;
  };
  let admitted = false;
  let touched = false;
  let implementation = "";
  let fingerprint = "";
  async function inventory() {
    const version = (await checked(["version"])).trim();
    if (!version.startsWith("sbx version v0.50.0 "))
      throw new Error("Unreviewed sandbox CLI version.");
    const list = JSON.parse(await checked(["ls", "--format", "json"]));
    const inspect = async (name: string, image: string, grader: boolean) => {
      const info = JSON.parse(await checked(["inspect", name, "--json"]));
      if (
        info.image_digest !== image ||
        info.cpus !== 2 ||
        info.memory !== "4g" ||
        info.runtime_mounts?.length !== 0 ||
        info.sessions !== 0 ||
        (!touched && info.state !== "stopped") ||
        (grader && info.auth_mode)
      )
        throw new Error("Sandbox image, mount, resource or session mismatch.");
      const id = list.find((item: { name: string }) => item.name === name)?.id;
      if (typeof id !== "string") throw new Error("Missing sandbox identity.");
      return {
        name,
        id,
        image: info.image_digest,
        cpus: info.cpus,
        memory: info.memory,
        mounts: info.runtime_mounts,
        auth: info.auth_mode ?? null,
        agent: info.agent,
        policy: JSON.parse(await checked(["policy", "ls", name, "--json"])),
      };
    };
    const agent = await inspect(config.agentSandbox, config.agentImage, false);
    const grader = await inspect(
      config.graderSandbox,
      config.graderImage,
      true,
    );
    const ssh = (
      await checked(["settings", "get", "ssh.agentForwardingEnabled"])
    ).trim();
    const browser = (
      await checked(["settings", "get", "browser.enabled"])
    ).trim();
    const mcp = JSON.parse(await checked(["mcp", "ls", "--json"]));
    if (
      ssh !== "false" ||
      browser !== "false" ||
      !Array.isArray(mcp) ||
      mcp.length
    )
      throw new Error("Host integrations invalidate isolation.");
    const script = await readFile(
      fileURLToPath(new URL("../isolation/runtime-files.py", import.meta.url)),
      "utf8",
    );
    const runtime = async (sandbox: string, role: string) =>
      JSON.parse(
        await checked(["exec", sandbox, "python3", "-I", "-c", script, role]),
      ) as Record<string, string>;
    touched = true;
    const agentFiles = await runtime(config.agentSandbox, "agent"),
      graderFiles = await runtime(config.graderSandbox, "grader");
    if (
      agentFiles["/home/agent/.codex/config.toml"] !==
        config.agentConfigSha256 ||
      agentFiles["/usr/local/bin/codex"] !== config.codexBinarySha256 ||
      graderFiles["/opt/forecode-booking/bin/node"] !==
        config.graderNodeSha256 ||
      graderFiles["/opt/forecode-booking/package-lock.json"] !==
        config.graderLockSha256 ||
      graderFiles["node_modules"] !== config.graderModulesSha256
    )
      throw new Error("Guest tooling or agent configuration changed.");
    for (const name of [
      "guest.ts",
      "oracle-driver.ts",
      "oracle.ts",
      "http-oracle.ts",
      "remote-oracles.ts",
      "worker.mjs",
      "client.mjs",
    ]) {
      const local = await readFile(
        fileURLToPath(
          new URL(`../../evaluator/booking-v1/${name}`, import.meta.url),
        ),
      );
      if (
        graderFiles[`/opt/forecode-booking/controller/${name}`] !==
        sha256(local)
      )
        throw new Error("Installed evaluator differs from controller pin.");
    }
    return {
      version,
      agent,
      grader,
      ssh,
      browser,
      mcp,
      agentFiles,
      graderFiles,
    };
  }
  async function assertCurrent() {
    if (!admitted) throw new Error("Runtime admission missing.");
    const current = await inventory();
    if (jsonDigest(current) !== fingerprint)
      throw new Error("Runtime admission missing or configuration drifted.");
    // Evidence/config are reread before every stage, not merely at construction.
    await admitRuntime(config, current, implementation);
  }
  const guestPath = (runId: string) => {
    if (!/^[a-f0-9-]{36}$/.test(runId))
      throw new Error("Invalid controller run identity.");
    return `/home/agent/forecode-booking-${runId}`;
  };
  return {
    kind: "sbx",
    async inspectRuntime(signal) {
      stageSignal = signal;
      return inventory();
    },
    async admit(pin, signal) {
      stageSignal = signal;
      if (!config.enabled)
        throw new Error("Real execution disabled by operator configuration.");
      await reviewIsolation(config, pin);
      const current = await inventory();
      await admitRuntime(config, current, pin);
      implementation = pin;
      fingerprint = jsonDigest(current);
      admitted = true;
    },
    async prepare(runId, localExport, signal) {
      stageSignal = signal;
      await assertCurrent();
      await checked([
        "cp",
        localExport,
        `${config.agentSandbox}:${guestPath(runId)}`,
      ]);
    },
    async agent(runId, signal) {
      stageSignal = signal;
      await assertCurrent();
      // Codex configuration/version/help in the actual guest must be part of
      // reviewed evidence. No credentials, caller prompts or CLI flags accepted.
      return execute(
        [
          "exec",
          "-w",
          guestPath(runId),
          config.agentSandbox,
          "/usr/local/bin/codex",
          "exec",
          "--json",
          "--ephemeral",
          "--skip-git-repo-check",
          "--color",
          "never",
          "-m",
          config.authorizedModel,
          "-C",
          guestPath(runId),
          "-c",
          "features.rollout_budget.enabled=true",
          "-c",
          `features.rollout_budget.limit_tokens=${config.tokenLimit}`,
          "-c",
          "mcp_servers.mcp-gateway.enabled=false",
          "-c",
          "model_providers.sandboxd.request_max_retries=0",
          "-c",
          "model_providers.sandboxd.stream_max_retries=0",
          fixedTask.prompt,
        ],
        signal,
      );
    },
    async collect(runId, signal) {
      stageSignal = signal;
      await assertCurrent();
      const exporter = await readFile(
        fileURLToPath(new URL("./export.py", import.meta.url)),
        "utf8",
      );
      const result = await execute(
        [
          "exec",
          config.agentSandbox,
          "python3",
          "-I",
          "-c",
          exporter,
          guestPath(runId),
          runId,
        ],
        undefined,
        undefined,
        12_000_000,
        30_000,
      );
      if (result.reason !== "completed" || result.exitCode !== 0)
        throw new Error("Candidate export failed.");
      return JSON.parse(result.stdout);
    },
    async grade(input, signal) {
      stageSignal = signal;
      await assertCurrent();
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
        signal,
        JSON.stringify(input),
      );
    },
    async cleanup() {
      stageSignal = undefined;
      // Stopping these dedicated VMs is the reviewed kill switch. Never delete
      // or reconfigure a VM; a failed stop invalidates publication.
      if (admitted || touched)
        await checked(["stop", config.agentSandbox, config.graderSandbox]);
    },
  };
}
