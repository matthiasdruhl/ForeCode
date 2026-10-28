import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sha256 } from "../../../src/lib/report/digests";
import type { OperatorConfig } from "../isolation/config";
import { boundedProcess, type ProcessResult } from "./process";
import { controllerFiles } from "../../evaluator/booking-v1/installed";

export type { GradeInput } from "./protocol";
import type { GradeInput } from "./protocol";
export type BookingAdapter = {
  kind: "sbx" | "synthetic-development";
  admit(implementationSha256: string, signal?: AbortSignal): Promise<void>;
  prepare(
    runId: string,
    localExport: string,
    signal?: AbortSignal,
  ): Promise<void>;
  agent(runId: string, signal: AbortSignal): Promise<ProcessResult>;
  // Trusted adapter operation; never implement by stop → exec/export. Fields
  // describe observations, not agent-authored attestations or independent approval.
  finalizeAgent(
    runId: string,
    signal?: AbortSignal,
  ): Promise<{
    runId: string;
    terminationConfirmed: boolean;
    restartAbsenceConfirmed: boolean;
    exportWithoutGuestExecution: boolean;
    candidate: unknown;
    candidateSha256: string;
  }>;
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
  let touched = false;
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
    for (const name of controllerFiles) {
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
  return {
    kind: "sbx",
    async inspectRuntime(signal) {
      stageSignal = signal;
      return inventory();
    },
    async admit(_pin, signal) {
      stageSignal = signal;
      if (!config.enabled)
        throw new Error("Real execution disabled by operator configuration.");
      throw new Error(
        "Real agent execution disabled pending supervised termination/export acceptance.",
      );
    },
    async prepare() {
      throw new Error("Real agent execution disabled.");
    },
    async agent() {
      throw new Error("Real agent execution disabled.");
    },
    async finalizeAgent() {
      throw new Error("Supervised termination/export acceptance missing.");
    },
    async grade() {
      throw new Error("Use the separate offline acceptance capability.");
    },
    async cleanup() {
      stageSignal = undefined;
      // Inspection starts trusted inventory processes only. Stop is not proof
      // of untrusted-process termination; real agent operations remain absent.
      if (touched)
        await checked(["stop", config.agentSandbox, config.graderSandbox]);
    },
  };
}
