import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
  readFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256 } from "@/lib/report/digests";
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
import { dependencyRowsJson } from "../../scripts/experiments/isolation/toolchain-audit.mjs";
const roots: string[] = [],
  h = "a".repeat(64),
  id = `sha256:${h}`;
afterEach(async () => {
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
        await writeFile(path.join(destination, "build-metadata.json"), "{}", {
          mode: 0o600,
        });
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
    if (["timeout", "context", "image", "remote"].includes(mode))
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
