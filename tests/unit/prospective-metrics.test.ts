import { describe, expect, it } from "vitest";
import {
  calculateProspectiveMetrics,
  MetricProtocolSchema,
  MetricSourcePathSchema,
  type MetricProtocol,
  type MetricObservations,
} from "@/lib/experiment/prospective-metrics";
import { jsonDigest } from "@/lib/report/digests";
import { collectBoundaryMetrics } from "../../scripts/experiments/tournament/boundary-metrics";
const hash = "a".repeat(64),
  edge = { from: "src/server/http.ts", to: "src/server/booking-store.ts" };
function fixture() {
  const p: MetricProtocol = {
    schemaVersion: "prospective-tournament-metrics.v1",
    studyId: "prospective-test",
    hypothesisId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    contextSha256: hash,
    taskSha256: hash,
    matchedConditionsSha256: hash,
    evaluatorSha256: hash,
    suiteSha256: hash,
    policySha256: hash,
    externalPackages: [],
    stylesheetPaths: [],
    boundaryRules: [{ id: "http-store", ...edge }],
    authorizationCaseIds: ["private-owner", "team-cancel"],
    observationWindow: "prepared_baseline_and_sealed_final_tree",
    duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
    prediction: "B_fewer_final_forbidden_edges_than_A",
  };
  const s = {
    treeSha256: hash,
    boundary: {
      complete: true,
      unresolvedImports: 0,
      scannedRuleIds: ["http-store"],
      edges: [] as (typeof edge)[],
    },
    authorization: [
      { caseId: "private-owner", outcome: "pass" as const },
      { caseId: "team-cancel", outcome: "pass" as const },
    ],
  };
  const o: MetricObservations = {
    schemaVersion: "prospective-tournament-observations.v1",
    studyId: p.studyId,
    protocolSha256: jsonDigest(p),
    taskSha256: hash,
    matchedConditionsSha256: hash,
    evaluatorSha256: hash,
    suiteSha256: hash,
    policySha256: hash,
    arms: [
      {
        variant: "A",
        runId: "run-a",
        status: "completed",
        baseline: structuredClone(s),
        final: structuredClone(s),
      },
      {
        variant: "B",
        runId: "run-b",
        status: "completed",
        baseline: structuredClone(s),
        final: structuredClone(s),
      },
    ],
  };
  return { p, o, calculate: () => calculateProspectiveMetrics(p, o) };
}
describe("prospective boundary and authorization measurement", () => {
  it.each([
    "src/app/api/bookings/[id]/route.ts",
    "src/app/[...slug]/page.tsx",
    "src/app/[[...slug]]/page.tsx",
  ])("accepts supplementary route paths %s", (path) => {
    expect(MetricSourcePathSchema.safeParse(path).success).toBe(true);
    const f = fixture();
    f.p.boundaryRules[0]!.from = path;
    expect(MetricProtocolSchema.safeParse(f.p).success).toBe(true);
  });
  it.each([
    "/src/a.ts",
    "src/../a.ts",
    "src/app/./a.ts",
    "src//a.ts",
    "src/app/[../a]/route.ts",
    "src/app/%2e%2e/a.ts",
    "src/app\\a.ts",
  ])("rejects traversal or noncanonical path %s", (path) => {
    expect(MetricSourcePathSchema.safeParse(path).success).toBe(false);
  });
  it.each([
    'module.require("./booking-store")',
    'module["require"]("./booking-store")',
    'const load = require; load("./booking-store")',
    'import {createRequire as factory} from "node:module"; factory(import.meta.url)("./booking-store")',
  ])(
    "abstains instead of supporting fewer edges for unsupported loader %s",
    (code) => {
      const f = fixture();
      f.p.externalPackages = ["node:module"];
      f.o.protocolSha256 = jsonDigest(f.p);
      const collect = (source: string) =>
        collectBoundaryMetrics(
          {
            [edge.from]: source,
            [edge.to]: "export const store = 1;",
          },
          f.p,
        );
      f.o.arms[0]!.final!.boundary = collect(
        'import {store} from "./booking-store"',
      );
      f.o.arms[1]!.final!.boundary = collect(code);
      const result = f.calculate();
      expect(result.arms[0]!.final.boundaryViolations).toBe(1);
      expect(result.arms[1]!.final.boundaryViolations).toBeNull();
      expect(result.predictionAssessment).toBe("not_established");
      expect(result.abstentionReason).toBe(
        "INCOMPLETE_OR_MISSING_MEASUREMENTS",
      );
    },
  );
  it("abstains on a failed starting authorization baseline", () => {
    const f = fixture();
    f.o.arms[0]!.baseline!.authorization[0]!.outcome = "fail";
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "not_established",
      abstentionReason: "BASELINE_AUTHORIZATION_FAILURE",
      authorizationPreserved: false,
      independentSamples: 0,
    });
  });
  it("counts unique resolved forbidden edges, independently of behavior", () => {
    const f = fixture();
    f.o.arms[0]!.final!.boundary.edges = [
      edge,
      edge,
      { ...edge, to: "src/server/other.ts" },
    ];
    const result = f.calculate();
    expect(result.arms[0]!.final.boundaryViolations).toBe(1);
    expect(result.predictionAssessment).toBe("supported");
    expect(result.independentSamples).toBe(1);
  });
  it("contradicts a strictly fewer prediction on ties including a zero baseline", () => {
    const f = fixture();
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "contradicted",
      boundaryTie: true,
    });
    f.o.arms[1]!.final!.boundary.edges = [edge];
    expect(f.calculate().predictionAssessment).toBe("contradicted");
  });
  it("does not mistake a behavioral failure for an import violation or superiority", () => {
    const f = fixture();
    f.o.arms[1]!.final!.authorization[0]!.outcome = "fail";
    expect(f.calculate()).toMatchObject({
      authorizationPreserved: false,
      predictionAssessment: "contradicted",
      engineeringRecommendation: "DEFER_TO_AUTHENTICATED_DETERMINISTIC_REPORT",
    });
    expect(f.calculate().arms[1]!.final).toEqual({
      boundaryViolations: 0,
      authorizationFailures: 1,
    });
  });
  it.each([
    "missing",
    "partial",
    "unresolved",
    "omitted-rule",
    "omitted-case",
    "duplicate-case",
    "not-run",
    "invalid",
    "cancelled",
    "baseline",
  ])("abstains for %s", (kind) => {
    const f = fixture(),
      a = f.o.arms[0]!,
      s = a.final!;
    if (kind === "missing") a.final = null;
    if (kind === "partial") s.boundary.complete = false;
    if (kind === "unresolved") s.boundary.unresolvedImports++;
    if (kind === "omitted-rule") s.boundary.scannedRuleIds = [];
    if (kind === "omitted-case") s.authorization.pop();
    if (kind === "duplicate-case") s.authorization.push(s.authorization[0]!);
    if (kind === "not-run") s.authorization[0]!.outcome = "not_run";
    if (kind === "invalid") s.authorization[0]!.outcome = "invalid";
    if (kind === "cancelled") a.status = "cancelled";
    if (kind === "baseline") a.baseline = null;
    expect(f.calculate()).toMatchObject({
      predictionAssessment: "not_established",
      independentSamples: 0,
      authorizationPreserved: null,
    });
  });
  it.each([
    "taskSha256",
    "matchedConditionsSha256",
    "evaluatorSha256",
    "suiteSha256",
    "policySha256",
    "protocolSha256",
  ] as const)("rejects mismatched %s", (key) => {
    const f = fixture();
    f.o[key] = "b".repeat(64);
    expect(() => f.calculate()).toThrow();
  });
  it("rejects duplicate policies, arms, replayed runs and unknown fields", () => {
    const f = fixture();
    f.p.boundaryRules.push({ ...f.p.boundaryRules[0]!, id: "other" });
    expect(() => MetricProtocolSchema.parse(f.p)).toThrow();
    const g = fixture();
    g.o.arms[1]!.runId = g.o.arms[0]!.runId;
    expect(() => g.calculate()).toThrow();
    const h = fixture();
    h.o.arms[1]!.variant = "A";
    expect(() => h.calculate()).toThrow();
    expect(() =>
      MetricProtocolSchema.parse({ ...fixture().p, verified: true }),
    ).toThrow();
    const ids = fixture().p;
    ids.authorizationCaseIds.push(ids.authorizationCaseIds[0]!);
    expect(() => MetricProtocolSchema.parse(ids)).toThrow();
    const rules = fixture().p;
    rules.boundaryRules.push({
      ...rules.boundaryRules[0]!,
      to: "src/other.ts",
    });
    expect(() => MetricProtocolSchema.parse(rules)).toThrow();
    expect(() =>
      MetricProtocolSchema.parse({
        ...fixture().p,
        stylesheetPaths: ["src/app/style.css", "src/app/style.css"],
      }),
    ).toThrow();
    expect(() =>
      MetricProtocolSchema.parse({
        ...fixture().p,
        stylesheetPaths: ["src/server/booking-store.ts"],
      }),
    ).toThrow();
  });
});
