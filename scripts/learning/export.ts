// Sanitized, private review draft from main's existing data-only report.
import { z } from "zod";
import {
  ContextSchema,
  StrategySchema,
} from "../../src/lib/learning/contracts";
import {
  Sha256Schema,
  IdSchema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import { ExperimentRunV1Schema } from "../../src/lib/contracts/evidence";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";

const MappingSchema = z.strictObject({
  A: z.literal("KEEP"),
  B: StrategySchema.exclude(["KEEP"]),
});
export const LearningExportDraftSchema = z.strictObject({
  schemaVersion: z.literal("learning-tournament-draft.local.v1"),
  authority: z.literal("unapproved_review_draft"),
  trainingEligible: z.literal(false),
  studyId: IdSchema,
  contextSha256: Sha256Schema,
  decisionAt: UtcTimestampSchema,
  protocolOriginalSha256: Sha256Schema,
  preparedOriginalSha256: Sha256Schema,
  sourceReportSha256: Sha256Schema,
  sourceComparability: z.enum(["BLOCKED", "NOT_COMPARABLE"]),
  comparison: z.enum(["BLOCKED", "INVALID"]),
  preparationHistorySha256: Sha256Schema,
  arms: z
    .array(
      z.strictObject({
        strategy: StrategySchema,
        variant: z.enum(["A", "B"]),
        runId: IdSchema.nullable(),
        receiptId: IdSchema.nullable(),
        initialTreeSha256: Sha256Schema,
        finalTreeSha256: Sha256Schema.nullable(),
        baselineVerdict: z.enum([
          "VERIFIED",
          "REJECTED",
          "INSUFFICIENT_EVIDENCE",
        ]),
        futureVerdict: z.enum([
          "VERIFIED",
          "REJECTED",
          "INSUFFICIENT_EVIDENCE",
        ]),
        preparationCostUsd: z.null(),
        downstreamCostUsd: z.null(),
      }),
    )
    .length(2),
  preparationAttempts: z
    .array(
      z.strictObject({
        id: IdSchema,
        status: z.enum([
          "completed",
          "failed",
          "cancelled",
          "timed_out",
          "blocked",
        ]),
        startedAt: UtcTimestampSchema,
        endedAt: UtcTimestampSchema,
      }),
    )
    .max(100),
  attempts: z
    .array(
      z.strictObject({
        id: IdSchema,
        strategy: StrategySchema.nullable(),
        variant: z.enum(["A", "B", "C"]),
        status: ExperimentRunV1Schema.shape.status,
        startedAt: UtcTimestampSchema,
        endedAt: UtcTimestampSchema,
      }),
    )
    .max(100),
  blockers: z.array(IdSchema).max(200),
});

export type DraftExportRequest = {
  study: unknown;
  attempts: readonly z.infer<typeof ExperimentRunV1Schema>[];
  baselines?: ReadonlyMap<"A" | "B", unknown>;
  evaluations?: ReadonlyMap<string, unknown>;
};
const DraftSourceSchema = LearningExportDraftSchema.pick({
  studyId: true,
  decisionAt: true,
  protocolOriginalSha256: true,
  preparedOriginalSha256: true,
  sourceReportSha256: true,
  sourceComparability: true,
  preparationHistorySha256: true,
  preparationAttempts: true,
  blockers: true,
}).extend({
  schemaVersion: z.literal("learning-draft-source.local.v1"),
  originalTreeSha256: Sha256Schema,
  visibleRoadmapSha256: Sha256Schema,
  arms: z
    .array(
      LearningExportDraftSchema.shape.arms.element.omit({
        strategy: true,
        preparationCostUsd: true,
        downstreamCostUsd: true,
      }),
    )
    .length(2),
  attempts: z
    .array(
      LearningExportDraftSchema.shape.attempts.element.omit({ strategy: true }),
    )
    .max(100),
});
// Supplied only by reviewed core/operator composition. Learning code imports no
// preparation/report/runner/grader implementation. Tests use the actual main
// preparation predicate and report assembler through this narrow adapter.
export function draftLearningExport(
  input: DraftExportRequest & {
    core: { inspect(request: DraftExportRequest): unknown };
    context: unknown;
    mapping: unknown;
  },
) {
  const context = ContextSchema.parse(input.context),
    mapping = MappingSchema.parse(input.mapping);
  const source = DraftSourceSchema.parse(input.core.inspect(input));
  invariant(
    context.sourceSha256 === source.originalTreeSha256 &&
      context.intentSha256 === source.visibleRoadmapSha256,
    "Learning context source/roadmap mismatch.",
  );
  invariant(
    Date.parse(context.frozenAt) < Date.parse(source.decisionAt),
    "Context postdates architecture selection.",
  );
  invariant(
    Object.values(mapping).every((s) => context.actions.eligible.includes(s)),
    "Strategy outside reviewed action set.",
  );
  invariant(
    new Set(source.arms.map((a) => a.variant)).size === 2,
    "Duplicate source arms.",
  );
  return immutable(
    LearningExportDraftSchema.parse({
      schemaVersion: "learning-tournament-draft.local.v1",
      authority: "unapproved_review_draft",
      trainingEligible: false,
      studyId: source.studyId,
      contextSha256: jsonDigest(context),
      decisionAt: source.decisionAt,
      protocolOriginalSha256: source.protocolOriginalSha256,
      preparedOriginalSha256: source.preparedOriginalSha256,
      sourceReportSha256: source.sourceReportSha256,
      sourceComparability: source.sourceComparability,
      comparison:
        source.sourceComparability === "NOT_COMPARABLE" ? "INVALID" : "BLOCKED",
      preparationHistorySha256: source.preparationHistorySha256,
      arms: source.arms.map((arm) => ({
        strategy: mapping[arm.variant],
        variant: arm.variant,
        runId: arm.runId,
        receiptId: arm.receiptId,
        initialTreeSha256: arm.initialTreeSha256,
        finalTreeSha256: arm.finalTreeSha256,
        baselineVerdict: arm.baselineVerdict,
        futureVerdict: arm.futureVerdict,
        // Main's runtime telemetry is unauthenticated. Reported numbers cannot
        // become actual training charges, even when they happen to be zero.
        preparationCostUsd: null,
        downstreamCostUsd: null,
      })),
      preparationAttempts: source.preparationAttempts,
      attempts: source.attempts.map((a) => ({
        id: a.id,
        strategy: a.variant === "C" ? null : mapping[a.variant],
        variant: a.variant,
        status: a.status,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
      })),
      blockers: source.blockers,
    }),
  );
}
