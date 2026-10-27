// Offline capability has no agent/provider methods or imports. Grader VM only.
import { sha256, jsonDigest } from "../../../src/lib/report/digests";
import { collectOfflineInventory } from "../isolation/offline-inventory";
export { verifyInstalledGrader } from "../isolation/installed-grader";
import { admitOffline, reviewOffline } from "../isolation/offline-gate";
import type { OfflineConfig } from "../isolation/offline-config";
import {
  validateRestartObservation,
  type LifecycleRequest,
} from "./lifecycle-protocol";
import type { GradeInput } from "./protocol";
import { boundedProcess, type ProcessResult } from "./process";
export type OfflineAdapter = {
  kind: "sbx-offline" | "synthetic-development";
  admit(implementation: string, signal: AbortSignal): Promise<unknown>;
  grade(input: GradeInput, signal: AbortSignal): Promise<ProcessResult>;
  probe(input: LifecycleRequest, signal: AbortSignal): Promise<ProcessResult>;
  cleanup(runIds: readonly string[]): Promise<unknown>;
  observations(): unknown;
};
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
  async function current(signal: AbortSignal) {
    if (!fingerprint) throw new Error("Offline admission missing");
    const result = await collectOfflineInventory(
      config,
      exec,
      signal,
      false,
      () => {
        touched = true;
      },
    );
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
      const result = await collectOfflineInventory(
        config,
        exec,
        signal,
        true,
        () => {
          touched = true;
        },
      );
      await admitOffline(config, result, pin);
      fingerprint = jsonDigest(result);
      return result;
    },
    async probe(input, signal) {
      await current(signal);
      if (
        input.implementationSha256 !== implementation ||
        input.workerImage !== config.workerImage
      )
        throw new Error("Lifecycle runtime mismatch");
      return boundedProcess(
        config.sbx,
        [
          "exec",
          "-i",
          config.graderSandbox,
          "/opt/forecode-booking/bin/node",
          "/opt/forecode-booking/controller/lifecycle-probes.mjs",
        ],
        {
          milliseconds: 95_000,
          maxBytes: config.maxOutputBytes,
          signal,
          input: JSON.stringify(input),
        },
      );
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
      const absentRunIds: string[] = [];
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
          validateRestartObservation(result, runId);
          absentRunIds.push(runId);
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
      return {
        touched: true,
        restartChecked: true,
        absentRunIds,
        observations: observed,
      };
    },
  };
}
