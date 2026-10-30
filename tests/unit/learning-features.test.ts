import { describe, expect, it } from "vitest";
import {
  ContextSchema,
  ModelProvenanceSchema,
} from "../../src/lib/learning/contracts";
import {
  contextFromGraph,
  extractFeatures,
  fixedPolicy,
} from "../../src/lib/learning/features";
import { validateConditionedProposal } from "../../src/lib/learning/meta-boundary";
import { bookingGraph } from "../../src/lib/foresight/booking-context";
import { learningContext, glimmerProposal } from "../support/learning";
import { jsonDigest } from "../../src/lib/report/digests";

describe("pre-decision learning contracts/features", () => {
  it("extracts reproducible, privacy-minimized vectors from actual source-backed graph representation", () => {
    const c = learningContext();
    const input = { graph: bookingGraph, context: c, facts: c.facts };
    const context = contextFromGraph(input);
    expect(context.facts.moduleCount).toBe(9);
    expect(context.facts.uncertainty).toBeGreaterThanOrEqual(0.5);
    const a = extractFeatures(context),
      b = extractFeatures(structuredClone(context));
    expect(a).toEqual(b);
    expect(a.values).toHaveLength(21);
    expect(JSON.stringify(context)).not.toContain("src/server");
    expect(JSON.stringify(a)).not.toContain(bookingGraph.repoCommit);
    expect(JSON.stringify(a)).not.toContain("booking");
  });
  it("represents missing values separately from measured zero", () => {
    const c = learningContext();
    c.facts.testCoverage = null;
    const missing = extractFeatures(c);
    c.facts.testCoverage = 0;
    const zero = extractFeatures(c);
    expect(missing.values).not.toEqual(zero.values);
    expect(missing.missingCount).toBe(zero.missingCount + 1);
    expect(
      fixedPolicy({ ...c, facts: { ...c.facts, budgetMinutes: null } }).action,
    ).toBe("ABSTAIN");
  });
  it.each([
    { schemaVersion: "learning-context.v2" },
    { postImplementationDiff: [] },
    { graderResults: "pass" },
    { secret: "secret" },
  ])("rejects version changes and outcome/secret fields", (patch) => {
    expect(() => extractFeatures({ ...learningContext(), ...patch })).toThrow();
  });
  it("rejects unsupported strategies, duplicate actions, malformed numbers and graph edges", () => {
    const c = learningContext();
    expect(
      ContextSchema.safeParse({
        ...c,
        actions: { ...c.actions, eligible: ["EVENTS"] },
      }).success,
    ).toBe(false);
    expect(
      ContextSchema.safeParse({
        ...c,
        actions: { ...c.actions, eligible: ["KEEP", "KEEP"] },
      }).success,
    ).toBe(false);
    expect(
      ContextSchema.safeParse({ ...c, facts: { ...c.facts, meanFanOut: NaN } })
        .success,
    ).toBe(false);
    expect(() =>
      contextFromGraph({
        context: c,
        facts: c.facts,
        graph: {
          ...bookingGraph,
          edges: [{ from: "missing", to: "missing", kind: "static_import" }],
        },
      }),
    ).toThrow("Dangling");
  });
  it("keeps KEEP legitimate and provides an equally informed fixed comparator", () => {
    const c = learningContext();
    expect(fixedPolicy(c).action).toBe("BOUNDARY");
    c.facts.boundaryPresent = true;
    expect(fixedPolicy(c).action).toBe("KEEP");
    c.facts.boundaryPresent = false;
    c.facts.requirement = "dependency";
    expect(fixedPolicy(c).action).toBe("ABSTAIN");
    c.actions.eligible.push("ADAPTER");
    expect(fixedPolicy(c).action).toBe("ADAPTER");
  });
  it("binds model proposals to exact approved input/candidates and keeps Spark/Glimmer provenance separate", () => {
    const c = learningContext(),
      p = glimmerProposal(c);
    expect(validateConditionedProposal(c, p)).toEqual(p);
    expect(() =>
      validateConditionedProposal(c, {
        ...p,
        candidateSetSha256: jsonDigest({}),
      }),
    ).toThrow();
    expect(() =>
      validateConditionedProposal(c, { ...p, proposed: ["ADAPTER"] }),
    ).toThrow();
    expect(
      ModelProvenanceSchema.safeParse({
        ...p.provenance,
        provider: "meta_model_api",
        modelId: "muse-spark-1.3",
        adaptation: "qlora_sft",
      }).success,
    ).toBe(false);
    expect(
      ModelProvenanceSchema.safeParse({
        ...p.provenance,
        adaptation: "qlora_sft",
        adapterSha256: null,
      }).success,
    ).toBe(false);
    expect(
      ModelProvenanceSchema.safeParse({
        ...p.provenance,
        graderAssertions: "secret",
      }).success,
    ).toBe(false);
  });
});
