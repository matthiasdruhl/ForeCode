import { UtcTimestampSchema } from "../../src/lib/contracts/common";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";
import { createSnapshot, type Snapshot } from "./dataset";
import { type AdmittedObservation } from "./intake";
import { type EvidenceLedger } from "./ledger";
import { createPolicy, trainPolicy, type PolicyArtifact } from "./policy";
import { type openLearningRegistry } from "./registry";
import { assessReward } from "./reward";
import { isApprovedSourceResult, type EvidenceSource } from "./source";
import {
  ShadowPlanSchema,
  ShadowReportSchema,
  type ShadowReport,
} from "./shadow-contracts";
import { learningTrainerIdentity } from "./trainer-identity";

type Registry = Awaited<ReturnType<typeof openLearningRegistry>>;
export type ShadowReplay = Readonly<{
  report: ShadowReport;
  sha256: string;
  policy: PolicyArtifact;
  snapshots: readonly Snapshot[];
}>;
const freshReplays = new WeakSet<object>();
export function isFreshShadowReplay(value: unknown): value is ShadowReplay {
  return !!value && typeof value === "object" && freshReplays.has(value);
}

// Operator-local numerical replay only. Each run reloads EVERY admitted
// original in the independently anchored prefix before updating any weights.
// There is no signer, grader, model request, experiment runner or release path.
export async function replayShadowPlan(input: {
  plan: unknown;
  source: EvidenceSource;
  ledger: EvidenceLedger;
  registry: Registry;
  assessedAt: string;
  mode?: "AUTHENTIC" | "SYNTHETIC";
}): Promise<ShadowReplay> {
  const plan = ShadowPlanSchema.parse(input.plan),
    mode = input.mode ?? "AUTHENTIC",
    at = UtcTimestampSchema.parse(input.assessedAt),
    identity = await learningTrainerIdentity();
  invariant(input.source.configured, "Approved source is not configured.");
  invariant(plan.origin === mode, "Synthetic replay isolation.");
  invariant(plan.trainerSha256 === identity.sha256, "Trainer source changed.");
  invariant(
    Date.parse(plan.frozenAt) <= Date.parse(at),
    "Replay predates plan.",
  );
  const audit = await input.ledger.inspect();
  invariant(
    jsonDigest(audit.head) === jsonDigest(plan.ledgerHead),
    "Ledger anchor changed.",
  );
  invariant(
    audit.entries.every(
      (e) => Date.parse(e.record.at) <= Date.parse(plan.frozenAt),
    ),
    "Plan predates anchored admissions.",
  );
  // Distinct admissions include ineligible and failed observations. Replays,
  // rejected/blocked loads remain in the audit but cannot add training rows.
  const admitted = audit.entries.filter((e) => e.record.status === "ADMITTED");
  const rows = plan.batches.flatMap((b) => b.rows);
  invariant(rows.length <= 1000, "Replay observation limit exceeded.");
  const rowHashes = new Set(rows.map((r) => r.observationSha256));
  invariant(
    rows.length === admitted.length &&
      rowHashes.size === rows.length &&
      admitted.every((e) => rowHashes.has(e.record.observationSha256!)),
    "Plan must retain every admission exactly once.",
  );
  let previousFreeze = -Infinity;
  for (const batch of plan.batches) {
    invariant(batch.origin === mode, "Batch origin mismatch.");
    const freeze = Date.parse(batch.frozenAt);
    invariant(
      freeze > previousFreeze && freeze <= Date.parse(plan.frozenAt),
      "Batch chronology changed.",
    );
    previousFreeze = freeze;
    invariant(batch.rows.length > 0, "Empty replay batch.");
    for (const row of batch.rows) {
      const entry = admitted.find(
        (e) => e.record.observationSha256 === row.observationSha256,
      )!;
      invariant(
        Date.parse(entry.record.at) <= freeze,
        "Batch predates admission.",
      );
    }
  }
  const observations = new Map<string, AdmittedObservation>();
  const sourceIds = new Map<string, string>();
  for (const entry of admitted) {
    const record = entry.record,
      result = await input.source.load(record.sourceId, at);
    invariant(
      isApprovedSourceResult(result),
      "Fresh approved original unavailable.",
    );
    invariant(
      result.sourceId === record.sourceId &&
        result.assessedAt === at &&
        result.packetSha256 === record.packetSha256 &&
        result.exportApprovalHeldAt === record.exportApprovalHeldAt &&
        result.observation.sha256 === record.observationSha256 &&
        result.observation.projection.origin === mode &&
        jsonDigest(result.observation.evidence) === jsonDigest(record.evidence),
      "Fresh source differs from admission.",
    );
    const o = result.observation,
      rewards = assessReward(o, mode);
    invariant(
      record.correctnessRewards ===
        rewards.filter((r) => r.correctness !== null).length &&
        record.costRewards ===
          rewards.filter((r) => r.efficiency !== null).length &&
        jsonDigest(record.failedActions) ===
          jsonDigest(
            rewards.filter((r) => r.correctness === 0).map((r) => r.action),
          ),
      "Admission reward summary changed.",
    );
    observations.set(o.sha256, o);
    sourceIds.set(o.sha256, record.sourceId);
  }
  // Global validation catches cross-batch family leakage, duplicate studies
  // and reused receipts, even when an earlier batch had no eligible rewards.
  if (plan.batches.length)
    createSnapshot(
      {
        ...plan.batches.at(-1)!,
        frozenAt: plan.frozenAt,
        rows,
      },
      [...observations.values()],
    );
  const snapshots = plan.batches.map((batch) =>
    createSnapshot(
      batch,
      batch.rows.map((r) => observations.get(r.observationSha256)!),
    ),
  );
  const initial = createPolicy({
    origin: mode,
    seed: plan.seed,
    trainerSha256: identity.sha256,
    config: plan.config,
  });
  let policy = initial;
  const policies = [initial],
    steps: ShadowReport["steps"] = [],
    outcomes: ShadowReport["observations"] = [];
  for (const snapshot of snapshots) {
    let hasTrainingReward = false;
    for (const row of snapshot.manifest.rows) {
      const rewards = assessReward(
        observations.get(row.observationSha256)!,
        mode,
      );
      hasTrainingReward ||=
        row.split === "train" && rewards.some((r) => r.correctness !== null);
      outcomes.push({
        sourceId: sourceIds.get(row.observationSha256)!,
        observationSha256: row.observationSha256,
        snapshotSha256: snapshot.sha256,
        split: row.split,
        rewards,
      });
    }
    const previous = policy;
    if (hasTrainingReward) {
      policy = trainPolicy(policy, snapshot);
      policies.push(policy);
    }
    steps.push({
      snapshotSha256: snapshot.sha256,
      previousPolicySha256: previous.sha256,
      policySha256: policy.sha256,
      updated: hasTrainingReward,
    });
  }
  const trainSupport = outcomes
    .filter(
      (o) =>
        o.split === "train" && o.rewards.some((r) => r.correctness !== null),
    )
    .map((o) => observations.get(o.observationSha256)!.projection.context);
  const report = ShadowReportSchema.parse({
    schemaVersion: "learning-shadow-replay.local.v1",
    planSha256: jsonDigest(plan),
    ledgerHead: audit.head,
    trainerSha256: identity.sha256,
    trainerManifest: identity.manifest,
    assessedAt: at,
    origin: mode,
    status: policy.policy.status,
    initialPolicySha256: initial.sha256,
    policySha256: policy.sha256,
    audit: audit.entries.map((e) => ({
      sequence: e.record.sequence,
      entrySha256: e.sha256,
      sourceId: e.record.sourceId,
      status: e.record.status,
      reason: e.record.reason,
      observationSha256: e.record.observationSha256,
    })),
    steps,
    observations: outcomes,
    trainingRepositoryFamilies: new Set(
      trainSupport.map((c) => c.repositoryFamily),
    ).size,
    trainingTaskFamilies: new Set(trainSupport.map((c) => c.taskFamily)).size,
    conclusion: "NO_INDEPENDENT_EVALUATION",
    execution: "DISABLED",
    promotion: "DISABLED",
  });
  // Validate everything before persisting. Partial I/O failure may leave valid
  // content-addressed ancestors, never a mutable promoted/current pointer.
  invariant(
    jsonDigest((await input.ledger.inspect()).head) === jsonDigest(audit.head),
    "Ledger changed during replay.",
  );
  invariant(
    (await learningTrainerIdentity()).sha256 === identity.sha256,
    "Trainer changed during replay.",
  );
  await input.registry.saveShadowPlan(plan);
  for (const snapshot of snapshots) await input.registry.saveSnapshot(snapshot);
  for (const artifact of policies) {
    await input.registry.savePolicy(artifact);
    invariant(
      (await input.registry.loadPolicy(artifact.sha256)).sha256 ===
        artifact.sha256,
      "Saved policy failed reload.",
    );
  }
  const sha256 = await input.registry.saveShadowReport(report);
  const result = immutable({ report, sha256, policy, snapshots });
  freshReplays.add(result);
  return result;
}
