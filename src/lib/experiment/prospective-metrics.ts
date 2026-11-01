// Supplementary prospective measurements; never a receipt, source of authority,
// frozen-v1 extension, or an input that can change a Decision Report verdict.
import { z } from "zod";
import { Sha256Schema, IdSchema } from "../contracts/common";
import { jsonDigest } from "../report/digests";
import { invariant } from "../contracts/validation";

const path = z
  .string()
  .regex(/^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|tsx)$/);
const edge = z.strictObject({ from: path, to: path });
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export const MetricProtocolSchema = z
  .strictObject({
    schemaVersion: z.literal("prospective-tournament-metrics.v1"),
    studyId: IdSchema,
    hypothesisId: z.uuid(),
    contextSha256: Sha256Schema,
    taskSha256: Sha256Schema,
    matchedConditionsSha256: Sha256Schema,
    evaluatorSha256: Sha256Schema,
    suiteSha256: Sha256Schema,
    policySha256: Sha256Schema,
    // Existing operator custody must authenticate this commitment before any
    // selection/preparation. A local timestamp or this parser cannot prove that.
    externalPackages: z
      .array(
        z
          .string()
          .regex(/^(?:[a-z][a-z0-9-]*|@[a-z0-9-]+\/[a-z0-9-]+|node:[a-z_]+)$/),
      )
      .max(100),
    boundaryRules: z
      .array(z.strictObject({ id: IdSchema, ...edge.shape }))
      .min(1)
      .max(100),
    authorizationCaseIds: z.array(IdSchema).min(1).max(100),
    observationWindow: z.literal("prepared_baseline_and_sealed_final_tree"),
    duplicatePolicy: z.literal("one_resolved_edge_or_case_per_arm_snapshot"),
    prediction: z.literal("B_fewer_final_forbidden_edges_than_A"),
  })
  .superRefine((p, c) => {
    if (
      !unique(p.externalPackages) ||
      !unique(p.boundaryRules.map((r) => r.id)) ||
      !unique(p.boundaryRules.map((r) => `${r.from}\0${r.to}`)) ||
      !unique(p.authorizationCaseIds)
    )
      c.addIssue({ code: "custom", message: "Duplicate rules/cases" });
  });
export type MetricProtocol = z.infer<typeof MetricProtocolSchema>;
const collection = z.strictObject({
  // Completeness is the evaluator's claim, to be independently authenticated by
  // its existing custody. A pure calculator deliberately cannot authenticate it.
  complete: z.boolean(),
  unresolvedImports: z.number().int().nonnegative(),
  scannedRuleIds: z.array(IdSchema).max(100),
  edges: z.array(edge).max(10_000),
});
const authorization = z.strictObject({
  caseId: IdSchema,
  outcome: z.enum(["pass", "fail", "not_run", "invalid"]),
});
const snapshot = z.strictObject({
  treeSha256: Sha256Schema,
  boundary: collection,
  authorization: z.array(authorization).max(100),
});
export const MetricObservationsSchema = z.strictObject({
  schemaVersion: z.literal("prospective-tournament-observations.v1"),
  studyId: IdSchema,
  protocolSha256: Sha256Schema,
  taskSha256: Sha256Schema,
  matchedConditionsSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  suiteSha256: Sha256Schema,
  policySha256: Sha256Schema,
  arms: z
    .array(
      z.strictObject({
        variant: z.enum(["A", "B"]),
        runId: IdSchema,
        status: z.enum([
          "completed",
          "failed",
          "cancelled",
          "timed_out",
          "blocked",
        ]),
        baseline: snapshot.nullable(),
        final: snapshot.nullable(),
      }),
    )
    .length(2),
});
export type MetricObservations = z.infer<typeof MetricObservationsSchema>;
const same = (a: string[], b: string[]) =>
  unique(a) &&
  unique(b) &&
  a.length === b.length &&
  a.every((x) => b.includes(x));

function measure(s: z.infer<typeof snapshot> | null, p: MetricProtocol) {
  if (!s) return { boundaryViolations: null, authorizationFailures: null };
  const b = s.boundary;
  const boundaryViolations =
    b.complete &&
    b.unresolvedImports === 0 &&
    same(
      b.scannedRuleIds,
      p.boundaryRules.map((r) => r.id),
    )
      ? new Set(
          b.edges
            .filter((e) =>
              p.boundaryRules.some((r) => r.from === e.from && r.to === e.to),
            )
            .map((e) => `${e.from}\0${e.to}`),
        ).size
      : null;
  const authorizationFailures =
    same(
      s.authorization.map((o) => o.caseId),
      p.authorizationCaseIds,
    ) &&
    s.authorization.every((o) => o.outcome === "pass" || o.outcome === "fail")
      ? s.authorization.filter((o) => o.outcome === "fail").length
      : null;
  return { boundaryViolations, authorizationFailures };
}
export function calculateProspectiveMetrics(
  protocolInput: unknown,
  observationsInput: unknown,
) {
  const p = MetricProtocolSchema.parse(protocolInput),
    o = MetricObservationsSchema.parse(observationsInput);
  const protocolSha256 = jsonDigest(p);
  // Content identity is necessary but never registration/evidence authentication.
  invariant(
    o.studyId === p.studyId && o.protocolSha256 === protocolSha256,
    "Protocol identity mismatch",
  );
  invariant(
    (
      [
        "taskSha256",
        "matchedConditionsSha256",
        "evaluatorSha256",
        "suiteSha256",
        "policySha256",
      ] as const
    ).every((k) => o[k] === p[k]),
    "Incomparable conditions",
  );
  invariant(
    new Set(o.arms.map((a) => a.variant)).size === 2 &&
      new Set(o.arms.map((a) => a.runId)).size === 2,
    "Duplicate arm/run",
  );
  const arms = o.arms.map((a) => ({
    variant: a.variant,
    baseline: measure(a.baseline, p),
    final: measure(a.final, p),
  }));
  const a = arms.find((a) => a.variant === "A")!,
    b = arms.find((a) => a.variant === "B")!;
  const complete =
    o.arms.every((a) => a.status === "completed") &&
    arms.every(
      (a) =>
        a.baseline.boundaryViolations !== null &&
        a.final.boundaryViolations !== null &&
        a.baseline.authorizationFailures !== null &&
        a.final.authorizationFailures !== null,
    );
  const eligible =
    complete && arms.every((a) => a.baseline.authorizationFailures === 0);
  return {
    authority: "UNAUTHENTICATED_METRIC_CALCULATION" as const,
    arms,
    predictionAssessment: !eligible
      ? "not_established"
      : b.final.boundaryViolations! < a.final.boundaryViolations!
        ? "supported"
        : "contradicted",
    abstentionReason: !complete
      ? "INCOMPLETE_OR_MISSING_MEASUREMENTS"
      : !eligible
        ? "BASELINE_AUTHORIZATION_FAILURE"
        : null,
    boundaryTie: complete
      ? a.final.boundaryViolations === b.final.boundaryViolations
      : null,
    // Authorization is a separate correctness gate, never evidence for fewer edges.
    authorizationPreserved: complete
      ? arms.every(
          (a) =>
            a.baseline.authorizationFailures === 0 &&
            a.final.authorizationFailures === 0,
        )
      : null,
    independentSamples: eligible ? 1 : 0,
    engineeringRecommendation:
      "DEFER_TO_AUTHENTICATED_DETERMINISTIC_REPORT" as const,
  };
}
