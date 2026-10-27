import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile, access, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prepareRuntimeBundle, runtimeBundleInputs } from "./bundle";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { protectedRead, disjoint, privateDirectory } from "../artifacts/files";
import { sha256, jsonDigest } from "../../../src/lib/report/digests";
import { boundedProcess, type ProcessResult } from "../runner/process";
import { largeFileIdentity, verifyToolingContext } from "./toolchain-files";
const project = fileURLToPath(new URL("../../../", import.meta.url));
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  imageId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const ToolchainAuditSchema = z.strictObject({
  schemaVersion: z.literal("booking-toolchain-audit.v1"),
  platform: z.literal("linux"),
  architecture: z.enum(["arm64", "x64"]),
  nodeVersion: z.literal("v22.23.4"),
  nodeSha256: hash,
  lockSha256: hash,
  packageSha256: hash,
  modulesSha256: hash,
  dependencies: z.record(z.string(), z.string()),
  native: z.record(z.string(), hash).refine((v) => Object.keys(v).length > 0),
  esbuildVersion: z.string(),
  swcTarget: z.string().includes("linux"),
  smoke: z.strictObject({
    typescript: z.literal(true),
    tsx: z.literal(true),
    esbuild: z.literal(true),
    nextNative: z.literal(true),
    nextCli: z.literal(true),
  }),
  inventoriedFiles: z.number().int().positive().max(25000),
  inventoriedBytes: z
    .number()
    .int()
    .positive()
    .max(1024 ** 3),
});
export function assertAuditContainer(raw: unknown, id: string, runId: string) {
  const info = z
    .object({
      Image: z.literal(id),
      State: z.object({ Running: z.literal(false), ExitCode: z.literal(0) }),
      Config: z.object({
        User: z.literal("65534:65534"),
        Labels: z.record(z.string(), z.string()),
      }),
      HostConfig: z.object({
        NetworkMode: z.literal("none"),
        ReadonlyRootfs: z.literal(true),
        Memory: z.literal(768 * 1024 ** 2),
        MemorySwap: z.literal(768 * 1024 ** 2),
        NanoCpus: z.literal(1_000_000_000),
        PidsLimit: z.literal(64),
        CapDrop: z.array(z.string()),
        SecurityOpt: z.array(z.string()),
        LogConfig: z.object({ Type: z.literal("none") }),
      }),
      Mounts: z.array(z.object({ Type: z.literal("tmpfs") })),
    })
    .parse(raw);
  if (
    info.Config.Labels["forecode.toolchain.run"] !== runId ||
    !info.HostConfig.CapDrop.includes("ALL") ||
    !info.HostConfig.SecurityOpt.includes("no-new-privileges:true")
  )
    throw new Error("Tooling audit ownership/capability mismatch");
  return info.HostConfig;
}
export type ToolchainDriver = {
  kind: "docker" | "synthetic-development";
  executableSha256: string;
  buildxSha256: string;
  run(
    args: string[],
    milliseconds: number,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<ProcessResult>;
};
export async function localDockerDriver(): Promise<ToolchainDriver> {
  let executable: string | undefined;
  for (const candidate of [
    path.join(homedir(), ".docker/bin/docker"),
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
  ]) {
    try {
      await access(candidate);
      executable = await realpath(candidate);
      break;
    } catch {
      /* next fixed installed location */
    }
  }
  if (!executable) throw new Error("Reviewed local Docker CLI missing");
  const pin = await largeFileIdentity(executable, 256 * 1024 ** 2);
  const endpoint = await boundedProcess(
    executable,
    [
      "context",
      "inspect",
      "desktop-linux",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ],
    { milliseconds: 15000, maxBytes: 8192 },
  );
  if (
    endpoint.reason !== "completed" ||
    endpoint.exitCode !== 0 ||
    JSON.parse(endpoint.stdout) !==
      `unix://${path.join(homedir(), ".docker/run/docker.sock")}`
  )
    throw new Error("Reviewed local Docker Desktop endpoint missing");
  const plugins = await boundedProcess(
    executable,
    [
      "--context",
      "desktop-linux",
      "info",
      "--format",
      "{{json .ClientInfo.Plugins}}",
    ],
    { milliseconds: 15000, maxBytes: 1_048_576 },
  );
  if (plugins.reason !== "completed" || plugins.exitCode !== 0)
    throw new Error("Docker plugin inventory failed");
  const buildxPath = await realpath(
    z
      .string()
      .parse(
        JSON.parse(plugins.stdout).find(
          (p: { Name: string }) => p.Name === "buildx",
        )?.Path,
      ),
  );
  const buildxPin = await largeFileIdentity(buildxPath, 256 * 1024 ** 2);
  return {
    kind: "docker",
    executableSha256: pin.sha256,
    buildxSha256: buildxPin.sha256,
    async run(args, milliseconds, maxBytes, signal) {
      if (
        (await largeFileIdentity(executable!, 256 * 1024 ** 2)).sha256 !==
        pin.sha256
      )
        throw new Error("Docker CLI bytes changed");
      if (
        (await largeFileIdentity(buildxPath, 256 * 1024 ** 2)).sha256 !==
        buildxPin.sha256
      )
        throw new Error("Buildx bytes changed");
      return boundedProcess(
        executable!,
        ["--context", "desktop-linux", ...args],
        { milliseconds, maxBytes, signal },
      );
    },
  };
}
export async function prepareToolchain(destination: string) {
  if (!path.isAbsolute(destination))
    throw new Error("Canonical new output required");
  disjoint(destination, project);
  disjoint(destination, path.resolve(project, "../AgentHarness-Planning"));
  if (path.dirname(destination) !== (await realpath(path.dirname(destination))))
    throw new Error("Canonical new output required");
  await mkdir(destination, { mode: 0o700 });
  const runtime = await prepareRuntimeBundle(path.join(destination, "runtime"));
  const request = {
    schemaVersion: "booking-toolchain-request.v1",
    createdAt: new Date().toISOString(),
    runId: randomUUID(),
    scope: "trusted-tooling-only-no-inference",
    implementationSha256: runtime.implementationSha256,
    contextSha256: jsonDigest(
      runtime.files.filter((f) => f.path.startsWith("toolchain/")),
    ),
    runtimeManifestSha256: sha256(
      await protectedRead(path.join(destination, "runtime/manifest.json")),
    ),
    limits: {
      buildSeconds: 600,
      buildMemoryBytes: 2 * 1024 ** 3,
      buildCpuQuota: 100000,
      auditSeconds: 120,
      auditMemoryBytes: 768 * 1024 ** 2,
      auditPids: 64,
      auditTmpBytes: 32 * 1024 ** 2,
      outputBytes: 1_048_576,
      archiveBytes: 2 * 1024 ** 3,
    },
    status: "PREPARED",
    installationStatus: "NOT_INSTALLED",
    bookingAcceptance: "NOT_RUN",
    inference: "NOT_RUN",
  };
  await writeFile(
    path.join(destination, "request.json"),
    JSON.stringify(request, null, 2),
    { flag: "wx", mode: 0o400 },
  );
  return { request, runtime };
}
export async function buildToolchain(
  destination: string,
  driver: ToolchainDriver,
  signal: AbortSignal,
) {
  const started = Date.now();
  const { request, runtime } = await prepareToolchain(destination);
  const context = path.join(destination, "runtime/toolchain"),
    name = `forecode-toolchain-${request.runId}`;
  const tag = `forecode-booking-toolchain:tooling-${request.runId}`;
  const observations: unknown[] = [];
  let stage = "inventory",
    failure: string | null = null,
    buildFinished = false,
    auditAttempted = false,
    cleanupConfirmed = false;
  let image: {
    id: string;
    os: string;
    architecture: string;
    repoDigests: string[];
    layers: string[];
  } | null = null;
  let audit: z.infer<typeof ToolchainAuditSchema> | null = null;
  let archive: Awaited<ReturnType<typeof largeFileIdentity>> | null = null;
  let tooling: unknown = null;
  const run = async (
    args: string[],
    milliseconds = 15000,
    activeSignal: AbortSignal | undefined = signal,
  ) => {
    const result = await driver.run(
      args,
      milliseconds,
      request.limits.outputBytes,
      activeSignal,
    );
    observations.push({
      commandSha256: jsonDigest(args),
      operation: args[0],
      ...result,
      stdout: sha256(result.stdout),
      stderr: sha256(result.stderr),
    });
    const index = observations.length;
    await writeFile(
      path.join(destination, `command-${index}.json`),
      JSON.stringify(result),
      { flag: "wx", mode: 0o400 },
    );
    if (result.reason !== "completed" || result.exitCode !== 0)
      throw new Error("Trusted tooling command failed");
    return result.stdout;
  };
  async function cleanup() {
    if (!auditAttempted) {
      cleanupConfirmed = true;
      return;
    }
    const cleanupSignal = AbortSignal.timeout(30000);
    const items = JSON.parse(
      await run(["container", "inspect", name], 10000, cleanupSignal),
    );
    if (items[0]?.Config?.Labels?.["forecode.toolchain.run"] !== request.runId)
      throw new Error("Audit container ownership mismatch");
    await run(["container", "rm", "--force", name], 10000, cleanupSignal);
    const remaining = await run(
      [
        "container",
        "ls",
        "--all",
        "--quiet",
        "--filter",
        `label=forecode.toolchain.run=${request.runId}`,
      ],
      10000,
      cleanupSignal,
    );
    if (remaining.trim())
      throw new Error("Audit container termination unconfirmed");
    cleanupConfirmed = true;
  }
  try {
    signal.throwIfAborted();
    await verifyToolingContext(context, runtime.files);
    const version = JSON.parse(
      await run(["version", "--format", "{{json .}}"]),
    );
    const builder = await run(["buildx", "inspect", "desktop-linux"]);
    if (
      !/Driver:\s+docker\b/.test(builder) ||
      !/Endpoint:\s+desktop-linux\b/.test(builder)
    )
      throw new Error("Unreviewed remote builder");
    const buildxVersion = (await run(["buildx", "version"])).trim();
    tooling = {
      clientVersion: version.Client?.Version,
      serverVersion: version.Server?.Version,
      buildxVersion,
      builderSha256: sha256(builder),
      dockerBinarySha256: driver.executableSha256,
      buildxBinarySha256: driver.buildxSha256,
    };
    stage = "build";
    await run(
      [
        "buildx",
        "build",
        "--builder",
        "desktop-linux",
        "--progress",
        "plain",
        "--load",
        "--resource",
        "memory=2g",
        "--resource",
        "cpu-quota=100000",
        "--iidfile",
        path.join(destination, "image.id"),
        "--metadata-file",
        path.join(destination, "build-metadata.json"),
        "--label",
        `forecode.toolchain.run=${request.runId}`,
        "--tag",
        tag,
        context,
      ],
      600000,
    );
    buildFinished = true;
    await verifyToolingContext(context, runtime.files);
    if (
      (await freezeBooking()).evaluatorSha256 !== runtime.implementationSha256
    )
      throw new Error("Implementation changed during tooling build");
    const id = imageId.parse(
      (await protectedRead(path.join(destination, "image.id")))
        .toString()
        .trim(),
    );
    const installed = JSON.parse(await run(["image", "inspect", id]))[0];
    z.number()
      .int()
      .positive()
      .max(request.limits.archiveBytes - 16 * 1024 ** 2)
      .parse(installed?.Size);
    if (
      installed?.Id !== id ||
      installed.Os !== "linux" ||
      !["arm64", "amd64"].includes(installed.Architecture) ||
      installed.Config?.Labels?.["forecode.toolchain.run"] !== request.runId
    )
      throw new Error("Built image identity mismatch");
    image = {
      id,
      os: installed.Os,
      architecture: installed.Architecture,
      repoDigests: installed.RepoDigests ?? [],
      layers: installed.RootFS?.Layers ?? [],
    };
    stage = "audit";
    const auditPath = fileURLToPath(
      new URL("./toolchain-audit.mjs", import.meta.url),
    );
    const script = await protectedRead(auditPath);
    if (
      sha256(script) !==
      runtime.files.find((f) => f.path === "toolchain-audit.mjs")?.sha256
    )
      throw new Error("Tooling audit script not bound to bundle");
    auditAttempted = true;
    await run(
      [
        "container",
        "create",
        "--name",
        name,
        "--label",
        `forecode.toolchain.run=${request.runId}`,
        "--pull",
        "never",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--user",
        "65534:65534",
        "--cpus",
        "1",
        "--memory",
        "768m",
        "--memory-swap",
        "768m",
        "--pids-limit",
        "64",
        "--ulimit",
        "nofile=256:256",
        "--log-driver",
        "none",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=32m,mode=1777",
        "--entrypoint",
        "/usr/local/bin/node",
        id,
        "--conditions=react-server",
        "--import",
        "/toolchain/node_modules/tsx/dist/loader.mjs",
        "--input-type=module",
        "--eval",
        script.toString(),
        "forecode-toolchain-audit",
      ],
      15000,
    );
    audit = ToolchainAuditSchema.parse(
      JSON.parse(await run(["container", "start", "--attach", name], 120000)),
    );
    const deps = JSON.parse(
      (await protectedRead(path.join(context, "package.json"))).toString(),
    ).dependencies;
    if (
      audit.lockSha256 !==
        runtime.files.find((f) => f.path === "toolchain/package-lock.json")
          ?.sha256 ||
      audit.packageSha256 !==
        runtime.files.find((f) => f.path === "toolchain/package.json")
          ?.sha256 ||
      jsonDigest(audit.dependencies) !== jsonDigest(deps) ||
      audit.architecture !== (image.architecture === "amd64" ? "x64" : "arm64")
    )
      throw new Error(
        "Installed tooling does not bind exact dependency inputs",
      );
    const container = JSON.parse(await run(["container", "inspect", name]))[0];
    assertAuditContainer(container, id, request.runId);
    stage = "cleanup";
    await cleanup();
    stage = "export";
    await run(
      [
        "image",
        "save",
        "--output",
        path.join(destination, "toolchain-image.tar"),
        id,
      ],
      120000,
    );
    await chmod(path.join(destination, "toolchain-image.tar"), 0o400);
    archive = await largeFileIdentity(
      path.join(destination, "toolchain-image.tar"),
    );
    await verifyToolingContext(context, runtime.files);
    if (
      (await freezeBooking()).evaluatorSha256 !== runtime.implementationSha256
    )
      throw new Error("Implementation changed during tooling preparation");
    signal.throwIfAborted();
    stage = "completed";
  } catch {
    failure =
      "Toolchain build/audit/export failed; inspect private bounded command observations. No installation or acceptance is granted.";
  } finally {
    if (!cleanupConfirmed) {
      try {
        await cleanup();
      } catch {
        failure =
          "Owned tooling-container termination unconfirmed; publication forbidden.";
      }
    }
  }
  const record = {
    schemaVersion: "booking-toolchain-preparation.v1",
    finishedAt: new Date().toISOString(),
    metrics: {
      elapsedMs: Date.now() - started,
      tokens: null,
      costUsd: null,
      iterations: null,
    },
    request,
    stage,
    status: failure ? "failed" : "built",
    driver: driver.kind,
    tooling,
    image,
    audit,
    archive,
    cleanupConfirmed,
    buildFinished,
    failure,
    observations,
    limitations: [
      "Trusted tooling preparation only; no sbx installation, booking/candidate execution, agent trial, inference or certificate.",
      "Builder disk/process hard caps and cancellation of a failed backend build are not established by client exit; a failed build grants no artifact admission.",
      ...(driver.kind === "synthetic-development"
        ? [
            "SYNTHETIC DEVELOPMENT observations, not installed runtime evidence.",
          ]
        : []),
    ],
  };
  await writeFile(
    path.join(destination, "toolchain.json"),
    JSON.stringify(record, null, 2),
    { flag: "wx", mode: 0o400 },
  );
  return record;
}

// Read-only byte binding. This does not authenticate an issuer, grant sandbox
// authority, install anything or execute the image/archive being inspected.
export async function verifyToolchainArtifact(directory: string) {
  const root = await privateDirectory(directory);
  disjoint(root, project);
  const recordBytes = await protectedRead(path.join(root, "toolchain.json"));
  const record = z
    .object({
      schemaVersion: z.literal("booking-toolchain-preparation.v1"),
      status: z.literal("built"),
      stage: z.literal("completed"),
      driver: z.literal("docker"),
      failure: z.null(),
      cleanupConfirmed: z.literal(true),
      buildFinished: z.literal(true),
      request: z.object({
        schemaVersion: z.literal("booking-toolchain-request.v1"),
        scope: z.literal("trusted-tooling-only-no-inference"),
        runId: z.string().uuid(),
        implementationSha256: hash,
        runtimeManifestSha256: hash,
        contextSha256: hash,
      }),
      image: z.object({
        id: imageId,
        os: z.literal("linux"),
        architecture: z.enum(["arm64", "amd64"]),
        repoDigests: z.array(z.string()),
        layers: z.array(imageId),
      }),
      audit: ToolchainAuditSchema,
      archive: z.strictObject({
        sha256: hash,
        bytes: z
          .number()
          .int()
          .positive()
          .max(2 * 1024 ** 3),
      }),
    })
    .parse(JSON.parse(recordBytes.toString()));
  if (
    record.request.implementationSha256 !==
    (await freezeBooking()).evaluatorSha256
  )
    throw new Error("Tooling preparation implementation is stale");
  const manifestBytes = await protectedRead(
    path.join(root, "runtime/manifest.json"),
  );
  if (sha256(manifestBytes) !== record.request.runtimeManifestSha256)
    throw new Error("Runtime manifest changed");
  const manifest = z
    .object({
      implementationSha256: hash,
      filesSha256: hash,
      files: z
        .array(
          z.strictObject({
            path: z.string(),
            sha256: hash,
            bytes: z.number().int().nonnegative(),
          }),
        )
        .max(100),
    })
    .parse(JSON.parse(manifestBytes.toString()));
  if (
    manifest.implementationSha256 !== record.request.implementationSha256 ||
    jsonDigest(manifest.files) !== manifest.filesSha256 ||
    jsonDigest(
      manifest.files.filter((f) => f.path.startsWith("toolchain/")),
    ) !== record.request.contextSha256
  )
    throw new Error("Runtime/context identities mismatch");
  if (
    JSON.stringify(manifest.files.map((f) => f.path).sort()) !==
    JSON.stringify(runtimeBundleInputs.map((f) => f.target).sort())
  )
    throw new Error("Missing or duplicated runtime bundle inputs");
  const expected = (await freezeBooking()).evaluatorManifest;
  for (const file of manifest.files) {
    const source =
      file.path === "runtime-files.py" || file.path === "toolchain-audit.mjs"
        ? `scripts/experiments/isolation/${file.path}`
        : file.path.startsWith("controller/")
          ? `scripts/evaluator/booking-v1/${file.path.slice(11)}`
          : `scripts/evaluator/booking-v1/${file.path}`;
    if (!expected.some((e) => e.path === source && e.sha256 === file.sha256))
      throw new Error("Unexpected trusted runtime input");
    const target = path.resolve(root, "runtime", file.path);
    if (!target.startsWith(path.join(root, "runtime") + path.sep))
      throw new Error("Runtime path escapes");
    const bytes = await protectedRead(target, 2_097_152);
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes)
      throw new Error("Runtime bundle bytes changed");
  }
  await verifyToolingContext(
    path.join(root, "runtime/toolchain"),
    manifest.files,
  );
  const archive = await largeFileIdentity(
    path.join(root, "toolchain-image.tar"),
  );
  if (
    archive.sha256 !== record.archive.sha256 ||
    archive.bytes !== record.archive.bytes
  )
    throw new Error("Toolchain archive changed");
  const id = (await protectedRead(path.join(root, "image.id")))
    .toString()
    .trim();
  if (
    id !== record.image.id ||
    record.audit.lockSha256 !==
      manifest.files.find((f) => f.path === "toolchain/package-lock.json")
        ?.sha256 ||
    record.audit.packageSha256 !==
      manifest.files.find((f) => f.path === "toolchain/package.json")?.sha256
  )
    throw new Error("Toolchain/image identity mismatch");
  if (
    record.request.implementationSha256 !==
      (await freezeBooking()).evaluatorSha256 ||
    sha256(await protectedRead(path.join(root, "runtime/manifest.json"))) !==
      record.request.runtimeManifestSha256 ||
    !(await protectedRead(path.join(root, "toolchain.json"))).equals(
      recordBytes,
    )
  )
    throw new Error("Toolchain inputs changed during verification");
  return record;
}
