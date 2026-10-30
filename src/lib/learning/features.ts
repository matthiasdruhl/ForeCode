import { z } from "zod";
import { GraphV1Schema } from "../contracts/architecture";
import { invariant } from "../contracts/validation";
import { jsonDigest } from "../report/digests";
import {
  ContextSchema,
  FeaturesSchema,
  FEATURE_VERSION,
  type LearningContext,
} from "./contracts";

export function extractFeatures(input: unknown) {
  const c = ContextSchema.parse(input),
    f = c.facts;
  const values = [1];
  let missingCount = 0;
  function add(value: number | null, scale: number) {
    values.push(
      value === null ? 0 : Math.min(value / scale, 1),
      value === null ? 1 : 0,
    );
    if (value === null) missingCount++;
  }
  add(f.repositoryFiles, 10000);
  add(f.moduleCount, 2000);
  add(f.meanFanOut, 20);
  add(f.boundaryPresent === null ? null : Number(f.boundaryPresent), 1);
  add(f.estimatedChangedModules, 64);
  add(f.testCoverage, 1);
  add(f.uncertainty, 1);
  add(f.budgetMinutes, 480);
  for (const category of ["authorization", "dependency", "other", "unknown"])
    values.push(Number(f.requirement === category));
  return FeaturesSchema.parse({
    schemaVersion: FEATURE_VERSION,
    contextSha256: jsonDigest(c),
    values,
    missingCount,
  });
}

// Adapter for ForeCode's existing source-backed graph. Unknown graph completeness
// remains uncertainty; no code, module paths or unknown free text is retained.
export function contextFromGraph(input: {
  graph: unknown;
  context: Omit<LearningContext, "facts">;
  facts: Omit<LearningContext["facts"], "moduleCount" | "meanFanOut">;
}) {
  const graph = GraphV1Schema.parse(input.graph);
  const ids = new Set(graph.modules.map((m) => m.id));
  invariant(ids.size === graph.modules.length, "Duplicate modules.");
  invariant(
    new Set(graph.modules.map((m) => m.path)).size === graph.modules.length,
    "Duplicate paths.",
  );
  invariant(
    graph.edges.every((e) => ids.has(e.from) && ids.has(e.to)),
    "Dangling edge.",
  );
  const edges = new Set(
    graph.edges
      .filter((e) => e.kind === "static_import" || e.kind === "export")
      .map((e) => JSON.stringify([e.from, e.to])),
  );
  return ContextSchema.parse({
    ...input.context,
    facts: {
      ...input.facts,
      moduleCount: graph.modules.length,
      meanFanOut: graph.modules.length
        ? edges.size / graph.modules.length
        : null,
      // A partial graph cannot declare zero uncertainty.
      uncertainty: graph.unknowns.length
        ? Math.max(input.facts.uncertainty ?? 1, 0.5)
        : input.facts.uncertainty,
    },
  });
}

export const DecisionSchema = z.strictObject({
  schemaVersion: z.literal("learning-decision.v1"),
  contextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  policySha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  action: z.enum(["KEEP", "BOUNDARY", "ADAPTER", "ABSTAIN"]),
  authority: z.literal("advisory_only"),
  reason: z.string().min(1).max(128),
});

// Roadmap-aware, equally informed deterministic comparator. Version v1 favors
// an existing boundary, scopes a new one for authorization, or an adapter for
// dependency volatility. It never starts an implementation.
export function fixedPolicy(input: unknown) {
  const c = ContextSchema.parse(input),
    f = c.facts;
  let action: "KEEP" | "BOUNDARY" | "ADAPTER" | "ABSTAIN" = "KEEP";
  if (
    f.requirement === "unknown" ||
    f.budgetMinutes === null ||
    f.boundaryPresent === null
  )
    action = "ABSTAIN";
  else if (
    !f.boundaryPresent &&
    f.budgetMinutes >= 60 &&
    f.requirement === "authorization"
  )
    action = "BOUNDARY";
  else if (
    !f.boundaryPresent &&
    f.budgetMinutes >= 60 &&
    f.requirement === "dependency"
  )
    action = "ADAPTER";
  if (action !== "ABSTAIN" && !c.actions.eligible.includes(action))
    action = "ABSTAIN";
  return DecisionSchema.parse({
    schemaVersion: "learning-decision.v1",
    contextSha256: jsonDigest(c),
    policySha256: null,
    action,
    authority: "advisory_only",
    reason: "roadmap-fixed.v1",
  });
}
