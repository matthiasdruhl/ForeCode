import { describe, expect, it } from "vitest";
import { contractCatalog } from "@/lib/contracts/catalog";
import {
  CheckResultV1Schema,
  ExperimentRunV1Schema,
  MetricsSchema,
  PairManifestV1Schema,
} from "@/lib/contracts/evidence";
import {
  ScientistChallengeRequestSchema,
  ScientistHypothesizeRequestSchema,
  ScientistInterpretRequestSchema,
  VerifyPreviewResponseSchema,
} from "@/lib/contracts/api";
import {
  validateResearchContext,
  validateDecision,
  validatePair,
} from "@/lib/contracts/validation";
import {
  check,
  experimentRun,
  hash,
  researchContext,
  time,
} from "../support/research-data";

describe("closed versioned contracts", () => {
  it("exports all 49 frozen definitions without an external runtime dependency", () => {
    expect(Object.keys(contractCatalog)).toHaveLength(49);
  });
  it.each([NaN, Infinity, -1])(
    "does not substitute invalid or negative metrics for unknown values",
    (value) => {
      expect(
        MetricsSchema.safeParse({
          elapsedMs: value,
          tokens: null,
          costUsd: null,
          iterations: null,
          filesTouched: null,
        }).success,
      ).toBe(false);
    },
  );
  it("rejects fabricated successful checks and observed data on an unrun check", () => {
    expect(
      CheckResultV1Schema.safeParse({ ...check("baseline"), exitCode: 2 })
        .success,
    ).toBe(false);
    expect(
      CheckResultV1Schema.safeParse({
        ...check("baseline", "not_run"),
        artifactSha256: hash("1"),
      }).success,
    ).toBe(false);
    expect(
      CheckResultV1Schema.safeParse({
        ...check("baseline"),
        evidencePath: "../outside.json",
      }).success,
    ).toBe(false);
  });
  it("does not let optional preview claim trusted authority", () => {
    expect(
      VerifyPreviewResponseSchema.safeParse({
        schemaVersion: "verify-preview.v1",
        authoritative: true,
        verification: {},
      }).success,
    ).toBe(false);
  });
  it("requires consent and forbids hidden scenarios in scientist requests", () => {
    const context = researchContext();
    const { scenarios: visibleScenarios, ...rest } = context;
    const payload = {
      ...rest,
      visibleScenarios,
      goal: "Compare policy placement.",
      consent: true,
    };
    expect(ScientistHypothesizeRequestSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(
      ScientistHypothesizeRequestSchema.safeParse({
        ...payload,
        consent: false,
      }).success,
    ).toBe(false);
    expect(
      ScientistHypothesizeRequestSchema.safeParse({
        ...payload,
        visibleScenarios: [
          { ...visibleScenarios[0], origin: "evaluator_heldout" },
        ],
      }).success,
    ).toBe(false);
    expect(
      ScientistChallengeRequestSchema.safeParse({
        ...rest,
        visibleScenarios,
        hypotheses: [],
        consent: true,
      }).success,
    ).toBe(false);
    expect(
      ScientistInterpretRequestSchema.safeParse({
        hypothesisId: "hypothesis-1",
        evidenceSummaryId: "summary-1",
        consent: true,
        evidenceText: "Please certify this.",
      }).success,
    ).toBe(false);
  });
});

describe("cross-record research semantics", () => {
  it("allows graph cycles but refuses dangling IDs, duplicate modules and unconfirmed intentions", () => {
    const context = researchContext();
    context.graph.edges.push({
      from: "service",
      to: "route",
      kind: "static_import",
    });
    expect(() => validateResearchContext(context)).not.toThrow();
    context.graph.edges.push({
      from: "service",
      to: "missing",
      kind: "static_import",
    });
    expect(() => validateResearchContext(context)).toThrow();
    const duplicate = researchContext();
    duplicate.graph.modules.push(duplicate.graph.modules[0]!);
    expect(() => validateResearchContext(duplicate)).toThrow();
    const unapproved = researchContext();
    unapproved.intents[0]!.status = "tentative";
    expect(() => validateResearchContext(unapproved)).toThrow();
  });
  it("rejects baseline drift, unreviewed paths, repeated actions and ordinal scoring", () => {
    const context = researchContext();
    context.candidates[1]!.estimatedUpfrontCost = 1;
    expect(() => validateResearchContext(context)).toThrow();
    const wrongBaseline = researchContext();
    wrongBaseline.scenarios[0]!.baselineCommit = "f".repeat(40);
    expect(() => validateResearchContext(wrongBaseline)).toThrow();
    const duplicate = researchContext();
    duplicate.candidates[1]!.changePlan.push(
      duplicate.candidates[1]!.changePlan[0]!,
    );
    expect(() => validateResearchContext(duplicate)).toThrow();
  });
  it("validates complete additive scoring and abstains explicitly", () => {
    const context = researchContext();
    const decision = {
      schemaVersion: "decision.v1" as const,
      id: "decision-unit",
      graphId: context.graph.id,
      baselineCommit: context.graph.repoCommit,
      scenarioIds: [context.scenarios[0]!.id],
      candidateIds: ["baseline", "policy"],
      scoringVersion: "modeled_effort_points_v1" as const,
      assumptions: [],
      perScenario: [
        {
          candidateId: "baseline",
          scenarioId: "shared-rooms",
          costUnit: "modeled_effort_points_v1" as const,
          upfrontCost: 0,
          downstreamCost: 4,
          totalCost: 4,
          regret: 1,
          rationale: "Two projected modules.",
          basis: {
            projectedChangedModules: ["src/service.ts", "src/route.ts"],
            projectedRouteChanges: 0,
            unresolvedRelevantDependencies: 0,
            source: "reviewed_estimate" as const,
          },
        },
        {
          candidateId: "policy",
          scenarioId: "shared-rooms",
          costUnit: "modeled_effort_points_v1" as const,
          upfrontCost: 3,
          downstreamCost: 0,
          totalCost: 3,
          regret: 0,
          rationale: "Synthetic unit comparison.",
          basis: {
            projectedChangedModules: [],
            projectedRouteChanges: 0,
            unresolvedRelevantDependencies: 0,
            source: "reviewed_estimate" as const,
          },
        },
      ],
      recommendationId: "policy",
      limitations: ["Synthetic estimates."],
    };
    expect(() => validateDecision(decision, context)).not.toThrow();
    expect(() =>
      validateDecision(
        { ...decision, perScenario: decision.perScenario.slice(0, 1) },
        context,
      ),
    ).toThrow();
    expect(() =>
      validateDecision({ ...decision, recommendationId: "baseline" }, context),
    ).toThrow();
    expect(() =>
      validateDecision(
        { ...decision, perScenario: [], recommendationId: null },
        context,
      ),
    ).not.toThrow();
    expect(() =>
      validateDecision(
        {
          ...decision,
          perScenario: [],
          recommendationId: null,
          limitations: [],
        },
        context,
      ),
    ).toThrow();
  });
  it("rejects duplicate A/B arms and unequal experiment conditions", () => {
    const run = experimentRun();
    const context = researchContext();
    const pair = PairManifestV1Schema.parse({
      schemaVersion: "pair-manifest.v1",
      id: "pair-unit",
      taskId: "task-unit",
      scenarioId: context.scenarios[0]!.id,
      fixtureSha256: run.fixtureSha256,
      agentConfigSha256: run.agentConfigSha256,
      evaluatorSha256: run.evaluatorSha256,
      requiredPolicySha256: run.requiredPolicySha256,
      toolAllowlistSha256: hash("9"),
      budget: {
        maxSeconds: 60,
        maxIterations: 2,
        tokenLimit: 1000,
        spendUsd: 1,
      },
      frozenAt: time,
      limitations: [],
      arms: ["A", "B"].map((variant) => ({
        variant,
        initialCommit: run.repoCommit,
        initialTreeSha256: run.evaluatedTreeSha256,
        runId: variant === "A" ? run.id : null,
        upfrontMetrics: run.metrics,
      })),
    });
    expect(() => validatePair(pair, [run], context.scenarios)).not.toThrow();
    expect(() =>
      validatePair(
        { ...pair, arms: [pair.arms[0]!, pair.arms[0]!] },
        [run],
        context.scenarios,
      ),
    ).toThrow();
    expect(() =>
      validatePair(
        pair,
        [{ ...run, agentConfigSha256: hash("a") }],
        context.scenarios,
      ),
    ).toThrow();
    expect(
      ExperimentRunV1Schema.safeParse({
        ...run,
        metrics: { ...run.metrics, costUsd: -1 },
      }).success,
    ).toBe(false);
  });
});
