// Synthetic approved publications in disposable test-owned directories only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assessDecisionReport,
  DecisionReportAnalysisSchema,
} from "@/lib/report/decision-report";
import {
  disclosureSubject,
  type PublicTournament,
} from "@/lib/experiment/tournament-publication";
import { preparationInclusiveMetrics } from "@/lib/experiment/metrics";
import { canonicalJson } from "@/lib/report/canonical";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { loadDecisionReports } from "@/server/artifacts/decision-reports";
import { loadApprovedDecisionReports } from "@/server/artifacts/recording-catalog";
import { publicationFixture } from "../support/tournament-publication";

const roots: string[] = [];
async function fixture(options: Parameters<typeof publicationFixture>[0] = {}) {
  const f = await publicationFixture(options);
  roots.push(f.parent);
  return f;
}
let original: PublicTournament;
beforeAll(async () => {
  original = (await fixture({ telemetry: true })).artifact.projection;
});
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});
const input = () => structuredClone(original);
function criterion(p: PublicTournament, metric = "costUsd") {
  return {
    protocolOriginalSha256: p.protocolOriginalSha256,
    metric,
    objective: "minimize_preparation_inclusive_total",
    establishedBeforeExecution: true,
    measurementsComparable: true,
  };
}
function outcomes(a: "VERIFIED" | "REJECTED", b: "VERIFIED" | "REJECTED") {
  const p = input();
  p.arms.forEach((arm, i) => {
    arm.verdict = i === 0 ? a : b;
    arm.checks.forEach((c) => {
      c.status =
        arm.verdict === "REJECTED" && c.id === "team-permissions-adversarial"
          ? "fail"
          : "pass";
    });
  });
  p.correctness =
    a === b
      ? a === "VERIFIED"
        ? "BOTH_VERIFIED"
        : "BOTH_REJECTED"
      : a === "VERIFIED"
        ? "A_ONLY_VERIFIED"
        : "B_ONLY_VERIFIED";
  return p;
}
async function replace(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
  await chmod(file, 0o400);
}

describe("deterministic non-authoritative Decision Report analysis", () => {
  it.each([
    ["VERIFIED", "VERIFIED", "INCONCLUSIVE"],
    ["VERIFIED", "REJECTED", "KEEP"],
    ["REJECTED", "VERIFIED", "REFACTOR"],
    ["REJECTED", "REJECTED", "INCONCLUSIVE"],
  ] as const)(
    "classifies %s/%s as %s without overriding evaluator verdicts",
    (a, b, decision) => {
      const p = outcomes(a, b);
      const report = assessDecisionReport(p);
      expect(report.decision).toBe(decision);
      expect(report.provenance).toBe("UNAUTHENTICATED_ANALYSIS");
      expect(report.observations!.arms.map((arm) => arm.verdict)).toEqual([
        a,
        b,
      ]);
      expect(report.differingChecks).toEqual(
        a === b ? [] : ["team-permissions-adversarial"],
      );
      expect(report.reasons.length).toBeGreaterThanOrEqual(2);
    },
  );
  it("does not treat complete measured effort as a predeclared preference", () => {
    const r = assessDecisionReport(input());
    expect(r.headline).toBe("Correctness tie");
    expect(r.decision).toBe("INCONCLUSIVE");
    expect(r.observations!.arms[1]!.total.costUsd).toBe(0.6);
    expect(r.assumedCriterion).toBeNull();
  });
  it.each(["NOT_COMPARABLE", "INSUFFICIENT_EVIDENCE"] as const)(
    "abstains for %s and retains the observations",
    (comparability) => {
      const p = outcomes("REJECTED", "VERIFIED");
      p.comparability = comparability;
      p.correctness = "INCONCLUSIVE";
      const r = assessDecisionReport(p);
      expect(r.decision).toBe("INCONCLUSIVE");
      expect(r.identity!.comparability).toBe(comparability);
      expect(r.observations!.arms[1]!.verdict).toBe("VERIFIED");
    },
  );
  it.each(["blocked", "cancelled", "failed", "timed_out", "not_run"] as const)(
    "retains %s status and abstains despite a verified receipt",
    (status) => {
      const p = outcomes("REJECTED", "VERIFIED");
      p.arms[1]!.status = status;
      const r = assessDecisionReport(p);
      expect(r.decision).toBe("INCONCLUSIVE");
      expect(r.observations!.arms[1]!.status).toBe(status);
    },
  );
  it("retains preparation and downstream failure history", () => {
    const p = input();
    p.attempts[0]!.status = "cancelled";
    p.preparationAttempts[0]!.status = "failed";
    const r = assessDecisionReport(p);
    expect(r.observations!.attempts[0]!.status).toBe("cancelled");
    expect(r.observations!.preparationAttempts[0]!.status).toBe("failed");
  });
  it.each(["blockers", "deviations"] as const)(
    "cannot override %s with a winner classification",
    (key) => {
      const p = outcomes("REJECTED", "VERIFIED");
      p[key].push("UNRESOLVED_CONDITION");
      expect(assessDecisionReport(p).decision).toBe("INCONCLUSIVE");
    },
  );
  it("missing outcome evidence is not a rejection", () => {
    const p = input();
    p.arms[1]!.verdict = "INSUFFICIENT_EVIDENCE";
    p.arms[1]!.receiptId = null;
    p.arms[1]!.checks.forEach((c) => {
      c.status = "not_run";
    });
    p.correctness = "INCONCLUSIVE";
    const r = assessDecisionReport(p);
    expect(r.decision).toBe("INCONCLUSIVE");
    expect(r.identity).not.toBeNull();
  });
  it.each(["baselineVerdict", "baselineReceiptId"] as const)(
    "requires valid %s",
    (key) => {
      const p = outcomes("REJECTED", "VERIFIED");
      if (key === "baselineVerdict") p.arms[0]!.baselineVerdict = "REJECTED";
      else p.arms[0]!.baselineReceiptId = null;
      expect(assessDecisionReport(p).decision).toBe("INCONCLUSIVE");
    },
  );
  it("supports only conditional offline effort analysis and counts B preparation", () => {
    const p = input();
    const r = assessDecisionReport(p, criterion(p));
    expect(r.decision).toBe("KEEP");
    expect(r.basis).toBe("ASSUMED_EFFORT_CRITERION");
    expect(r.support).toBe("CONDITIONAL_ON_AUTHENTICATED_INPUT");
    expect(r.provenance).toBe("UNAUTHENTICATED_ANALYSIS");
    expect(r.limitations.join(" ")).toContain(
      "caller-supplied offline assumption",
    );
    p.arms[0]!.downstream.costUsd = 1;
    p.arms[0]!.total = preparationInclusiveMetrics(
      p.arms[0]!.preparation,
      p.arms[0]!.downstream,
    );
    expect(assessDecisionReport(p, criterion(p)).decision).toBe("REFACTOR");
  });
  it.each(["preparation", "downstream"] as const)(
    "preserves unknown %s cost without savings or a tie-break",
    (phase) => {
      const p = input();
      p.arms[1]![phase].costUsd = null;
      p.arms[1]!.total = preparationInclusiveMetrics(
        p.arms[1]!.preparation,
        p.arms[1]!.downstream,
      );
      const r = assessDecisionReport(p, criterion(p));
      expect(r.decision).toBe("INCONCLUSIVE");
      expect(r.observations!.arms[1]!.total.costUsd).toBeNull();
      expect(r.reasons.join(" ")).toContain("unknown");
    },
  );
  it("abstains when the selected complete totals are equal", () => {
    const p = input();
    p.arms[0]!.preparation = structuredClone(p.arms[1]!.preparation);
    p.arms[0]!.total = preparationInclusiveMetrics(
      p.arms[0]!.preparation,
      p.arms[0]!.downstream,
    );
    expect(assessDecisionReport(p, criterion(p)).decision).toBe("INCONCLUSIVE");
  });
  it("never adds filesTouched phase counts or substitutes a reservation for actual cost", () => {
    const r = assessDecisionReport(input());
    const b = r.observations!.arms[1]!;
    expect(b.total.filesTouched).toBeNull();
    expect(b.totalChangedFileCount).toBe(2);
    expect(b.reservedMicroUsd).toBe(500000);
    expect(b.total.costUsd).toBe(0.6);
    expect(b.downstream.costUsd).toBe(0.1);
  });
  it("retains all available source, suite, run and receipt identities without inventing candidate IDs", () => {
    const p = input();
    const r = assessDecisionReport(p);
    expect(r.identity!.protocolOriginalSha256).toBe(p.protocolOriginalSha256);
    expect(r.identity!.futurePolicySha256).toBe(p.futurePolicySha256);
    expect(r.observations!.arms[0]!.initialTreeSha256).toBe(
      p.arms[0]!.initialTreeSha256,
    );
    expect(r.observations!.arms[1]!.finalTreeSha256).toBe(
      p.arms[1]!.finalTreeSha256,
    );
    expect(r.observations!.arms[1]!.receiptId).toBe(p.arms[1]!.receiptId);
    expect(r.evidenceReferences!.projectionSha256).toBe(jsonDigest(p));
  });
  it("never lets an approved Meta prediction override independent correctness", () => {
    const p = outcomes("VERIFIED", "REJECTED");
    p.hypothesis = "Meta predicts that Architecture B will always be better.";
    const r = assessDecisionReport(p);
    expect(r.decision).toBe("KEEP");
    expect(JSON.stringify(r)).not.toContain("always be better");
  });
  it.each([
    "duplicate-arm",
    "duplicate-check",
    "missing-receipt",
    "duplicate-run",
    "duplicate-baseline",
    "verdict-mismatch",
    "classification-mismatch",
    "invented-total",
    "private-field",
    "unbounded-history",
  ])("fails safely for %s", (defect) => {
    const p = input();
    if (defect === "duplicate-arm") p.arms[1]!.variant = "A";
    if (defect === "duplicate-check")
      p.arms[0]!.checks[1]!.id = p.arms[0]!.checks[0]!.id;
    if (defect === "missing-receipt") p.arms[0]!.receiptId = null;
    if (defect === "duplicate-run") p.arms[0]!.runId = p.arms[1]!.runId;
    if (defect === "duplicate-baseline")
      p.arms[0]!.baselineReceiptId = p.arms[1]!.baselineReceiptId;
    if (defect === "verdict-mismatch") p.arms[0]!.checks[0]!.status = "fail";
    if (defect === "classification-mismatch") p.correctness = "A_ONLY_VERIFIED";
    if (defect === "invented-total") p.arms[1]!.total.costUsd = 0;
    if (defect === "private-field")
      Object.assign(p, { privateGraderPath: "/PRIVATE_SENTINEL/grader" });
    if (defect === "unbounded-history")
      p.attempts = Array(101).fill(p.attempts[0]);
    const r = assessDecisionReport(p);
    expect(r.decision).toBe("INCONCLUSIVE");
    expect(r.identity).toBeNull();
    expect(JSON.stringify(r)).not.toContain("PRIVATE_SENTINEL");
  });
  it.each([
    null,
    undefined,
    {},
    [],
    "PRIVATE_SENTINEL",
    {
      schemaVersion: "decision-report-analysis.v1",
      provenance: "AUTHENTICATED",
    },
  ])("rejects malformed or authority-spoofing input %#", (value) => {
    expect(assessDecisionReport(value).identity).toBeNull();
  });
  it("rejects cycles, accessor payloads and a mismatched/undeclared criterion", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    let reads = 0;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        reads++;
        return "PRIVATE_SENTINEL";
      },
    });
    for (const p of [cycle, accessor])
      expect(assessDecisionReport(p).identity).toBeNull();
    expect(reads).toBe(0);
    const p = input();
    for (const c of [
      { ...criterion(p), protocolOriginalSha256: "f".repeat(64) },
      { ...criterion(p), establishedBeforeExecution: false },
      { ...criterion(p), measurementsComparable: false },
      { ...criterion(p), metric: "filesTouched" },
    ])
      expect(assessDecisionReport(p, c).identity).toBeNull();
  });
  it("parses only canonical snapshots and never invokes hidden known-field getters", () => {
    let reads = 0;
    const p = input();
    Object.defineProperty(p, "schemaVersion", {
      enumerable: false,
      get() {
        reads++;
        throw new Error("PRIVATE_SENTINEL");
      },
    });
    expect(assessDecisionReport(p).identity).toBeNull();
    const c = criterion(input());
    Object.defineProperty(c, "metric", {
      enumerable: false,
      get() {
        reads++;
        throw new Error("PRIVATE_SENTINEL");
      },
    });
    expect(assessDecisionReport(input(), c).identity).toBeNull();
    expect(reads).toBe(0);
  });
  it("returns stable deeply frozen output without mutating inputs or leaking private fixtures", () => {
    const p = input(),
      before = canonicalJson(p);
    const r = assessDecisionReport(p);
    expect(canonicalJson(assessDecisionReport(p))).toBe(canonicalJson(r));
    expect(canonicalJson(p)).toBe(before);
    expect(Object.isFrozen(r.observations!.arms[0]!.checks)).toBe(true);
    expect(() => {
      r.observations!.arms[0]!.checks[0]!.status = "fail";
    }).toThrow();
    expect(() =>
      DecisionReportAnalysisSchema.parse({
        ...r,
        hostPath: "/PRIVATE_SENTINEL",
      }),
    ).toThrow();
    for (const value of [
      "PRIVATE_SENTINEL",
      "src/service.ts",
      "sourceComparison",
      "hypothesis",
      "signature",
      "authorityPublicKeyPem",
    ])
      expect(canonicalJson(r)).not.toContain(value);
  });
});

describe("fresh trusted server composition", () => {
  it("remains unprovisioned without filesystem access or a fabricated result", async () => {
    expect(await loadApprovedDecisionReports()).toEqual({
      state: "empty",
      reports: [],
      unavailableCount: 0,
    });
    expect(await loadDecisionReports(null)).toEqual({
      state: "empty",
      reports: [],
      unavailableCount: 0,
    });
  });
  it.each([
    [{}, "INCONCLUSIVE"],
    [{ failB: true }, "KEEP"],
    [{ failA: true }, "REFACTOR"],
    [{ failA: true, failB: true }, "INCONCLUSIVE"],
    [{ noFutureB: true }, "INCONCLUSIVE"],
    [{ failedAgent: true }, "INCONCLUSIVE"],
  ] as const)(
    "composes independently cross-checked synthetic originals %#",
    async (options, decision) => {
      const f = await fixture(options);
      const catalog = await loadDecisionReports(f.config, f.now);
      expect(catalog.state).toBe("available");
      expect(catalog.reports[0]!.analysis.decision).toBe(decision);
      expect(catalog.reports[0]!.provenance).toBe(
        "FRESH_APPROVED_TOURNAMENT_LOADER",
      );
      expect(catalog.reports[0]!.support).toBe(
        decision === "INCONCLUSIVE" ? "INCONCLUSIVE" : "EVIDENCE_SUPPORTED",
      );
      expect(canonicalJson(catalog)).not.toContain(f.parent);
      expect(canonicalJson(catalog)).not.toContain("PRIVATE_SENTINEL");
    },
  );
  it("does not accept a client-created analysis or projection as loader authority", async () => {
    const fake = assessDecisionReport(outcomes("REJECTED", "VERIFIED"));
    // Simulate a request attempting to pass parsed JSON as server configuration.
    // The source-owned production entry accepts no request body at all.
    expect((await loadDecisionReports(fake as never)).reports).toEqual([]);
    expect((await loadDecisionReports(input() as never)).reports).toEqual([]);
  });
  it("cannot promote an offline effort assumption through server configuration", async () => {
    const f = await fixture({ telemetry: true });
    const config = {
      ...f.config,
      assumedCriterion: criterion(f.artifact.projection),
    };
    const r = (await loadDecisionReports(config, f.now)).reports[0]!;
    expect(r.analysis.decision).toBe("INCONCLUSIVE");
    expect(r.analysis.assumedCriterion).toBeNull();
  });
  it.each(["runId", "receiptId"] as const)(
    "withholds even a freshly signed projection whose %s differs from the original",
    async (field) => {
      const f = await fixture({ failA: true });
      const artifact = structuredClone(f.artifact);
      artifact.projection.arms[1]![field] = "unrelated-original";
      const id = `decision-mismatched-${field}`;
      await f.hold({
        id,
        studyId: f.report.studyId,
        kind: "disclosure",
        heldAt: f.assessmentAt,
        subjectSha256: disclosureSubject(artifact),
        predecessorSha256: f.report.preparedOriginalSha256,
      });
      const disclosureBytes = await readFile(path.join(f.root, `${id}.json`));
      const directory = path.join(f.config.publications.authorityRoot, id);
      await mkdir(directory, { mode: 0o700 });
      await writeFile(
        path.join(directory, "disclosure-original.json"),
        disclosureBytes,
        { mode: 0o400 },
      );
      const publicationBytes = canonicalJson(artifact);
      await replace(f.publicationFile, publicationBytes);
      Object.assign(f.config.publications.entries.get(f.report.studyId)!, {
        publicationSha256: sha256(publicationBytes),
        disclosureId: id,
        disclosureSha256: sha256(disclosureBytes),
      });
      expect(await loadDecisionReports(f.config, f.now)).toEqual({
        state: "unavailable",
        reports: [],
        unavailableCount: 1,
      });
    },
  );
  it.each([
    "tampered",
    "expired",
    "revoked",
    "run-mismatch",
    "missing-original",
    "check-bytes",
  ])(
    "withholds prior results after %s, without stale fallback",
    async (defect) => {
      const f = await fixture({ failA: true });
      expect(
        (await loadDecisionReports(f.config, f.now)).reports[0]!.analysis
          .decision,
      ).toBe("REFACTOR");
      if (defect === "tampered") await replace(f.publicationFile, "{}");
      if (defect === "revoked")
        await replace(
          f.revocationFile,
          canonicalJson({ revokedIds: ["public-disclosure"] }),
        );
      if (defect === "run-mismatch")
        f.config.registrations[0]!.arms.get("B")!.futureEvaluationId =
          f.loaded[0]!.original.run.id;
      if (defect === "missing-original") await rm(f.disclosureFile);
      if (defect === "check-bytes")
        await replace(
          path.join(
            f.evaluationRoot,
            f.loaded[0]!.original.run.id,
            f.loaded[0]!.future!.checks[0]!.evidencePath!,
          ),
          "PRIVATE_SENTINEL",
        );
      const result = await loadDecisionReports(
        f.config,
        defect === "expired" ? Date.parse("2026-11-01T00:00:00.000Z") : f.now,
      );
      expect(result).toEqual({
        state: "unavailable",
        reports: [],
        unavailableCount: 1,
      });
    },
  );
});
