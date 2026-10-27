import { syntheticVmResources } from "../helpers/synthetic-vm-resources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256, jsonDigest } from "@/lib/report/digests";
import { freezeBooking } from "../../scripts/evaluator/booking-v1/freeze";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";
import { OfflineConfigSchema } from "../../scripts/experiments/isolation/offline-config";
import {
  observeInstalledGrader,
  validateInstalledSmoke,
} from "../../scripts/experiments/isolation/installed-observation";
import { verifyToolchainArtifact } from "../../scripts/experiments/isolation/toolchain";
import { boundedProcess } from "../../scripts/experiments/runner/process";

// Explicitly synthetic VM/files/commands. No Docker, sbx or installed tooling runs.
vi.mock("../../scripts/experiments/isolation/toolchain", async (original) => ({
  ...(await original<
    typeof import("../../scripts/experiments/isolation/toolchain")
  >()),
  verifyToolchainArtifact: vi.fn(),
}));
vi.mock("../../scripts/experiments/runner/process", () => ({
  boundedProcess: vi.fn(),
}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) =>
      args[0] === "/opt/homebrew/bin/sbx"
        ? Promise.resolve(Buffer.from("SYNTHETIC sbx"))
        : actual.readFile(...args),
  };
});
const h = "a".repeat(64),
  id = `sha256:${h}`;
const audit = {
  architecture: "arm64",
  nodeVersion: "v22.23.4",
  dependencies: { next: "16.4.3" },
  esbuildVersion: "0.28.2",
  swcTarget: "aarch64-unknown-linux-gnu",
  nodeSha256: h,
  lockSha256: h,
  modulesSha256: h,
};
const goodSmoke = {
  schemaVersion: "booking-installed-smoke.v1",
  platform: "linux",
  ...audit,
  nodeExecutable: "/opt/forecode-booking/bin/node",
  smoke: {
    esm: true,
    serverOnly: true,
    typescript: true,
    tsx: true,
    esbuild: true,
    nextNative: true,
    nextCli: true,
  },
};
delete (goodSmoke as Partial<typeof goodSmoke>).nodeSha256;
delete (goodSmoke as Partial<typeof goodSmoke>).lockSha256;
delete (goodSmoke as Partial<typeof goodSmoke>).modulesSha256;
const envelope = (value: unknown) => ({
  guestMachine: "aarch64",
  reason: "completed",
  exitCode: 0,
  stdout: JSON.stringify(value),
  stderr: "",
});
const roots: string[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function setup(mode = "normal") {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-installed-synthetic-")),
  );
  roots.push(root);
  const config = OfflineConfigSchema.parse({
    ...JSON.parse(
      await readFile(
        "scripts/experiments/isolation/offline.example.json",
        "utf8",
      ),
    ),
    sbxSha256: sha256("SYNTHETIC sbx"),
    graderImage: id,
    workerImage: id,
    graderNodeSha256: h,
    graderLockSha256: h,
    graderModulesSha256: h,
    coordinationRoot: path.join(root, "coordination"),
    protectedRoot: path.join(root, "protected"),
    scratchRoot: path.join(root, "scratch"),
    reviewFile: path.join(root, "MISSING-review.json"),
  });
  await mkdir(config.coordinationRoot, { mode: 0o700 });
  const configFile = path.join(root, "offline.json"),
    destination = path.join(root, "observed");
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  // Deliberately incomplete self-authored artifact; mocked verifier is not evidence.
  vi.mocked(verifyToolchainArtifact).mockResolvedValue({
    request: { implementationSha256: (await freezeBooking()).evaluatorSha256 },
    requestSha256: h,
    image: { id, repoDigests: [], architecture: "arm64" },
    archive: { sha256: h },
    audit,
  } as unknown as Awaited<ReturnType<typeof verifyToolchainArtifact>>);
  const files: Record<string, string> = {
    "/opt/forecode-booking/bin/node": h,
    "/opt/forecode-booking/package-lock.json": h,
    "/opt/forecode-booking/package.json": sha256(
      await readFile("scripts/evaluator/booking-v1/toolchain/package.json"),
    ),
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
  const info = {
    runtime_mounts: [],
    sessions: 0,
    cpus: 2,
    memory: "4g",
    image_digest: id,
    state: mode === "running" ? "running" : "stopped",
  };
  let inventories = 0;
  vi.mocked(boundedProcess).mockImplementation(async (_exe, args) => {
    let stdout = "",
      exitCode = 0;
    if (args[0] === "version") stdout = "sbx version v0.50.0 SYNTHETIC";
    else if (args[0] === "inspect") stdout = JSON.stringify(info);
    else if (args[0] === "ls")
      stdout = JSON.stringify([
        { name: config.graderSandbox, id: "SYNTHETIC-VM" },
      ]);
    else if (args[0] === "policy") stdout = "[]";
    else if (args[0] === "settings") stdout = "false";
    else if (args[0] === "mcp") stdout = "[]";
    else if (args[0] === "stop") {
      if (mode === "stop") exitCode = 1;
    } else if (args[0] === "exec" && args[2] === "docker")
      stdout = JSON.stringify([
        { Id: id, RepoDigests: [], Os: "linux", Architecture: "arm64" },
      ]);
    else if (args[0] === "exec" && args[1] === "-u") {
      expect(args.slice(1, 7)).toEqual([
        "-u",
        "root",
        config.graderSandbox,
        "python3",
        "-I",
        "-c",
      ]);
      expect(args[7]).toContain("Fixed trusted offline-grader supervisor");
      stdout = JSON.stringify(
        mode === "vm-readback"
          ? { ...syntheticVmResources(), kernelThreadsMax: 8192 }
          : syntheticVmResources(config.vmPids),
      );
      if (mode === "vm-failure") exitCode = 1;
    } else if (args[0] === "exec" && args[2] === "python3") {
      const script = args[5]!;
      if (script.includes("Read-only trusted inventory")) {
        inventories++;
        const observed = { ...files };
        if (mode === "controller")
          observed["/opt/forecode-booking/controller/installed-smoke.mjs"] = h;
        if (mode === "modules") observed.node_modules = "b".repeat(64);
        if (mode === "executable") delete observed["runtime_metadata"];
        if (mode === "mutation" && inventories > 1)
          observed.runtime_metadata = "b".repeat(64);
        stdout = JSON.stringify(observed);
      } else {
        expect(script).toContain("Fixed owner-maintenance launcher");
        expect(inventories).toBe(1);
        if (mode === "config-mutation") await writeFile(configFile, "{}");
        if (mode === "source-mutation")
          vi.mocked(verifyToolchainArtifact).mockRejectedValue(
            new Error("stale implementation"),
          );
        stdout = JSON.stringify(
          mode === "abi"
            ? {
                ...envelope(null),
                exitCode: 1,
                stderr: "SYNTHETIC ABI loader failure",
              }
            : envelope(goodSmoke),
        );
        if (["spawn_error", "timed_out", "output_limit"].includes(mode))
          return {
            exitCode: null,
            signal: null,
            reason: mode as "spawn_error" | "timed_out" | "output_limit",
            stdout: "",
            stderr: "SYNTHETIC",
            elapsedMs: 1,
          };
      }
    } else throw new Error("Unexpected synthetic command");
    return {
      exitCode,
      signal: null,
      reason: "completed",
      stdout,
      stderr: "SYNTHETIC development observation",
      elapsedMs: 1,
    };
  });
  const run = () =>
    observeInstalledGrader(
      path.join(root, "artifact"),
      configFile,
      destination,
      new AbortController().signal,
    );
  return { root, config, configFile, destination, run };
}
const smokeCalls = () =>
  vi
    .mocked(boundedProcess)
    .mock.calls.filter(
      ([, args]) =>
        args[0] === "exec" &&
        args[5]?.includes("Fixed owner-maintenance launcher"),
    );
describe("installed owner maintenance — SYNTHETIC; no actual guest evidence", () => {
  it("emits the exact canonical admission inventory with separate configured limits and no self-approval", async () => {
    const { run, destination, config } = await setup();
    const record = await run();
    expect(record.status).toBe("OBSERVED");
    const inventory = JSON.parse(
      await readFile(path.join(destination, "inventory.json"), "utf8"),
    );
    expect(record.inventorySha256).toBe(jsonDigest(inventory));
    expect(inventory.reviewedLimits).toEqual({
      vmDiskBytes: config.vmDiskBytes,
      vmPids: config.vmPids,
    });
    expect(record.observedVmEnforcement).toEqual(
      syntheticVmResources(config.vmPids),
    );
    expect(record.authority).toContain("REQUIRES_INDEPENDENT_OWNER_REVIEW");
    expect(record.bookingAcceptance).toBe("NOT_RUN");
    expect(smokeCalls()).toHaveLength(1);
    await expect(
      readFile(
        path.join(config.coordinationRoot, ".booking-run.lock/owner.json"),
      ),
    ).rejects.toThrow();
    await expect(readFile(config.reviewFile)).rejects.toThrow();
    expect(
      JSON.parse(
        await readFile(path.join(destination, "command-1.json"), "utf8"),
      ).args,
    ).toEqual(["version"]);
  });
  it.each([
    "controller",
    "modules",
    "executable",
    "running",
    "vm-failure",
    "vm-readback",
  ])(
    "rejects %s substitution before installed tooling executes",
    async (mode) => {
      const { run, destination } = await setup(mode);
      expect((await run()).status).toBe("FAILED");
      expect(smokeCalls()).toHaveLength(0);
      await expect(
        readFile(path.join(destination, "inventory.json")),
      ).rejects.toThrow();
    },
  );
  it.each([
    "abi",
    "mutation",
    "source-mutation",
    "spawn_error",
    "timed_out",
    "output_limit",
    "stop",
    "config-mutation",
  ])(
    "withholds inventory for %s and preserves diagnostics/lease when termination is unconfirmed",
    async (mode) => {
      const { run, destination, config } = await setup(mode);
      const record = await run();
      expect(record.status).toBe("FAILED");
      expect(record.inventorySha256).toBeNull();
      await expect(
        readFile(path.join(destination, "inventory.json")),
      ).rejects.toThrow();
      if (["stop", "config-mutation"].includes(mode)) {
        expect(record.leaseRetained).toBe(true);
        expect(
          await readFile(
            path.join(config.coordinationRoot, ".booking-run.lock/owner.json"),
            "utf8",
          ),
        ).toContain("runId");
      }
    },
  );
  it("refuses existing leases, stale artifacts and enabled acceptance before any sandbox command", async () => {
    const { run, config, configFile } = await setup();
    vi.mocked(verifyToolchainArtifact).mockRejectedValueOnce(
      new Error("stale implementation"),
    );
    await expect(run()).rejects.toThrow("stale");
    await writeFile(
      configFile,
      JSON.stringify({ ...config, acceptanceEnabled: true }),
    );
    await expect(run()).rejects.toThrow("acceptance disabled");
    await writeFile(configFile, JSON.stringify(config));
    await mkdir(path.join(config.coordinationRoot, ".booking-run.lock"));
    await expect(run()).rejects.toThrow();
    expect(boundedProcess).not.toHaveBeenCalled();
  });
  it("rejects a kernel architecture inconsistent with reviewed tooling", () => {
    expect(() =>
      validateInstalledSmoke(
        { ...envelope(goodSmoke), guestMachine: "x86_64" },
        audit,
      ),
    ).toThrow("kernel architecture");
  });
  it.each([
    "architecture",
    "nodeVersion",
    "dependencies",
    "swcTarget",
    "esbuildVersion",
    "smoke",
    "extra",
  ])("rejects malformed/stale installed %s observations", (key) => {
    expect(() =>
      validateInstalledSmoke(
        envelope({ ...goodSmoke, [key]: "forged" }),
        audit,
      ),
    ).toThrow();
  });
});
