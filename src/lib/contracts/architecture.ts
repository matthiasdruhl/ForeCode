import { z } from "zod";
import {
  EffortUnitSchema,
  GitCommitSchema,
  IdSchema,
  RelativePathSchema,
  count,
  ids,
  text,
  texts,
} from "./common";

const scenarioFields = {
  schemaVersion: z.literal("scenario.v1"),
  id: IdSchema,
  intentIds: ids(24, 1),
  request: text(2000),
  assumptions: texts(320, 24),
  acceptanceIds: ids(32),
  frozen: z.boolean(),
  baselineCommit: GitCommitSchema,
};
export const ScenarioV1Schema = z.strictObject({
  ...scenarioFields,
  origin: z.enum([
    "developer_confirmed",
    "developer_tentative",
    "meta_generated",
    "evaluator_heldout",
  ]),
});
export const VisibleScenarioV1Schema = z.strictObject({
  ...scenarioFields,
  origin: z.enum([
    "developer_confirmed",
    "developer_tentative",
    "meta_generated",
  ]),
});
export const ChangePlanItemSchema = z.strictObject({
  module: RelativePathSchema,
  action: z.enum([
    "introduce_boundary",
    "extract_module",
    "move_module",
    "add_interface",
    "leave_unchanged",
  ]),
  rationale: text(500),
});
export const BoundaryConstraintSchema = z.strictObject({
  kind: z.enum(["forbid_import", "require_import", "layer_constraint"]),
  from: RelativePathSchema,
  to: RelativePathSchema,
});
export const ArchitectureCandidateV1Schema = z
  .strictObject({
    schemaVersion: z.literal("architecture-candidate.v1"),
    id: IdSchema,
    label: text(120),
    baselineCommit: GitCommitSchema,
    description: text(2000),
    changePlan: z.array(ChangePlanItemSchema).max(32),
    constraints: z.array(BoundaryConstraintSchema).max(32),
    estimatedUpfrontCost: count(100_000),
    estimatedCostUnit: EffortUnitSchema,
    metaProvenance: z.enum(["live", "recorded", "template"]),
    modelId: text(150).nullable(),
    promptVersion: IdSchema.nullable(),
    limitations: texts(500, 24),
  })
  .superRefine((candidate, ctx) => {
    if (
      candidate.metaProvenance === "live" &&
      (candidate.modelId === null || candidate.promptVersion === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Live candidates require model and prompt identities.",
      });
    }
  });
export const ModuleSchema = z.strictObject({
  id: IdSchema,
  path: RelativePathSchema,
  kind: z.enum(["source", "route", "test", "config", "external", "unknown"]),
});
export const GraphEdgeSchema = z.strictObject({
  from: IdSchema,
  to: IdSchema,
  kind: z.enum([
    "static_import",
    "dynamic_import",
    "export",
    "route",
    "unknown",
  ]),
});
export const GraphV1Schema = z.strictObject({
  schemaVersion: z.literal("graph.v1"),
  id: IdSchema,
  repoCommit: GitCommitSchema,
  modules: z.array(ModuleSchema).max(2000),
  edges: z.array(GraphEdgeSchema).max(6000),
  unknowns: texts(500, 1000),
});
export const ScoreBasisSchema = z.strictObject({
  projectedChangedModules: z.array(RelativePathSchema).max(64),
  projectedRouteChanges: count(64),
  unresolvedRelevantDependencies: count(64),
  source: z.enum(["reviewed_estimate", "static_graph"]),
});
export const ScoreSchema = z.strictObject({
  candidateId: IdSchema,
  scenarioId: IdSchema,
  costUnit: EffortUnitSchema,
  upfrontCost: count(100_000),
  downstreamCost: count(100_000),
  totalCost: count(200_000),
  regret: count(200_000),
  rationale: text(1000),
  basis: ScoreBasisSchema,
});
export const DecisionV1Schema = z
  .strictObject({
    schemaVersion: z.literal("decision.v1"),
    id: IdSchema,
    graphId: IdSchema,
    baselineCommit: GitCommitSchema,
    scenarioIds: ids(24, 1),
    candidateIds: ids(12, 2),
    scoringVersion: EffortUnitSchema,
    assumptions: texts(500, 32),
    perScenario: z.array(ScoreSchema).max(288),
    recommendationId: IdSchema.nullable(),
    limitations: texts(500, 32),
  })
  .superRefine((decision, ctx) => {
    if (
      decision.perScenario.length === 0 &&
      (decision.recommendationId !== null || decision.limitations.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Abstention requires no recommendation and an explicit limitation.",
      });
    }
  });

export type ScenarioV1 = z.infer<typeof ScenarioV1Schema>;
export type ArchitectureCandidateV1 = z.infer<
  typeof ArchitectureCandidateV1Schema
>;
export type GraphV1 = z.infer<typeof GraphV1Schema>;
export type DecisionV1 = z.infer<typeof DecisionV1Schema>;
export type Score = z.infer<typeof ScoreSchema>;
