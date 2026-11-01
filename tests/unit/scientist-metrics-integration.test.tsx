// Genuine merged readers; all signatures, source files and provider responses
// are disposable synthetic fixtures. No protected worker or network execution.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { futureTaskDigest } from "@/lib/experiment/future-task";
import { matchedConditionsDigest } from "@/lib/experiment/study-identities";
import { jsonDigest } from "@/lib/report/digests";
import { loadDecisionReports } from "@/server/artifacts/decision-reports";
import { createEvidenceAdapter } from "@/server/meta/evidence";
import { decisionMemo } from "@/lib/presentation/decision-memo";
import { MeasurementRail } from "@/components/v6/tournament-measurements";
import { teamTaskSha256 } from "../../scripts/evaluator/booking-v1/grade-profile";
import { createProtectedMetricObservationReader } from "../../scripts/experiments/tournament/metric-observation";
import { measuredFixture } from "../support/tournament-measured";
import { publicationFixture } from "../support/tournament-publication";
import { scientistHarness } from "../support/scientist-harness";
import {
  protectedMetricFixture,
  removeMetricFixture,
} from "../support/protected-metrics";

vi.mock("@/lib/foresight/booking-context", async (original) => ({
  ...(await original<typeof import("@/lib/foresight/booking-context")>()),
  bookingGraph: {
    ...(await original<typeof import("@/lib/foresight/booking-context")>())
      .bookingGraph,
    repoCommit: "1".repeat(40),
  },
}));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
async function fixture(
  codeA = 'import "./service";',
  codeB = "// inert final B",
) {
  const measured = await measuredFixture({ codeA, codeB });
  roots.push(measured.parent);
  const publication = await publicationFixture({}, measured);
  const h = await scientistHarness(publication, {
    schemaVersion: "prospective-tournament-metrics.v1",
    externalPackages: [],
    stylesheetPaths: [],
    boundaryRules: [
      { id: "self", from: "src/service.ts", to: "src/service.ts" },
    ],
    authorizationCaseIds:
      measured.study.definition.protocol.task.acceptance.map((c) => c.id),
    observationWindow: "prepared_baseline_and_sealed_final_tree",
    duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
    prediction: "B_fewer_final_forbidden_edges_than_A",
  });
  const registered = await h.service.register(
    h.registration.id,
    h.issued.hypothesis.id,
  );
  const f = await protectedMetricFixture({
    measured,
    codeA,
    codeB,
    registered: {
      protocol: registered.metricProtocol,
      commitmentId: registered.commitmentId,
      resolveRegistration: () =>
        h.service.resolveRegistered(h.registration.id, h.issued.hypothesis.id),
    },
  });
  return { f, h, registered, publication };
}
describe("SYNTHETIC Scientist → protected metrics → approved report integration", () => {
  it.each([
    ['import "./service";', "// inert final B", "supported", [1, 0]],
    ["// inert final A", "// inert final B", "contradicted", [0, 0]],
    ['import "./service";', 'import "./service";', "contradicted", [1, 1]],
    ["// inert final A", 'import "./service";', "contradicted", [0, 1]],
  ] as const)(
    "authenticates merged path %s / %s",
    async (a, b, prediction, counts) => {
      const { f, h, registered, publication } = await fixture(a, b);
      const definition = f.study.definition;
      expect(registered.lineage.taskSha256).toBe(
        futureTaskDigest(definition.protocol.task),
      );
      expect(registered.lineage.taskSha256).toBe(teamTaskSha256);
      expect(definition.protocol.conditions[0]!.taskSha256).not.toBe(
        teamTaskSha256,
      );
      expect(registered.lineage.matchedConditionsSha256).toBe(
        matchedConditionsDigest(definition),
      );
      expect(registered.lineage.matchedConditionsSha256).not.toBe(
        f.study.protocol.record.subjectSha256,
      );
      expect(registered.lineage.studyProtocolSha256).toBe(
        jsonDigest(definition.protocol),
      );
      expect(registered.lineage.protocolSha256).not.toBe(
        registered.lineage.studyProtocolSha256,
      );
      const metrics = await f.load();
      expect(metrics).toMatchObject({
        status: "complete",
        evidenceOrigin: "synthetic",
        predictionAssessment: prediction,
        registrationOriginalSha256: registered.bindingOriginalSha256,
      });
      expect(
        metrics!.calculation.arms.map((x) => x.final.boundaryViolations),
      ).toEqual(counts);
      expect(metrics!.effort[1]!.total.costUsd).toBeNull();
      const reports = await loadDecisionReports(publication.config, h.now());
      expect(reports.state).toBe("available");
      expect(reports.reports[0]!.analysis.identity?.correctness).toBe(
        "BOTH_VERIFIED",
      );
      expect(reports.reports[0]!.analysis.decision).toBe("INCONCLUSIVE");
      expect(decisionMemo(reports.reports[0], reports.state).headline).toBe(
        "Insufficient evidence to choose.",
      );
      const adapter = createEvidenceAdapter({
        loadReports: async () =>
          loadDecisionReports(publication.config, h.now()),
        resolveLink: h.linkReader.resolveLink,
        resolveRegistration: h.registrationReader.resolveRegistration,
      });
      expect(
        (await adapter(h.link.evidenceSummaryId, h.issued, h.now())).studyId,
      ).toBe(f.study.definition.protocol.studyId);
      const html = renderToStaticMarkup(
        createElement(MeasurementRail, {
          study: publication.artifact.projection,
        }),
      );
      expect(html).toContain("Unknown");
      expect(html).not.toContain("boundaryViolations");
      expect(publication.artifact.projection).not.toHaveProperty(
        "metricObservations",
      );
    },
  );
  it.each([
    "taskSha256",
    "matchedConditionsSha256",
    "contextSha256",
    "evaluatorSha256",
    "suiteSha256",
    "policySha256",
  ] as const)("rejects substituted registered %s", async (key) => {
    const { f } = await fixture();
    const config = {
      ...f.metricConfig,
      protocol: { ...f.metricConfig.protocol, [key]: "0".repeat(64) },
    };
    expect(
      await createProtectedMetricObservationReader(config).load(f.assessmentAt),
    ).toBeNull();
  });
  it("rejects parsed/cloned registration and cached registration after expiry", async () => {
    const { f, registered, h } = await fixture();
    expect(
      await createProtectedMetricObservationReader({
        ...f.metricConfig,
        resolveRegistration: async () => structuredClone(registered),
      }).load(f.assessmentAt),
    ).toBeNull();
    h.advance(31 * 60_000);
    expect(await f.load()).toBeNull();
    await expect(
      h.service.resolveRegistered(h.registration.id, h.issued.hypothesis.id),
    ).rejects.toThrow();
  });
  it("rejects replay and retired issuance even while custody remains signed", async () => {
    const { f, h } = await fixture();
    await expect(
      h.service.register(h.registration.id, h.issued.hypothesis.id),
    ).rejects.toThrow();
    await h.service.run(
      "propose",
      { ...h.input, goal: `${h.input.goal} Changed.` },
      h.signal,
    );
    expect(await f.load()).toBeNull();
  });
  it("revalidates revocations between complete measurement passes", async () => {
    const { f, h } = await fixture();
    const resolve = f.metricConfig.resolveRegistration!;
    let reads = 0;
    const reader = createProtectedMetricObservationReader({
      ...f.metricConfig,
      resolveRegistration: async () => {
        if (++reads === 2) {
          const filename = path.join(h.root, "revocations.json");
          await chmod(filename, 0o600);
          await writeFile(
            filename,
            JSON.stringify({ revokedIds: [h.ids.bindingId] }),
          );
          await chmod(filename, 0o400);
        }
        return resolve();
      },
    });
    expect(await reader.load(f.assessmentAt)).toBeNull();
    expect(reads).toBe(2);
  });
  it("retains missing registered source evidence and abstains", async () => {
    const { f } = await fixture();
    f.original.arms[1]!.final = null;
    f.original.observations.arms[1]!.final = null;
    f.original.status = "incomplete";
    f.metricConfig.observationId = await f.publish();
    expect(await f.load()).toMatchObject({
      status: "incomplete",
      predictionAssessment: "not_established",
    });
  });
});
