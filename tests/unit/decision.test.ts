import { describe, expect, it } from "vitest";
import {
  compareReviewed,
  rankDecision,
  recommendationReason,
} from "@/lib/decision/regret";
import {
  createWorksheet,
  researchKey,
  type Worksheet,
} from "@/lib/decision/worksheet";
import {
  validateDecision,
  type ResearchContext,
} from "@/lib/contracts/validation";
import { comparisonContext } from "@/lib/foresight/comparison";
import {
  browserSyntheticResponse,
  proposalRequest,
} from "../support/foresight";
import type { ProposeResponse } from "@/lib/foresight/flow";
import { confirmIntent } from "@/lib/intents/lifecycle";

// Fresh complete synthetic graph: no booking imports, measurements or evidence.
function control() {
  const baselineCommit = "7".repeat(40);
  const context: ResearchContext = {
    intents: [
      confirmIntent(
        {
          title: "Export",
          statement: "Allow local text export.",
          priority: "low",
          horizon: "later",
        },
        "intent-export",
        new Date("2026-10-27T20:00:00.000Z"),
      ),
    ],
    graph: {
      schemaVersion: "graph.v1",
      id: "synthetic-complete",
      repoCommit: baselineCommit,
      modules: ["one", "two", "three", "four"].map((id) => ({
        id,
        path: `src/${id}.ts`,
        kind: "source",
      })),
      edges: [],
      unknowns: [],
    },
    candidates: [
      {
        schemaVersion: "architecture-candidate.v1",
        id: "a",
        label: "Keep direct export",
        baselineCommit,
        description: "Keep a direct text formatter.",
        changePlan: [],
        constraints: [],
        estimatedUpfrontCost: 0,
        estimatedCostUnit: "modeled_effort_points_v1",
        metaProvenance: "template",
        modelId: null,
        promptVersion: null,
        limitations: ["Synthetic control only."],
      },
      {
        schemaVersion: "architecture-candidate.v1",
        id: "b",
        label: "Export boundary",
        baselineCommit,
        description: "Introduce a formatter boundary.",
        changePlan: [
          {
            module: "src/one.ts",
            action: "introduce_boundary",
            rationale: "Separate formatting.",
          },
        ],
        constraints: [],
        estimatedUpfrontCost: 3,
        estimatedCostUnit: "modeled_effort_points_v1",
        metaProvenance: "template",
        modelId: null,
        promptVersion: null,
        limitations: ["Synthetic control only."],
      },
    ],
    scenarios: ["s1", "s2"].map((id) => ({
      schemaVersion: "scenario.v1",
      id,
      origin: "developer_tentative",
      intentIds: ["intent-export"],
      request: `Synthetic export format ${id}.`,
      assumptions: [],
      acceptanceIds: [],
      frozen: false,
      baselineCommit,
    })),
  };
  return context;
}
function reviewed(
  context: ResearchContext,
  downstream = [8, 2, 0, 0],
): Worksheet {
  const sheet = createWorksheet(context);
  sheet.scope = "Synthetic formatting modules only; complete declared graph.";
  sheet.comparability = "shared_scope";
  sheet.pairs.forEach((pair, i) => {
    pair.reviewed = true;
    pair.rationale = "Hand-reviewed synthetic control, not measured effort.";
    // Independent setup: known route counts express integer costs in tests.
    pair.basis.projectedChangedModules = [];
    pair.basis.projectedRouteChanges = downstream[i]!;
    pair.basis.unresolvedRelevantDependencies = 0;
  });
  return sheet;
}
const calculate = (context: ResearchContext, costs: number[]) =>
  compareReviewed(context, reviewed(context, costs));
function noMatrix(context: ResearchContext, sheet: Worksheet, reason: string) {
  const result = compareReviewed(context, sheet);
  expect(result.perScenario).toEqual([]);
  expect(result.recommendationId).toBeNull();
  expect(result.limitations.join(" ")).toContain(reason);
  expect(validateDecision(result, context)).toEqual(result);
}

describe("pure reviewed modeled comparison", () => {
  it("control: abstraction provides no benefit; full matrix and lower-upfront tie favor A", () => {
    const context = control();
    const sheet = reviewed(context);
    sheet.pairs[0]!.basis.projectedChangedModules = context.graph.modules.map(
      (m) => m.path,
    );
    sheet.pairs[0]!.basis.projectedRouteChanges = 0;
    sheet.pairs[1]!.basis.projectedChangedModules = ["src/one.ts"];
    sheet.pairs[1]!.basis.projectedRouteChanges = 0;
    const result = compareReviewed(context, sheet);
    expect(
      result.perScenario.map((s) => [
        s.candidateId,
        s.scenarioId,
        s.upfrontCost,
        s.downstreamCost,
        s.totalCost,
        s.regret,
      ]),
    ).toEqual([
      ["a", "s1", 0, 8, 8, 3],
      ["b", "s1", 3, 2, 5, 0],
      ["a", "s2", 0, 0, 0, 0],
      ["b", "s2", 3, 0, 3, 3],
    ]);
    expect(rankDecision(result)).toEqual([
      { id: "a", upfront: 0, worst: 3 },
      { id: "b", upfront: 3, worst: 3 },
    ]);
    expect(result.recommendationId).toBe("a");
    expect(recommendationReason(result)).toContain("lower upfront");
    expect(
      result.perScenario.every((s) => s.basis.source === "reviewed_estimate"),
    ).toBe(true);
  });
  it("B wins with smaller worst regret", () => {
    const result = calculate(control(), [10, 0, 8, 0]);
    expect(result.recommendationId).toBe("b");
    expect(result.perScenario.map((s) => s.regret)).toEqual([7, 0, 5, 0]);
    expect(recommendationReason(result)).toBe(
      "Smallest worst scenario regret.",
    );
  });
  it("A wins outright", () => {
    const result = calculate(control(), [0, 4, 0, 2]);
    expect(result.recommendationId).toBe("a");
    expect(result.perScenario.map((s) => s.regret)).toEqual([0, 7, 0, 5]);
  });
  it("minimax differs from lowest average cost", () => {
    const context = control();
    context.scenarios.push({ ...context.scenarios[0]!, id: "s3" });
    const minimax = calculate(context, [14, 0, 0, 4, 0, 4]);
    expect(minimax.perScenario.map((s) => s.totalCost)).toEqual([
      14, 3, 0, 7, 0, 7,
    ]);
    expect(minimax.recommendationId).toBe("b"); // avg A=14/3 < B=17/3, worst 11 vs 7
  });
  it("lexical ID is the last tie breaker, independent of candidate order", () => {
    const context = control();
    context.candidates.push({
      ...structuredClone(context.candidates[1]!),
      id: "aa",
    });
    const result = calculate(context, [10, 0, 0, 10, 0, 0]);
    expect(result.recommendationId).toBe("aa");
    expect(recommendationReason(result)).toContain("lexically lowest");
    context.candidates.reverse();
    expect(calculate(context, [0, 0, 10, 0, 0, 10]).recommendationId).toBe(
      "aa",
    );
  });
  it("counts all action weights and downstream terms", () => {
    const context = control();
    context.candidates[1]!.changePlan = (
      [
        "introduce_boundary",
        "extract_module",
        "move_module",
        "add_interface",
        "leave_unchanged",
      ] as const
    ).map((action) => ({
      module: "src/one.ts",
      action,
      rationale: "Synthetic action.",
    }));
    context.candidates[1]!.estimatedUpfrontCost = 9;
    const sheet = reviewed(context);
    sheet.pairs[1]!.basis = {
      source: "reviewed_estimate",
      projectedChangedModules: ["src/two.ts", "src/three.ts"],
      projectedRouteChanges: 3,
      unresolvedRelevantDependencies: 2,
    };
    expect(compareReviewed(context, sheet).perScenario[1]).toMatchObject({
      upfrontCost: 9,
      downstreamCost: 11,
      totalCost: 20,
    });
    context.candidates[1]!.estimatedUpfrontCost = 8;
    sheet.contextKey = researchKey(context);
    expect(() => compareReviewed(context, sheet)).toThrow("upfront");
  });
  it("genuine zero is complete, but null, omitted and unreviewed basis never produce partial results", () => {
    const context = control();
    expect(
      calculate(context, [0, 0, 0, 0]).perScenario.map((s) => s.downstreamCost),
    ).toEqual([0, 0, 0, 0]);
    const sheet = reviewed(context);
    for (const field of [
      "projectedChangedModules",
      "projectedRouteChanges",
      "unresolvedRelevantDependencies",
    ] as const) {
      const incomplete = structuredClone(sheet);
      incomplete.pairs[0]!.basis[field] = null;
      noMatrix(context, incomplete, "Incomplete reviewed basis: a / s1");
    }
    sheet.pairs.pop();
    noMatrix(context, sheet, "b / s2");
    noMatrix(context, createWorksheet(context), "scope");
    const unreviewed = reviewed(context);
    unreviewed.pairs[0]!.reviewed = false;
    noMatrix(context, unreviewed, "a / s1");
  });
  it("unknown relevant basis, omissions and incomparable scopes force abstention", () => {
    const context = control();
    const sheet = reviewed(context);
    sheet.pairs[1]!.relevantUnknown = "Dynamic route cannot be represented.";
    noMatrix(context, sheet, "Dynamic route");
    sheet.pairs[1]!.relevantUnknown = "";
    sheet.comparability = "incomparable";
    noMatrix(context, sheet, "incomparable");
    context.graph.unknowns = ["Dynamic route omitted."];
    const scoped = reviewed(context);
    noMatrix(context, scoped, "Dynamic route omitted");
    scoped.unknowns[0]!.disposition = "relevant_unknown";
    scoped.unknowns[0]!.rationale = "Needed by task.";
    noMatrix(context, scoped, "Dynamic route omitted");
    scoped.unknowns[0] = {
      unknown: "Dynamic route omitted.",
      disposition: "out_of_scope",
      rationale:
        "Synthetic text formatter excludes runtime routes for both alternatives.",
    };
    expect(compareReviewed(context, scoped).perScenario).toHaveLength(4);
  });
  it.each([
    "duplicate-path",
    "escape",
    "unnormalized",
    "unreviewed-path",
    "plan-path",
    "constraint-path",
    "pair-ref",
    "pair-duplicate",
    "unknown-ref",
    "unit",
    "baseline",
    "scenario-ref",
    "negative",
    "fraction",
    "oversized",
    "source",
    "extra",
    "missing-field",
  ])("explicitly rejects malformed %s even with incomplete review", (kind) => {
    const context = control();
    const sheet = reviewed(context);
    const pair = sheet.pairs[0]!;
    if (kind === "duplicate-path")
      pair.basis.projectedChangedModules = ["src/one.ts", "src/one.ts"];
    if (kind === "escape") pair.basis.projectedChangedModules = ["../one.ts"];
    if (kind === "unnormalized")
      pair.basis.projectedChangedModules = ["src/./one.ts"];
    if (kind === "unreviewed-path")
      pair.basis.projectedChangedModules = ["src/missing.ts"];
    if (kind === "plan-path")
      context.candidates[1]!.changePlan[0]!.module = "src/new.ts";
    if (kind === "constraint-path")
      context.candidates[1]!.constraints = [
        { kind: "require_import", from: "src/new.ts", to: "src/one.ts" },
      ];
    if (kind === "pair-ref") pair.candidateId = "absent";
    if (kind === "pair-duplicate") sheet.pairs.push(structuredClone(pair));
    if (kind === "unknown-ref")
      sheet.unknowns.push({
        unknown: "not in graph",
        disposition: "out_of_scope",
        rationale: "Invalid.",
      });
    if (kind === "unit")
      Object.assign(context.candidates[0]!, { estimatedCostUnit: "hours" });
    if (kind === "baseline")
      context.scenarios[0]!.baselineCommit = "f".repeat(40);
    if (kind === "scenario-ref") context.scenarios[0]!.intentIds = ["absent"];
    if (kind === "negative") pair.basis.projectedRouteChanges = -1;
    if (kind === "fraction") pair.basis.projectedRouteChanges = 1.5;
    if (kind === "oversized") pair.basis.unresolvedRelevantDependencies = 65;
    if (kind === "source")
      Object.assign(pair.basis, { source: "static_graph" });
    if (kind === "extra") Object.assign(pair.basis, { trusted: true });
    if (kind === "missing-field")
      Reflect.deleteProperty(pair.basis, "projectedRouteChanges");
    sheet.contextKey = researchKey(context);
    sheet.scope = "";
    expect(() => compareReviewed(context, sheet)).toThrow();
  });
  it.each([
    "intent-text",
    "revision",
    "revocation",
    "candidate",
    "scenario",
    "graph",
  ])("binds review to exact %s content, beyond reused IDs", (kind) => {
    const context = control();
    const sheet = reviewed(context);
    if (kind === "intent-text")
      context.intents[0]!.statement = "Different text.";
    if (kind === "revision") context.intents[0]!.revision++;
    if (kind === "revocation") context.intents[0]!.status = "rejected";
    if (kind === "candidate")
      context.candidates[1]!.description = "Different description.";
    if (kind === "scenario")
      context.scenarios[0]!.request = "Different request.";
    if (kind === "graph")
      context.graph.edges.push({ from: "one", to: "two", kind: "unknown" });
    expect(() => compareReviewed(context, sheet)).toThrow();
  });
  it("is deterministic and never mutates context or worksheet, including frozen inputs", () => {
    const context = control();
    const sheet = reviewed(context);
    const before = JSON.stringify({ context, sheet });
    function freeze(value: unknown) {
      if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
    }
    freeze(context);
    freeze(sheet);
    expect(compareReviewed(context, sheet)).toEqual(
      compareReviewed(context, sheet),
    );
    expect(JSON.stringify({ context, sheet })).toBe(before);
  });
  it("orchestrates the actual proposal context without hypothesis, challenge or an evaluation API", () => {
    const request = proposalRequest();
    const proposal = browserSyntheticResponse(
      "propose",
      request,
    ) as ProposeResponse;
    const context = comparisonContext(request.intents, proposal);
    noMatrix(context, createWorksheet(context), "scope");
    expect(context.scenarios).toEqual(proposal.scenarios);
  });
  it("strict final validation rejects matrix, unit, baseline and reference tampering", () => {
    const context = control();
    const decision = calculate(context, [8, 2, 0, 0]);
    for (const bad of [
      { ...decision, perScenario: decision.perScenario.slice(1) },
      { ...decision, graphId: "wrong" },
      { ...decision, baselineCommit: "f".repeat(40) },
      { ...decision, candidateIds: ["a", "wrong"] },
      {
        ...decision,
        perScenario: decision.perScenario.map((row) => ({
          ...row,
          costUnit: "hours",
        })),
      },
    ])
      expect(() => validateDecision(bad as typeof decision, context)).toThrow();
  });
});
