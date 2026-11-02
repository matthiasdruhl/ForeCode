// Real registered operator and finite filesystem retention. Only admission data
// and the guest/execution boundary are mocked; no candidate/signing/paid calls.
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ExperimentRunV1Schema } from "../../src/lib/contracts/evidence";
import { unknownMetrics } from "../../src/lib/experiment/metrics";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { RuntimeObservationSchema } from "../../scripts/experiments/tournament/measured";
import { runRegisteredTeamTournament } from "../../scripts/experiments/tournament/team-operator";
import { loadRegisteredTeamRuntime } from "../../scripts/experiments/tournament/team-config";
import { loadOperatorStudy } from "../../scripts/experiments/tournament/operator";
import {
  createSupervisedTeamTransport,
  isAdmittedSupervisedTeamTransport,
} from "../../scripts/experiments/tournament/supervised-team";
import {
  runPairedTournament,
  type PairedOutcome,
} from "../../scripts/experiments/tournament/paired";
import { teamGradeData } from "../support/team-grade-data";

vi.mock(
  "../../scripts/experiments/tournament/team-config",
  async (original) => ({
    ...(await original<
      typeof import("../../scripts/experiments/tournament/team-config")
    >()),
    loadRegisteredTeamRuntime: vi.fn(),
  }),
);
vi.mock("../../scripts/experiments/tournament/operator", async (original) => ({
  ...(await original<
    typeof import("../../scripts/experiments/tournament/operator")
  >()),
  loadOperatorStudy: vi.fn(),
}));
vi.mock(
  "../../scripts/experiments/tournament/supervised-team",
  async (original) => ({
    ...(await original<
      typeof import("../../scripts/experiments/tournament/supervised-team")
    >()),
    createSupervisedTeamTransport: vi.fn(),
    isAdmittedSupervisedTeamTransport: vi.fn(),
  }),
);
vi.mock("../../scripts/experiments/tournament/paired", async (original) => ({
  ...(await original<
    typeof import("../../scripts/experiments/tournament/paired")
  >()),
  runPairedTournament: vi.fn(),
}));

const roots: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const root of roots.splice(0)) {
    for (const variant of ["A", "B"])
      await chmod(path.join(root, "runtime", `synthetic-${variant}`), 0o700);
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(complete: boolean) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-operator-handoff-")),
  );
  roots.push(root);
  const id = "synthetic-study16-operator-case";
  const protectedRoot = path.join(root, "protected");
  const runtimeOriginalRoot = path.join(root, "runtime");
  for (const dir of [protectedRoot, runtimeOriginalRoot])
    await mkdir(dir, { mode: 0o700 });
  const arms = (["A", "B"] as const).map((variant) => ({
    variant,
    runId: `synthetic-${variant}`,
  }));
  const { report } = teamGradeData();
  const outcome: PairedOutcome = {
    kind: "supervised_team_paired_lifecycle",
    studyId: id,
    execution: complete ? "OBSERVED" : "INCOMPLETE",
    cleanupConfirmed: true,
    leaseReleased: true,
    blockers: [],
    attempts: arms.map(({ variant, runId }) => {
      const finished = complete || variant === "A";
      const run = ExperimentRunV1Schema.parse({
        schemaVersion: "experiment-run.v1",
        id: runId,
        variant,
        status: finished ? "completed" : "timed_out",
        repoCommit: "1".repeat(40),
        evaluatedTreeSha256: finished ? report.evaluatedTreeSha256 : null,
        fixtureSha256: "1".repeat(64),
        agentConfigSha256: "2".repeat(64),
        evaluatorSha256: report.evaluatorSha256,
        requiredPolicySha256: report.requiredPolicySha256,
        isolationAttestationId: null,
        seed: null,
        startedAt: "2026-11-02T03:00:00.000Z",
        endedAt: "2026-11-02T03:07:19.000Z",
        verificationId: finished ? `verify-${runId}` : null,
        receiptId: finished ? `receipt-${runId}` : null,
        metrics: unknownMetrics(),
        evidenceOrigin: "none",
        presentationMode: "recorded",
        limitations: ["Synthetic fixture; no observed experiment."],
      });
      return {
        variant,
        run,
        candidateTreeSha256: run.evaluatedTreeSha256,
        changedFiles: finished ? ["src/inert.ts"] : null,
        cleanupConfirmed: true,
        finalizationConfirmed: finished,
        publicReadiness: finished
          ? {
              status: "READY",
              reason: "public-checks-passed",
              candidateSha256: "3".repeat(64),
              outputSha256: "4".repeat(64),
            }
          : null,
        grade: finished ? { ...report, runId } : null,
        failure: finished
          ? null
          : "PAIRED_ATTEMPT_BLOCKED_INTERRUPTED_OR_INVALID",
      };
    }),
  };
  for (const arm of arms) {
    const directory = path.join(runtimeOriginalRoot, arm.runId);
    await mkdir(directory, { mode: 0o700 });
    if (complete || arm.variant === "A") {
      const manifest = [
        { path: "src/inert.ts", sha256: sha256("// inert bytes only\n") },
      ];
      const original = RuntimeObservationSchema.parse({
        schemaVersion: "tournament-runtime-original.local.v1",
        origin: "actual_supervised_agent",
        run: outcome.attempts.find((a) => a.variant === arm.variant)!.run,
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
  // These two mock return values replace admission only. The real entry still
  // validates scope and calls the real retainer with its registered fixed roots.
  vi.mocked(loadRegisteredTeamRuntime).mockResolvedValue({
    registration: {
      studyRoot: path.join(root, "study"),
      study: {},
      runtime: {
        enabled: true,
        protectedRoot,
        runtimeOriginalRoot,
        coordinationRoot: path.join(root, "lease"),
        sources: {
          A: path.join(root, "source-A"),
          B: path.join(root, "source-B"),
        },
      },
    },
  } as unknown as NonNullable<
    Awaited<ReturnType<typeof loadRegisteredTeamRuntime>>
  >);
  vi.mocked(loadOperatorStudy).mockResolvedValue({
    definition: { protocol: { studyId: id, arms } },
  } as unknown as Awaited<ReturnType<typeof loadOperatorStudy>>);
  vi.mocked(createSupervisedTeamTransport).mockResolvedValue({
    kind: "supervised-team",
  } as Awaited<ReturnType<typeof createSupervisedTeamTransport>>);
  vi.mocked(isAdmittedSupervisedTeamTransport).mockReturnValue(true);
  vi.mocked(runPairedTournament).mockImplementation(async () => {
    await mkdir(path.join(protectedRoot, `paired-${id}`), { mode: 0o700 });
    return outcome;
  });
  return {
    id,
    outcome,
    runtimeOriginalRoot,
    file: path.join(protectedRoot, `paired-${id}`, "terminal-failure.json"),
  };
}

it("the real operator durably retains the two-attempt incomplete handoff before returning to report code", async () => {
  const f = await fixture(false);
  const original = await readFile(
    path.join(f.runtimeOriginalRoot, "synthetic-A/runtime-observation.json"),
  );
  const result = await runRegisteredTeamTournament(
    f.id,
    new AbortController().signal,
  ).then(async (outcome) => {
    const document = JSON.parse(await readFile(f.file, "utf8"));
    expect(document).toMatchObject({
      execution: "INCOMPLETE",
      pairedOutcomeSha256: jsonDigest(f.outcome),
      completeComparativeReport: false,
      actualAttemptIds: ["synthetic-A", "synthetic-B"],
    });
    expect(document.missingRuntimeOriginals).toEqual([
      { variant: "B", runId: "synthetic-B" },
    ]);
    return outcome;
  });
  expect(result).toBe(f.outcome);
  expect(vi.mocked(runPairedTournament)).toHaveBeenCalledTimes(1);
  expect((await lstat(f.file)).mode & 0o777).toBe(0o400);
  expect(
    await readFile(
      path.join(f.runtimeOriginalRoot, "synthetic-A/runtime-observation.json"),
    ),
  ).toEqual(original);
  await expect(
    lstat(
      path.join(f.runtimeOriginalRoot, "synthetic-B/runtime-observation.json"),
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("the real operator returns a full observed pair unchanged and does not emit a failure handoff", async () => {
  const f = await fixture(true);
  expect(
    await runRegisteredTeamTournament(f.id, new AbortController().signal),
  ).toBe(f.outcome);
  await expect(lstat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
});
