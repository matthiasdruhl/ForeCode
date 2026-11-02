// Synthetic terminal records and sealed inert files only. No candidate, signer,
// guest, provider, historical evidence, or fake production-session brand.
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExperimentRunV1Schema } from "../../src/lib/contracts/evidence";
import { unknownMetrics } from "../../src/lib/experiment/metrics";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { RuntimeObservationSchema } from "../../scripts/experiments/tournament/measured";
import type { PairedOutcome } from "../../scripts/experiments/tournament/paired";
import {
  classifyIncompleteHandoff,
  retainIncompleteHandoff,
  type RuntimeOriginalCoverage,
} from "../../scripts/experiments/tournament/incomplete-handoff";
import { teamGradeData } from "../support/team-grade-data";

const declaredArms = [
  { variant: "A", runId: "synthetic-run-A" },
  { variant: "B", runId: "synthetic-run-B" },
] as const;
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    for (const arm of declaredArms)
      await chmod(path.join(root, "runtime", arm.runId), 0o700).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

function outcome(observed = false): PairedOutcome {
  const { report } = teamGradeData();
  return {
    kind: "supervised_team_paired_lifecycle",
    studyId: "synthetic-study16-shaped-case",
    execution: observed ? "OBSERVED" : "INCOMPLETE",
    cleanupConfirmed: true,
    leaseReleased: true,
    blockers: [],
    attempts: declaredArms.map(({ variant, runId }) => {
      const completed = observed || variant === "A";
      const run = ExperimentRunV1Schema.parse({
        schemaVersion: "experiment-run.v1",
        id: runId,
        variant,
        status: completed ? "completed" : "timed_out",
        repoCommit: "1".repeat(40),
        evaluatedTreeSha256: completed ? report.evaluatedTreeSha256 : null,
        fixtureSha256: "1".repeat(64),
        agentConfigSha256: "2".repeat(64),
        evaluatorSha256: report.evaluatorSha256,
        requiredPolicySha256: report.requiredPolicySha256,
        isolationAttestationId: null,
        seed: null,
        startedAt: "2026-11-02T03:00:00.000Z",
        endedAt: "2026-11-02T03:07:19.000Z",
        verificationId: completed ? `verify-${runId}` : null,
        receiptId: completed ? `receipt-${runId}` : null,
        metrics: unknownMetrics(),
        evidenceOrigin: "none",
        presentationMode: "recorded",
        limitations: ["Synthetic terminal data, never measured evidence."],
      });
      return {
        variant,
        run,
        candidateTreeSha256: run.evaluatedTreeSha256,
        changedFiles: completed ? ["src/inert.ts"] : null,
        cleanupConfirmed: true,
        finalizationConfirmed: completed,
        publicReadiness: completed
          ? {
              status: "READY",
              reason: "public-checks-passed",
              candidateSha256: "3".repeat(64),
              outputSha256: "4".repeat(64),
            }
          : null,
        grade: completed ? { ...report, runId } : null,
        failure: completed
          ? null
          : "PAIRED_ATTEMPT_BLOCKED_INTERRUPTED_OR_INVALID",
      };
    }),
  };
}

async function fixture(
  pair = outcome(),
  present: readonly ("A" | "B")[] = ["A"],
) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-incomplete-control-")),
  );
  roots.push(root);
  const outputDirectory = path.join(root, "output");
  const runtimeOriginalRoot = path.join(root, "runtime");
  await mkdir(outputDirectory, { mode: 0o700 });
  await mkdir(runtimeOriginalRoot, { mode: 0o700 });
  for (const arm of declaredArms) {
    const directory = path.join(runtimeOriginalRoot, arm.runId);
    await mkdir(directory, { mode: 0o700 });
    if (present.includes(arm.variant)) {
      const run = pair.attempts.find((a) => a.variant === arm.variant)!.run;
      const manifest = [
        { path: "src/inert.ts", sha256: sha256("// never execute\n") },
      ];
      const original = RuntimeObservationSchema.parse({
        schemaVersion: "tournament-runtime-original.local.v1",
        origin: "actual_supervised_agent", // Required schema token, not an authenticity claim.
        run,
        implementationSha256: "5".repeat(64),
        taskDefinitionSha256: "6".repeat(64),
        sharedTaskSha256: "7".repeat(64),
        initialManifest: manifest,
        finalManifest: manifest,
        baselineRunId: `baseline-${arm.variant}`,
        deviations: [],
        finalization: {
          terminationConfirmed: true,
          restartAbsenceConfirmed: true,
          exportWithoutGuestExecution: true,
        },
        cleanup: {
          workersAbsent: true,
          scratchRemoved: true,
          ownedLeaseReleased: true,
        },
      });
      await writeFile(
        path.join(directory, "runtime-observation.json"),
        canonicalJson(original),
        { flag: "wx", mode: 0o400 },
      );
    }
    await chmod(directory, 0o500);
  }
  return { outputDirectory, runtimeOriginalRoot, outcome: pair, declaredArms };
}

describe("finite incomplete primary handoff", () => {
  it("retains the two-attempt Study16 shape before any report/original can be invented", async () => {
    const input = await fixture();
    const before = jsonDigest(input.outcome);
    const result = await retainIncompleteHandoff(input);
    expect(result).not.toBeNull();
    const bytes = await readFile(result!.file);
    const retained = JSON.parse(bytes.toString("utf8"));
    expect(sha256(bytes)).toBe(result!.sha256);
    expect(retained).toMatchObject({
      pairedOutcomeSha256: before,
      actualAttemptIds: ["synthetic-run-A", "synthetic-run-B"],
      execution: "INCOMPLETE",
      pairStatus: "TWO_ATTEMPTS_INCOMPLETE_EXECUTION_OR_EVIDENCE",
      primaryBlockers: [],
      metricsAuthority: null,
      completeComparativeReport: false,
      publication: "UNSIGNED_NOT_PUBLISHED",
      retry: "NONE",
      providerCallsByRecovery: 0,
      guestActionsByRecovery: 0,
    });
    expect(retained.reasons).toEqual([
      "EXECUTION_NOT_OBSERVED",
      "RUNTIME_ORIGINALS_MISSING",
    ]);
    expect(retained.missingRuntimeOriginals).toEqual([declaredArms[1]]);
    expect(retained.runtimeOriginals[0].state).toBe("PRESENT_RAW_STRUCTURAL");
    expect(retained.runtimeCoverageAuthority).toBe(
      "RAW_STRUCTURAL_ONLY_NOT_AUTHENTICATED_EXECUTION",
    );
    expect((await lstat(result!.file)).mode & 0o777).toBe(0o400);
    expect(jsonDigest(input.outcome)).toBe(before);
    await expect(
      lstat(
        path.join(
          input.runtimeOriginalRoot,
          declaredArms[1].runId,
          "runtime-observation.json",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(retainIncompleteHandoff(input)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(result!.file)).toEqual(bytes);
  });

  it("keeps a full observed pair on the unchanged ordinary authentication path", async () => {
    const input = await fixture(outcome(true), ["A", "B"]);
    expect(await retainIncompleteHandoff(input)).toBeNull();
    await expect(
      lstat(path.join(input.outputDirectory, "terminal-failure.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records missing structural coverage separately without rewriting OBSERVED", async () => {
    const result = await retainIncompleteHandoff(await fixture(outcome(true)));
    expect(result!.document.execution).toBe("OBSERVED");
    expect(result!.document.reasons).toEqual(["RUNTIME_ORIGINALS_MISSING"]);
    expect(result!.document.missingRuntimeOriginals).toEqual([declaredArms[1]]);
  });

  it.each([0, 1] as const)(
    "retains %i actual attempts without inventing missing attempts",
    async (count) => {
      const pair = outcome();
      pair.attempts = pair.attempts.slice(0, count);
      const result = await retainIncompleteHandoff(
        await fixture(pair, count ? ["A"] : []),
      );
      expect(result!.document.actualAttemptIds).toHaveLength(count);
      expect(result!.document.pairStatus).toBe(
        count ? "PARTIAL_DOWNSTREAM_ATTEMPTS" : "NO_DOWNSTREAM_ATTEMPTS",
      );
    },
  );

  it("still retains two attempts when raw originals exist but execution is incomplete", async () => {
    const result = await retainIncompleteHandoff(
      await fixture(outcome(), ["A", "B"]),
    );
    expect(result!.document.reasons).toEqual(["EXECUTION_NOT_OBSERVED"]);
  });

  it.each(["duplicate", "foreign", "variant", "declared-duplicate"] as const)(
    "rejects %s identities before retention",
    async (kind) => {
      const input = await fixture();
      if (kind === "duplicate")
        input.outcome.attempts[1] = structuredClone(input.outcome.attempts[0]!);
      if (kind === "foreign")
        input.outcome.attempts[1]!.run.id = "unrelated-run";
      if (kind === "variant") input.outcome.attempts[1]!.run.variant = "A";
      const arms =
        kind === "declared-duplicate"
          ? [declaredArms[0], declaredArms[0]]
          : declaredArms;
      await expect(
        retainIncompleteHandoff({ ...input, declaredArms: arms }),
      ).rejects.toThrow();
      await expect(
        lstat(path.join(input.outputDirectory, "terminal-failure.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it.each([
    "writable",
    "symlink",
    "hardlink",
    "malformed",
    "misbound",
  ] as const)(
    "refuses %s runtime bytes rather than treating them as missing",
    async (kind) => {
      const input = await fixture();
      const directory = path.join(
        input.runtimeOriginalRoot,
        declaredArms[0].runId,
      );
      const file = path.join(directory, "runtime-observation.json");
      await chmod(directory, 0o700);
      if (kind === "writable") await chmod(file, 0o600);
      if (kind === "symlink") {
        await rm(file);
        await symlink(path.join(directory, "missing-target"), file);
      }
      if (kind === "hardlink")
        await link(file, path.join(directory, "alias.json"));
      if (kind === "malformed" || kind === "misbound") {
        const raw = JSON.parse(await readFile(file, "utf8"));
        if (kind === "misbound") raw.run.id = "unrelated-run";
        await chmod(file, 0o600);
        await writeFile(file, kind === "malformed" ? "{}" : canonicalJson(raw));
        await chmod(file, 0o400);
      }
      await expect(retainIncompleteHandoff(input)).rejects.toThrow();
      await expect(
        lstat(path.join(input.outputDirectory, "terminal-failure.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("does not call unconfirmed cleanup a complete pair", () => {
    const pair = outcome(true);
    pair.leaseReleased = false;
    const runtimeOriginals: RuntimeOriginalCoverage[] = declaredArms.map(
      (a) => ({
        ...a,
        state: "PRESENT_RAW_STRUCTURAL",
        sha256: "a".repeat(64),
      }),
    );
    expect(
      classifyIncompleteHandoff({
        outcome: pair,
        declaredArms,
        runtimeOriginals,
      }).reasons,
    ).toEqual(["CLEANUP_OR_LEASE_UNCONFIRMED"]);
  });
});
