import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  link,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  protectedMetricFixture,
  removeMetricFixture,
} from "../support/protected-metrics";
import {
  createProtectedMetricObservationReader,
  isAuthenticatedMetricObservation,
  metricMeasurementStatus,
  metricBaselineEvaluationRunId,
} from "../../scripts/experiments/tournament/metric-observation";
import { GradeIdentitySchema } from "../../scripts/evaluator/booking-v1/grade-profile";
import { validRun } from "../../scripts/evaluator/booking-v1/lifecycle.mjs";
import {
  collectSealedMetricSnapshot,
  validateMetricManifest,
} from "../../scripts/evaluator/booking-v1/metric-snapshot";
import { readProtectedAuthorizationCases } from "../../scripts/evaluator/booking-v1/metric-authorization";
import { jsonDigest } from "@/lib/report/digests";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
async function fixture(
  options: Parameters<typeof protectedMetricFixture>[0] = {},
) {
  const f = await protectedMetricFixture(options);
  roots.push(f.parent);
  return f;
}
describe("SYNTHETIC protected metric integration — test-owned custody only", () => {
  it("uses the prospectively fixed v2 baseline UUID accepted by the actual guest identity gate", () => {
    const downstream = "11111111-1111-4111-8111-111111111111";
    const baseline = metricBaselineEvaluationRunId(downstream);
    expect(baseline).toBe("3981c268-f829-421a-a8e0-44c50883754a");
    expect(() => validRun(baseline)).not.toThrow();
    expect(() =>
      GradeIdentitySchema.parse({
        runId: baseline,
        evaluatedTreeSha256: "a".repeat(64),
        evaluatorSha256: "b".repeat(64),
        testSuiteSha256: "c".repeat(64),
        requiredPolicySha256: "d".repeat(64),
      }),
    ).not.toThrow();
    expect(baseline).not.toBe(downstream);
    expect(
      metricBaselineEvaluationRunId("22222222-2222-4222-8222-222222222222"),
    ).not.toBe(baseline);
    expect(() => validRun(`metric-baseline-${downstream}`)).toThrow();
    expect(() =>
      metricBaselineEvaluationRunId(`metric-baseline-${downstream}`),
    ).toThrow();
  });
  it.each([
    ['import "./service";', "", "supported", 1, 0],
    ["", "", "contradicted", 0, 0],
    ['import "./service";', 'import "./service";', "contradicted", 1, 1],
    ["", 'import "./service";', "contradicted", 0, 1],
  ] as const)(
    "seals, collects, authenticates and compares %s / %s",
    async (codeA, codeB, prediction, a, b) => {
      const f = await fixture({ codeA, codeB });
      const result = await f.load();
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        authority: "AUTHENTICATED_SUPPLEMENTARY_METRICS",
        evidenceOrigin: "synthetic",
        predictionAssessment: prediction,
        independentSamples: 1,
        status: "complete",
        comparability: "COMPARABLE",
      });
      expect(
        result!.calculation.arms.map((a) => a.final.boundaryViolations),
      ).toEqual([a, b]);
      expect(result!.calculation.authorizationPreserved).toBe(true);
      expect(result!.effort[1]!.total.costUsd).toBeNull();
      expect(result!.effort[1]!.total.filesTouched).toBeNull();
      expect(isAuthenticatedMetricObservation(result)).toBe(true);
      expect(isAuthenticatedMetricObservation(structuredClone(result))).toBe(
        false,
      );
      expect(Object.isFrozen(result!.observations.arms)).toBe(true);
    },
  );
  it("keeps behavioral failures independent of architecture and counts cases once", async () => {
    const f = await fixture({ failB: true });
    const result = await f.load();
    expect(result?.predictionAssessment).toBe("supported");
    expect(result?.calculation.authorizationPreserved).toBe(false);
    expect(result?.calculation.arms[1]!.final).toEqual({
      boundaryViolations: 0,
      authorizationFailures: 1,
    });
    expect(result?.calculation.engineeringRecommendation).toBe(
      "DEFER_TO_AUTHENTICATED_DETERMINISTIC_REPORT",
    );
  });
  it.each(["baseline", "final"] as const)(
    "retains a missing %s as incomplete",
    async (role) => {
      const f = await fixture();
      f.original.arms[0]![role] = null;
      f.original.observations.arms[0]![role] = null;
      f.original.status = "incomplete";
      f.metricConfig.observationId = await f.publish();
      expect(await f.load()).toMatchObject({
        status: "incomplete",
        predictionAssessment: "not_established",
        independentSamples: 0,
      });
    },
  );
  it.each(["failed", "cancelled", "timed_out", "blocked"] as const)(
    "retains %s attempts and all preparation attempts and abstains",
    async (statusA) => {
      const f = await fixture({ statusA }),
        result = await f.load();
      expect(result).toMatchObject({
        status: "incomplete",
        predictionAssessment: "not_established",
        independentSamples: 0,
      });
      expect(result?.attempts).toHaveLength(2);
      expect(result?.preparationAttempts).toHaveLength(1);
      expect(result?.attempts[0]).toMatchObject({ status: statusA });
    },
  );
  it("retains an additional cancelled attempt and gates the complete static comparison", async () => {
    const f = await fixture(),
      load = f.metricConfig.loadContext;
    f.metricConfig.loadContext = async () => ({
      ...(await load()),
      additionalAttempts: [
        {
          ...f.loaded[0]!.original.run,
          id: "synthetic-extra-cancelled",
          status: "cancelled",
        },
      ],
    });
    const result = await f.load();
    expect(result).toMatchObject({
      predictionAssessment: "not_established",
      independentSamples: 0,
      calculation: {
        predictionAssessment: "not_established",
        abstentionReason: "RUN_COMPARISON_NOT_ESTABLISHED",
      },
    });
    expect(result?.attempts).toHaveLength(3);
  });
  it.each([
    "protocol",
    "evaluator",
    "suite",
    "arm",
    "run",
    "tree",
    "manifest",
    "boundary",
    "receipt",
    "case",
    "duplicate-case",
    "late-baseline",
    "early-final",
    "wrong-predecessor",
  ])("rejects freshly held but substituted %s", async (defect) => {
    const f = await fixture(),
      ref = f.original.arms[0]!.baseline!,
      s = ref.original;
    if (defect === "protocol")
      f.original.observations.protocolSha256 = "0".repeat(64);
    if (defect === "evaluator")
      s.authorization.identity.evaluatorSha256 = "0".repeat(64);
    if (defect === "suite")
      s.authorization.identity.testSuiteSha256 = "0".repeat(64);
    if (defect === "arm") s.variant = "B";
    if (defect === "run") s.runId = f.original.arms[1]!.runId;
    if (defect === "tree") s.treeSha256 = "0".repeat(64);
    if (defect === "manifest") s.manifest.pop();
    if (defect === "boundary")
      s.boundary.edges.push({ from: "src/service.ts", to: "src/service.ts" });
    if (defect === "receipt") s.authorization.receiptSha256 = "0".repeat(64);
    if (defect === "case") s.authorization.cases[0]!.caseId = "unfrozen-case";
    if (defect === "duplicate-case")
      s.authorization.cases.push(s.authorization.cases[0]!);
    if (defect === "late-baseline") s.finishedAt = "2026-10-28T12:06:01.000Z";
    if (defect === "early-final")
      f.original.arms[0]!.final!.original.startedAt =
        "2026-10-28T12:00:00.000Z";
    // Give modified snapshot fresh test-owned custody too: identity checks must
    // reject bad originals, independently of ordinary hash/signature tampering.
    for (const role of ["baseline", "final"] as const) {
      const r = f.original.arms[0]![role]!;
      r.custodyId = `replacement-${role}`;
      await f.hold({
        id: r.custodyId,
        studyId: f.metricConfig.protocol.studyId,
        kind: "telemetry",
        subjectSha256: jsonDigest(r.original),
        predecessorSha256:
          defect === "wrong-predecessor"
            ? f.loaded[1]!.admission.sha256
            : role === "baseline"
              ? f.loaded[0]!.admission.sha256
              : f.loaded[0]!.originalRecord.sha256,
        heldAt:
          role === "baseline"
            ? "2026-10-28T12:05:50.000Z"
            : "2026-10-28T12:10:00.000Z",
      });
    }
    f.metricConfig.observationId = await f.publish();
    expect(await f.load()).toBeNull();
  });
  it.each(["missing", "invalid", "not_run"] as const)(
    "abstains on %s authorization cases",
    async (outcome) => {
      const f = await fixture(),
        ref = f.original.arms[1]!.final!;
      if (outcome === "missing") ref.original.authorization.cases.pop();
      else ref.original.authorization.cases[0]!.outcome = outcome;
      ref.custodyId = "incomplete-case-original";
      await f.hold({
        id: ref.custodyId,
        studyId: f.metricConfig.protocol.studyId,
        kind: "telemetry",
        subjectSha256: jsonDigest(ref.original),
        predecessorSha256: f.loaded[1]!.originalRecord.sha256,
        heldAt: "2026-10-28T12:10:00.000Z",
      });
      f.original.observations.arms[1]!.final!.authorization =
        ref.original.authorization.cases;
      f.original.status = metricMeasurementStatus(
        f.metricConfig.protocol,
        f.original.observations,
      );
      f.metricConfig.observationId = await f.publish();
      expect(await f.load()).toMatchObject({
        status: "incomplete",
        predictionAssessment: "not_established",
      });
    },
  );
  it.each([
    "raw-observation",
    "raw-receipt",
    "stale-original",
    "signature",
    "revocations",
    "revoked-original",
    "source",
    "missing-manifest",
    "over-limit",
    "malformed",
  ])("rejects %s on a fresh read", async (defect) => {
    const f = await fixture();
    if (defect === "raw-observation")
      f.metricConfig.loadRecord = async () => ({
        record: {},
        sha256: "0".repeat(64),
      });
    if (defect === "raw-receipt") {
      const load = f.metricConfig.loadEvaluation;
      f.metricConfig.loadEvaluation = async (id) =>
        structuredClone(await load(id));
    }
    if (defect === "stale-original") {
      const file = path.join(f.config.originalRoot, "prepared-original.json");
      await chmod(file, 0o600);
      await writeFile(file, "{}");
    }
    if (defect === "signature") {
      const e = f.entries.get(f.metricConfig.observationId)!;
      const file = path.join(f.config.originalRoot, e.file);
      const data = JSON.parse(await readFile(file, "utf8"));
      data.signature = "A".repeat(86) + "==";
      await chmod(file, 0o600);
      await writeFile(file, JSON.stringify(data));
      // Even allowlisting the modified bytes does not bypass signature verification.
      const { sha256 } = await import("@/lib/report/digests");
      e.sha256 = sha256(await readFile(file));
    }
    if (defect === "revocations" || defect === "revoked-original") {
      const file = path.join(f.config.originalRoot, "revocations.json");
      await chmod(file, 0o600);
      await writeFile(file, JSON.stringify({ revokedIds: ["metric-final-B"] }));
    }
    if (defect === "source") {
      const file = path.join(f.sources.get("A")!.final!, "src/service.ts");
      await chmod(file, 0o600);
      await writeFile(file, "// substituted");
      await chmod(file, 0o400);
    }
    if (["missing-manifest", "over-limit", "malformed"].includes(defect)) {
      const file = path.join(f.root, "metric-observation.json");
      await chmod(file, 0o600);
      if (defect === "missing-manifest") {
        const data = structuredClone(f.original);
        Reflect.deleteProperty(data.arms[0]!.baseline!.original, "manifest");
        await writeFile(file, JSON.stringify(data));
      } else
        await writeFile(
          file,
          defect === "over-limit" ? " ".repeat(1_048_577) : Buffer.from([0xff]),
        );
      if (defect === "revoked-original") {
        const { sha256 } = await import("@/lib/report/digests");
        f.config.revocationSha256 = sha256(await readFile(file));
      }
    }
    expect(await f.load()).toBeNull();
  });
  it("refuses missing protected observation and a claimed fail under an all-pass receipt", async () => {
    const f = await fixture();
    const s = f.original.arms[0]!.final!.original;
    expect(() =>
      readProtectedAuthorizationCases(
        s.authorization,
        f.metricConfig.protocol,
        {},
      ),
    ).toThrow();
    const evalOriginal = await f.metricConfig.loadEvaluation(
      s.authorization.identity.runId,
    );
    s.authorization.cases[0]!.outcome = "fail";
    expect(() =>
      readProtectedAuthorizationCases(
        s.authorization,
        f.metricConfig.protocol,
        evalOriginal,
      ),
    ).toThrow();
    f.metricConfig.loadEvaluation = async () => null;
    expect(await f.load()).toBeNull();
  });
  it("rechecks originals at the end of loading", async () => {
    const f = await fixture(),
      load = f.metricConfig.loadRecord;
    let calls = 0;
    f.metricConfig.loadRecord = async (id) =>
      id === "metric-final-B" && ++calls > 1 ? null : load(id);
    expect(await f.load()).toBeNull();
  });
  it.each(["commitment", "baseline"] as const)(
    "rejects an authentic %s original that expired after its event but before assessment",
    async (kind) => {
      const f = await fixture();
      const baseline = f.original.arms[0]!.baseline!;
      const id = "expired-metric-original";
      const previous = (await f.metricConfig.loadRecord(
        kind === "commitment"
          ? f.metricConfig.commitmentId
          : baseline.custodyId,
      )) as import("../../scripts/experiments/tournament/custody").HeldRecord;
      const { schemaVersion, ...record } = previous.record;
      void schemaVersion;
      const expired = (await f.hold({
        ...record,
        id,
        expiresAt: "2026-10-28T12:07:00.000Z",
      }))!;
      if (kind === "commitment") {
        f.metricConfig.commitmentId = id;
        f.original.metricCommitmentSha256 = expired.sha256;
      } else baseline.custodyId = id;
      f.metricConfig.observationId = await f.publish();
      expect(await f.load()).toBeNull();
    },
  );
  it.each([
    "extra-file",
    "symlink",
    "hardlink",
    "writable",
    "extra-dir",
    "missing-file",
  ])(
    "rejects filesystem %s, even when the caller's file map looks complete",
    async (defect) => {
      const f = await fixture(),
        directory = f.sources.get("A")!.final!;
      const src = path.join(directory, "src");
      await chmod(directory, 0o700);
      await chmod(src, 0o700);
      if (defect === "extra-file")
        await writeFile(path.join(src, "omitted.ts"), "", { mode: 0o400 });
      if (defect === "extra-dir")
        await mkdir(path.join(src, "omitted"), { mode: 0o500 });
      if (defect === "symlink")
        await symlink(
          path.join(directory, "package-lock.json"),
          path.join(src, "omitted.ts"),
        );
      if (defect === "hardlink")
        await link(
          path.join(src, "service.ts"),
          path.join(f.parent, "linked.ts"),
        );
      if (defect === "missing-file") {
        const { unlink } = await import("node:fs/promises");
        await unlink(path.join(src, "service.ts"));
      }
      await chmod(src, 0o500);
      if (defect !== "writable") await chmod(directory, 0o500);
      const s = f.original.arms[0]!.final!.original;
      await expect(
        collectSealedMetricSnapshot({
          directory,
          manifest: s.manifest,
          treeSha256: s.treeSha256,
          protocol: f.metricConfig.protocol,
        }),
      ).rejects.toThrow();
    },
  );
  it.each([
    "../escape.ts",
    "/src/a.ts",
    "src/../a.ts",
    "src//a.ts",
    "src/./a.ts",
    "src/a\\b.ts",
  ])("rejects unsafe manifest path %s", (unsafe) => {
    const manifest = [{ path: unsafe, sha256: "a".repeat(64) }];
    expect(() =>
      validateMetricManifest(manifest, jsonDigest(manifest)),
    ).toThrow();
  });
  it("rejects duplicate/noncanonical manifests and fixed configuration overlap", async () => {
    const f = await fixture(),
      s = f.original.arms[1]!.final!.original;
    for (const manifest of [
      [...s.manifest].reverse(),
      [s.manifest[0], s.manifest[0]],
    ])
      expect(() =>
        validateMetricManifest(manifest, jsonDigest(manifest)),
      ).toThrow();
    f.metricConfig.workspaceRoots = [f.parent];
    expect(await f.load()).toBeNull();
    expect(
      await createProtectedMetricObservationReader({
        ...f.metricConfig,
        root: f.workspace,
      }).load(f.assessmentAt),
    ).toBeNull();
  });
});
