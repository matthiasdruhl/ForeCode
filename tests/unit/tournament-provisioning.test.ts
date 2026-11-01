// Entirely synthetic custody, keys, sources and observations. No private study.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "@/lib/report/canonical";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { disclosureSubject } from "@/lib/experiment/tournament-publication";
import {
  createTournamentPublicationReader,
  type ApprovedTournamentConfig,
} from "@/server/artifacts/tournament-provisioning";
import {
  inspectApprovedTournamentPublication,
  loadApprovedDecisionReports,
  loadApprovedTournamentRecordings,
} from "@/server/artifacts/recording-catalog";
import { loadTournamentRecordings } from "@/server/artifacts/tournament-recordings";
import { tournamentCli } from "../../scripts/experiments/tournament/cli";
import { publicationFixture } from "../support/tournament-publication";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(options: Parameters<typeof publicationFixture>[0] = {}) {
  const f = await publicationFixture(options);
  roots.push(f.parent);
  vi.spyOn(Date, "now").mockReturnValue(f.now);
  const config: ApprovedTournamentConfig = {
    ...f.config,
    registrations: f.config.registrations.map((r) => ({
      ...r,
      projectionSha256: jsonDigest(f.artifact.projection),
    })),
  };
  const used = new Set(
    config.registrations.flatMap((r) =>
      [...r.arms.values()].flatMap((a) => [
        a.baselineEvaluationId,
        a.futureEvaluationId,
      ]),
    ),
  );
  config.evaluations = {
    ...config.evaluations,
    entries: new Map(
      [...config.evaluations.entries].filter(([id]) => used.has(id)),
    ),
  };
  return {
    ...f,
    artifact: structuredClone(f.artifact),
    config,
    reader: createTournamentPublicationReader(config),
  };
}
async function replace(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
  await chmod(file, 0o400);
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function republish(f: Fixture, updateProjectionPin = true) {
  const id = "replacement-disclosure";
  await f.hold({
    id,
    studyId: f.report.studyId,
    kind: "disclosure",
    heldAt: f.assessmentAt,
    subjectSha256: disclosureSubject(f.artifact),
    predecessorSha256: f.report.preparedOriginalSha256,
  });
  const bytes = await readFile(path.join(f.root, `${id}.json`));
  const directory = path.join(f.config.publications.authorityRoot, id);
  await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(directory, "disclosure-original.json"), bytes, {
    mode: 0o400,
  });
  const publication = canonicalJson(f.artifact);
  await replace(f.publicationFile, publication);
  Object.assign(f.config.publications.entries.get(f.report.studyId)!, {
    publicationSha256: sha256(publication),
    disclosureId: id,
    disclosureSha256: sha256(bytes),
  });
  if (updateProjectionPin)
    f.config.registrations[0]!.projectionSha256 = jsonDigest(
      f.artifact.projection,
    );
}
async function expectUnavailable(f: Fixture, code: string) {
  expect((await f.reader.loadTournaments()).studies).toEqual([]);
  expect((await f.reader.loadReports()).reports).toEqual([]);
  const inspection = await f.reader.inspect();
  expect(inspection.state).toBe("unavailable");
  expect(inspection.failures).toEqual([
    {
      registrationIndex:
        code === "CONFIGURATION_INVALID" || code === "STORE_UNAVAILABLE"
          ? null
          : 0,
      code,
    },
  ]);
  const safe = canonicalJson(inspection);
  for (const secret of [
    f.parent,
    "PRIVATE_SENTINEL",
    "signature",
    "stack",
    "authorityPublicKeyPem",
    "src/service.ts",
  ])
    expect(safe).not.toContain(secret);
}

describe("source-owned tournament provisioning adapter", () => {
  it("keeps both production catalogs and inspection unprovisioned regardless of public flags", async () => {
    vi.stubEnv("TOURNAMENT_PUBLICATION_ENABLED", "true");
    try {
      expect(await loadApprovedTournamentRecordings()).toEqual({
        state: "empty",
        studies: [],
        unavailableCount: 0,
      });
      expect(await loadApprovedDecisionReports()).toEqual({
        state: "empty",
        reports: [],
        unavailableCount: 0,
      });
      expect(await inspectApprovedTournamentPublication()).toEqual({
        state: "empty",
        availableCount: 0,
        unavailableCount: 0,
        failures: [],
      });
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      expect(await tournamentCli(["--publication-status"])).toBe(2);
      expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual(
        await inspectApprovedTournamentPublication(),
      );
      expect(
        await tournamentCli(["--publication-status", "/PRIVATE_SENTINEL"]),
      ).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each([
    [{}, "INCONCLUSIVE"],
    [{ failB: true }, "KEEP"],
    [{ failA: true }, "REFACTOR"],
    [{ failA: true, failB: true }, "INCONCLUSIVE"],
    [{ noFutureB: true }, "INCONCLUSIVE"],
    [{ missingB: "team-permissions-adversarial" }, "INCONCLUSIVE"],
    [{ deviation: true }, "INCONCLUSIVE"],
    [{ failedAgent: true }, "INCONCLUSIVE"],
  ] as const)(
    "composes exact approved synthetic evidence %#",
    async (options, decision) => {
      const f = await fixture(options);
      expect((await f.reader.loadTournaments()).studies).toEqual([
        f.artifact.projection,
      ]);
      const report = (await f.reader.loadReports()).reports[0]!;
      expect(report.analysis.decision).toBe(decision);
      expect(report.provenance).toBe("FRESH_APPROVED_TOURNAMENT_LOADER");
      expect(report.analysis.provenance).toBe("UNAUTHENTICATED_ANALYSIS");
      expect(report.analysis.evidenceReferences!.projectionSha256).toBe(
        f.config.registrations[0]!.projectionSha256,
      );
      expect(report.analysis.observations!.attempts).toEqual(
        f.artifact.projection.attempts,
      );
      expect(report.analysis.observations!.preparationAttempts).toEqual(
        f.artifact.projection.preparationAttempts,
      );
      expect(await f.reader.inspect()).toEqual({
        state: "available",
        availableCount: 1,
        unavailableCount: 0,
        failures: [],
      });
      const publicOutput = canonicalJson(await f.reader.loadReports());
      for (const secret of [
        f.parent,
        "PRIVATE_SENTINEL",
        f.study.evidence.instructions,
        f.study.definition.protocol.task.specification,
        "signature",
        "authorityPublicKeyPem",
      ])
        expect(publicOutput).not.toContain(secret);
    },
  );
  it("retains observed preparation-inclusive totals without promoting effort preferences", async () => {
    const f = await fixture({ telemetry: true });
    Object.assign(f.config, {
      assumedCriterion: { metric: "costUsd", establishedBeforeExecution: true },
    });
    const r = (await f.reader.loadReports()).reports[0]!.analysis;
    expect(r.decision).toBe("INCONCLUSIVE");
    expect(r.headline).toBe("Correctness tie");
    expect(r.assumedCriterion).toBeNull();
    expect(r.observations!.arms[1]).toMatchObject({
      preparation: { costUsd: 0.5 },
      downstream: { costUsd: 0.1 },
      total: { costUsd: 0.6, filesTouched: null },
      reservedMicroUsd: 500000,
    });
  });
  it.each(["preparation", "downstream"] as const)(
    "keeps missing %s measurements unknown",
    async (phase) => {
      const f = await fixture();
      const arm = (await f.reader.loadReports()).reports[0]!.analysis
        .observations!.arms[1]!;
      expect(arm[phase].costUsd).toBeNull();
      expect(arm.total.costUsd).toBeNull();
    },
  );
  it.each([
    "duplicate-study",
    "unknown-study",
    "extra-study",
    "unknown-evaluation",
    "reused-evaluation",
    "extra-evaluation",
    "missing-arm",
    "missing-projection-pin",
    "reused-run",
  ])("fails before storage access for %s", async (defect) => {
    const f = await fixture();
    const r = f.config.registrations[0]!;
    if (defect === "duplicate-study") f.config.registrations = [r, r];
    if (defect === "unknown-study") r.studyId = "unknown-study";
    if (defect === "extra-study")
      f.config.publications.entries = new Map([
        ...f.config.publications.entries,
        ["unregistered", [...f.config.publications.entries.values()][0]!],
      ]);
    if (defect === "unknown-evaluation")
      r.arms.get("B")!.futureEvaluationId = "unknown-evaluation";
    if (defect === "reused-evaluation")
      r.arms.get("B")!.futureEvaluationId = r.arms.get("A")!.futureEvaluationId;
    if (defect === "extra-evaluation")
      f.config.evaluations.entries = new Map([
        ...f.config.evaluations.entries,
        ["unregistered", [...f.config.evaluations.entries.values()][0]!],
      ]);
    if (defect === "missing-arm") r.arms = new Map([["A", r.arms.get("A")!]]);
    if (defect === "missing-projection-pin")
      r.projectionSha256 = undefined as never;
    if (defect === "reused-run") {
      const a = f.config.evaluations.entries.get(
        r.arms.get("A")!.baselineEvaluationId,
      )!;
      f.config.evaluations.entries.get(
        r.arms.get("B")!.baselineEvaluationId,
      )!.identity.runId = a.identity.runId;
    }
    await expectUnavailable(f, "CONFIGURATION_INVALID");
  });
  it("does not mistake a failed registered final lookup for an approved absent final", async () => {
    const f = await fixture({ noFutureB: true });
    expect((await f.reader.loadReports()).state).toBe("available");
    f.config.registrations[0]!.arms.get("B")!.futureEvaluationId =
      "missing-final";
    // Existing lower-level API must preserve this distinction too.
    expect((await loadTournamentRecordings(f.config)).studies).toEqual([]);
    await expectUnavailable(f, "CONFIGURATION_INVALID");
  });
  it("rejects excessive registrations without exposing their data", async () => {
    const f = await fixture();
    f.config.registrations = Array(21).fill(f.config.registrations[0]);
    await expectUnavailable(f, "CONFIGURATION_INVALID");
  });
  it("contains malformed source configuration in the safe unavailable envelope", async () => {
    const reader = createTournamentPublicationReader({} as never);
    expect(await reader.inspect()).toMatchObject({
      state: "unavailable",
      failures: [{ registrationIndex: null, code: "CONFIGURATION_INVALID" }],
    });
    expect((await reader.loadTournaments()).studies).toEqual([]);
    expect((await reader.loadReports()).reports).toEqual([]);
  });
  it.each(["taskId", "taskDefinitionSha256", "model", "order"] as const)(
    "pins approved %s even with another genuine test signature",
    async (field) => {
      const f = await fixture();
      const p = f.artifact.projection;
      if (field === "taskId") p.taskId = "another-task";
      if (field === "taskDefinitionSha256")
        p.taskDefinitionSha256 = "e".repeat(64);
      if (field === "model") p.model = "another-model";
      if (field === "order") p.order = "B_then_A";
      await republish(f, false);
      await expectUnavailable(f, "APPROVED_PROJECTION_MISMATCH");
    },
  );
  it.each([
    "runId",
    "receiptId",
    "finalTreeSha256",
    "initialTreeSha256",
    "futureEvaluatorSha256",
    "baselineEvaluatorSha256",
    "check",
  ])("cross-checks %s independently of a signed projection", async (field) => {
    const f = await fixture();
    const p = f.artifact.projection;
    const b = p.arms[1]!;
    if (field === "runId") b.runId = "wrong-run";
    if (field === "receiptId") b.receiptId = "wrong-receipt";
    if (field === "finalTreeSha256") b.finalTreeSha256 = "e".repeat(64);
    if (field === "initialTreeSha256") b.initialTreeSha256 = "e".repeat(64);
    if (field === "futureEvaluatorSha256")
      p.futureEvaluatorSha256 = "e".repeat(64);
    if (field === "baselineEvaluatorSha256")
      p.baselineEvaluatorSha256 = "e".repeat(64);
    if (field === "check") b.checks[0]!.status = "not_run";
    await republish(f);
    await expectUnavailable(
      f,
      field === "initialTreeSha256" || field === "baselineEvaluatorSha256"
        ? "BASELINE_IDENTITY_MISMATCH"
        : field === "check"
          ? "CHECK_PROJECTION_MISMATCH"
          : "FUTURE_IDENTITY_MISMATCH",
    );
  });
  it.each(["baseline", "future"] as const)(
    "requires the original %s evaluation on repeated reads",
    async (phase) => {
      const f = await fixture();
      expect((await f.reader.loadReports()).state).toBe("available");
      const a = f.config.registrations[0]!.arms.get("A")!;
      const id =
        phase === "baseline" ? a.baselineEvaluationId : a.futureEvaluationId!;
      const directory = f.config.evaluations.entries.get(id)!.directory;
      await rm(path.join(f.evaluationRoot, directory, "evaluation.json"));
      await expectUnavailable(
        f,
        phase === "baseline"
          ? "BASELINE_EVIDENCE_UNAVAILABLE"
          : "FUTURE_EVIDENCE_UNAVAILABLE",
      );
    },
  );
  it.each([
    "publication",
    "disclosure",
    "evidence",
    "expired",
    "revoked",
    "store",
  ])("freshly withholds evidence after %s changes", async (defect) => {
    const f = await fixture({ failA: true });
    expect((await f.reader.loadReports()).reports[0]!.analysis.decision).toBe(
      "REFACTOR",
    );
    if (defect === "publication") await replace(f.publicationFile, "{}");
    if (defect === "disclosure") await replace(f.disclosureFile, "{}");
    if (defect === "evidence")
      await replace(
        path.join(
          f.evaluationRoot,
          f.loaded[0]!.original.run.id,
          f.loaded[0]!.future!.checks[0]!.evidencePath!,
        ),
        "PRIVATE_SENTINEL",
      );
    if (defect === "expired")
      vi.spyOn(Date, "now").mockReturnValue(
        Date.parse("2026-11-01T00:00:00.000Z"),
      );
    if (defect === "revoked") {
      const bytes = canonicalJson({ revokedIds: ["public-disclosure"] });
      await replace(f.revocationFile, bytes);
      // Even an operator-refreshed pin cannot bypass the actual revoked record.
      f.config.publications.revocationSha256 = sha256(bytes);
    }
    if (defect === "store")
      await rm(f.config.publications.root, { recursive: true });
    await expectUnavailable(
      f,
      defect === "evidence"
        ? "FUTURE_EVIDENCE_UNAVAILABLE"
        : defect === "store"
          ? "STORE_UNAVAILABLE"
          : "DISCLOSURE_UNAVAILABLE",
    );
  });
});
