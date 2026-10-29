// SYNTHETIC transport tests of the concrete adapter, not runtime admission.
// Real Docker/process mechanics are exercised separately by tests/runtime/.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as processes from "../../scripts/experiments/runner/process";
import {
  createSbxAdapter,
  isTrustedAgentFinalization,
} from "../../scripts/experiments/runner/sbx";
import {
  OperatorConfigSchema,
  obligations,
} from "../../scripts/experiments/isolation/config";
import { configurationDigest } from "../../scripts/experiments/isolation/gate";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";
import { prepareBookingWorkspace } from "../../scripts/experiments/prepare-booking";
import { snapshotTree } from "../../scripts/evaluator/booking-v1/snapshot";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import type { CandidateEnvelope } from "../../scripts/experiments/artifacts/files";

vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
}));
const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
const hash = "a".repeat(64);
const observed = (stdout: string): processes.ProcessResult => ({
  exitCode: 0,
  signal: null,
  reason: "completed",
  stdout,
  stderr: "",
  elapsedMs: 1,
});
async function setup(
  model:
    | "gpt-5.6-sol"
    | "muse-spark-1.3"
    | "muse-spark-1.3-contributor" = "gpt-5.6-sol",
) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(tmpdir(), "forecode-sbx-adapter-unit-")),
  );
  temporary.push(root);
  for (const dir of ["protected", "scratch", "coordination"])
    await fs.mkdir(path.join(root, dir), { mode: 0o700 });
  const config = OperatorConfigSchema.parse({
    ...JSON.parse(
      await fs.readFile(
        "scripts/experiments/isolation/operator.example.json",
        "utf8",
      ),
    ),
    authorizedModel: model,
    enabled: true,
    protectedRoot: path.join(root, "protected"),
    scratchRoot: path.join(root, "scratch"),
    coordinationRoot: path.join(root, "coordination"),
    reviewFile: path.join(root, "review.json"),
    supervision: {
      schemaVersion: "booking-supervised-worker.v1",
      sbxSha256: sha256("SYNTHETIC_SBX_BINARY"),
      workerImage: `sha256:${"b".repeat(64)}`,
      workerNodeSha256: hash,
      vmPids: 4096,
      vmDiskBytes: 8 * 1024 ** 3,
      provider: {
        endpoint:
          model !== "gpt-5.6-sol"
            ? "https://api.meta.ai/v1/responses"
            : "https://api.openai.com/v1/responses",
        inputMicroUsdPerToken: 1,
        outputMicroUsdPerToken: 2,
        maxOutputTokens: 4096,
      },
    },
  });
  const runId = randomUUID();
  const actualProcess = processes.boundedProcess;
  const git = await actualProcess("/usr/bin/git", ["rev-parse", "HEAD"], {
    milliseconds: 5000,
    maxBytes: 1024,
  });
  const exported = path.join(root, "subject");
  await prepareBookingWorkspace(path.resolve("fixtures/booking-v1"), exported);
  const context = {
    runId,
    repoCommit: git.stdout.trim(),
    commitmentSha256: hash,
    fixtureSha256: (await snapshotTree(exported)).treeSha256,
    assertOwned: vi.fn(async () => {}),
  };
  const agentFiles: Record<string, string> = {
    "/home/agent/.codex/config.toml": config.agentConfigSha256,
    "/usr/local/bin/codex": config.codexBinarySha256,
    runtime_metadata: hash,
  };
  for (const name of ["supervisor.py", "budget.py", "worker.mjs"])
    agentFiles[`/opt/forecode-agent/${name}`] = sha256(
      await fs.readFile(`scripts/experiments/agent/${name}`),
    );
  const files: Record<string, string> = {
    "/opt/forecode-booking/bin/node": config.graderNodeSha256,
    "/opt/forecode-booking/package-lock.json": config.graderLockSha256,
    node_modules: config.graderModulesSha256,
    runtime_metadata: hash,
    "executable:docker": hash,
    "executable:python3": hash,
    "executable:ldd": hash,
    "native:/lib/reviewed.so": hash,
    "/opt/forecode-booking/package.json": sha256(
      await fs.readFile("scripts/evaluator/booking-v1/toolchain/package.json"),
    ),
  };
  for (const name of controllerFiles)
    files[`/opt/forecode-booking/controller/${name}`] = sha256(
      await fs.readFile(`scripts/evaluator/booking-v1/${name}`),
    );
  const commands: string[][] = [];
  let request: Record<string, unknown> | undefined;
  let candidate: CandidateEnvelope | undefined;
  let replaced = false;
  let foreignWorker = false;
  const realRead = fs.readFile;
  vi.spyOn(fs, "readFile").mockImplementation(((
    file: Parameters<typeof fs.readFile>[0],
    ...args: unknown[]
  ) =>
    file === config.sbx
      ? Promise.resolve(Buffer.from("SYNTHETIC_SBX_BINARY"))
      : Reflect.apply(realRead, fs, [file, ...args])) as typeof fs.readFile);
  vi.spyOn(processes, "boundedProcess").mockImplementation(
    async (executable, args, options) => {
      if (executable !== config.sbx)
        return actualProcess(executable, args, options);
      const a = [...args];
      commands.push(a);
      if (a[0] === "version") return observed("sbx version v0.50.0 SYNTHETIC");
      if (a[0] === "ls")
        return observed(
          JSON.stringify([
            {
              name: config.agentSandbox,
              id: replaced ? "REPLACED" : "agent-unit",
            },
            { name: config.graderSandbox, id: "grader-unit" },
          ]),
        );
      if (a[0] === "inspect")
        return observed(
          JSON.stringify({
            image_digest:
              a[1] === config.agentSandbox
                ? config.agentImage
                : config.graderImage,
            cpus: 2,
            memory: "4g",
            runtime_mounts: [],
            sessions: 0,
            state: "stopped",
            auth_mode: null,
          }),
        );
      if (a[0] === "policy") return observed('{"SYNTHETIC":"deny-unreviewed"}');
      if (a[0] === "settings") return observed("false");
      if (a[0] === "mcp") return observed("[]");
      if (a[0] === "stop") return observed("");
      if (a.includes("docker") && a.includes("ps"))
        return observed(foreignWorker ? "f".repeat(64) : "");
      if (a.includes("python3") && a.includes("-c")) {
        if (
          a.includes("runtime changed during inventory") ||
          a.some((v) => v.includes("def trusted_metadata"))
        )
          return observed(
            JSON.stringify(a.includes("agent") ? agentFiles : files),
          );
        return observed(
          JSON.stringify({
            schemaVersion: "booking-vm-resources.v1",
            kernelThreadsMax: 4096,
            parentPidsMax: 4096,
            sandboxPidsMax: 4096,
            kernelPidAllocationMax: 4194304,
            blockDevices: [{ name: "vda", bytes: 1024 ** 3 }],
            blockDeviceBytes: 1024 ** 3,
          }),
        );
      }
      if (a.includes("image"))
        return observed(
          JSON.stringify([
            {
              Id: a.at(-1),
              Os: "linux",
              Architecture: "arm64",
              RepoDigests: [],
            },
          ]),
        );
      if (a.includes("/opt/forecode-agent/supervisor.py")) {
        const body = JSON.parse(options.input!);
        if (body.operation === "prepare") {
          request = body.request;
          candidate = structuredClone(request!.candidate) as CandidateEnvelope;
          const f = candidate.files.find(
            (f) => f.path === "src/server/booking-service.ts",
          )!;
          f.base64 = Buffer.from(
            Buffer.from(f.base64, "base64").toString() +
              "\n// SYNTHETIC TRANSPORT CANDIDATE\n",
          ).toString("base64");
          return observed(
            JSON.stringify({
              runId,
              stage: "prepared",
              requestSha256: jsonDigest(request),
            }),
          );
        }
        if (body.operation === "start")
          return observed(JSON.stringify({ runId, stage: "starting" }));
        if (body.operation === "status")
          return observed(
            JSON.stringify({
              runId,
              nonce: request!.nonce,
              stage: "terminated",
              bootId: "synthetic-boot",
              containerId: "c".repeat(64),
              requestSha256: jsonDigest(request),
              agent: observed(""),
            }),
          );
        if (body.operation === "finalize")
          return observed(
            JSON.stringify({
              runId,
              nonce: request!.nonce,
              stage: "sealed",
              bootId: "synthetic-boot",
              containerId: "c".repeat(64),
              requestSha256: jsonDigest(request),
              candidate,
              candidateSha256: jsonDigest(candidate),
            }),
          );
        if (body.operation === "cleanup")
          return observed(JSON.stringify({ runId, absent: true }));
      }
      if (a.includes("/opt/forecode-booking/controller/guest.ts")) {
        const input = JSON.parse(options.input!);
        expect(input.candidate).toEqual(candidate);
        return observed(
          JSON.stringify({
            schemaVersion: "booking-grade-observation.v1",
            runId,
            ...Object.fromEntries(
              [
                "evaluatedTreeSha256",
                "evaluatorSha256",
                "testSuiteSha256",
                "requiredPolicySha256",
              ].map((k) => [k, input[k]]),
            ),
            checks: [
              {
                id: "typecheck",
                status: "pass",
                exitCode: 0,
                detail: "SYNTHETIC",
              },
            ],
          }),
        );
      }
      throw new Error("Unexpected SYNTHETIC transport operation");
    },
  );
  const observation = path.join(root, "reviewed-observation.txt");
  await fs.writeFile(observation, "SYNTHETIC only, not real owner approval", {
    mode: 0o400,
  });
  const revocation = path.join(root, "revocation.txt");
  await fs.writeFile(revocation, "SYNTHETIC active marker", { mode: 0o400 });
  const inventory = await createSbxAdapter(config).inspectRuntime(
    undefined,
    context,
  );
  const review = {
    schemaVersion: "booking-isolation-review.v1",
    reviewedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    configurationSha256: configurationDigest(config),
    implementationSha256: hash,
    inventorySha256: jsonDigest(inventory),
    authorizedTask: "booking-ownership-refactor-v1",
    authorizedModel: model,
    maxSpendUsd: config.spendUsd,
    execution: {
      runId,
      repoCommit: context.repoCommit,
      commitmentSha256: hash,
      revocationFile: revocation,
      revocationSha256: sha256("SYNTHETIC active marker"),
    },
    evidence: obligations.map((obligation) => ({
      obligation,
      path: observation,
      sha256: sha256("SYNTHETIC only, not real owner approval"),
      reviewedObservation:
        "SYNTHETIC test fixture; no real sandbox or authority.",
    })),
  };
  async function save() {
    await fs.chmod(config.reviewFile, 0o600).catch(() => {});
    const bytes = JSON.stringify(review);
    await fs.writeFile(config.reviewFile, bytes, { mode: 0o400 });
    config.reviewSha256 = sha256(bytes);
  }
  await save();
  commands.length = 0;
  return {
    root,
    config,
    context,
    exported,
    commands,
    review,
    save,
    revocation,
    preparedRequest: () => request,
    agentFiles,
    foreignWorker: () => {
      foreignWorker = true;
    },
    replace: () => {
      replaced = true;
    },
  };
}

describe("concrete sbx adapter — synthetic finite transport, real methods", () => {
  it("carries Meta model and endpoint into the trusted supervisor request", async () => {
    const f = await setup("muse-spark-1.3-contributor"),
      adapter = createSbxAdapter(f.config);
    await adapter.admit(hash, undefined, f.context);
    await adapter.prepare(f.context.runId, f.exported);
    expect(f.preparedRequest()).toMatchObject({
      model: "muse-spark-1.3-contributor",
      provider: { endpoint: "https://api.meta.ai/v1/responses" },
    });
    // Synthetic transport creates no guest; afterEach removes its host fixture.
  });
  it("rejects an OpenAI-model review for Meta before any sandbox operation", async () => {
    const f = await setup("muse-spark-1.3-contributor");
    f.review.authorizedModel = "gpt-5.6-sol";
    await f.save();
    await expect(
      createSbxAdapter(f.config).admit(hash, undefined, f.context),
    ).rejects.toThrow("does not bind");
    expect(f.commands).toEqual([]);
  });
  it("reaches prepare, one invocation, authenticated finalization and exact modified-candidate grading", async () => {
    const f = await setup(),
      adapter = createSbxAdapter(f.config),
      signal = new AbortController().signal;
    await adapter.admit(hash, signal, f.context);
    await adapter.prepare(f.context.runId, f.exported, signal);
    const result = await adapter.agent(f.context.runId, signal);
    expect(result.exitCode).toBe(0);
    const sealed = await adapter.finalizeAgent(f.context.runId, signal);
    expect(isTrustedAgentFinalization(sealed)).toBe(true);
    expect(isTrustedAgentFinalization({ ...sealed })).toBe(false);
    expect(isTrustedAgentFinalization(JSON.parse(JSON.stringify(sealed)))).toBe(
      false,
    );
    const candidate = sealed.candidate as CandidateEnvelope;
    const manifest = candidate.files
      .map((v) => ({
        path: v.path,
        sha256: sha256(Buffer.from(v.base64, "base64")),
      }))
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    const grade = await adapter.grade(
      {
        runId: f.context.runId,
        candidate,
        evaluatedTreeSha256: jsonDigest(manifest),
        evaluatorSha256: hash,
        testSuiteSha256: hash,
        requiredPolicySha256: hash,
        workerImage: f.config.workerImage,
      },
      signal,
    );
    expect(JSON.parse(grade.stdout).evaluatedTreeSha256).toBe(
      jsonDigest(manifest),
    );
    await expect(adapter.agent(f.context.runId, signal)).rejects.toThrow(
      "One agent attempt",
    );
    const operations = f.commands.filter((a) =>
      a.includes("/opt/forecode-agent/supervisor.py"),
    );
    expect(operations.length).toBe(4);
    expect(f.commands.some((a) => a[0] === "cp")).toBe(false);
  });
  it.each(["run", "commitment", "expired", "revoked", "reviewHash"])(
    "denies %s mismatch before a VM command",
    async (mode) => {
      const f = await setup();
      if (mode === "run") f.review.execution.runId = randomUUID();
      if (mode === "commitment")
        f.review.execution.commitmentSha256 = "b".repeat(64);
      if (mode === "expired") f.review.expiresAt = new Date(0).toISOString();
      if (mode === "revoked") {
        await fs.chmod(f.revocation, 0o600);
        await fs.writeFile(f.revocation, "revoked");
      }
      await f.save();
      if (mode === "reviewHash") f.config.reviewSha256 = "f".repeat(64);
      await expect(
        createSbxAdapter(f.config).admit(hash, undefined, f.context),
      ).rejects.toThrow();
      expect(f.commands).toEqual([]);
    },
  );
  it("rejects changed supervisor bytes before source preparation or invocation", async () => {
    const f = await setup();
    f.agentFiles["/opt/forecode-agent/supervisor.py"] = "b".repeat(64);
    await expect(
      createSbxAdapter(f.config).admit(hash, undefined, f.context),
    ).rejects.toThrow("Installed supervisor");
    expect(
      f.commands.some((a) => a.includes("/opt/forecode-agent/supervisor.py")),
    ).toBe(false);
  });
  it("revocation after admission prevents invocation", async () => {
    const f = await setup(),
      a = createSbxAdapter(f.config);
    await a.admit(hash, undefined, f.context);
    await a.prepare(f.context.runId, f.exported);
    await fs.chmod(f.revocation, 0o600);
    await fs.writeFile(f.revocation, "revoked");
    const before = f.commands.length;
    await expect(
      a.agent(f.context.runId, new AbortController().signal),
    ).rejects.toThrow("revoked");
    expect(f.commands.length).toBe(before);
  });
  it("replaced runtime and lost lease prevent any source export or cleanup of another owner", async () => {
    const f = await setup(),
      a = createSbxAdapter(f.config);
    await a.admit(hash, undefined, f.context);
    f.replace();
    await expect(a.prepare(f.context.runId, f.exported)).rejects.toThrow(
      "replaced",
    );
    f.context.assertOwned.mockRejectedValue(new Error("SYNTHETIC lease lost"));
    const before = f.commands.length;
    await expect(a.cleanup()).rejects.toThrow("lease lost");
    expect(f.commands.length).toBe(before);
  });
  it("retains existing foreign workers and refuses to stop their VM", async () => {
    const f = await setup(),
      a = createSbxAdapter(f.config);
    f.foreignWorker();
    await expect(a.admit(hash, undefined, f.context)).rejects.toThrow(
      "Existing agent worker",
    );
    await expect(a.cleanup()).rejects.toThrow("existing foreign worker");
    expect(
      f.commands.some((args) => args[0] === "stop" || args.includes("rm")),
    ).toBe(false);
  });
  it("cannot grade arbitrary or unfinalized source", async () => {
    const f = await setup(),
      a = createSbxAdapter(f.config);
    await a.admit(hash, undefined, f.context);
    await expect(
      a.grade(
        {
          runId: f.context.runId,
          candidate: { runId: f.context.runId, files: [] },
          evaluatedTreeSha256: hash,
          evaluatorSha256: hash,
          testSuiteSha256: hash,
          requiredPolicySha256: hash,
          workerImage: f.config.workerImage,
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("Only the sealed");
  });
});
