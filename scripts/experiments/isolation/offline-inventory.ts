// Fixed inventory shared by owner maintenance and independently admitted acceptance.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sha256 } from "../../../src/lib/report/digests";
import { verifyInstalledGrader } from "./installed-grader";
import type { OfflineConfig } from "./offline-config";
export type InventoryExec = (
  args: string[],
  signal?: AbortSignal,
) => Promise<string>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const InventorySchema = z.strictObject({
  version: z.string().startsWith("sbx version v0.50.0 "),
  sbxSha256: hash,
  id: z.string().min(1),
  image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  cpus: z.literal(2),
  memory: z.literal("4g"),
  mounts: z.array(z.unknown()).length(0),
  auth: z.null(),
  policy: z.unknown(),
  ssh: z.literal("false"),
  browser: z.literal("false"),
  mcp: z.array(z.unknown()).length(0),
  files: z.record(z.string(), hash),
  worker: z.strictObject({
    id: z.string(),
    repoDigests: z.array(z.string()),
    os: z.literal("linux"),
    architecture: z.enum(["arm64", "amd64"]),
  }),
  reviewedLimits: z.strictObject({
    vmDiskBytes: z.number().int().positive(),
    vmPids: z.number().int().positive(),
  }),
});

export async function collectOfflineInventory(
  config: OfflineConfig,
  exec: InventoryExec,
  signal: AbortSignal,
  initiallyStopped: boolean,
  touch: () => void,
) {
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
  touch();
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
