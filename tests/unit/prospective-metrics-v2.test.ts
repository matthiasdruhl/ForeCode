// New v2 proposal semantics only; all custody, receipts and source are synthetic.
import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MetricProtocolSchema,
  MetricObservationsSchema,
  calculateProspectiveMetrics,
} from "@/lib/experiment/prospective-metrics";
import { jsonDigest } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import {
  createMetricBaselineAuthorizationNotApplicable,
  readMetricBaselineAuthorizationNotApplicable,
  SupplementaryMetricOriginalSchema,
  MetricSnapshotOriginalSchema,
  metricMeasurementStatus,
  createProtectedMetricObservationReader,
} from "../../scripts/experiments/tournament/metric-observation";
import {
  protectedMetricFixture,
  removeMetricFixture,
} from "../support/protected-metrics";
import { syntheticEvaluation } from "../support/tournament-evidence";

const na = { kind: "not_applicable_before_future_requirement" as const };
const hash = "a".repeat(64),
  edge = { from: "src/server/http.ts", to: "src/server/booking-store.ts" };
function calculation() {
  const protocol = MetricProtocolSchema.parse({
    schemaVersion: "prospective-tournament-metrics.v2",
    baselineAuthorization: na.kind,
    studyId: "synthetic-v2",
    hypothesisId: "11111111-1111-4111-8111-111111111111",
    contextSha256: hash,
    taskSha256: hash,
    matchedConditionsSha256: hash,
    evaluatorSha256: hash,
    suiteSha256: hash,
    policySha256: hash,
    externalPackages: [],
    stylesheetPaths: [],
    boundaryRules: [{ id: "http-store", ...edge }],
    authorizationCaseIds: ["synthetic-final-case"],
    observationWindow: "prepared_baseline_and_sealed_final_tree",
    duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
    prediction: "B_fewer_final_forbidden_edges_than_A",
  });
  const boundary = {
    complete: true,
    unresolvedImports: 0,
    scannedRuleIds: ["http-store"],
    edges: [] as (typeof edge)[],
  };
  const observations = MetricObservationsSchema.parse({
    schemaVersion: "prospective-tournament-observations.v2",
    studyId: protocol.studyId,
    protocolSha256: jsonDigest(protocol),
    taskSha256: hash,
    matchedConditionsSha256: hash,
    evaluatorSha256: hash,
    suiteSha256: hash,
    policySha256: hash,
    arms: (["A", "B"] as const).map((variant) => ({
      variant,
      runId: `synthetic-${variant}`,
      status: "completed",
      baseline: {
        treeSha256: hash,
        boundary: structuredClone(boundary),
        authorization: na,
      },
      final: {
        treeSha256: hash,
        boundary: {
          ...structuredClone(boundary),
          edges: variant === "A" ? [edge] : [],
        },
        authorization: [{ caseId: "synthetic-final-case", outcome: "pass" }],
      },
    })),
  });
  return {
    protocol,
    observations,
    calculate: () => calculateProspectiveMetrics(protocol, observations),
  };
}
describe("unregistered v2 baseline applicability and final-only future authorization", () => {
  it("keeps future baseline authorization unknown while assessing a strictly fewer boundary prediction", () => {
    const f = calculation(),
      result = f.calculate();
    expect(result.authority).toBe("UNAUTHENTICATED_METRIC_CALCULATION");
    expect(result.arms.map((a) => a.baseline.authorizationFailures)).toEqual([
      null,
      null,
    ]);
    expect(result).toMatchObject({
      predictionAssessment: "supported",
      authorizationPreserved: true,
      independentSamples: 1,
    });
    expect(metricMeasurementStatus(f.protocol, f.observations)).toBe(
      "complete",
    );
  });
  it("retains final authorization failure separately from boundary direction and never recommends adoption", () => {
    const f = calculation();
    f.observations.arms[1]!.final!.authorization[0]!.outcome = "fail";
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "supported",
      authorizationPreserved: false,
      engineeringRecommendation: "DEFER_TO_AUTHENTICATED_DETERMINISTIC_REPORT",
    });
  });
  it("contradicts zero/zero ties rather than claiming improvement", () => {
    const f = calculation();
    f.observations.arms[0]!.final!.boundary.edges = [];
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "contradicted",
      boundaryTie: true,
    });
  });
  it.each([
    "missing-baseline",
    "unknown-boundary",
    "missing-final-case",
    "invalid-final-case",
  ])("abstains for %s", (defect) => {
    const f = calculation();
    if (defect === "missing-baseline") f.observations.arms[0]!.baseline = null;
    if (defect === "unknown-boundary")
      f.observations.arms[0]!.baseline!.boundary.unresolvedImports = 1;
    if (defect === "missing-final-case")
      f.observations.arms[0]!.final!.authorization = [];
    if (defect === "invalid-final-case")
      f.observations.arms[0]!.final!.authorization[0]!.outcome = "invalid";
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "not_established",
      authorizationPreserved: null,
      independentSamples: 0,
    });
  });
  it("rejects applicability tags for v1 or final observations and rejects implicit version coercion", () => {
    const f = calculation(),
      raw = structuredClone(f.observations);
    expect(() =>
      MetricObservationsSchema.parse({
        ...raw,
        schemaVersion: "prospective-tournament-observations.v1",
      }),
    ).toThrow();
    const finalTag = structuredClone(raw) as unknown as {
      arms: { final: { authorization: unknown } }[];
    };
    finalTag.arms[0]!.final.authorization = na;
    expect(() => MetricObservationsSchema.parse(finalTag)).toThrow();
    const baselineArray = structuredClone(raw) as unknown as {
      arms: { baseline: { authorization: unknown } }[];
    };
    baselineArray.arms[0]!.baseline.authorization = [];
    expect(() => MetricObservationsSchema.parse(baselineArray)).toThrow();
    const { baselineAuthorization: _, ...v1 } = f.protocol as Extract<
      typeof f.protocol,
      { schemaVersion: "prospective-tournament-metrics.v2" }
    >;
    void _;
    expect(() =>
      calculateProspectiveMetrics(
        { ...v1, schemaVersion: "prospective-tournament-metrics.v1" },
        raw,
      ),
    ).toThrow("version mismatch");
    expect(() =>
      MetricProtocolSchema.parse({
        ...f.protocol,
        baselineAuthorization: undefined,
      }),
    ).toThrow();
  });
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
async function protectedV2(version: 2 | 3 = 2) {
  const f = await protectedMetricFixture();
  roots.push(f.parent);
  const protocol = MetricProtocolSchema.parse({
    ...f.original.protocol,
    schemaVersion:
      version === 3
        ? "prospective-tournament-metrics.v3"
        : "prospective-tournament-metrics.v2",
    baselineAuthorization: na.kind,
    ...(version === 3 ? { staticAssets: [] } : {}),
  });
  const commitment = await f.hold({
    id: "v2-metric-commitment",
    studyId: protocol.studyId,
    kind: "protocol",
    heldAt: "2026-10-28T12:00:00.000Z",
    subjectSha256: jsonDigest(protocol),
    predecessorSha256: f.study.protocol.sha256,
  });
  const observations = MetricObservationsSchema.parse({
    ...f.original.observations,
    schemaVersion:
      version === 3
        ? "prospective-tournament-observations.v3"
        : "prospective-tournament-observations.v2",
    protocolSha256: jsonDigest(protocol),
    arms: f.original.observations.arms.map((arm) => ({
      ...arm,
      baseline: { ...arm.baseline!, authorization: na },
    })),
  });
  const arms = f.original.arms.map((arm, i) => {
    const actualBaselineRunId = f.observations[i]!.baselineRunId;
    f.sources.get(arm.variant)!.baselineEvaluationRunId = actualBaselineRunId;
    const proof = createMetricBaselineAuthorizationNotApplicable(
      protocol,
      f.evaluations.get(actualBaselineRunId)!.loaded,
    );
    return {
      ...arm,
      baseline: {
        ...arm.baseline!,
        original: MetricSnapshotOriginalSchema.parse({
          ...arm.baseline!.original,
          schemaVersion:
            version === 3
              ? "protected-metric-snapshot.local.v3"
              : "protected-metric-snapshot.local.v2",
          protocolSha256: jsonDigest(protocol),
          authorization: proof,
        }),
      },
      final: {
        ...arm.final!,
        original: {
          ...arm.final!.original,
          protocolSha256: jsonDigest(protocol),
        },
      },
    };
  });
  const original = SupplementaryMetricOriginalSchema.parse({
    ...f.original,
    protocol,
    observations,
    arms,
    metricCommitmentSha256: commitment!.sha256,
    status: metricMeasurementStatus(protocol, observations),
  });
  const config = {
    ...f.metricConfig,
    protocol,
    commitmentId: commitment!.record.id,
  };
  let sequence = 0;
  async function publish() {
    for (const [i, arm] of original.arms.entries())
      for (const role of ["baseline", "final"] as const) {
        const ref = arm[role]!;
        ref.custodyId = `v2-${sequence}-${role}-${arm.variant}`;
        await f.hold({
          id: ref.custodyId,
          studyId: protocol.studyId,
          kind: "telemetry",
          subjectSha256: jsonDigest(ref.original),
          predecessorSha256:
            role === "baseline"
              ? f.loaded[i]!.admission.sha256
              : f.loaded[i]!.originalRecord.sha256,
          heldAt:
            role === "baseline"
              ? "2026-10-28T12:05:50.000Z"
              : "2026-10-28T12:10:00.000Z",
        });
      }
    const filename = path.join(f.root, "metric-observation.json");
    await chmod(filename, 0o600);
    await writeFile(filename, canonicalJson(original));
    await chmod(filename, 0o400);
    const id = `v2-observation-${sequence++}`;
    await f.hold({
      id,
      studyId: protocol.studyId,
      kind: "telemetry",
      subjectSha256: jsonDigest(original),
      predecessorSha256: f.study.prepared.sha256,
      heldAt: "2026-10-28T12:11:30.000Z",
    });
    config.observationId = id;
  }
  await publish();
  return {
    ...f,
    protocol,
    original,
    publish,
    config,
    load: () =>
      createProtectedMetricObservationReader(config).load(f.assessmentAt),
  };
}
describe("v2 protected reader binds a real personal baseline without inventing future results", () => {
  it.each(["failed", "missing"])(
    "refuses a %s actual five-check baseline instead of claiming applicability",
    async (defect) => {
      const f = await protectedV2();
      const prior = f.evaluations.get(f.observations[0]!.baselineRunId)!;
      const root = path.join(f.parent, "v2-invalid-baseline");
      await mkdir(root, { mode: 0o700 });
      const altered = await syntheticEvaluation({
        root,
        workspace: f.workspace,
        identity: prior.entry.identity,
        startedAt: prior.loaded!.receipt.startedAt,
        finishedAt: prior.loaded!.receipt.finishedAt,
        ...(defect === "failed"
          ? { fail: "baseline-domain" }
          : { missing: "boundary" }),
      });
      expect(() =>
        createMetricBaselineAuthorizationNotApplicable(
          f.protocol,
          altered.loaded,
        ),
      ).toThrow("five-check");
    },
  );
  it("authenticates exact five-check baseline proof and final eight-check cases", async () => {
    const f = await protectedV2(),
      result = await f.load();
    expect(result).not.toBeNull();
    expect(result!.status).toBe("complete");
    expect(
      result!.calculation.arms.map((a) => a.baseline.authorizationFailures),
    ).toEqual([null, null]);
    expect(result!.predictionAssessment).toBe("supported");
  });
  it.each([
    "wrong-receipt",
    "wrong-run",
    "future-suite-baseline",
    "na-final",
    "v1-na",
    "projection-zero",
  ])("rejects independently reheld %s substitution", async (defect) => {
    const f = await protectedV2(),
      s = f.original.arms[0]!.baseline!.original;
    if (defect === "wrong-receipt")
      s.authorization.receiptSha256 = "0".repeat(64);
    if (defect === "wrong-run")
      s.authorization.identity.runId =
        f.original.arms[1]!.baseline!.original.authorization.identity.runId;
    if (defect === "future-suite-baseline")
      s.authorization.identity.evaluatorSha256 = f.protocol.evaluatorSha256;
    if (defect === "na-final") f.original.arms[0]!.final!.original = s;
    if (defect === "v1-na")
      s.schemaVersion = "protected-metric-snapshot.local.v1" as never;
    if (defect === "projection-zero")
      (
        f.original.observations.arms[0]!.baseline! as unknown as {
          authorization: unknown;
        }
      ).authorization = [];
    await f.publish();
    expect(await f.load()).toBeNull();
  });
  it("does not let a schema-cloned receipt create not-applicable proof or apply the proof to v1", async () => {
    const f = await protectedV2(),
      arm = f.observations[0]!,
      receipt = f.evaluations.get(arm.baselineRunId)!.loaded!;
    expect(() =>
      createMetricBaselineAuthorizationNotApplicable(
        f.protocol,
        structuredClone(receipt),
      ),
    ).toThrow("Authenticated");
    expect(() =>
      readMetricBaselineAuthorizationNotApplicable(
        f.original.arms[0]!.baseline!.original.authorization,
        { ...f.protocol, schemaVersion: "prospective-tournament-metrics.v1" },
        receipt,
      ),
    ).toThrow();
  });
});

// Same authentic reader/custody and final-case coverage; no version coercion.
describe("v3 protected personal-baseline compatibility", () => {
  it("authenticates v3 observations and preserves unknown baseline authorization", async () => {
    const f = await protectedV2(3),
      result = await f.load();
    expect(result?.status).toBe("complete");
    expect(
      result?.calculation.arms.map((a) => a.baseline.authorizationFailures),
    ).toEqual([null, null]);
    expect(result?.predictionAssessment).toBe("supported");
  });
  it.each(["snapshot", "observations"])(
    "rejects a reheld v2 %s under v3",
    async (field) => {
      const f = await protectedV2(3);
      if (field === "snapshot")
        f.original.arms[0]!.baseline!.original.schemaVersion =
          "protected-metric-snapshot.local.v2";
      else
        f.original.observations.schemaVersion =
          "prospective-tournament-observations.v2";
      await f.publish();
      expect(await f.load()).toBeNull();
    },
  );
});
