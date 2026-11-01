// Supplementary analysis, outside the 49 frozen contracts. Parsing and hashing
// establish shape and identity, never receipt authentication or disclosure rights.
import { z } from "zod";
import { invariant, sameIds } from "../contracts/validation";
import { Sha256Schema } from "../contracts/common";
import {
  PublicTournamentSchema,
  tournamentRequiredChecks,
  type PublicTournament,
} from "../experiment/tournament-publication";
import { preparationInclusiveMetrics } from "../experiment/metrics";
import { canonicalJson } from "./canonical";
import { jsonDigest } from "./digests";

// Assumptions for offline analysis ONLY. The current approved publication has
// no predeclared effort criterion; the production composer never supplies this.
export const AssumedEffortCriterionSchema = z.strictObject({
  protocolOriginalSha256: Sha256Schema,
  metric: z.enum(["elapsedMs", "tokens", "costUsd", "iterations"]),
  objective: z.literal("minimize_preparation_inclusive_total"),
  establishedBeforeExecution: z.literal(true),
  measurementsComparable: z.literal(true),
});
export type AssumedEffortCriterion = z.infer<
  typeof AssumedEffortCriterionSchema
>;
const LabelSchema = z.enum(["REFACTOR", "KEEP", "INCONCLUSIVE"]);
const IdentitySchema = PublicTournamentSchema.pick({
  studyId: true,
  taskId: true,
  taskDefinitionSha256: true,
  definitionSha256: true,
  protocolOriginalSha256: true,
  preparedOriginalSha256: true,
  model: true,
  order: true,
  comparability: true,
  correctness: true,
  baselineEvaluatorSha256: true,
  baselineSuiteSha256: true,
  baselinePolicySha256: true,
  futureEvaluatorSha256: true,
  futureSuiteSha256: true,
  futurePolicySha256: true,
});
const text = z.string().min(1).max(500);
export const DecisionReportAnalysisSchema = z.strictObject({
  schemaVersion: z.literal("decision-report-analysis.v1"),
  provenance: z.literal("UNAUTHENTICATED_ANALYSIS"),
  decision: LabelSchema,
  support: z.enum(["CONDITIONAL_ON_AUTHENTICATED_INPUT", "INCONCLUSIVE"]),
  basis: z.enum(["CORRECTNESS", "ASSUMED_EFFORT_CRITERION", "ABSTENTION"]),
  headline: text,
  explanation: text,
  scope: text,
  question: PublicTournamentSchema.shape.futureProblem.nullable(),
  reasons: z.array(text).min(2).max(3),
  nextAction: text,
  identity: IdentitySchema.nullable(),
  observations: PublicTournamentSchema.pick({
    arms: true,
    attempts: true,
    preparationAttempts: true,
    blockers: true,
    deviations: true,
    limitations: true,
  }).nullable(),
  differingChecks: z.array(z.enum(tournamentRequiredChecks)).max(8),
  assumedCriterion: AssumedEffortCriterionSchema.nullable(),
  evidenceReferences: z
    .strictObject({
      // Safe identifiers and digests only; no original paths, payloads or source.
      projectionSha256: Sha256Schema,
      studyId: IdentitySchema.shape.studyId,
      taskId: IdentitySchema.shape.taskId,
    })
    .nullable(),
  limitations: z.array(text).max(12),
});
export type DecisionReportAnalysis = z.infer<
  typeof DecisionReportAnalysisSchema
>;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const baseLimits = [
  "Recommendations are advisory and apply only to the pinned task, source trees and required checks in this single study.",
  "Parsing, hashing and this pure analysis do not authenticate evidence or authorize publication. Use the fresh server-side loader.",
  "A/B does not establish Meta's incremental benefit or general architectural superiority.",
  "Unknown measurements remain unknown; reservation limits are not actual spending. Files-touched phase counts are never added.",
];
function finish(report: DecisionReportAnalysis): DecisionReportAnalysis {
  return freeze(DecisionReportAnalysisSchema.parse(report));
}
function unavailable(): DecisionReportAnalysis {
  return finish({
    schemaVersion: "decision-report-analysis.v1",
    provenance: "UNAUTHENTICATED_ANALYSIS",
    decision: "INCONCLUSIVE",
    support: "INCONCLUSIVE",
    basis: "ABSTENTION",
    headline: "Evidence unavailable",
    explanation:
      "Missing or inconsistent evidence cannot justify an engineering recommendation.",
    scope: "No authenticated study is established by this analysis.",
    question: null,
    reasons: [
      "The supplied projection is absent, malformed or internally inconsistent.",
      "Fresh approved originals and matching protected receipts are required.",
    ],
    nextAction:
      "Load a complete approved study through the existing protected publication loader before deciding.",
    identity: null,
    observations: null,
    differingChecks: [],
    assumedCriterion: null,
    evidenceReferences: null,
    limitations: baseLimits,
  });
}
function validateConsistency(p: PublicTournament) {
  invariant(
    sameIds(
      p.arms.map((a) => a.variant),
      ["A", "B"],
    ),
    "Pair required.",
  );
  invariant(
    new Set(p.attempts.map((a) => a.id)).size === p.attempts.length &&
      new Set(p.preparationAttempts.map((a) => a.id)).size ===
        p.preparationAttempts.length,
    "Duplicate history.",
  );
  for (const arm of p.arms) {
    invariant(
      sameIds(
        arm.checks.map((c) => c.id),
        tournamentRequiredChecks,
      ),
      "Required checks missing.",
    );
    const total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
    invariant(
      canonicalJson(total) === canonicalJson(arm.total),
      "Inconsistent totals.",
    );
    if (arm.verdict !== "INSUFFICIENT_EVIDENCE") {
      invariant(
        arm.runId && arm.receiptId && arm.finalTreeSha256,
        "Outcome identity missing.",
      );
      invariant(
        arm.verdict === "VERIFIED"
          ? arm.checks.every((c) => c.status === "pass")
          : arm.checks.some((c) => c.status === "fail"),
        "Verdict differs from required checks.",
      );
    }
  }
  const [a, b] = [
    p.arms.find((x) => x.variant === "A")!,
    p.arms.find((x) => x.variant === "B")!,
  ];
  invariant(!a.runId || a.runId !== b.runId, "Run reuse.");
  invariant(!a.receiptId || a.receiptId !== b.receiptId, "Receipt reuse.");
  invariant(
    !a.baselineReceiptId || a.baselineReceiptId !== b.baselineReceiptId,
    "Baseline receipt reuse.",
  );
  const comparable = p.comparability === "COMPARABLE";
  const classification = !comparable
    ? "INCONCLUSIVE"
    : a.verdict === "VERIFIED" && b.verdict === "VERIFIED"
      ? "BOTH_VERIFIED"
      : a.verdict === "VERIFIED" && b.verdict === "REJECTED"
        ? "A_ONLY_VERIFIED"
        : b.verdict === "VERIFIED" && a.verdict === "REJECTED"
          ? "B_ONLY_VERIFIED"
          : a.verdict === "REJECTED" && b.verdict === "REJECTED"
            ? "BOTH_REJECTED"
            : "INCONCLUSIVE";
  invariant(p.correctness === classification, "Classification mismatch.");
}

/** Non-authoritative deterministic analysis. Callers cannot authenticate JSON by
 * invoking this function. Production recommendations require the server composer. */
export function assessDecisionReport(
  input: unknown,
  assumedCriterionInput: unknown = null,
): DecisionReportAnalysis {
  try {
    // Validate plain JSON and parse snapshots so Zod never accesses caller objects.
    const snapshot: unknown = JSON.parse(canonicalJson(input));
    const criterionSnapshot: unknown = JSON.parse(
      canonicalJson(assumedCriterionInput),
    );
    const p = PublicTournamentSchema.parse(snapshot);
    validateConsistency(p);
    const assumedCriterion =
      criterionSnapshot === null
        ? null
        : AssumedEffortCriterionSchema.parse(criterionSnapshot);
    invariant(
      !assumedCriterion ||
        assumedCriterion.protocolOriginalSha256 === p.protocolOriginalSha256,
      "Criterion protocol mismatch.",
    );
    const arms = [...p.arms].sort((a, b) => (a.variant < b.variant ? -1 : 1));
    const [a, b] = arms;
    const report: DecisionReportAnalysis = {
      schemaVersion: "decision-report-analysis.v1",
      provenance: "UNAUTHENTICATED_ANALYSIS",
      decision: "INCONCLUSIVE",
      support: "INCONCLUSIVE",
      basis: "ABSTENTION",
      headline: "More evidence is needed",
      explanation:
        "The available comparison does not justify keeping A or adopting B.",
      scope:
        "One frozen future requirement; recommendations require human review and do not change evaluator verdicts.",
      question: p.futureProblem,
      reasons: [],
      nextAction:
        "Collect a complete comparable study under separately authorized procedures before deciding.",
      identity: IdentitySchema.parse(
        Object.fromEntries(
          Object.keys(IdentitySchema.shape).map((k) => [
            k,
            p[k as keyof PublicTournament],
          ]),
        ),
      ),
      observations: {
        arms,
        attempts: [...p.attempts].sort((a, b) => (a.id < b.id ? -1 : 1)),
        preparationAttempts: [...p.preparationAttempts].sort((a, b) =>
          a.id < b.id ? -1 : 1,
        ),
        blockers: [...p.blockers].sort(),
        deviations: [...p.deviations].sort(),
        limitations: [...p.limitations],
      },
      differingChecks: tournamentRequiredChecks.filter(
        (id) =>
          a!.checks.find((c) => c.id === id)!.status !==
          b!.checks.find((c) => c.id === id)!.status,
      ),
      assumedCriterion,
      evidenceReferences: {
        projectionSha256: jsonDigest(p),
        studyId: p.studyId,
        taskId: p.taskId,
      },
      limitations: [...baseLimits],
    };
    const eligible =
      p.comparability === "COMPARABLE" &&
      p.blockers.length === 0 &&
      p.deviations.length === 0 &&
      arms.every(
        (arm) =>
          arm.baselineVerdict === "VERIFIED" &&
          arm.baselineReceiptId !== null &&
          arm.status === "completed" &&
          arm.verdict !== "INSUFFICIENT_EVIDENCE",
      );
    if (!eligible) {
      report.reasons = [
        `Study comparability: ${p.comparability}; unresolved blockers: ${p.blockers.length}; deviations: ${p.deviations.length}.`,
        "Both valid starting baselines, completed attempts and sufficient protected outcomes are necessary for a recommendation.",
      ];
    } else if (p.correctness === "BOTH_REJECTED") {
      report.headline = "Neither architecture satisfied the required checks";
      report.reasons = [
        "Both arms have rejected protected outcomes.",
        "These failures establish no verified architectural winner.",
      ];
      report.nextAction =
        "Review the failed check identifiers and remediate before any separately authorized controlled experiment.";
    } else if (p.correctness === "BOTH_VERIFIED") {
      report.headline = "Correctness tie";
      report.explanation =
        "Both arms passed the required checks; correctness alone does not justify an architectural preference.";
      report.reasons = [
        "Both arms have verified protected outcomes for the same frozen task.",
        "No authenticated predeclared effort criterion is available in the current publication format.",
      ];
      if (assumedCriterion) {
        const metric = assumedCriterion.metric;
        const left = a!.total[metric],
          right = b!.total[metric];
        if (left !== null && right !== null && left !== right) {
          report.decision = left < right ? "KEEP" : "REFACTOR";
          report.basis = "ASSUMED_EFFORT_CRITERION";
          report.reasons = [
            "Both arms passed the required protected checks: a correctness tie.",
            `Under the supplied offline criterion assumption, ${left < right ? "A" : "B"} has lower preparation-inclusive ${metric} (${left} versus ${right} for A and B).`,
          ];
          report.limitations.push(
            "The effort criterion is a caller-supplied offline assumption, not authenticated preregistration. This preference cannot be promoted by the production composer.",
          );
        } else {
          report.reasons[1] =
            left === null || right === null
              ? "The selected preparation-inclusive measurement is unknown for at least one arm."
              : "The selected preparation-inclusive measurements are equal.";
        }
      }
    } else if (
      p.correctness === "A_ONLY_VERIFIED" ||
      p.correctness === "B_ONLY_VERIFIED"
    ) {
      report.decision =
        p.correctness === "A_ONLY_VERIFIED" ? "KEEP" : "REFACTOR";
      report.basis = "CORRECTNESS";
      report.reasons = [
        `${report.decision === "KEEP" ? "A" : "B"} passed all eight required protected checks; the other arm has an authenticated rejection when loaded through the trusted composer.`,
        `The required-check outcomes differ on: ${report.differingChecks.join(", ")}.`,
        "Comparable conditions support a preference only for this evaluated task, without a claim of lower cost.",
      ];
    } else {
      report.reasons = [
        "At least one required protected outcome is insufficient.",
        "A missing outcome is not an authenticated rejection.",
      ];
    }
    if (report.decision !== "INCONCLUSIVE") {
      report.support = "CONDITIONAL_ON_AUTHENTICATED_INPUT";
      report.headline =
        report.decision === "KEEP"
          ? "Retain Architecture A for the evaluated task"
          : "Review adoption of Architecture B for the evaluated task";
      report.explanation =
        report.basis === "CORRECTNESS"
          ? "The verified arm has a scoped correctness advantage under the matched study conditions."
          : "The assumed predeclared criterion favors the lower measured preparation-inclusive total in this correctness tie.";
      report.nextAction =
        report.decision === "KEEP"
          ? "Retain the current architecture for this scope and revisit when requirements change."
          : "Review adoption of the tested preparation boundary before making code changes.";
    }
    if (arms.some((arm) => Object.values(arm.total).some((v) => v === null)))
      report.limitations.push(
        "Some preparation-inclusive measurements are unknown; no missing effort is treated as zero and no savings are inferred.",
      );
    return finish(report);
  } catch {
    // Never echo parser errors, arbitrary input or private fields into reports.
    return unavailable();
  }
}
