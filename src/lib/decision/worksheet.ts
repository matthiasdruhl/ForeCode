import { z } from "zod";
import { ScoreBasisSchema } from "../contracts/architecture";
import { IdSchema } from "../contracts/common";
import type { ResearchContext } from "../contracts/validation";
import { canonicalJson } from "../report/canonical";

// Internal browser worksheet, deliberately not an EvaluateRequest extension.
export const PairReviewSchema = z.strictObject({
  candidateId: IdSchema,
  scenarioId: IdSchema,
  reviewed: z.boolean(),
  rationale: z.string().max(1000),
  relevantUnknown: z.string().max(500),
  basis: ScoreBasisSchema.extend({
    source: z.literal("reviewed_estimate"),
    projectedChangedModules:
      ScoreBasisSchema.shape.projectedChangedModules.nullable(),
    projectedRouteChanges:
      ScoreBasisSchema.shape.projectedRouteChanges.nullable(),
    unresolvedRelevantDependencies:
      ScoreBasisSchema.shape.unresolvedRelevantDependencies.nullable(),
  }),
});
export const WorksheetSchema = z.strictObject({
  contextKey: z.string(),
  scope: z.string().max(500),
  comparability: z.enum(["unreviewed", "shared_scope", "incomparable"]),
  unknowns: z
    .array(
      z.strictObject({
        unknown: z.string().max(500),
        disposition: z.enum(["unreviewed", "out_of_scope", "relevant_unknown"]),
        rationale: z.string().max(500),
      }),
    )
    .max(1000),
  pairs: z.array(PairReviewSchema).max(288),
});
export type Worksheet = z.infer<typeof WorksheetSchema>;
export type PairReview = z.infer<typeof PairReviewSchema>;
export const researchKey = (context: ResearchContext) => canonicalJson(context);
export function createWorksheet(context: ResearchContext): Worksheet {
  return {
    contextKey: researchKey(context),
    scope: "",
    comparability: "unreviewed",
    unknowns: [...new Set(context.graph.unknowns)].map((unknown) => ({
      unknown,
      disposition: "unreviewed",
      rationale: "",
    })),
    pairs: context.scenarios.flatMap((scenario) =>
      context.candidates.map((candidate) => ({
        candidateId: candidate.id,
        scenarioId: scenario.id,
        reviewed: false,
        rationale: "",
        relevantUnknown: "",
        basis: {
          source: "reviewed_estimate",
          projectedChangedModules: null,
          projectedRouteChanges: null,
          unresolvedRelevantDependencies: null,
        },
      })),
    ),
  };
}
