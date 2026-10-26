// Offline capability has no agent/provider methods or imports. Grader VM only.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sha256, jsonDigest } from "../../../src/lib/report/digests";
import { controllerFiles } from "../../evaluator/booking-v1/installed";
import { admitOffline, reviewOffline } from "../isolation/offline-gate";
import type { OfflineConfig } from "../isolation/offline-config";
import type { GradeInput } from "./protocol";
import { boundedProcess, type ProcessResult } from "./process";
export type OfflineAdapter = {
  kind: "sbx-offline" | "synthetic-development";
  admit(implementation: string, signal: AbortSignal): Promise<unknown>;
  grade(input: GradeInput, signal: AbortSignal): Promise<ProcessResult>;
  cleanup(runIds: readonly string[]): Promise<unknown>;
  observations(): unknown;
};
export async function verifyInstalledGrader(
  files: Record<string, string>,
  images: {
    Id?: string;
    RepoDigests?: string[];
    Os?: string;
    Architecture?: string;
  }[],
  config: OfflineConfig,
) {
  for (const [name, expected] of [
    ["/opt/forecode-booking/bin/node", config.graderNodeSha256],
    ["/opt/forecode-booking/package-lock.json", config.graderLockSha256],
    ["node_modules", config.graderModulesSha256],
  ])
    if (files[name!] !== expected)
      throw new Error("Installed toolchain tampering");
  const localPackage = await readFile(
    fileURLToPath(
      new URL(
        "../../evaluator/booking-v1/toolchain/package.json",
        import.meta.url,
      ),
    ),
  );
  if (files["/opt/forecode-booking/package.json"] !== sha256(localPackage))
    throw new Error("Installed module resolution changed");
  for (const name of controllerFiles) {
    const local = await readFile(
      fileURLToPath(
        new URL(`../../evaluator/booking-v1/${name}`, import.meta.url),
      ),
    );
    if (files[`/opt/forecode-booking/controller/${name}`] !== sha256(local))
      throw new Error("Installed controller tampering");
  }
  const image = images[0];
  if (
    !image ||
    (image.Id !== config.workerImage &&
      !image.RepoDigests?.includes(config.workerImage))
  )
    throw new Error("Installed worker image mismatch");
  return image;
}
export function createOfflineSbxAdapter(config: OfflineConfig): OfflineAdapter {
  let touched = false,
    implementation = "",
    fingerprint = "";
  const observed: (ProcessResult & {
    commandSha256: string;
    operation: string;
  })[] = [];
  const exec = async (args: string[], signal?: AbortSignal, input?: string) => {
    const result = await boundedProcess(config.sbx, args, {
      milliseconds: input ? 590_000 : 15_000,
      maxBytes: config.maxOutputBytes,
      input,
      signal,
    });
    observed.push({
      ...result,
      commandSha256: jsonDigest(args),
      operation: args[0]!,
      stdout: sha256(result.stdout),
      stderr: sha256(result.stderr),
    });
    if (result.reason !== "completed" || result.exitCode !== 0)
      throw new Error("Offline sandbox command failed");
    return result.stdout;
  };
  const node = (script: string, args: string[] = []) => [
    "exec",
    config.graderSandbox,
    "/opt/forecode-booking/bin/node",
    `/opt/forecode-booking/controller/${script}`,
    ...args,
  ];
  async function inventory(signal: AbortSignal, initiallyStopped: boolean) {
    if (sha256(await readFile(config.sbx)) !== config.sbxSha256)
      throw new Error("Sandbox CLI bytes changed");
    const version = (await exec(["version"], signal)).trim();
    if (!version.startsWith("sbx version v0.50.0 "))
      throw new Error("Unreviewed sbx version");
    const info = JSON.parse(
      await exec(["inspect", config.graderSandbox, "--json"], signal),
    );
    if (
      info.runtime_mounts?.length !== 0 ||
      info.sessions !== 0 ||
      info.auth_mode ||
      info.cpus !== 2 ||
      info.memory !== "4g" ||
      info.image_digest !== config.graderImage ||
      (initiallyStopped && info.state !== "stopped")
    )
      throw new Error("Offline grader inventory mismatch");
    const list = JSON.parse(await exec(["ls", "--format", "json"], signal));
    const id = list.find(
      (v: { name: string }) => v.name === config.graderSandbox,
    )?.id;
    if (typeof id !== "string") throw new Error("Missing VM identity");
    const policy = JSON.parse(
      await exec(["policy", "ls", config.graderSandbox, "--json"], signal),
    );
    const ssh = (
      await exec(["settings", "get", "ssh.agentForwardingEnabled"], signal)
    ).trim();
    const browser = (
      await exec(["settings", "get", "browser.enabled"], signal)
    ).trim();
    const mcp = JSON.parse(await exec(["mcp", "ls", "--json"], signal));
    if (
      ssh !== "false" ||
      browser !== "false" ||
      !Array.isArray(mcp) ||
      mcp.length
    )
      throw new Error("Host integrations enabled");
    const script = await readFile(
      fileURLToPath(new URL("../isolation/runtime-files.py", import.meta.url)),
      "utf8",
    );
    touched = true;
    const files = JSON.parse(
      await exec(
        [
          "exec",
          config.graderSandbox,
          "python3",
          "-I",
          "-c",
          script,
          "grader",
          config.graderNodeSha256,
        ],
        signal,
      ),
    );
    const images = JSON.parse(
      await exec(
        [
          "exec",
          config.graderSandbox,
          "docker",
          "image",
          "inspect",
          config.workerImage,
        ],
        signal,
      ),
    );
    const image = await verifyInstalledGrader(files, images, config);
    return {
      version,
      sbxSha256: config.sbxSha256,
      id,
      image: info.image_digest,
      cpus: info.cpus,
      memory: info.memory,
      mounts: info.runtime_mounts,
      auth: info.auth_mode ?? null,
      policy,
      ssh,
      browser,
      mcp,
      files,
      worker: {
        id: image.Id,
        repoDigests: image.RepoDigests ?? [],
        os: image.Os,
        architecture: image.Architecture,
      },
      reviewedLimits: {
        vmDiskBytes: config.vmDiskBytes,
        vmPids: config.vmPids,
      },
    };
  }
  async function current(signal: AbortSignal) {
    if (!fingerprint) throw new Error("Offline admission missing");
    const result = await inventory(signal, false);
    await admitOffline(config, result, implementation);
    if (jsonDigest(result) !== fingerprint)
      throw new Error("Offline runtime drift");
  }
  return {
    kind: "sbx-offline",
    observations: () => structuredClone(observed),
    async admit(pin, signal) {
      await reviewOffline(config, pin); // Before any sandbox command/start.
      implementation = pin;
      const result = await inventory(signal, true);
      await admitOffline(config, result, pin);
      fingerprint = jsonDigest(result);
      return result;
    },
    async grade(input, signal) {
      await current(signal);
      return boundedProcess(
        config.sbx,
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
        {
          milliseconds: 590_000,
          maxBytes: config.maxOutputBytes,
          signal,
          input: JSON.stringify(input),
        },
      );
    },
    async cleanup(runIds) {
      if (!touched) return { touched: false, observations: observed };
      // Fresh independent cleanup budget. A killed exec does not imply a killed
      // guest controller/container. Remove only exact run labels, then restart
      // and verify absence; a VM stop alone never grants publication.
      const deadline = AbortSignal.timeout(60_000);
      try {
        // Recheck installed controller/toolchain custody before executing recovery.
        // If admission failed before any grade, only stop the VM we started.
        if (runIds.length) await current(deadline);
        for (const runId of runIds) {
          if (!/^[a-f0-9-]{36}$/.test(runId))
            throw new Error("Invalid cleanup run");
          await exec(node("lifecycle.mjs", ["cleanup", runId]), deadline);
        }
        await exec(["stop", config.graderSandbox], deadline);
        for (const runId of runIds) {
          const result = JSON.parse(
            await exec(node("lifecycle.mjs", ["cleanup", runId]), deadline),
          );
          if (result.removed !== 0 || result.remaining !== 0)
            throw new Error("Workers resumed after stop");
        }
        await exec(["stop", config.graderSandbox], deadline);
        const state = JSON.parse(
          await exec(["inspect", config.graderSandbox, "--json"], deadline),
        );
        if (state.state !== "stopped")
          throw new Error("Grader stop unconfirmed");
      } finally {
        // Even if narrow cleanup fails, attempt the VM stop; retain the lease.
        await exec(["stop", config.graderSandbox], deadline);
      }
      return { touched: true, restartChecked: true, observations: observed };
    },
  };
}
