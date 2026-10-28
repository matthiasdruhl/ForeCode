import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import {
  syntheticOfflineAdapter,
  syntheticOfflineFixture,
} from "../helpers/offline-acceptance";
import { runOfflineAcceptance } from "../../scripts/experiments/runner/offline-controller";
import * as originals from "../../scripts/experiments/artifacts/offline-runs";
import * as privateFiles from "../../scripts/experiments/artifacts/files";
import * as storeModule from "@/server/artifacts/evaluation-store";
import * as certificates from "@/server/artifacts/recorded-certificates";
import {
  loadApprovedCertificates,
  loadApprovedRecordings,
} from "@/server/artifacts/recording-catalog";
import { freezeBooking } from "../../scripts/evaluator/booking-v1/freeze";
import {
  reviewOfflineEvidence,
  reviewConsoleSummary,
  writePrivateReview,
  readPrivateReviewInput,
} from "../../scripts/experiments/artifacts/offline-evidence-review";
import {
  parseReviewArguments,
  runReviewCli,
} from "../../scripts/experiments/artifacts/offline-evidence-review-cli";
import {
  cases,
  SelectionSchema,
  type Selection,
  type Disclosure,
} from "../../scripts/experiments/artifacts/offline-evidence-schema";
import { canonicalJson } from "@/lib/report/canonical";
import { certificateDigest, jsonDigest, sha256 } from "@/lib/report/digests";
import { DemoResponseSchema } from "@/lib/contracts/api";
import { ExperimentRunV1Schema } from "@/lib/contracts/evidence";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const temporary: string[] = [];
const sentinel = "PRIVATE_INERT_REVIEW_SENTINEL";
async function writable(directory: string): Promise<void> {
  await fs.chmod(directory, 0o700);
  for (const entry of await fs.readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory() && !entry.isSymbolicLink())
      await writable(path.join(directory, entry.name));
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporary.splice(0)) {
    await writable(directory);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
async function replace(file: string, value: unknown, canonical = true) {
  const bytes =
    typeof value === "string"
      ? value
      : canonical
        ? canonicalJson(value)
        : JSON.stringify(value, null, 2);
  await fs.chmod(file, 0o600);
  await fs.writeFile(file, bytes);
  await fs.chmod(file, 0o400);
  return sha256(bytes);
}
async function produced(mode = "normal") {
  const f = await syntheticOfflineFixture(temporary);
  const pins = await freezeBooking();
  const adapter = syntheticOfflineAdapter(
    mode === "optional" ? "missing" : mode,
  );
  const grade = adapter.grade;
  adapter.grade = async (input, signal) => {
    const result = await grade(input, signal);
    const report = JSON.parse(result.stdout);
    for (const check of report.checks) check.detail = sentinel;
    if (
      mode === "unexpected" &&
      input.evaluatedTreeSha256 === pins.fixtureSha256
    )
      report.checks[0] = { ...report.checks[0], status: "fail", exitCode: 1 };
    if (mode === "optional")
      report.checks.push({
        id: "optional-extra",
        status: "pass",
        exitCode: 0,
        detail: sentinel,
      });
    return { ...result, stdout: JSON.stringify(report) };
  };
  if (mode === "admit-failure")
    adapter.admit = async () => {
      throw new Error(sentinel);
    };
  if (mode === "partial") {
    const actual = originals.publishOfflineRun;
    let once = true;
    vi.spyOn(originals, "publishOfflineRun").mockImplementation(
      async (directory, run, evaluation, failed) => {
        if (once) {
          once = false;
          await fs.writeFile(
            path.join(directory, "experiment-run.json"),
            sentinel,
            { flag: "wx", mode: 0o400 },
          );
        }
        return actual(directory, run, evaluation, failed);
      },
    );
  }
  const cancellation = new AbortController();
  if (mode === "pre-cancel") cancellation.abort();
  const record = await runOfflineAcceptance(
    f.config,
    adapter,
    cancellation.signal,
    mode === "lifecycle-only" ? "lifecycle-only" : "booking-and-lifecycle",
  );
  vi.restoreAllMocks();
  const acceptanceFile = path.join(
    f.config.protectedRoot,
    record.acceptanceId,
    "acceptance.json",
  );
  const contextFile = (runId: string) =>
    path.join(f.config.protectedRoot, runId, "source-context.json");
  const sourceFile = (index = 0) => {
    const ref = record.sourceRecords[index]!;
    return path.join(f.config.protectedRoot, ref.directory, ref.file);
  };
  const selection: Selection = {
    schemaVersion: "offline-evidence-selection.v1",
    acceptanceId: record.acceptanceId,
    acceptanceSha256: sha256(await fs.readFile(acceptanceFile)),
    sourcePlanSha256:
      record.source && existsSync(contextFile(record.acceptanceId))
        ? sha256(await fs.readFile(contextFile(record.acceptanceId)))
        : null,
    caseContexts: await Promise.all(
      record.attemptDiagnostics.map(async (attempt) => ({
        runId: attempt.runId,
        sha256: sha256(await fs.readFile(contextFile(attempt.runId))),
      })),
    ),
    pins: record.source
      ? {
          ...record.source,
          implementationSha256: pins.evaluatorSha256,
          evaluatorSha256: jsonDigest(record.runtimePins),
          testSuiteSha256: pins.testSuiteSha256,
          requiredPolicySha256: pins.requiredPolicySha256,
          requiredCheckIds: SelectionSchema.shape.pins
            .unwrap()
            .shape.requiredCheckIds.parse(pins.policy.requiredCheckIds),
          agentConfigSha256: record.agentConfigSha256,
        }
      : null,
  };
  const repinAcceptance = async () => {
    selection.acceptanceSha256 = await replace(acceptanceFile, record, false);
  };
  const run = async (index = 0) =>
    ExperimentRunV1Schema.parse(
      JSON.parse((await fs.readFile(sourceFile(index))).toString()),
    );
  async function disclose(): Promise<Disclosure> {
    const report = await reviewOfflineEvidence(f.config, selection);
    return {
      schemaVersion: "offline-evidence-disclosure.v1",
      sourceSetSha256: report.sourceSetSha256,
      certificate: {
        id: "synthetic-review-certificate",
        title: "SYNTHETIC private review",
        scope: "SYNTHETIC fixed infrastructure checks only.",
        baselineCommit: record.source!.repoCommit,
        generatedAt: record.endedAt,
        evidenceOrigin: "none",
        limitations: ["SYNTHETIC ONLY; publication not authorized."],
      },
      sources: report.cases.map((row, index) => ({
        runId: row.runId!,
        sourceRunSha256: row.sourceRunSha256!,
        publicRunSha256: row.proposedCompleteRunSha256!,
        metadata: {
          id: `synthetic-case-${index}`,
          evaluationId: row.runId!,
          runId: row.runId!,
          receiptId: row.run!.receiptId!,
          verificationId: row.run!.verificationId!,
          title: `Synthetic case ${index}`,
          scope: "Synthetic fixed check scope.",
          category: "infrastructure_acceptance",
          checks: selection.pins!.requiredCheckIds.map((id) => ({
            id,
            label: `Synthetic ${id}`,
            description: "Approved synthetic check description.",
            publishArtifactDigest: true,
          })),
          publicIdentities: ["evaluatedTreeSha256"],
          publicMetrics: [],
          limitations: ["SYNTHETIC"],
        },
      })),
    };
  }
  return {
    ...f,
    record,
    adapter,
    selection,
    acceptanceFile,
    contextFile,
    sourceFile,
    repinAcceptance,
    run,
    disclose,
  };
}

// These tests drive the real producer with inert bytes and synthetic adapters.
// No hand-authored run replaces a captured original; negative mutations affect
// only fresh synthetic originals, never historical/private operator evidence.
describe("prospective evidence intake — synthetic, no runtime or publication", () => {
  it.each(["normal", "missing", "unexpected"])(
    "reviews %s producer originals through actual custody, disclosure, certificate and export boundaries",
    async (mode) => {
      const f = await produced(mode);
      const sourceBefore = await fs.readFile(f.acceptanceFile);
      const compose = vi.spyOn(certificates, "loadRecordedCertificates");
      const inspect = await reviewOfflineEvidence(f.config, f.selection);
      expect(inspect).toMatchObject({
        sourceState: "validated",
        disclosure: "not_supplied",
        publication: "NOT_PERFORMED",
        runtimeAdmission: "NOT_ASSESSED",
        candidate: null,
      });
      expect(compose).not.toHaveBeenCalled();
      expect(inspect.cases.map((row) => row.scenario)).toEqual(cases);
      expect(
        inspect.cases.every(
          (row) =>
            row.disposition === "authenticated_completion" &&
            row.run?.status === "completed",
        ),
      ).toBe(true);
      expect(inspect.cases.map((row) => row.verdict)).toEqual(
        mode === "missing"
          ? [
              "INSUFFICIENT_EVIDENCE",
              "INSUFFICIENT_EVIDENCE",
              "REJECTED",
              "REJECTED",
            ]
          : mode === "unexpected"
            ? ["REJECTED", "VERIFIED", "REJECTED", "REJECTED"]
            : ["VERIFIED", "VERIFIED", "REJECTED", "REJECTED"],
      );
      if (mode !== "normal") expect(inspect.suiteStatus).toBe("failed");
      expect(JSON.stringify(inspect)).not.toContain("approvedPublicRunDigest");
      const approval = await f.disclose();
      const approved = await reviewOfflineEvidence(
        f.config,
        f.selection,
        approval,
      );
      expect(approved.disclosure).toBe("validated");
      expect(approved.publication).toBe("NOT_PERFORMED");
      const candidate = approved.candidate!;
      expect(DemoResponseSchema.parse(candidate.demo)).toEqual(candidate.demo);
      expect(candidate.demo.runs).toHaveLength(4);
      const certificate = candidate.demo.certificates[0]!;
      expect(certificate).toMatchObject({
        intentRevisions: [],
        scenarioIds: [],
        decisionId: null,
        evidenceOrigin: "none",
        presentationMode: "recorded",
      });
      expect(candidate.certificateExport.json).toBe(canonicalJson(certificate));
      expect(certificate.artifactSha256).toBe(certificateDigest(certificate));
      expect(sha256(candidate.certificateExport.json)).not.toBe(
        certificate.artifactSha256,
      );
      expect(JSON.stringify(candidate)).not.toContain(sentinel);
      expect(JSON.stringify(candidate)).not.toContain(f.root);
      expect(JSON.stringify(candidate)).not.toContain("evidencePath");
      expect(
        candidate.demo.runs.every(
          (run) =>
            run.variant === "A" &&
            Object.values(run.metrics).every((value) => value === null),
        ),
      ).toBe(true);
      expect(await fs.readFile(f.acceptanceFile)).toEqual(sourceBefore);
      const out = path.join(f.root, "review-output");
      await writePrivateReview(out, approved, f.config);
      expect((await fs.stat(out)).mode & 0o777).toBe(0o700);
      for (const name of [
        "review.json",
        "candidate-demo.json",
        "candidate-certificate.json",
      ]) {
        expect((await fs.stat(path.join(out, name))).mode & 0o777).toBe(0o400);
        expect((await fs.stat(path.join(out, name))).nlink).toBe(1);
      }
      expect(
        (
          await fs.readFile(path.join(out, "candidate-certificate.json"))
        ).toString(),
      ).toBe(candidate.certificateExport.json);
      await expect(
        writePrivateReview(out, approved, f.config),
      ).rejects.toThrow();
      expect((await loadApprovedCertificates()).demo.runs).toEqual([]);
      expect((await loadApprovedRecordings()).state).toBe("empty");
      expect(
        await reviewOfflineEvidence(f.config, f.selection, approval),
      ).toEqual(approved);
    },
  );
  it.each([
    "timeout",
    "cancel",
    "cleanup",
    "wrong",
    "optional",
    "admit-failure",
    "pre-cancel",
    "partial",
    "lifecycle-only",
  ])(
    "accounts for %s without inventing complete sources or choosing collision files",
    async (mode) => {
      const f = await produced(mode);
      const report = await reviewOfflineEvidence(f.config, f.selection);
      expect(report.sourceState).not.toBe("validated");
      expect(report.cases).toHaveLength(4);
      expect(report.candidate).toBeNull();
      expect(report.cases.every((row) => row.verdict === null)).toBe(true);
      const attempted =
        mode === "cleanup" || mode === "partial"
          ? 4
          : mode === "admit-failure" ||
              mode === "pre-cancel" ||
              mode === "lifecycle-only"
            ? 0
            : 1;
      expect(report.cases.filter((row) => row.runId !== null)).toHaveLength(
        attempted,
      );
      if (mode === "lifecycle-only")
        expect(report.sourceState).toBe("unsupported");
      else if (mode === "partial") {
        expect(f.record.sourceRecords[0]!.file).toBe(
          "experiment-run-failed.json",
        );
        expect(report.cases[0]!.disposition).toBe("failed_publication");
        expect(
          await fs.readFile(
            path.join(
              f.config.protectedRoot,
              f.record.sourceRecords[0]!.directory,
              "experiment-run.json",
            ),
            "utf8",
          ),
        ).toBe(sentinel);
      } else if (attempted > 0) {
        expect(
          report.cases
            .filter((row) => row.runId)
            .every((row) => row.disposition === "unlinked_failure"),
        ).toBe(true);
        expect(report.cases[0]!.run!.status).toBe(
          mode === "timeout"
            ? "timed_out"
            : mode === "cancel"
              ? "cancelled"
              : mode === "cleanup"
                ? "blocked"
                : "failed",
        );
      }
      const suppliedButInvalid = {
        schemaVersion: "offline-evidence-disclosure.v1",
      };
      expect(
        (await reviewOfflineEvidence(f.config, f.selection, suppliedButInvalid))
          .candidate,
      ).toBeNull();
    },
  );
  it("reports an absent original and a missing source reference, never backfilling diagnostics", async () => {
    const f = await produced();
    await fs.rm(f.sourceFile());
    let report = await reviewOfflineEvidence(f.config, f.selection);
    expect(report.cases[0]).toMatchObject({
      disposition: "original_missing",
      run: null,
      verdict: null,
      reasons: ["ORIGINAL_UNAVAILABLE"],
    });
    f.record.sourceRecords.splice(1, 1);
    await f.repinAcceptance();
    report = await reviewOfflineEvidence(f.config, f.selection);
    expect(report.cases[1]!.reasons).toContain("SOURCE_REFERENCE_MISSING");
    expect(report.sourceState).toBe("incomplete");
  });
  it.each([
    "acceptance",
    "plan",
    "context",
    "run",
    "bundle",
    "check",
    "disappear",
  ])(
    "invalidates changed %s after an earlier successful review",
    async (target) => {
      const f = await produced();
      const approval = await f.disclose();
      expect(
        (await reviewOfflineEvidence(f.config, f.selection, approval))
          .candidate,
      ).not.toBeNull();
      const entry = f.record.entries[0]!;
      const file =
        target === "acceptance"
          ? f.acceptanceFile
          : target === "plan"
            ? f.contextFile(f.record.acceptanceId)
            : target === "context"
              ? f.contextFile(entry.identity.runId)
              : target === "run" || target === "disappear"
                ? f.sourceFile()
                : path.join(
                    f.config.protectedRoot,
                    entry.directory,
                    target === "bundle"
                      ? "evaluation.json"
                      : "checks/build.json",
                  );
      if (target === "disappear") await fs.rm(file);
      else await replace(file, "inert changed bytes");
      if (target === "acceptance")
        await expect(
          reviewOfflineEvidence(f.config, f.selection, approval),
        ).rejects.toThrow();
      else
        expect(
          (await reviewOfflineEvidence(f.config, f.selection, approval))
            .candidate,
        ).toBeNull();
    },
  );
  it.each([
    "missing-pin",
    "stale-implementation",
    "wrong-evaluator",
    "wrong-fixture",
    "cross-run",
    "extra-reference",
    "duplicate",
    "missing-case",
    "extra-observation",
  ])("rejects %s without trusting acceptance strings", async (kind) => {
    const f = await produced();
    if (kind === "missing-pin") f.selection.pins = null;
    if (kind === "stale-implementation")
      f.selection.pins!.implementationSha256 = "0".repeat(64);
    if (kind === "wrong-evaluator")
      f.selection.pins!.evaluatorSha256 = "0".repeat(64);
    if (kind === "wrong-fixture")
      f.selection.pins!.fixtureSha256 = "0".repeat(64);
    if (kind === "cross-run")
      f.record.entries[0]!.identity.runId = f.record.entries[1]!.identity.runId;
    if (kind === "extra-reference")
      f.record.sourceRecords[0]!.runId = randomUUID();
    if (kind === "duplicate")
      f.record.sourceRecords[1] = f.record.sourceRecords[0]!;
    if (kind === "missing-case") f.record.casePlan.pop();
    if (kind === "extra-observation")
      f.record.observations.push({ scenario: "baseline", runId: randomUUID() });
    await f.repinAcceptance();
    const report = await reviewOfflineEvidence(f.config, f.selection);
    expect(report.sourceState).toBe("invalid");
    expect(report.cases.every((row) => row.verdict === null)).toBe(true);
  });
  it.each([
    "variant",
    "metric-zero",
    "provenance",
    "baseline",
    "timestamp",
    "receipt-link",
    "profile",
  ])("rejects repinned synthetic %s relationship drift", async (kind) => {
    const f = await produced();
    const run = await f.run();
    if (kind === "variant") run.variant = "B";
    if (kind === "metric-zero") run.metrics.tokens = 0;
    if (kind === "provenance") run.evidenceOrigin = "measured";
    if (kind === "baseline") run.repoCommit = "0".repeat(40);
    if (kind === "timestamp") run.endedAt = "2026-01-01T00:00:00.000Z";
    if (kind === "receipt-link") run.receiptId = "forged-receipt";
    if (kind === "profile") {
      const file = f.contextFile(run.id);
      const context = JSON.parse(await fs.readFile(file, "utf8"));
      context.profile.agent = "invented-agent";
      f.selection.caseContexts[0]!.sha256 = await replace(file, context);
    }
    f.record.sourceRecords[0]!.sha256 = await replace(f.sourceFile(), run);
    await f.repinAcceptance();
    const report = await reviewOfflineEvidence(f.config, f.selection);
    expect(report.cases[0]!.disposition).toBe("invalid");
    expect(report.candidate).toBeNull();
  });
  it.each([
    "source-set",
    "subset",
    "run-digest",
    "metadata",
    "baseline",
    "time",
    "category",
  ])("requires exact separately supplied %s disclosure", async (kind) => {
    const f = await produced();
    const approval = await f.disclose();
    if (kind === "source-set") approval.sourceSetSha256 = "0".repeat(64);
    if (kind === "subset") approval.sources.pop();
    if (kind === "run-digest")
      approval.sources[0]!.publicRunSha256 = "0".repeat(64);
    if (kind === "metadata") approval.sources[0]!.metadata.checks.pop();
    if (kind === "baseline")
      approval.certificate.baselineCommit = "0".repeat(40);
    if (kind === "time") approval.certificate.generatedAt = f.record.startedAt;
    if (kind === "category")
      approval.sources[0]!.metadata.category = "recorded_checks";
    const report = await reviewOfflineEvidence(f.config, f.selection, approval);
    expect(report.disclosure).toBe("invalid");
    expect(report.candidate).toBeNull();
  });
  it("withholds complete-run approval for private frozen text rather than redacting originals", async () => {
    const f = await produced();
    const run = await f.run();
    run.limitations.push(sentinel);
    f.record.sourceRecords[0]!.sha256 = await replace(f.sourceFile(), run);
    await f.repinAcceptance();
    const report = await reviewOfflineEvidence(f.config, f.selection);
    expect(report.cases[0]!.run!.limitations).toContain(sentinel);
    expect(report.candidate).toBeNull();
    const withheld = await f.disclose();
    withheld.sources[0]!.publicRunSha256 = "0".repeat(64); // No full-field approval.
    const result = await reviewOfflineEvidence(f.config, f.selection, withheld);
    expect(result.disclosure).toBe("invalid");
    expect(result.candidate).toBeNull();
    expect(JSON.stringify(reviewConsoleSummary(result))).not.toContain(
      sentinel,
    );
    expect((await f.run()).limitations).toContain(sentinel);
  });
  it.each(["run", "context", "acceptance-wrapper", "evaluation-wrapper"])(
    "preserves the producer's %s serialization rules",
    async (kind) => {
      const f = await produced();
      if (kind === "run")
        f.record.sourceRecords[0]!.sha256 = await replace(
          f.sourceFile(),
          await f.run(),
          false,
        );
      if (kind === "context") {
        const file = f.contextFile(f.record.sourceRecords[0]!.runId);
        f.selection.caseContexts[0]!.sha256 = await replace(
          file,
          JSON.parse(await fs.readFile(file, "utf8")),
          false,
        );
      }
      if (kind === "evaluation-wrapper") {
        const entry = f.record.entries[0]!;
        const file = path.join(
          f.config.protectedRoot,
          entry.directory,
          "evaluation.json",
        );
        entry.bundleSha256 = await replace(
          file,
          JSON.parse(await fs.readFile(file, "utf8")),
          false,
        );
      }
      await f.repinAcceptance(); // Original acceptance format is already pretty JSON.
      const report = await reviewOfflineEvidence(f.config, f.selection);
      expect(report.sourceState).toBe(
        kind === "run" || kind === "context" ? "incomplete" : "validated",
      );
    },
  );
  it.each([
    "symlink",
    "hardlink",
    "permissions",
    "directory-mode",
    "alias",
    "coordination-alias",
    "traversal",
    "oversize",
    "ownership",
  ])("rejects %s custody without modifying originals", async (kind) => {
    const f = await produced();
    const file = f.sourceFile();
    const bytes = await fs.readFile(file);
    if (kind === "symlink") {
      await fs.rename(file, `${file}.original`);
      await fs.symlink(`${file}.original`, file);
    }
    if (kind === "hardlink") await fs.link(file, `${file}.alias`);
    if (kind === "permissions") await fs.chmod(file, 0o440);
    if (kind === "directory-mode") await fs.chmod(path.dirname(file), 0o750);
    if (kind === "alias") {
      const alias = path.join(f.root, "root-alias");
      await fs.symlink(f.config.protectedRoot, alias);
      f.config.protectedRoot = alias;
    }
    if (kind === "coordination-alias") {
      const alias = path.join(f.root, "coordination-alias");
      await fs.symlink(f.config.coordinationRoot, alias);
      f.config.coordinationRoot = alias;
    }
    if (kind === "traversal")
      f.record.sourceRecords[0]!.directory = "../escape";
    if (kind === "oversize") await replace(file, "x".repeat(1_048_577));
    if (kind === "ownership") {
      const actual = fs.lstat;
      vi.spyOn(fs, "lstat").mockImplementation(async (...args) => {
        const stat = await actual(...args);
        return args[0] === file
          ? Object.assign(stat, { uid: (process.getuid?.() ?? 0) + 1 })
          : stat;
      });
    }
    if (kind === "traversal") await f.repinAcceptance();
    if (kind === "alias" || kind === "coordination-alias")
      await expect(
        reviewOfflineEvidence(f.config, f.selection),
      ).rejects.toThrow();
    else
      expect(
        (await reviewOfflineEvidence(f.config, f.selection)).sourceState,
      ).not.toBe("validated");
    if (!["oversize", "traversal", "alias"].includes(kind))
      expect(await fs.readFile(file)).toEqual(bytes);
  });
  it("detects mutation after a protected read and after certificate service invocation", async () => {
    const f = await produced();
    const originalRead = privateFiles.protectedRead;
    let changed = false;
    vi.spyOn(privateFiles, "protectedRead").mockImplementation(
      async (file, limit) => {
        const bytes = await originalRead(file, limit);
        if (file === f.sourceFile() && !changed) {
          changed = true;
          await replace(file, "synthetic concurrent mutation");
        }
        return bytes;
      },
    );
    const result = await reviewOfflineEvidence(f.config, f.selection);
    expect(result.sourceState).toBe("invalid");
    expect(result.cases.every((row) => row.verdict === null)).toBe(true);
    vi.restoreAllMocks();
    const second = await produced();
    const approval = await second.disclose();
    const actual = certificates.loadRecordedCertificates;
    vi.spyOn(certificates, "loadRecordedCertificates").mockImplementation(
      async (config) => {
        const catalog = await actual(config);
        await fs.rm(second.sourceFile());
        return catalog;
      },
    );
    const reviewed = await reviewOfflineEvidence(
      second.config,
      second.selection,
      approval,
    );
    expect(reviewed.sourceState).toBe("incomplete");
    expect(reviewed.disclosure).toBe("unavailable");
    expect(reviewed.candidate).toBeNull();
  });
  it("rejects cloned protected-store results rather than trusting serialized origin", async () => {
    const f = await produced();
    const actual = storeModule.createProtectedEvaluationStore;
    vi.spyOn(storeModule, "createProtectedEvaluationStore").mockImplementation(
      async (config) => {
        const store = await actual(config);
        return Object.freeze({
          load: async (id: string) => structuredClone(await store.load(id)),
        });
      },
    );
    const report = await reviewOfflineEvidence(f.config, f.selection);
    expect(
      report.cases.every(
        (row) =>
          row.verdict === null &&
          row.reasons.includes("EVALUATION_UNAVAILABLE"),
      ),
    ).toBe(true);
    expect(report.candidate).toBeNull();
  });
  it("leaves no completed review after interrupted output publication, and refuses overlapping outputs", async () => {
    const f = await produced();
    const report = await reviewOfflineEvidence(
      f.config,
      f.selection,
      await f.disclose(),
    );
    const out = path.join(f.root, "interrupted-review");
    vi.spyOn(fs, "link").mockRejectedValueOnce(new Error(sentinel));
    await expect(writePrivateReview(out, report, f.config)).rejects.toThrow();
    expect(existsSync(path.join(out, "review.json"))).toBe(false);
    vi.restoreAllMocks();
    for (const output of [
      path.join(f.config.protectedRoot, "review"),
      path.join(f.config.scratchRoot, "review"),
    ])
      await expect(
        writePrivateReview(output, report, f.config),
      ).rejects.toThrow();
  });
  it("keeps selection inputs frozen and output ordering stable", async () => {
    const f = await produced();
    const before = canonicalJson(f.selection);
    Object.freeze(f.selection.caseContexts);
    Object.freeze(f.selection);
    const one = await reviewOfflineEvidence(f.config, f.selection);
    expect(await reviewOfflineEvidence(f.config, f.selection)).toEqual(one);
    expect(canonicalJson(f.selection)).toBe(before);
  });
  it("has no execution, runner, provider or dynamic-loading capability in its local import closure", () => {
    const visited = new Set<string>();
    function walk(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      expect(file).not.toMatch(/scripts\/experiments\/runner\//);
      expect(file).not.toMatch(/src\/server\/(meta|providers)\//);
      const code = readFileSync(file, "utf8");
      const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
            return;
          const specifier = node.moduleSpecifier.text;
          expect(specifier).not.toMatch(
            /^(node:)?(child_process|vm|worker_threads|net|tls|module)$/,
          );
          if (specifier.startsWith(".") || specifier.startsWith("@/")) {
            const base = specifier.startsWith("@/")
              ? path.resolve("src", specifier.slice(2))
              : path.resolve(path.dirname(file), specifier);
            const resolved = [base, `${base}.ts`, `${base}.mjs`].find((name) =>
              existsSync(name),
            );
            expect(resolved).toBeTruthy();
            walk(resolved!);
          }
        }
        if (ts.isCallExpression(node))
          expect(
            [
              "require",
              "eval",
              "Function",
              "process.getBuiltinModule",
            ].includes(node.expression.getText(ast)) ||
              node.expression.kind === ts.SyntaxKind.ImportKeyword,
          ).toBe(false);
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
    walk(
      path.resolve(
        "scripts/experiments/artifacts/offline-evidence-review-cli.ts",
      ),
    );
    expect(visited.size).toBeGreaterThan(5);
  });
});

describe("private review CLI", () => {
  it.each([{ args: [] }, { args: ["--help"] }])(
    "default/help performs no protected reads",
    async ({ args }) => {
      const read = vi.spyOn(privateFiles, "protectedRead");
      const output: string[] = [];
      expect(await runReviewCli(args, (value) => output.push(value))).toBe(0);
      expect(output.join()).toContain("No runtime");
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(
    [
      ["--execute"],
      ["--help", "--config", "/private/config"],
      ["--config", "relative"],
      ["--config=/private/one", "--config=/private/two"],
      [
        "--config",
        "/one",
        "--request",
        "/two",
        "--output",
        "/three",
        "--root",
        "/other",
      ],
    ].map((args) => ({ args })),
  )(
    "rejects invalid/conflicting options before protected reads",
    async ({ args }) => {
      const read = vi.spyOn(privateFiles, "protectedRead");
      const output: string[] = [];
      expect(await runReviewCli(args, (value) => output.push(value))).toBe(1);
      expect(output).toEqual(['{"status":"INVALID_ARGUMENTS"}\n']);
      expect(read).not.toHaveBeenCalled();
      expect(() => parseReviewArguments(args)).toThrow();
    },
  );
  it("writes a private report and candidate through the actual strict CLI path with safe console output", async () => {
    const f = await produced();
    const configFile = path.join(f.root, "offline.json"),
      requestFile = path.join(f.root, "selection.json"),
      approvalFile = path.join(f.root, "disclosure.json");
    for (const [file, value] of [
      [configFile, f.config],
      [requestFile, f.selection],
      [approvalFile, await f.disclose()],
    ] as const)
      await fs.writeFile(file, canonicalJson(value), {
        flag: "wx",
        mode: 0o600,
      });
    const lines: string[] = [];
    const args = [
      "--config",
      configFile,
      "--request",
      requestFile,
      "--output",
      path.join(f.root, "cli-report"),
      "--approval",
      approvalFile,
    ];
    expect(await runReviewCli(args, (value) => lines.push(value))).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      sourceState: "validated",
      disclosure: "validated",
      publication: "NOT_PERFORMED",
      declaredCases: 4,
      authenticatedCases: 4,
      candidatePrepared: true,
    });
    expect(lines.join()).not.toContain(f.root);
    expect(lines.join()).not.toContain(sentinel);
    const report = JSON.parse(
      (
        await readPrivateReviewInput(
          path.join(f.root, "cli-report/review.json"),
        )
      ).toString(),
    );
    expect(report.candidate.demo.certificates).toHaveLength(1);
    expect(await runReviewCli(args, (value) => lines.push(value))).toBe(1);
    expect(lines.at(-1)).toBe(
      '{"status":"REVIEW_UNAVAILABLE","publication":"NOT_PERFORMED"}\n',
    );
  });
});
