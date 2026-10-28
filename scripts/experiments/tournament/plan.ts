import { z } from "zod";
import { ScenarioV1Schema } from "../../../src/lib/contracts/architecture";
import {
  GitCommitSchema,
  IdSchema,
  Sha256Schema,
  ids,
} from "../../../src/lib/contracts/common";
import {
  BudgetSchema,
  PairManifestV1Schema,
} from "../../../src/lib/contracts/evidence";
import {
  invariant,
  sameIds,
  validatePair,
} from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";

export const OracleSchema = z.strictObject({
  evaluatorSha256: Sha256Schema,
  testSuiteSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  requiredCheckIds: ids(64, 1),
});
const ArmConditionsSchema = z.strictObject({
  variant: z.enum(["A", "B"]),
  originalCommit: GitCommitSchema,
  originalTreeSha256: Sha256Schema,
  dependencyLockSha256: Sha256Schema,
  taskSha256: Sha256Schema,
  visibleRoadmapSha256: Sha256Schema,
  promptTemplateSha256: Sha256Schema,
  agentConfigSha256: Sha256Schema,
  toolAllowlistSha256: Sha256Schema,
  runtimeSha256: Sha256Schema,
  networkPolicySha256: Sha256Schema,
  credentialPolicySha256: Sha256Schema,
  seed: z.number().int().min(0).max(2_147_483_647).nullable(),
  budget: BudgetSchema,
});

// Private local supplementary planning data, NOT a new public/frozen contract.
// There are deliberately no approval/issuer flags: parsing this does not grant
// execution, establish preregistration custody or authenticate operator review.
export const TournamentPlanSchema = z.strictObject({
  schemaVersion: z.literal("tournament-plan.local.v1"),
  manifest: PairManifestV1Schema,
  scenario: ScenarioV1Schema,
  taskSha256: Sha256Schema,
  visibleRoadmapSha256: Sha256Schema,
  baselineOracle: OracleSchema,
  futureOracle: OracleSchema,
  conditions: z.array(ArmConditionsSchema).length(2),
  trialPolicy: z.strictObject({
    attemptsPerArm: z.literal(1),
    order: z.enum(["A_then_B", "B_then_A"]),
    failedAttempts: z.literal("retain_all_no_retries"),
    opposingResults: z.literal("withheld_until_both_finished"),
  }),
  studyKind: z.literal("visible_preregistered_case_study"),
  intentRevision: z.strictObject({
    id: IdSchema,
    revision: z.number().int().positive(),
  }),
});
export type TournamentPlan = z.infer<typeof TournamentPlanSchema>;

export function validateTournamentPlan(input: unknown): TournamentPlan {
  const plan = TournamentPlanSchema.parse(input);
  const pair = plan.manifest;
  // Frozen validation requires every referenced run to exist. At preparation
  // time validate the unexecuted shape separately, then preserve the original
  // predeclared IDs for report-time validation against actual attempts.
  validatePair(
    { ...pair, arms: pair.arms.map((arm) => ({ ...arm, runId: null })) },
    [],
    [plan.scenario],
  );
  const plannedRunIds = pair.arms.flatMap((arm) =>
    arm.runId ? [arm.runId] : [],
  );
  invariant(
    new Set(plannedRunIds).size === plannedRunIds.length,
    "Duplicate planned run IDs.",
  );
  invariant(
    plan.scenario.intentIds.includes(plan.intentRevision.id),
    "Study intent revision differs from the frozen scenario.",
  );
  invariant(
    plan.taskSha256 === frozenTaskDigest(plan),
    "Task commitment differs from the exact scenario instructions and acceptance IDs.",
  );
  invariant(
    plan.scenario.origin === "developer_confirmed" &&
      plan.scenario.acceptanceIds.length > 0,
    "Study needs a confirmed frozen task with acceptance conditions.",
  );
  invariant(
    sameIds(
      plan.conditions.map((arm) => arm.variant),
      ["A", "B"],
    ),
    "Conditions must contain each arm exactly once.",
  );
  for (const oracle of [plan.baselineOracle, plan.futureOracle])
    invariant(
      new Set(oracle.requiredCheckIds).size === oracle.requiredCheckIds.length,
      "Duplicate oracle check IDs.",
    );
  invariant(
    plan.futureOracle.evaluatorSha256 === pair.evaluatorSha256 &&
      plan.futureOracle.requiredPolicySha256 === pair.requiredPolicySha256,
    "Future oracle differs from pair pins.",
  );
  const a = plan.conditions.find((arm) => arm.variant === "A")!;
  const b = plan.conditions.find((arm) => arm.variant === "B")!;
  const { variant: _a, ...left } = a;
  const { variant: _b, ...right } = b;
  void _a;
  void _b;
  invariant(
    jsonDigest(left) === jsonDigest(right),
    "Unequal downstream conditions.",
  );
  invariant(
    a.taskSha256 === plan.taskSha256 &&
      a.visibleRoadmapSha256 === plan.visibleRoadmapSha256 &&
      a.agentConfigSha256 === pair.agentConfigSha256 &&
      a.toolAllowlistSha256 === pair.toolAllowlistSha256 &&
      jsonDigest(a.budget) === jsonDigest(pair.budget),
    "Conditions differ from frozen pair/task pins.",
  );
  invariant(
    plan.scenario.baselineCommit === a.originalCommit,
    "Scenario differs from original source.",
  );
  const statusQuo = pair.arms.find((arm) => arm.variant === "A")!;
  invariant(
    statusQuo.initialCommit === a.originalCommit &&
      statusQuo.initialTreeSha256 === a.originalTreeSha256,
    "Status quo must preserve the identical pre-preparation source.",
  );
  return plan;
}

export function frozenTaskDigest(
  plan: Pick<TournamentPlan, "manifest" | "scenario">,
): string {
  return jsonDigest({
    taskId: plan.manifest.taskId,
    request: plan.scenario.request,
    assumptions: plan.scenario.assumptions,
    acceptanceIds: plan.scenario.acceptanceIds,
  });
}

export function tournamentPlanCommitment(input: unknown): string {
  return jsonDigest(validateTournamentPlan(input));
}
