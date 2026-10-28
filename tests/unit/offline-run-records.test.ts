import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  syntheticOfflineAdapter,
  syntheticOfflineFixture,
} from "../helpers/offline-acceptance";
import { runOfflineAcceptance } from "../../scripts/experiments/runner/offline-controller";
import * as processModule from "../../scripts/experiments/runner/process";
import * as runArtifacts from "../../scripts/experiments/artifacts/offline-runs";
import * as sourceFreeze from "../../scripts/evaluator/booking-v1/freeze";
import { protectedRead } from "../../scripts/experiments/artifacts/files";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "@/server/artifacts/evaluation-store";
import {
  composeRecordedCertificate,
  loadRecordedCertificates,
  type CertificateRegistration,
} from "@/server/artifacts/recorded-certificates";
import { loadApprovedCertificates } from "@/server/artifacts/recording-catalog";
import {
  ExperimentRunV1Schema,
  CertificateV1Schema,
} from "@/lib/contracts/evidence";
import { DemoResponseSchema } from "@/lib/contracts/api";
import {
  validateReceiptRelationships,
  validateCertificateReferences,
} from "@/lib/contracts/validation";
import { canonicalJson } from "@/lib/report/canonical";
import { certificateDigest, jsonDigest, sha256 } from "@/lib/report/digests";
import { selectCertificateExport } from "@/lib/report/certificate-export";

const temporary: string[] = [];
const sentinel = "PRIVATE_SYNTHETIC_DIAGNOSTIC_DO_NOT_DISCLOSE";
async function writable(root: string): Promise<void> {
  await chmod(root, 0o700);
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isDirectory() && !entry.isSymbolicLink())
      await writable(path.join(root, entry.name));
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0)) {
    await writable(root);
    await rm(root, { recursive: true, force: true });
  }
});
const setup = () => syntheticOfflineFixture(temporary);
async function produced(mode = "normal") {
  const fixture = await setup();
  const adapter = syntheticOfflineAdapter(mode);
  const grade = adapter.grade;
  adapter.grade = async (input, signal) => {
    const result = await grade(input, signal);
    return {
      ...result,
      stdout: result.stdout.replaceAll("SYNTHETIC observation only", sentinel),
    };
  };
  const record = await runOfflineAcceptance(
    fixture.config,
    adapter,
    new AbortController().signal,
  );
  const runs = await Promise.all(
    record.sourceRecords.map(async (ref) => {
      const file = path.join(
        fixture.config.protectedRoot,
        ref.directory,
        ref.file,
      );
      const bytes = await protectedRead(file);
      expect(sha256(bytes)).toBe(ref.sha256);
      const run = ExperimentRunV1Schema.parse(JSON.parse(bytes.toString()));
      expect(bytes.toString()).toBe(canonicalJson(run));
      expect((await lstat(file)).mode & 0o777).toBe(0o400);
      expect((await lstat(file)).nlink).toBe(1);
      return run;
    }),
  );
  return { ...fixture, adapter, record, runs };
}
async function certificateFixture(mode = "normal") {
  const fixture = await produced(mode);
  const storeConfig = {
    root: fixture.config.protectedRoot,
    agentWorkspaceRoot: fixture.config.scratchRoot,
    entries: new Map(
      fixture.record.entries.map((entry) => [entry.identity.runId, entry]),
    ),
  };
  const store = await createProtectedEvaluationStore(storeConfig);
  const evaluations = await Promise.all(
    fixture.runs.map(async (run) => {
      const evaluation = await store.load(run.id);
      if (!isTrustedEvaluation(evaluation))
        throw new Error("Synthetic producer evidence did not authenticate");
      validateReceiptRelationships(
        evaluation.receipt,
        evaluation.verification,
        run,
      );
      return evaluation;
    }),
  );
  const registration: CertificateRegistration = {
    approval: {
      id: "synthetic-producer-certificate",
      title: "SYNTHETIC prospective producer test",
      scope: "SYNTHETIC fixed infrastructure acceptance; no actual execution.",
      baselineCommit: fixture.record.source!.repoCommit,
      generatedAt: new Date().toISOString(),
      evidenceOrigin: "none",
      limitations: [
        "SYNTHETIC integration only; no real measurement, publication or runtime admission.",
      ],
    },
    sources: fixture.runs.map((run, index) => ({
      recording: {
        run,
        metadata: {
          id: `synthetic-recording-${index}`,
          evaluationId: run.id,
          runId: run.id,
          receiptId: run.receiptId!,
          verificationId: run.verificationId!,
          title: `SYNTHETIC case ${index}`,
          scope: "SYNTHETIC fixed infrastructure check observations only.",
          category: "infrastructure_acceptance",
          checks: evaluations[index]!.checks.map((check) => ({
            id: check.id,
            label: check.id,
            description: "Synthetic protected check",
            publishArtifactDigest: true,
          })),
          publicIdentities: [],
          publicMetrics: [],
          limitations: ["SYNTHETIC"],
        },
      },
      publicRunSha256: jsonDigest(run),
    })),
  };
  return {
    ...fixture,
    evaluations,
    registration,
    certificateConfig: { certificates: [registration], store: storeConfig },
  };
}

describe("prospective offline source runs — SYNTHETIC, no VM/agent/inference", () => {
  it.each([
    "missing-commit",
    "dirty",
    "missing-binding",
    "mismatched-blob",
    "git-error",
  ])("refuses %s before any adapter operation", async (kind) => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter();
    const actual = processModule.boundedProcess;
    vi.spyOn(processModule, "boundedProcess").mockImplementation(
      async (executable, args, options) => {
        const result = await actual(executable, args, options);
        if (kind === "git-error") return { ...result, exitCode: 1 };
        if (kind === "missing-commit" && args.includes("rev-parse"))
          return { ...result, stdout: "" };
        if (kind === "dirty" && args.includes("status"))
          return { ...result, stdout: " M fixtures/booking-v1/package.json\n" };
        if (args.includes("ls-tree")) {
          if (kind === "missing-binding") return { ...result, stdout: "" };
          if (kind === "mismatched-blob")
            return {
              ...result,
              stdout: result.stdout.replace(
                /blob [a-f0-9]{40}/,
                `blob ${"0".repeat(40)}`,
              ),
            };
        }
        return result;
      },
    );
    await expect(
      runOfflineAcceptance(config, adapter, new AbortController().signal),
    ).rejects.toThrow();
    expect(adapter.admit).not.toHaveBeenCalled();
    expect(adapter.probe).not.toHaveBeenCalled();
    expect(adapter.grade).not.toHaveBeenCalled();
    expect(adapter.cleanup).not.toHaveBeenCalled();
    expect(await readdir(config.protectedRoot)).toEqual([]);
  });

  it("persists source/profile/candidate declarations before grading and captures distinct per-case receipt intervals", async () => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter();
    const grade = adapter.grade;
    const contexts: Record<string, unknown>[] = [];
    const admit = adapter.admit;
    adapter.admit = async (identity, signal) => {
      const suites = await readdir(config.protectedRoot);
      expect(suites).toHaveLength(1);
      const plan = JSON.parse(
        (
          await protectedRead(
            path.join(config.protectedRoot, suites[0]!, "source-context.json"),
          )
        ).toString(),
      );
      expect(plan.cases).toEqual(
        [
          "baseline",
          "distinct-final",
          "ownership-regression",
          "forged-success",
        ].map((scenario) => ({ scenario, variant: "A" })),
      );
      return admit(identity, signal);
    };
    adapter.grade = async (input, signal) => {
      const context = JSON.parse(
        (
          await protectedRead(
            path.join(config.protectedRoot, input.runId, "source-context.json"),
          )
        ).toString(),
      );
      contexts.push(context);
      expect(context).toMatchObject({
        runId: input.runId,
        variant: "A",
        evaluatedTreeSha256: input.evaluatedTreeSha256,
        evaluatorSha256: input.evaluatorSha256,
        profile: { agent: "none", build: "next-build-webpack" },
      });
      expect(context.agentConfigSha256).toBe(jsonDigest(context.profile));
      expect(context.repoCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(
        await readdir(path.join(config.protectedRoot, input.runId)),
      ).not.toContain("experiment-run.json");
      await delay(5);
      const result = await grade(input, signal);
      return {
        ...result,
        stdout: result.stdout.replaceAll(
          "SYNTHETIC observation only",
          sentinel,
        ),
      };
    };
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("completed");
    expect(contexts).toHaveLength(4);
    expect(record.sourceRecords).toHaveLength(4);
    expect(new Set(record.sourceRecords.map((r) => r.runId)).size).toBe(4);
    const store = await createProtectedEvaluationStore({
      root: config.protectedRoot,
      agentWorkspaceRoot: config.scratchRoot,
      entries: new Map(record.entries.map((e) => [e.identity.runId, e])),
    });
    let previousFinished = record.startedAt;
    for (const ref of record.sourceRecords) {
      const run = ExperimentRunV1Schema.parse(
        JSON.parse(
          (
            await protectedRead(
              path.join(config.protectedRoot, ref.directory, ref.file),
            )
          ).toString(),
        ),
      );
      const evaluation = await store.load(run.id);
      expect(isTrustedEvaluation(evaluation)).toBe(true);
      validateReceiptRelationships(
        evaluation!.receipt,
        evaluation!.verification,
        run,
      );
      expect(Date.parse(evaluation!.receipt.startedAt)).toBeGreaterThanOrEqual(
        Date.parse(previousFinished),
      );
      expect(evaluation!.receipt.startedAt).not.toBe(record.startedAt);
      expect(Date.parse(run.startedAt)).toBeLessThanOrEqual(
        Date.parse(evaluation!.receipt.startedAt),
      );
      expect(Date.parse(run.endedAt)).toBeGreaterThanOrEqual(
        Date.parse(evaluation!.receipt.finishedAt),
      );
      previousFinished = evaluation!.receipt.finishedAt;
      expect(run).toMatchObject({
        variant: "A",
        status: "completed",
        repoCommit: record.source!.repoCommit,
        agentConfigSha256: record.agentConfigSha256,
        fixtureSha256: record.source!.fixtureSha256,
        evidenceOrigin: "none",
        presentationMode: "recorded",
        isolationAttestationId: null,
        seed: null,
      });
      expect(run.metrics).toEqual({
        elapsedMs: null,
        tokens: null,
        costUsd: null,
        iterations: null,
        filesTouched: null,
      });
      expect(canonicalJson(run)).not.toContain(sentinel);
      expect(run.limitations.join()).toContain("SYNTHETIC");
    }
  });

  it.each(["normal", "missing"])(
    "consumes actual %s producer originals through protected loading, certificate service and exact canonical export",
    async (mode) => {
      const f = await certificateFixture(mode);
      const catalog = await loadRecordedCertificates(f.certificateConfig);
      expect(DemoResponseSchema.parse(catalog.demo)).toEqual(catalog.demo);
      expect(catalog.demo.runs).toHaveLength(4);
      const certificate = CertificateV1Schema.parse(
        catalog.demo.certificates[0],
      );
      expect(certificate.conclusion).toContain(
        mode === "normal"
          ? "2 VERIFIED, 2 REJECTED, 0 INSUFFICIENT_EVIDENCE"
          : "0 VERIFIED, 2 REJECTED, 2 INSUFFICIENT_EVIDENCE",
      );
      expect(certificate).toMatchObject({
        intentRevisions: [],
        scenarioIds: [],
        decisionId: null,
        evidenceOrigin: "none",
        presentationMode: "recorded",
      });
      validateCertificateReferences(certificate, {
        intents: [],
        scenarios: [],
        decision: null,
        runs: f.runs,
        receipts: f.evaluations.map((e) => e.receipt),
        verifications: f.evaluations.map((e) => e.verification),
      });
      const exported = selectCertificateExport(
        catalog.demo,
        certificate.id,
        certificate.artifactSha256,
      );
      expect(exported.json).toBe(canonicalJson(certificate));
      expect(certificateDigest(certificate)).toBe(certificate.artifactSha256);
      const { artifactSha256: _self, ...contents } = certificate;
      void _self;
      expect(sha256(canonicalJson(contents))).toBe(certificate.artifactSha256);
      expect(sha256(exported.json)).not.toBe(certificate.artifactSha256);
      expect(
        (await loadRecordedCertificates(f.certificateConfig)).demo,
      ).toEqual(catalog.demo);
      for (const fake of [
        structuredClone(f.evaluations[0]),
        JSON.parse(JSON.stringify(f.evaluations[0])),
      ]) {
        expect(isTrustedEvaluation(fake)).toBe(false);
        expect(() =>
          composeRecordedCertificate(f.registration, [
            fake,
            ...f.evaluations.slice(1),
          ]),
        ).toThrow("Authenticated");
      }
      expect(exported.json).not.toContain(f.root);
      expect(exported.json).not.toContain("source-context");
      expect(exported.json).not.toContain(sentinel);
      expect((await loadApprovedCertificates()).demo).toEqual({
        schemaVersion: "demo.v1",
        runs: [],
        certificates: [],
        mode: "recorded",
      });
    },
  );

  it.each(["approval", "pin", "check-bytes", "bundle-bytes"])(
    "invalidates certificate retrieval after changed %s",
    async (kind) => {
      const f = await certificateFixture();
      expect(
        (await loadRecordedCertificates(f.certificateConfig)).reports,
      ).toHaveLength(1);
      const entry = f.record.entries[0]!;
      if (kind === "approval")
        f.registration.sources[0]!.publicRunSha256 = "0".repeat(64);
      if (kind === "pin")
        f.certificateConfig.store.entries.set(entry.identity.runId, {
          ...entry,
          identity: { ...entry.identity, requiredPolicySha256: "0".repeat(64) },
        });
      if (kind === "check-bytes" || kind === "bundle-bytes") {
        const file = path.join(
          f.config.protectedRoot,
          entry.directory,
          kind === "check-bytes" ? "checks/build.json" : "evaluation.json",
        );
        await chmod(file, 0o600);
        await writeFile(file, "SYNTHETIC tamper");
      }
      expect(
        (await loadRecordedCertificates(f.certificateConfig)).demo.runs,
      ).toEqual([]);
    },
  );

  it.each(["missing", "failure-and-missing"])(
    "retains completed %s evidence without promoting check verdict",
    async (mode) => {
      const { config } = await setup();
      const adapter = syntheticOfflineAdapter("missing");
      if (mode === "failure-and-missing") {
        const grade = adapter.grade;
        adapter.grade = async (input, signal) => {
          const result = await grade(input, signal);
          const report = JSON.parse(result.stdout);
          report.checks[0].status = "fail";
          report.checks[0].exitCode = 1;
          return { ...result, stdout: JSON.stringify(report) };
        };
      }
      const record = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(record.status).toBe("failed");
      expect(record.sourceRecords).toHaveLength(4);
      expect(record.verdicts[0]!.verdict).toBe(
        mode === "missing" ? "INSUFFICIENT_EVIDENCE" : "REJECTED",
      );
      const store = await createProtectedEvaluationStore({
        root: config.protectedRoot,
        agentWorkspaceRoot: config.scratchRoot,
        entries: new Map(record.entries.map((e) => [e.identity.runId, e])),
      });
      for (const ref of record.sourceRecords) {
        const run = JSON.parse(
          (
            await protectedRead(
              path.join(config.protectedRoot, ref.directory, ref.file),
            )
          ).toString(),
        );
        expect(run.status).toBe("completed");
        const evaluation = await store.load(run.id);
        expect(isTrustedEvaluation(evaluation)).toBe(true);
        validateReceiptRelationships(
          evaluation!.receipt,
          evaluation!.verification,
          run,
        );
        expect(evaluation!.checks.find((c) => c.id === "build")!.status).toBe(
          "not_run",
        );
      }
    },
  );

  it("keeps an unexpectedly rejected baseline and all subsequent cases as mechanically completed originals", async () => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter();
    const grade = adapter.grade;
    let first = true;
    adapter.grade = async (input, signal) => {
      const result = await grade(input, signal);
      if (!first) return result;
      first = false;
      const report = JSON.parse(result.stdout);
      report.checks[0] = { ...report.checks[0], status: "fail", exitCode: 1 };
      return { ...result, stdout: JSON.stringify(report) };
    };
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.status).toBe("failed");
    expect(record.verdicts.map((v) => v.verdict)).toEqual([
      "REJECTED",
      "VERIFIED",
      "REJECTED",
      "REJECTED",
    ]);
    expect(record.entries).toHaveLength(4);
    for (const ref of record.sourceRecords)
      expect(
        JSON.parse(
          await readFile(
            path.join(config.protectedRoot, ref.directory, ref.file),
            "utf8",
          ),
        ).status,
      ).toBe("completed");
  });

  it("does not accept an optional pass in place of missing fixed required evidence", async () => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter("missing");
    const grade = adapter.grade;
    adapter.grade = async (input, signal) => {
      const result = await grade(input, signal);
      const report = JSON.parse(result.stdout);
      report.checks.push({
        id: "optional-extra",
        status: "pass",
        exitCode: 0,
        detail: "SYNTHETIC optional pass",
      });
      return { ...result, stdout: JSON.stringify(report) };
    };
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.entries).toEqual([]);
    expect(record.sourceRecords).toHaveLength(1);
    const ref = record.sourceRecords[0]!;
    expect(
      JSON.parse(
        await readFile(
          path.join(config.protectedRoot, ref.directory, ref.file),
          "utf8",
        ),
      ),
    ).toMatchObject({
      status: "failed",
      receiptId: null,
      verificationId: null,
    });
  });

  it("preserves cancellation thrown by the adapter and retains the lease", async () => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter();
    const abort = new AbortController();
    adapter.grade = async () => {
      abort.abort();
      abort.signal.throwIfAborted();
      throw new Error("unreachable");
    };
    const record = await runOfflineAcceptance(config, adapter, abort.signal);
    expect(record.entries).toEqual([]);
    expect(record.sourceRecords).toHaveLength(1);
    const ref = record.sourceRecords[0]!;
    expect(
      JSON.parse(
        await readFile(
          path.join(config.protectedRoot, ref.directory, ref.file),
          "utf8",
        ),
      ),
    ).toMatchObject({
      status: "cancelled",
      receiptId: null,
      verificationId: null,
    });
    expect(await readdir(config.coordinationRoot)).toContain(
      ".booking-run.lock",
    );
  });

  it.each(["wrong", "forged", "timeout", "cancel", "cleanup"])(
    "preserves %s attempts with no invented links or trusted completion",
    async (mode) => {
      const { record, runs } = await produced(mode);
      expect(record.entries).toEqual([]);
      expect(runs).toHaveLength(mode === "cleanup" ? 4 : 1);
      for (const run of runs) {
        expect(run.status).toBe(
          mode === "timeout"
            ? "timed_out"
            : mode === "cancel"
              ? "cancelled"
              : mode === "cleanup"
                ? "blocked"
                : "failed",
        );
        expect(run.receiptId).toBeNull();
        expect(run.verificationId).toBeNull();
      }
    },
  );

  it.each(["admit", "grade"] as const)(
    "retains honest %s errors and emits no never-attempted cases",
    async (stage) => {
      const { config } = await setup();
      const adapter = syntheticOfflineAdapter();
      adapter[stage] = vi.fn(async () => {
        throw new Error("SYNTHETIC adapter failure");
      });
      const record = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(record.entries).toEqual([]);
      expect(record.sourceRecords).toHaveLength(stage === "admit" ? 0 : 1);
    },
  );

  it("emits no case runs for lifecycle-only mode or pre-cancellation", async () => {
    for (const lifecycleOnly of [true, false]) {
      const { config } = await setup();
      const abort = new AbortController();
      if (!lifecycleOnly) abort.abort();
      const record = await runOfflineAcceptance(
        config,
        syntheticOfflineAdapter(),
        abort.signal,
        lifecycleOnly ? "lifecycle-only" : "booking-and-lifecycle",
      );
      expect(record.sourceRecords).toEqual([]);
      expect(record.attemptDiagnostics).toEqual([]);
    }
  });

  it.each(["candidate", "implementation", "source-commit"])(
    "withholds links after %s mutation",
    async (kind) => {
      const { config } = await setup();
      const adapter = syntheticOfflineAdapter();
      const grade = adapter.grade;
      const freeze = sourceFreeze.freezeBooking;
      const actualProcess = processModule.boundedProcess;
      adapter.grade = async (input, signal) => {
        const result = await grade(input, signal);
        if (kind === "candidate") {
          const file = path.join(
            config.protectedRoot,
            input.runId,
            "candidate/src/server/booking-service.ts",
          );
          await chmod(file, 0o600);
          await writeFile(file, "inert synthetic tamper");
        }
        if (kind === "implementation")
          vi.spyOn(sourceFreeze, "freezeBooking").mockImplementation(
            async () => ({
              ...(await freeze()),
              evaluatorSha256: "0".repeat(64),
            }),
          );
        if (kind === "source-commit") {
          vi.spyOn(processModule, "boundedProcess").mockImplementation(
            async (exe, args, opts) => ({
              ...(await actualProcess(exe, args, opts)),
              ...(args.includes("rev-parse") ? { stdout: "0".repeat(40) } : {}),
            }),
          );
        }
        return result;
      };
      const record = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(record.entries).toEqual([]);
      expect(record.sourceRecords).toHaveLength(4);
      for (const ref of record.sourceRecords)
        expect(
          JSON.parse(
            await readFile(
              path.join(config.protectedRoot, ref.directory, ref.file),
              "utf8",
            ),
          ).receiptId,
        ).toBeNull();
    },
  );

  it.each(["allowlist", "evaluation", "run-collision"])(
    "preserves originals after partial %s publication failure",
    async (kind) => {
      const { config } = await setup();
      const adapter = syntheticOfflineAdapter();
      const grade = adapter.grade;
      let collided: string | null = null;
      adapter.grade = async (input, signal) => {
        if (collided === null) {
          collided = path.join(
            config.protectedRoot,
            input.runId,
            kind === "allowlist"
              ? "allowlist-entry.json"
              : kind === "evaluation"
                ? "evaluation.json"
                : "experiment-run.json",
          );
          await writeFile(collided, "SYNTHETIC original collision", {
            mode: 0o400,
            flag: "wx",
          });
        }
        return grade(input, signal);
      };
      const record = await runOfflineAcceptance(
        config,
        adapter,
        new AbortController().signal,
      );
      expect(record.status).toBe("failed");
      expect(record.entries).toEqual([]);
      expect(await readFile(collided!, "utf8")).toBe(
        "SYNTHETIC original collision",
      );
      expect(record.sourceRecords).toHaveLength(4);
      for (const ref of record.sourceRecords) {
        const run = JSON.parse(
          await readFile(
            path.join(config.protectedRoot, ref.directory, ref.file),
            "utf8",
          ),
        );
        expect(run.status).not.toBe("completed");
        expect(run.receiptId).toBeNull();
        expect(run.verificationId).toBeNull();
      }
    },
  );

  it("refuses cloned evaluation links and retains a failed original when link validation fails", async () => {
    const f = await certificateFixture();
    await expect(
      runArtifacts.publishOfflineRun(
        path.join(f.config.protectedRoot, f.runs[0]!.id),
        f.runs[0]!,
        structuredClone(f.evaluations[0]!),
      ),
    ).rejects.toThrow("Authenticated");
    const actual = runArtifacts.publishOfflineRun;
    vi.spyOn(runArtifacts, "publishOfflineRun").mockImplementation(
      async (directory, run, evaluation, failed) => {
        if (run.status === "completed")
          throw new Error("SYNTHETIC link-validation failure");
        return actual(directory, run, evaluation, failed);
      },
    );
    const result = await produced();
    expect(result.record.entries).toEqual([]);
    expect(
      result.runs.every(
        (r) => r.status !== "completed" && r.receiptId === null,
      ),
    ).toBe(true);
  });

  it("rechecks candidate freshness after evaluator publication before linking a complete run", async () => {
    const { config } = await setup();
    const adapter = syntheticOfflineAdapter();
    const actual = runArtifacts.publishOfflineRun;
    // Mutation occurs after completed source capture? Use protected-store load
    // hook to mutate inert candidate bytes during publication itself.
    const storeModule = await import("@/server/artifacts/evaluation-store");
    const createStore = storeModule.createProtectedEvaluationStore;
    vi.spyOn(storeModule, "createProtectedEvaluationStore").mockImplementation(
      async (configuration) => {
        const store = await createStore(configuration);
        return {
          load: async (id: string) => {
            const evaluation = await store.load(id);
            const file = path.join(
              config.protectedRoot,
              id,
              "candidate/src/server/booking-service.ts",
            );
            await chmod(file, 0o600);
            await writeFile(file, "SYNTHETIC late inert mutation");
            return evaluation;
          },
        };
      },
    );
    const publish = vi
      .spyOn(runArtifacts, "publishOfflineRun")
      .mockImplementation(actual);
    const record = await runOfflineAcceptance(
      config,
      adapter,
      new AbortController().signal,
    );
    expect(record.entries).toEqual([]);
    expect(record.sourceRecords).toHaveLength(4);
    expect(
      publish.mock.calls.every((call) => call[1].status !== "completed"),
    ).toBe(true);
  });

  it("rejects path aliases, unsafe custody and collisions without overwriting source originals", async () => {
    const { root, config } = await setup();
    const id = randomUUID();
    const directory = path.join(config.protectedRoot, id);
    await mkdir(directory, { mode: 0o700 });
    const write = (dir: string, runId: string = id) =>
      runArtifacts.writeOfflineOriginal(dir, runId, "source-context.json", {
        synthetic: true,
      });
    await expect(write(directory, "../escape")).rejects.toThrow();
    const alias = path.join(root, "alias");
    await symlink(config.protectedRoot, alias);
    await expect(write(path.join(alias, id))).rejects.toThrow("aliases");
    await expect(
      runArtifacts.writeOfflineOriginal(
        directory,
        id,
        "../escape" as "source-context.json",
        {},
      ),
    ).rejects.toThrow("filename");
    await symlink(
      path.join(root, "outside"),
      path.join(directory, ".source-context.json.pending"),
    );
    await expect(write(directory)).rejects.toThrow();
    await rm(path.join(directory, ".source-context.json.pending"));
    await chmod(directory, 0o755);
    await expect(write(directory)).rejects.toThrow("0700");
    await chmod(directory, 0o700);
    await write(directory);
    const original = await readFile(
      path.join(directory, "source-context.json"),
      "utf8",
    );
    await expect(write(directory)).rejects.toThrow();
    expect(
      await readFile(path.join(directory, "source-context.json"), "utf8"),
    ).toBe(original);
  });

  it("domain-separates the deterministic no-agent profile and binds actual tool/limit identities", async () => {
    const { config } = await setup();
    const runtime = {
      limitsSha256: "a".repeat(64),
      implementationSha256: "b".repeat(64),
    };
    const profile = runArtifacts.offlineRunProfile(config, runtime);
    expect(profile.agent).toBe("none");
    expect(profile.domain).toBe(
      "forecode/no-agent-fixed-offline-acceptance/v1",
    );
    expect(jsonDigest(profile)).toBe(
      jsonDigest(
        runArtifacts.offlineRunProfile(structuredClone(config), { ...runtime }),
      ),
    );
    for (const changed of [
      runArtifacts.offlineRunProfile(
        { ...config, sbxSha256: "0".repeat(64) },
        runtime,
      ),
      runArtifacts.offlineRunProfile(
        { ...config, graderImage: `sha256:${"0".repeat(64)}` },
        runtime,
      ),
      runArtifacts.offlineRunProfile(config, {
        ...runtime,
        limitsSha256: "0".repeat(64),
      }),
    ])
      expect(jsonDigest(changed)).not.toBe(jsonDigest(profile));
    expect(canonicalJson(profile)).not.toContain(config.protectedRoot);
    expect(profile).not.toHaveProperty("model");
  });
});
