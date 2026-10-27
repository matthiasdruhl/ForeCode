// Owner maintenance capability only; never an acceptance review or provisioning.
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sha256, jsonDigest } from "../../../src/lib/report/digests";
import { disjoint, privateDirectory, protectedRead } from "../artifacts/files";
import { acquireBookingLease } from "../runner/lease";
import { boundedProcess } from "../runner/process";
import { collectOfflineInventory, InventorySchema } from "./offline-inventory";
import { OfflineConfigSchema } from "./offline-config";
import { offlineConfigurationDigest } from "./offline-gate";
import { verifyToolchainArtifact } from "./toolchain";

const SmokeSchema = z.strictObject({
  schemaVersion: z.literal("booking-installed-smoke.v1"),
  platform: z.literal("linux"),
  architecture: z.enum(["arm64", "x64"]),
  nodeVersion: z.literal("v22.23.4"),
  nodeExecutable: z.literal("/opt/forecode-booking/bin/node"),
  dependencies: z.record(z.string(), z.string()),
  esbuildVersion: z.string(),
  swcTarget: z.string(),
  smoke: z.strictObject({
    esm: z.literal(true),
    serverOnly: z.literal(true),
    typescript: z.literal(true),
    tsx: z.literal(true),
    esbuild: z.literal(true),
    nextNative: z.literal(true),
    nextCli: z.literal(true),
  }),
});
export function validateInstalledSmoke(
  raw: unknown,
  audit: {
    architecture: string;
    nodeVersion: string;
    dependencies: Record<string, string>;
    esbuildVersion: string;
    swcTarget: string;
  },
) {
  const envelope = z
    .strictObject({
      guestMachine: z.enum(["aarch64", "x86_64"]),
      reason: z.literal("completed"),
      exitCode: z.literal(0),
      stdout: z.string().max(65536),
      stderr: z.string().max(65536),
    })
    .parse(raw);
  if (
    envelope.guestMachine !==
    (audit.architecture === "arm64" ? "aarch64" : "x86_64")
  )
    throw new Error("Guest kernel architecture mismatch");
  const smoke = SmokeSchema.parse(JSON.parse(envelope.stdout));
  for (const key of [
    "architecture",
    "nodeVersion",
    "dependencies",
    "esbuildVersion",
    "swcTarget",
  ] as const)
    if (jsonDigest(smoke[key]) !== jsonDigest(audit[key]))
      throw new Error("Installed smoke differs from reviewed tooling");
  return smoke;
}

export async function observeInstalledGrader(
  artifactRoot: string,
  configFile: string,
  destination: string,
  userSignal: AbortSignal,
) {
  const artifact = await verifyToolchainArtifact(artifactRoot);
  const pins = await freezeBooking();
  if (pins.evaluatorSha256 !== artifact.request.implementationSha256)
    throw new Error("Maintenance implementation changed");
  const helperHashes = [
    "runtime-files.py",
    "installed-smoke.py",
    "vm-resources.py",
  ].map(
    (name) =>
      pins.evaluatorManifest.find(
        (file) => file.path === `scripts/experiments/isolation/${name}`,
      )?.sha256,
  );
  const configBytes = await protectedRead(configFile);
  const config = OfflineConfigSchema.parse(JSON.parse(configBytes.toString()));
  // Bootstrap is deliberately separate from an acceptance review. Authority to
  // start/stop this dedicated VM must already exist outside this JSON/command.
  if (config.acceptanceEnabled || config.enabled !== false)
    throw new Error("Maintenance requires acceptance disabled");
  if (
    !(
      config.workerImage === artifact.image.id ||
      artifact.image.repoDigests.includes(config.workerImage)
    ) ||
    config.graderNodeSha256 !== artifact.audit.nodeSha256 ||
    config.graderLockSha256 !== artifact.audit.lockSha256 ||
    config.graderModulesSha256 !== artifact.audit.modulesSha256
  )
    throw new Error("Maintenance tooling proposal mismatch");
  if (!path.isAbsolute(destination))
    throw new Error("New private absolute output required");
  await privateDirectory(path.dirname(destination));
  const project = fileURLToPath(new URL("../../../", import.meta.url));
  for (const root of [
    project,
    path.resolve(project, "../AgentHarness-Planning"),
    artifactRoot,
    config.coordinationRoot,
    config.scratchRoot,
  ])
    disjoint(destination, root);
  disjoint(destination, configFile);
  disjoint(config.coordinationRoot, project);
  disjoint(
    config.coordinationRoot,
    path.resolve(project, "../AgentHarness-Planning"),
  );
  const lease = await acquireBookingLease(
    config.coordinationRoot,
    randomUUID(),
  );
  try {
    await mkdir(destination, { mode: 0o700 }); // Never overwrite old observations.
  } catch (error) {
    await lease.release();
    throw error;
  }
  const startedAt = new Date().toISOString();
  const signal = AbortSignal.any([userSignal, AbortSignal.timeout(180_000)]);
  let touched = false,
    stopped = false,
    failure: string | null = null;
  let inventory: z.infer<typeof InventorySchema> | null = null;
  let smoke: z.infer<typeof SmokeSchema> | null = null;
  const commands: unknown[] = [];
  const stable = async () => {
    await lease.assertOwned();
    if (!(await protectedRead(configFile)).equals(configBytes))
      throw new Error("Maintenance configuration changed");
    if (sha256(await readFile(config.sbx)) !== config.sbxSha256)
      throw new Error("Sandbox CLI changed");
  };
  const exec = async (args: string[], commandSignal = signal) => {
    await stable();
    const pythonIndex = args.indexOf("python3");
    if (
      args[0] === "exec" &&
      pythonIndex !== -1 &&
      (args[pythonIndex + 1] !== "-I" ||
        args[pythonIndex + 2] !== "-c" ||
        !helperHashes.includes(sha256(args[pythonIndex + 3] ?? "")))
    )
      throw new Error("Unreviewed guest helper bytes");
    const result = await boundedProcess(config.sbx, args, {
      milliseconds: 35_000,
      maxBytes: config.maxOutputBytes,
      signal: commandSignal,
    });
    const command = { executable: config.sbx, args, ...result };
    // Keep exact bounded raw diagnostics privately, including failed commands.
    const name = `command-${commands.length + 1}.json`;
    await writeFile(
      path.join(destination, name),
      JSON.stringify(command, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    commands.push({
      file: name,
      sha256: jsonDigest(command),
      reason: result.reason,
      exitCode: result.exitCode,
    });
    if (result.reason !== "completed" || result.exitCode !== 0 || result.signal)
      throw new Error("Installed observation command failed");
    return result.stdout;
  };
  try {
    signal.throwIfAborted();
    // collectOfflineInventory hashes installed Node/modules/controllers/modes
    // and compares them with reviewed pins BEFORE any installed smoke executes.
    inventory = InventorySchema.parse(
      await collectOfflineInventory(config, exec, signal, true, () => {
        touched = true;
      }),
    );
    if (inventory.worker.architecture !== artifact.image.architecture)
      throw new Error("Installed architecture mismatch");
    await verifyToolchainArtifact(artifactRoot);
    const launcher = await protectedRead(
      fileURLToPath(new URL("./installed-smoke.py", import.meta.url)),
    );
    const observed = await exec(
      [
        "exec",
        config.graderSandbox,
        "python3",
        "-I",
        "-c",
        launcher.toString(),
      ],
      signal,
    );
    smoke = validateInstalledSmoke(JSON.parse(observed), artifact.audit);
    const after = InventorySchema.parse(
      await collectOfflineInventory(config, exec, signal, false, () => {
        touched = true;
      }),
    );
    if (jsonDigest(inventory) !== jsonDigest(after))
      throw new Error("Installed runtime changed during smoke");
    await verifyToolchainArtifact(artifactRoot);
    await stable();
  } catch {
    failure =
      "Installed observations incomplete or changed; inspect private command records. No acceptance authority.";
  } finally {
    if (touched) {
      try {
        // Independent cleanup budget; a killed sbx client is not termination.
        const cleanupSignal = AbortSignal.timeout(45_000);
        await exec(["stop", config.graderSandbox], cleanupSignal);
        const state = JSON.parse(
          await exec(
            ["inspect", config.graderSandbox, "--json"],
            cleanupSignal,
          ),
        );
        if (
          state.state !== "stopped" ||
          state.image_digest !== config.graderImage
        )
          throw new Error("Maintenance stop unconfirmed");
        stopped = true;
      } catch {
        failure =
          "Guest termination unconfirmed; lease retained for owner recovery. No inventory publication.";
      }
    }
  }
  if (!failure) {
    try {
      signal.throwIfAborted();
      await stable();
      await verifyToolchainArtifact(artifactRoot);
      signal.throwIfAborted();
    } catch {
      failure =
        "Maintenance inputs changed or interrupted before inventory publication.";
    }
  }
  const completed = !failure && stopped && inventory && smoke;
  if (completed) {
    await writeFile(
      path.join(destination, "inventory.json"),
      JSON.stringify(inventory, null, 2),
      { flag: "wx", mode: 0o600 },
    );
  }
  const record = {
    schemaVersion: "booking-installed-observation.v1",
    status: completed ? "OBSERVED" : "FAILED",
    authority: "NONE_REQUIRES_INDEPENDENT_OWNER_REVIEW",
    startedAt,
    endedAt: new Date().toISOString(),
    implementationSha256: artifact.request.implementationSha256,
    configurationSha256: offlineConfigurationDigest(config),
    requestSha256: artifact.requestSha256,
    archive: artifact.archive,
    image: artifact.image,
    inventorySha256: completed ? jsonDigest(inventory) : null,
    smoke: completed ? smoke : null,
    commands,
    guestTouched: touched,
    stopped,
    leaseRetained: touched && !stopped,
    configuredVmLimits: { diskBytes: config.vmDiskBytes, pids: config.vmPids },
    observedVmEnforcement:
      completed && inventory ? inventory.vmResources : null,
    lifecycleAcceptance: "NOT_RUN",
    bookingAcceptance: "NOT_RUN",
    inference: "NOT_RUN",
    realAgentExecution: "DISABLED",
    metrics: { tokens: null, costUsd: null, iterations: null },
    failure,
  };
  await writeFile(
    path.join(destination, "observation.json"),
    JSON.stringify(record, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  if (!touched || stopped) await lease.release();
  return record;
}
