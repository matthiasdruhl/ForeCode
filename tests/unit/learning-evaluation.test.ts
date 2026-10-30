import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import {
  evaluateAblation,
  AblationProtocolSchema,
  type EvaluationCase,
} from "../../scripts/learning/evaluation";
import { createPolicy, trainPolicy } from "../../scripts/learning/policy";
import {
  learningFixture,
  learningContext,
  glimmerProposal,
  snapshotOf,
  h,
  t,
} from "../support/learning";
import { jsonDigest } from "../../src/lib/report/digests";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { force: true, recursive: true })),
  );
});

async function evaluationFixture(
  options: { defect?: string; failures?: string[] } = {},
) {
  const train = await learningFixture(cleanup, { id: "train" }),
    o = await train.admit(),
    training = snapshotOf([o]);
  const policy = trainPolicy(
    createPolicy({ trainerSha256: h("trainer"), origin: "SYNTHETIC" }),
    training,
  );
  const c = learningContext();
  c.id = "held-context";
  c.frozenAt = t(22);
  c.repositoryFamily = h("held-repo");
  c.taskFamily = h("held-task");
  const protocol = AblationProtocolSchema.parse({
    schemaVersion: "glimmer-selector-ablation.v1",
    id: "ablation",
    frozenAt: t(21),
    baseModel: "meta-models/Muse-Glimmer-30B",
    baseRevision: "a".repeat(40),
    tokenizerRevision: "a".repeat(40),
    adapterSha256: h("adapter"),
    fixedPolicy: "roadmap-fixed.v1",
    learnedPolicySha256: policy.sha256,
    matchedConditionsSha256: h("matched"),
    heldoutRepositoryFamilies: [c.repositoryFamily],
    heldoutTaskFamilies: [c.taskFamily],
    nonMetaControl: "SEPARATELY_REQUIRED",
  });
  const preregistration = await train.hold({
    schemaVersion: "tournament-custodian-record.local.v1",
    id: "eval-protocol",
    kind: "protocol",
    studyId: protocol.id,
    subjectSha256: jsonDigest(protocol),
    predecessorSha256: null,
    heldAt: t(21),
    expiresAt: "2026-10-29T12:00:00.000Z",
  });
  const cases: EvaluationCase[] = [];
  for (const condition of ["A", "B", "C", "D"] as const) {
    const f = await learningFixture(cleanup, {
      id: condition,
      context: c,
      offset: 21,
      failures: options.failures,
      mutate: (p) => {
        p.decision.proposal = glimmerProposal(
          c,
          condition === "B" || condition === "D",
        );
        p.decision.selector =
          condition === "A" || condition === "B"
            ? protocol.fixedPolicy
            : policy.sha256;
        if (
          options.defect === "model" &&
          condition === "D" &&
          p.decision.proposal.provenance.provider === "open_weight_local"
        )
          p.decision.proposal.provenance.revision = "b".repeat(40);
        if (options.defect === "cost-unknown")
          p.arms[0]!.preparationCostUsd = null;
        if (options.defect === "conditions" && condition === "D")
          p.matchedConditionsSha256 = h("changed-budget");
        if (options.defect === "selector" && condition === "D")
          p.decision.selector = protocol.fixedPolicy;
        if (options.defect === "abstain" && condition === "D")
          p.decision.selected = "ABSTAIN";
      },
    });
    cases.push({
      condition,
      observation: await f.admit(),
      selected:
        options.defect === "abstain" && condition === "D" ? "ABSTAIN" : "KEEP",
    });
  }
  return {
    protocol,
    preregistration,
    policy,
    training,
    cases,
    mode: "SYNTHETIC" as const,
  };
}
describe("offline 2×2 matched evaluation scaffolding — synthetic only", () => {
  it("counts independent families, missing cost/regression/latency and all negative results", async () => {
    const input = await evaluationFixture({ failures: ["KEEP"] }),
      report = evaluateAblation(input);
    expect(report.status).toBe("DESCRIPTIVE_MATCHED_CASES");
    expect(report.reports.map((r) => r.failed)).toEqual([1, 1, 1, 1]);
    expect(
      report.reports.every(
        (r) =>
          r.independentTaskFamilies === 1 &&
          r.independentRepositoryFamilies === 1,
      ),
    ).toBe(true);
    expect(
      report.reports.every(
        (r) =>
          r.totalCostUsd === null &&
          r.regressionRate === null &&
          r.meanLatencyMs === null &&
          r.brierScore === null,
      ),
    ).toBe(true);
    expect(
      report.reports.every((r) => r.conclusion === "DESCRIPTIVE_ONLY"),
    ).toBe(true);
  });
  it("retains missing arms and abstentions instead of silently selecting complete favorable groups", async () => {
    const input = await evaluationFixture({ defect: "abstain" });
    expect(evaluateAblation(input).reports[3]!.coverage).toBe(0);
    const partial = evaluateAblation({
      ...input,
      cases: input.cases.slice(0, 3),
    });
    expect(partial.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(partial.incompleteContexts).toHaveLength(1);
    expect(partial.reports[3]!.coverage).toBeNull();
    expect(partial.reports[3]!.attempted).toBe(0);
  });
  it.each(["model", "conditions", "selector"])(
    "rejects %s substitution",
    async (defect) => {
      const input = await evaluationFixture({ defect });
      expect(() => evaluateAblation(input)).toThrow();
    },
  );
  it("rejects forged registration, held-out leakage, duplicate rows, synthetic mixing and post-outcome selection", async () => {
    const input = await evaluationFixture();
    expect(() =>
      evaluateAblation({
        ...input,
        preregistration: structuredClone(input.preregistration),
      }),
    ).toThrow();
    expect(() =>
      evaluateAblation({
        ...input,
        protocol: {
          ...input.protocol,
          heldoutRepositoryFamilies: [
            input.training.manifest.rows[0]!.repositoryFamily,
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      evaluateAblation({ ...input, cases: [...input.cases, input.cases[0]!] }),
    ).toThrow("Repeated");
    expect(() => evaluateAblation({ ...input, mode: "AUTHENTIC" })).toThrow();
    expect(() =>
      evaluateAblation({
        ...input,
        protocol: { ...input.protocol, frozenAt: t(0) },
      }),
    ).toThrow("predates");
    expect(() =>
      evaluateAblation({
        ...input,
        cases: input.cases.map((c) => ({ ...c, selected: "BOUNDARY" })),
      }),
    ).toThrow("Post-outcome");
  });
});
