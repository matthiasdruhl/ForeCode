import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
  readFile,
  symlink,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256, jsonDigest } from "@/lib/report/digests";
import {
  prepareToolchain,
  buildToolchain,
  verifyToolchainArtifact,
  assertAuditContainer,
  type ToolchainDriver,
} from "../../scripts/experiments/isolation/toolchain";
import {
  largeFileIdentity,
  verifyToolingContext,
} from "../../scripts/experiments/isolation/toolchain-files";
import * as toolingFiles from "../../scripts/experiments/isolation/toolchain-files";
import * as processes from "../../scripts/experiments/runner/process";
import { installationPreflight } from "../../scripts/experiments/isolation/installation-preflight";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";
import { offlineConfigurationDigest } from "../../scripts/experiments/isolation/offline-gate";
import {
  OfflineConfigSchema,
  offlineObligations,
} from "../../scripts/experiments/isolation/offline-config";
import { dependencyRowsJson } from "../../scripts/experiments/isolation/toolchain-audit.mjs";
const roots: string[] = [],
  h = "a".repeat(64),
  id = `sha256:${h}`;
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function root() {
  const value = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-tooling-synthetic-")),
  );
  roots.push(value);
  return value;
}
function container(runId: string) {
  return {
    Image: id,
    State: { Running: false, ExitCode: 0 },
    Config: {
      User: "65534:65534",
      Labels: { "forecode.toolchain.run": runId },
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Memory: 768 * 1024 ** 2,
      MemorySwap: 768 * 1024 ** 2,
      NanoCpus: 1_000_000_000,
      PidsLimit: 64,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      LogConfig: { Type: "none" },
    },
    Mounts: [],
  };
}
function synthetic(destination: string, mode = "normal") {
  const calls: string[][] = [];
  let runId = "",
    context = "";
  const driver: ToolchainDriver = {
    kind: "synthetic-development",
    executableSha256: h,
    buildxSha256: h,
    async run(args) {
      calls.push(args);
      const result = {
        exitCode: 0,
        signal: null,
        reason: "completed" as const,
        stdout: "",
        stderr: "SYNTHETIC development observation",
        elapsedMs: 1,
      };
      if (args[0] === "version")
        result.stdout = JSON.stringify({
          Client: { Version: "synthetic" },
          Server: { Version: "synthetic" },
        });
      else if (args[0] === "buildx" && args[1] === "inspect")
        result.stdout =
          mode === "remote"
            ? "Driver: remote\nEndpoint: tcp://somewhere"
            : "Driver: docker\nEndpoint: desktop-linux";
      else if (args[0] === "buildx" && args[1] === "version")
        result.stdout = "SYNTHETIC buildx";
      else if (args[0] === "buildx" && args[1] === "build") {
        context = args.at(-1)!;
        runId = args[args.indexOf("--label") + 1]!.split("=")[1]!;
        expect((await readdir(context)).sort()).toEqual([
          ".dockerignore",
          "Dockerfile",
          "package-lock.json",
          "package.json",
        ]);
        expect(args).not.toContain("--secret");
        expect(args).not.toContain("--ssh");
        if (mode === "timeout")
          return { ...result, exitCode: null, reason: "timed_out" };
        if (mode === "context")
          await writeFile(path.join(context, "candidate.ts"), "inert data");
        await writeFile(path.join(destination, "image.id"), id, {
          mode: 0o600,
        });
        await writeFile(
          path.join(destination, "build-metadata.json"),
          JSON.stringify({
            "containerimage.digest":
              mode === "metadata" ? `sha256:${"b".repeat(64)}` : id,
          }),
          { mode: 0o600 },
        );
      } else if (args[0] === "image" && args[1] === "inspect")
        result.stdout = JSON.stringify([
          {
            Id: mode === "image" ? `sha256:${"b".repeat(64)}` : id,
            Os: "linux",
            Architecture: "arm64",
            Size: 512 * 1024 ** 2,
            Config: { Labels: { "forecode.toolchain.run": runId } },
            RootFS: { Layers: [id] },
          },
        ]);
      else if (args[0] === "container" && args[1] === "create") {
        expect(args).toContain("none");
        expect(args).toContain("--read-only");
        expect(args).not.toContain("--mount");
        expect(args.at(-1)).toBe("forecode-toolchain-audit");
      } else if (args[0] === "container" && args[1] === "start") {
        const pkg = await readFile(path.join(context, "package.json")),
          lock = await readFile(path.join(context, "package-lock.json"));
        result.stdout = JSON.stringify({
          schemaVersion: "booking-toolchain-audit.v1",
          platform: "linux",
          architecture: "arm64",
          nodeVersion: "v22.23.4",
          nodeSha256: h,
          lockSha256: mode === "lock" ? h : sha256(lock),
          packageSha256: sha256(pkg),
          modulesSha256: h,
          dependencies: JSON.parse(pkg.toString()).dependencies,
          native: { "/lib/reviewed.so": h },
          esbuildVersion: "0.28.2",
          swcTarget: "aarch64-unknown-linux-gnu",
          smoke: {
            typescript: true,
            tsx: true,
            esbuild: true,
            nextNative: mode !== "audit",
            nextCli: true,
          },
          inventoriedFiles: 1,
          inventoriedBytes: 1,
        });
      } else if (args[0] === "container" && args[1] === "inspect")
        result.stdout = JSON.stringify([
          container(mode === "owner" ? "other-owner" : runId),
        ]);
      else if (
        args[0] === "container" &&
        args[1] === "rm" &&
        mode === "cleanup"
      )
        return { ...result, exitCode: 1 };
      else if (args[0] === "container" && args[1] === "ls")
        result.stdout = mode === "survivor" ? "remaining" : "";
      else if (args[0] === "image" && args[1] === "save")
        await writeFile(
          path.join(destination, "toolchain-image.tar"),
          "SYNTHETIC image bytes, not a loadable runtime",
          { mode: 0o600 },
        );
      return result;
    },
  };
  return { driver, calls };
}
// Relabel only a local byte fixture to test the read-only verifier's shape.
// This intentionally demonstrates that JSON labels are NOT authentication.
async function verifierFixture() {
  const destination = path.join(await root(), "verifier-fixture");
  const record = await buildToolchain(
    destination,
    synthetic(destination).driver,
    new AbortController().signal,
  );
  expect(record.status).toBe("built");
  const bytes = { ...record, driver: "docker" };
  await overwrite(path.join(destination, "toolchain.json"), bytes);
  return { destination, record: bytes };
}
async function overwrite(file: string, value: unknown) {
  await chmod(file, 0o600);
  await writeFile(
    file,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
describe("trusted tooling preparation — SYNTHETIC Docker adapter; no image/guest execution", () => {
  it("prepares only reviewed tooling/controller files without a command adapter", async () => {
    const destination = path.join(await root(), "prepared"),
      result = await prepareToolchain(destination);
    expect(result.request.status).toBe("PREPARED");
    expect(result.request.inference).toBe("NOT_RUN");
    expect(await readdir(destination)).toEqual(["request.json", "runtime"]);
    await verifyToolingContext(
      path.join(destination, "runtime/toolchain"),
      result.runtime.files,
    );
    await expect(prepareToolchain(destination)).rejects.toThrow();
  });
  it("binds build, installed dependencies, cleanup and archive bytes without claiming real acceptance", async () => {
    const destination = path.join(await root(), "built"),
      fake = synthetic(destination);
    const record = await buildToolchain(
      destination,
      fake.driver,
      new AbortController().signal,
    );
    expect(record.status).toBe("built");
    expect(record.cleanupConfirmed).toBe(true);
    expect(record.request.bookingAcceptance).toBe("NOT_RUN");
    expect(record.limitations.join()).toContain("SYNTHETIC");
    expect(record.image?.repoDigests).toEqual([]);
    expect(record.image?.id).toBe(id);
    expect(record.archive?.sha256).toBe(
      sha256("SYNTHETIC image bytes, not a loadable runtime"),
    );
    expect(fake.calls.findIndex((a) => a[1] === "rm")).toBeLessThan(
      fake.calls.findIndex((a) => a[1] === "save"),
    );
    await expect(verifyToolchainArtifact(destination)).rejects.toThrow(); // Kind label is never actual runtime evidence.
  });
  it.each([
    "remote",
    "timeout",
    "context",
    "image",
    "metadata",
    "lock",
    "audit",
    "owner",
    "cleanup",
    "survivor",
  ])("retains %s failures and refuses a built artifact", async (mode) => {
    const destination = path.join(await root(), mode),
      fake = synthetic(destination, mode);
    const record = await buildToolchain(
      destination,
      fake.driver,
      new AbortController().signal,
    );
    expect(record.status).toBe("failed");
    expect(record.failure).toBeTruthy();
    expect(record.archive).toBeNull();
    expect(fake.calls.some((a) => a[0] === "image" && a[1] === "save")).toBe(
      false,
    );
    if (["timeout", "context", "image", "metadata", "remote"].includes(mode))
      expect(fake.calls.some((a) => a[0] === "container")).toBe(false);
    if (mode === "owner")
      expect(fake.calls.some((a) => a[1] === "rm")).toBe(false);
    expect(
      await readFile(path.join(destination, "toolchain.json"), "utf8"),
    ).toContain('"failed"');
  });
  it("pre-cancellation never reaches Docker", async () => {
    const destination = path.join(await root(), "cancelled"),
      fake = synthetic(destination),
      abort = new AbortController();
    abort.abort();
    const record = await buildToolchain(destination, fake.driver, abort.signal);
    expect(record.status).toBe("failed");
    expect(fake.calls).toEqual([]);
  });
  it("rejects context tampering, aliases and finite hash bound violations", async () => {
    const destination = path.join(await root(), "prepared"),
      result = await prepareToolchain(destination),
      context = path.join(destination, "runtime/toolchain");
    const file = path.join(context, "package.json");
    await chmod(file, 0o600);
    await writeFile(file, "{}");
    await expect(
      verifyToolingContext(context, result.runtime.files),
    ).rejects.toThrow("changed");
    await symlink(file, path.join(destination, "alias"));
    await expect(
      largeFileIdentity(path.join(destination, "alias")),
    ).rejects.toThrow("alias");
    await expect(largeFileIdentity(file, 1)).rejects.toThrow("bounded");
    await expect(
      prepareToolchain(
        path.resolve("../AgentHarness-Planning/forbidden-runtime-output"),
      ),
    ).rejects.toThrow("disjoint");
  });
  it("checks actual effective audit limits and identity", () => {
    const runId = "private-synthetic-owner",
      good = container(runId);
    expect(assertAuditContainer(good, id, runId)).toBeDefined();
    for (const field of ["Memory", "MemorySwap", "NanoCpus", "PidsLimit"])
      expect(() =>
        assertAuditContainer(
          { ...good, HostConfig: { ...good.HostConfig, [field]: 0 } },
          id,
          runId,
        ),
      ).toThrow();
    expect(() =>
      assertAuditContainer({ ...good, Mounts: [{ Type: "bind" }] }, id, runId),
    ).toThrow();
    expect(() => assertAuditContainer(good, id, "another-owner")).toThrow();
  });
  it.each([
    "request",
    "request-limits",
    "metadata",
    "image",
    "archive",
    "manifest",
    "architecture",
    "dependencies",
    "controller",
    "stale",
  ])(
    "read-only verifier rejects %s substitution (SYNTHETIC byte fixture)",
    async (mode) => {
      const { destination, record } = await verifierFixture();
      await expect(verifyToolchainArtifact(destination)).resolves.toBeDefined();
      if (mode === "request")
        await overwrite(path.join(destination, "request.json"), {
          ...record.request,
          runId: "00000000-0000-4000-8000-000000000000",
        });
      if (mode === "request-limits") {
        record.request.limits.outputBytes++;
        await overwrite(path.join(destination, "request.json"), record.request);
        await overwrite(path.join(destination, "toolchain.json"), record);
      }
      if (mode === "metadata")
        await overwrite(path.join(destination, "build-metadata.json"), {
          "containerimage.digest": `sha256:${"b".repeat(64)}`,
        });
      if (mode === "image")
        await overwrite(
          path.join(destination, "image.id"),
          `sha256:${"b".repeat(64)}`,
        );
      if (mode === "archive")
        await overwrite(
          path.join(destination, "toolchain-image.tar"),
          "inert changed archive",
        );
      if (mode === "controller")
        await overwrite(
          path.join(destination, "runtime/controller/worker.mjs"),
          "inert changed controller",
        );
      if (mode === "architecture") record.audit!.architecture = "x64";
      if (mode === "dependencies") record.audit!.dependencies = { bogus: "1" };
      if (mode === "stale") {
        record.request.implementationSha256 = "b".repeat(64);
        await overwrite(path.join(destination, "request.json"), record.request);
      }
      if (mode === "manifest") {
        const file = path.join(destination, "runtime/manifest.json");
        const manifest = JSON.parse(await readFile(file, "utf8"));
        manifest.fixtureSha256 = "b".repeat(64);
        await overwrite(file, manifest);
        record.request.runtimeManifestSha256 = sha256(await readFile(file));
        await overwrite(path.join(destination, "request.json"), record.request);
      }
      if (["stale", "manifest"].includes(mode))
        record.requestSha256 = sha256(
          await readFile(path.join(destination, "request.json")),
        );
      if (["architecture", "dependencies", "stale", "manifest"].includes(mode))
        await overwrite(path.join(destination, "toolchain.json"), record);
      await expect(verifyToolchainArtifact(destination)).rejects.toThrow();
    },
  );
  it.each([
    "request.json",
    "build-metadata.json",
    "runtime/controller/guest.ts",
  ])(
    "rejects %s mutation while archive hashing is in progress",
    async (name) => {
      const { destination } = await verifierFixture();
      const actual = toolingFiles.largeFileIdentity;
      vi.spyOn(toolingFiles, "largeFileIdentity").mockImplementation(
        async (file, max) => {
          const result = await actual(file, max);
          if (file.endsWith("toolchain-image.tar"))
            await overwrite(
              path.join(destination, name),
              "inert concurrent mutation",
            );
          return result;
        },
      );
      await expect(verifyToolchainArtifact(destination)).rejects.toThrow(
        /changed|context/,
      );
    },
  );
  it("refuses hardlinked archives", async () => {
    const directory = await root(),
      file = path.join(directory, "archive");
    await writeFile(file, "inert archive", { mode: 0o600 });
    await link(file, path.join(directory, "other"));
    await expect(largeFileIdentity(file)).rejects.toThrow("bounded");
  });
  it("preflight reports missing owner and guest evidence without invoking any process", async () => {
    const { destination } = await verifierFixture();
    const spawn = vi
      .spyOn(processes, "boundedProcess")
      .mockRejectedValue(new Error("NO PROCESS ALLOWED"));
    const report = await installationPreflight(destination);
    expect(spawn).not.toHaveBeenCalled();
    expect(report.authority).toBe("NONE_INTEGRITY_ONLY");
    expect(report.installedRuntime).toBeNull();
    expect(report.observedVmEnforcement).toBeNull();
    expect(report.bookingAcceptance).toBe("NOT_RUN");
    expect(report.gaps.map((g) => g.gate)).toContain("installed-inventory");
    expect(report.ownerSequence.join()).toContain(
      "never-started staging container",
    );
  });
  it("preflight binds exact proposal inputs and keeps configured caps separate from observations", async () => {
    const { destination } = await verifierFixture();
    const configFile = path.join(path.dirname(destination), "offline.json");
    const config = JSON.parse(
      await readFile(
        "scripts/experiments/isolation/offline.example.json",
        "utf8",
      ),
    );
    config.workerImage = id;
    config.graderNodeSha256 = h;
    config.graderModulesSha256 = h;
    config.graderLockSha256 = sha256(
      await readFile(
        path.join(destination, "runtime/toolchain/package-lock.json"),
      ),
    );
    await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
    const report = await installationPreflight(destination, configFile);
    expect(report.proposal.proposedInputs).toBe("BOUND");
    expect(report.proposal.configuredVmLimits).toEqual({
      diskBytes: config.vmDiskBytes,
      pids: config.vmPids,
    });
    expect(report.proposal.review).toBe("MISSING");
    expect(report.observedVmEnforcement).toBeNull();
    config.workerImage = `sha256:${"b".repeat(64)}`;
    await overwrite(configFile, config);
    expect((await installationPreflight(destination, configFile)).status).toBe(
      "INPUTS_INVALID",
    );
    const inventoryFile = path.join(
      path.dirname(destination),
      "inventory.json",
    );
    await writeFile(inventoryFile, JSON.stringify({ status: "PASS" }), {
      mode: 0o600,
    });
    expect(
      (await installationPreflight(destination, configFile, inventoryFile))
        .proposal.inventory,
    ).toBe("INVALID");
  });
  it("preflight accepts bound record integrity without granting runtime authority, and rejects stale/substituted records", async () => {
    const { destination, record } = await verifierFixture();
    const directory = path.dirname(destination),
      configFile = path.join(directory, "offline.json"),
      inventoryFile = path.join(directory, "inventory.json"),
      reviewFile = path.join(directory, "review.json"),
      evidenceFile = path.join(directory, "evidence.txt");
    const config = OfflineConfigSchema.parse({
      ...JSON.parse(
        await readFile(
          "scripts/experiments/isolation/offline.example.json",
          "utf8",
        ),
      ),
      acceptanceEnabled: true,
      workerImage: id,
      graderNodeSha256: h,
      graderModulesSha256: h,
      graderLockSha256: record.audit!.lockSha256,
      reviewFile,
      protectedRoot: path.join(directory, "protected"),
      scratchRoot: path.join(directory, "scratch"),
      coordinationRoot: path.join(directory, "coordination"),
    });
    const files: Record<string, string> = {
      "/opt/forecode-booking/bin/node": h,
      "/opt/forecode-booking/package-lock.json": config.graderLockSha256,
      "/opt/forecode-booking/package.json": record.audit!.packageSha256,
      node_modules: h,
      runtime_metadata: h,
      "executable:docker": h,
      "executable:python3": h,
      "executable:ldd": h,
      "native:/lib/synthetic.so": h,
    };
    for (const name of controllerFiles)
      files[`/opt/forecode-booking/controller/${name}`] = sha256(
        await readFile(`scripts/evaluator/booking-v1/${name}`),
      );
    const observed = {
      version: "sbx version v0.50.0 SYNTHETIC",
      sbxSha256: config.sbxSha256,
      id: "SYNTHETIC-VM",
      image: config.graderImage,
      cpus: 2,
      memory: "4g",
      mounts: [],
      auth: null,
      policy: { synthetic: true },
      ssh: "false",
      browser: "false",
      mcp: [],
      files,
      worker: { id, repoDigests: [], os: "linux", architecture: "arm64" },
      reviewedLimits: {
        vmDiskBytes: config.vmDiskBytes,
        vmPids: config.vmPids,
      },
    };
    await writeFile(
      evidenceFile,
      "SYNTHETIC DEVELOPMENT observations only; no actual owner authority or guest execution.",
      { mode: 0o600 },
    );
    const review = {
      schemaVersion: "booking-offline-isolation-review.v1",
      scope: config.scope,
      reviewedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      configurationSha256: offlineConfigurationDigest(config),
      implementationSha256: record.request.implementationSha256,
      inventorySha256: jsonDigest(observed),
      evidence: offlineObligations.map((obligation) => ({
        obligation,
        path: evidenceFile,
        sha256: sha256(
          "SYNTHETIC DEVELOPMENT observations only; no actual owner authority or guest execution.",
        ),
        reviewedObservation:
          "SYNTHETIC unit fixture; never use for live runtime admission.",
      })),
    };
    await writeFile(reviewFile, JSON.stringify(review), { mode: 0o600 });
    config.reviewSha256 = sha256(await readFile(reviewFile));
    await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
    await writeFile(inventoryFile, JSON.stringify(observed), { mode: 0o600 });
    const process = vi
      .spyOn(processes, "boundedProcess")
      .mockRejectedValue(new Error("NO PROCESS"));
    const report = await installationPreflight(
      destination,
      configFile,
      inventoryFile,
    );
    expect(report.proposal.inventory).toBe("RECORD_BOUND_INTEGRITY_ONLY");
    expect(report.proposal.inventorySha256).toBe(jsonDigest(observed));
    expect(report.proposal.review).toBe("RECORD_VALID_INTEGRITY_ONLY");
    expect(report.status).toBe("OWNER_ACTION_REQUIRED");
    expect(report.installedRuntime).toBeNull();
    expect(report.bookingAcceptance).toBe("NOT_RUN");
    for (const key of [
      "/opt/forecode-booking/controller/guest.ts",
      "runtime_metadata",
      "executable:docker",
      "node_modules",
    ]) {
      await overwrite(inventoryFile, {
        ...observed,
        files: { ...files, [key]: "b".repeat(64) },
      });
      expect(
        (await installationPreflight(destination, configFile, inventoryFile))
          .proposal.inventory,
      ).toBe("INVALID");
    }
    await overwrite(inventoryFile, observed);
    await overwrite(reviewFile, {
      ...review,
      expiresAt: new Date(0).toISOString(),
    });
    config.reviewSha256 = sha256(await readFile(reviewFile));
    await overwrite(configFile, config);
    const stale = await installationPreflight(
      destination,
      configFile,
      inventoryFile,
    );
    expect(stale.proposal.reviewIssue).toBe("REVIEW_STALE_OR_INVALID_INTERVAL");
    expect(stale.proposal.inventory).toBe("INVALID");
    expect(process).not.toHaveBeenCalled();
  });
  it("matches Python compact ASCII JSON rows including Unicode code-point ordering", () => {
    const rows = [
      ["\u{10000}", "hash-a"],
      ["\uffff", "hash-b"],
      ["ascii", "link", "../target"],
      ["\u007f", "hash-c"],
    ];
    expect(dependencyRowsJson(rows)).toBe(
      '[["ascii","link","../target"],["\\u007f","hash-c"],["\\uffff","hash-b"],["\\ud800\\udc00","hash-a"]]',
    );
  });
});
