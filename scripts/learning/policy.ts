import { z } from "zod";
import {
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import {
  ContextSchema,
  strategies,
  StrategySchema,
  FEATURE_DIMENSION,
  FEATURE_VERSION,
  ACTION_VERSION,
  REWARD_VERSION,
  type Strategy,
} from "../../src/lib/learning/contracts";
import { extractFeatures } from "../../src/lib/learning/features";
import { jsonDigest } from "../../src/lib/report/digests";
import { invariant } from "../../src/lib/contracts/validation";
import { immutable } from "../experiments/tournament/custody";
import { isSnapshot, type Snapshot } from "./dataset";
import { assessReward } from "./reward";

const finite = z.number().finite();
const vector = z.array(finite).length(FEATURE_DIMENSION);
const matrix = z.array(vector).length(FEATURE_DIMENSION);
const ChannelSchema = z.strictObject({
  a: matrix,
  b: vector,
  samples: z.number().int().nonnegative(),
});
const SupportSchema = z.strictObject({
  action: StrategySchema,
  repositoryFamily: Sha256Schema,
  taskFamily: Sha256Schema,
  values: vector,
});
const UpdateSchema = z.strictObject({
  observationSha256: Sha256Schema,
  action: StrategySchema,
  correctness: z.number().min(0).max(1),
  efficiency: z.number().min(0).max(1).nullable(),
});
export const PolicySchema = z.strictObject({
  schemaVersion: z.literal("learning-policy.v1"),
  algorithm: z.literal("disjoint-linucb-two-channel.v1"),
  featureVersion: z.literal(FEATURE_VERSION),
  actionVersion: z.literal(ACTION_VERSION),
  rewardVersion: z.literal(REWARD_VERSION),
  version: z.number().int().nonnegative(),
  parentSha256: Sha256Schema.nullable(),
  trainerSha256: Sha256Schema,
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  status: z.enum(["NOT_TRAINED", "SHADOW"]),
  seed: z.number().int().min(0).max(2147483647),
  config: z.strictObject({
    lambda: z.number().min(0.001).max(1000),
    alpha: z.number().min(0.01).max(10),
    minimumFamilies: z.number().int().min(2).max(1000),
    minimumCorrectness: z.number().min(0.5).max(1),
    maximumDistance: z.number().min(0.001).max(1),
    maximumMissing: z.number().int().min(0).max(8),
  }),
  snapshots: z.array(Sha256Schema).max(10000),
  trainedThrough: UtcTimestampSchema.nullable(),
  evidenceIds: z.array(z.string().min(1).max(128)).max(6000),
  studies: z.array(z.string().min(1).max(128)).max(1000),
  partitions: z
    .array(
      z.strictObject({
        repositoryFamily: Sha256Schema,
        taskFamily: Sha256Schema,
        split: z.enum(["train", "validation", "test"]),
      }),
    )
    .max(1000),
  updates: z.array(UpdateSchema).max(30000),
  support: z.array(SupportSchema).max(30000),
  actions: z.strictObject({
    KEEP: z.strictObject({
      correctness: ChannelSchema,
      efficiency: ChannelSchema,
    }),
    BOUNDARY: z.strictObject({
      correctness: ChannelSchema,
      efficiency: ChannelSchema,
    }),
    ADAPTER: z.strictObject({
      correctness: ChannelSchema,
      efficiency: ChannelSchema,
    }),
  }),
});
export type Policy = z.infer<typeof PolicySchema>;
type Channel = z.infer<typeof ChannelSchema>;
export type PolicyArtifact = Readonly<{ policy: Policy; sha256: string }>;

function initialChannel(lambda: number): Channel {
  return {
    a: Array.from({ length: FEATURE_DIMENSION }, (_, i) =>
      Array.from({ length: FEATURE_DIMENSION }, (_, j) =>
        i === j ? lambda : 0,
      ),
    ),
    b: Array<number>(FEATURE_DIMENSION).fill(0),
    samples: 0,
  };
}
export function createPolicy(input: {
  trainerSha256: string;
  seed?: number;
  origin?: Policy["origin"];
  config?: Partial<Policy["config"]>;
}): PolicyArtifact {
  const config: Policy["config"] = {
    lambda: 1,
    alpha: 1,
    minimumFamilies: 3,
    minimumCorrectness: 0.8,
    maximumDistance: 0.25,
    maximumMissing: 3,
    ...input.config,
  };
  const channel = () => ({
    correctness: initialChannel(config.lambda),
    efficiency: initialChannel(config.lambda),
  });
  return sealPolicy({
    schemaVersion: "learning-policy.v1",
    algorithm: "disjoint-linucb-two-channel.v1",
    featureVersion: FEATURE_VERSION,
    actionVersion: ACTION_VERSION,
    rewardVersion: REWARD_VERSION,
    version: 0,
    parentSha256: null,
    trainerSha256: input.trainerSha256,
    origin: input.origin ?? "AUTHENTIC",
    status: "NOT_TRAINED",
    seed: input.seed ?? 0,
    config,
    snapshots: [],
    trainedThrough: null,
    evidenceIds: [],
    studies: [],
    partitions: [],
    updates: [],
    support: [],
    actions: { KEEP: channel(), BOUNDARY: channel(), ADAPTER: channel() },
  });
}

function dot(x: number[], y: number[]) {
  return x.reduce((sum, v, i) => sum + v * y[i]!, 0);
}
// Cholesky solve for regularized positive-definite design matrices. No large
// numerical dependency; malformed or ill-conditioned state fails closed.
function solve(a: number[][], b: number[]) {
  const n = b.length,
    l = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      invariant(
        Math.abs(a[i]![j]! - a[j]![i]!) < 1e-9,
        "Asymmetric policy matrix.",
      );
      let sum = a[i]![j]!;
      for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!;
      if (i === j) invariant(sum > 1e-12, "Non-positive policy matrix.");
      l[i]![j] = i === j ? Math.sqrt(sum) : sum / l[j]![j]!;
    }
  const y = Array<number>(n).fill(0),
    x = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let j = 0; j < i; j++) s -= l[i]![j]! * y[j]!;
    y[i] = s / l[i]![i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let j = i + 1; j < n; j++) s -= l[j]![i]! * x[j]!;
    x[i] = s / l[i]![i]!;
  }
  invariant(x.every(Number.isFinite), "Non-finite model solve.");
  return x;
}
function sealPolicy(input: unknown): PolicyArtifact {
  const p = PolicySchema.parse(input);
  invariant(
    new Set(p.snapshots).size === p.snapshots.length,
    "Repeated snapshot.",
  );
  invariant(
    new Set(p.evidenceIds).size === p.evidenceIds.length &&
      new Set(p.studies).size === p.studies.length,
    "Repeated evidence.",
  );
  for (const key of ["repositoryFamily", "taskFamily"] as const) {
    const groups = new Map<string, string>();
    for (const row of p.partitions) {
      invariant(
        !groups.has(row[key]) || groups.get(row[key]) === row.split,
        "Cross-version held-out leakage.",
      );
      groups.set(row[key], row.split);
    }
  }
  invariant(
    new Set(p.updates.map((u) => u.observationSha256 + u.action)).size ===
      p.updates.length,
    "Repeated update.",
  );
  invariant(p.support.length === p.updates.length, "Missing update support.");
  invariant(p.version === p.snapshots.length, "Snapshot/version mismatch.");
  invariant(
    (p.version === 0) === (p.parentSha256 === null),
    "Version ancestry mismatch.",
  );
  invariant(
    p.status === (p.updates.length ? "SHADOW" : "NOT_TRAINED"),
    "Policy status mismatch.",
  );
  invariant(
    (p.trainedThrough === null) === (p.updates.length === 0),
    "Training chronology missing.",
  );
  for (const action of strategies)
    for (const name of ["correctness", "efficiency"] as const) {
      const c = p.actions[action][name];
      const expected = initialChannel(p.config.lambda);
      p.updates.forEach((u, index) => {
        const support = p.support[index]!;
        invariant(support.action === u.action, "Update support mismatch.");
        if (u.action === action && u[name] !== null)
          update(expected, support.values, u[name]!);
      });
      invariant(
        jsonDigest(c) === jsonDigest(expected),
        "Parameters do not replay from update history.",
      );
      invariant(
        c.samples ===
          p.updates.filter((u) => u.action === action && u[name] !== null)
            .length,
        "Channel count mismatch.",
      );
      solve(c.a, c.b);
    }
  return immutable({ policy: p, sha256: jsonDigest(p) });
}
// Hashes detect corruption, not an evaluator signature or release approval.
export function parsePolicy(input: unknown): PolicyArtifact {
  const a = z
    .strictObject({ policy: PolicySchema, sha256: Sha256Schema })
    .parse(input);
  const sealed = sealPolicy(a.policy);
  invariant(sealed.sha256 === a.sha256, "Policy digest mismatch.");
  return sealed;
}
function update(c: Channel, x: number[], r: number) {
  c.samples++;
  for (let i = 0; i < x.length; i++) {
    c.b[i] = c.b[i]! + r * x[i]!;
    for (let j = 0; j < x.length; j++) c.a[i]![j] = c.a[i]![j]! + x[i]! * x[j]!;
  }
}
export function trainPolicy(
  artifact: PolicyArtifact,
  snapshot: Snapshot,
): PolicyArtifact {
  const old = parsePolicy(artifact),
    p = structuredClone(old.policy);
  invariant(isSnapshot(snapshot), "Authenticated frozen snapshot required.");
  invariant(snapshot.manifest.origin === p.origin, "Synthetic data isolation.");
  invariant(
    !p.snapshots.includes(snapshot.sha256),
    "Snapshot already consumed.",
  );
  const heldReceipts = new Set(p.evidenceIds);
  for (const row of snapshot.manifest.rows) {
    const observation = snapshot.observations.find(
      (o) => o.sha256 === row.observationSha256,
    )!;
    invariant(
      !p.studies.includes(observation.projection.studyId),
      "Study replay.",
    );
    p.studies.push(observation.projection.studyId);
    p.partitions.push({
      repositoryFamily: row.repositoryFamily,
      taskFamily: row.taskFamily,
      split: row.split,
    });
    for (const id of row.evidence.receiptIds) {
      invariant(!heldReceipts.has(id), "Evidence reused.");
      heldReceipts.add(id);
    }
  }
  p.evidenceIds = [...heldReceipts].sort();
  let changed = false;
  for (const row of [...snapshot.manifest.rows].sort((a, b) =>
    a.observationSha256.localeCompare(b.observationSha256),
  )) {
    if (row.split !== "train") continue;
    const o = snapshot.observations.find(
      (o) => o.sha256 === row.observationSha256,
    )!;
    invariant(
      !p.updates.some((u) => u.observationSha256 === o.sha256),
      "Observation already trained.",
    );
    const features = extractFeatures(o.projection.context),
      c = o.projection.context;
    for (const r of assessReward(o, p.origin)) {
      if (r.correctness === null) continue;
      update(p.actions[r.action].correctness, features.values, r.correctness);
      if (r.efficiency !== null)
        update(p.actions[r.action].efficiency, features.values, r.efficiency);
      p.updates.push({
        observationSha256: o.sha256,
        action: r.action,
        correctness: r.correctness,
        efficiency: r.efficiency,
      });
      p.support.push({
        action: r.action,
        repositoryFamily: c.repositoryFamily,
        taskFamily: c.taskFamily,
        values: features.values,
      });
      changed = true;
    }
  }
  invariant(changed, "No eligible training rewards.");
  p.version++;
  p.parentSha256 = old.sha256;
  p.status = "SHADOW";
  p.snapshots.push(snapshot.sha256);
  p.trainedThrough =
    p.trainedThrough !== null &&
    Date.parse(p.trainedThrough) > Date.parse(snapshot.manifest.frozenAt)
      ? p.trainedThrough
      : snapshot.manifest.frozenAt;
  return sealPolicy(p);
}
export function policyWeights(
  artifact: PolicyArtifact,
  action: Strategy,
  channel: "correctness" | "efficiency" = "correctness",
) {
  const c = parsePolicy(artifact).policy.actions[action][channel];
  return solve(c.a, c.b);
}
export function featureDistance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / a.length);
}
function estimate(c: Channel, x: number[], alpha: number) {
  const mean = dot(solve(c.a, c.b), x),
    radius = alpha * Math.sqrt(Math.max(0, dot(x, solve(c.a, x))));
  return { mean, radius, lower: mean - radius, upper: mean + radius };
}
export function recommend(
  artifact: PolicyArtifact,
  input: unknown,
  mode: "AUTHENTIC" | "SYNTHETIC" = "AUTHENTIC",
) {
  const a = parsePolicy(artifact),
    p = a.policy,
    c = ContextSchema.parse(input),
    f = extractFeatures(c);
  const ranking = c.actions.eligible
    .map((action) => {
      const support = p.support.filter((s) => s.action === action);
      return {
        action,
        correctness: estimate(
          p.actions[action].correctness,
          f.values,
          p.config.alpha,
        ),
        efficiency: p.actions[action].efficiency.samples
          ? estimate(p.actions[action].efficiency, f.values, p.config.alpha)
          : null,
        repositoryFamilies: new Set(support.map((s) => s.repositoryFamily))
          .size,
        taskFamilies: new Set(support.map((s) => s.taskFamily)).size,
        distance: support.length
          ? Math.min(...support.map((s) => featureDistance(s.values, f.values)))
          : null,
      };
    })
    .sort(
      (a, b) =>
        b.correctness.upper - a.correctness.upper ||
        strategies.indexOf(a.action) - strategies.indexOf(b.action),
    );
  const base = {
    schemaVersion: "learning-advice.v1" as const,
    policySha256: a.sha256,
    contextSha256: jsonDigest(c),
    status: p.status,
    authority: "advisory_only" as const,
    ranking,
  };
  const abstain = (reason: string) => ({
    ...base,
    action: "ABSTAIN" as const,
    reason,
  });
  if (p.origin !== mode) return abstain("SYNTHETIC_POLICY_ISOLATED");
  if (!p.updates.length) return abstain("NOT_TRAINED");
  if (Date.parse(c.frozenAt) <= Date.parse(p.trainedThrough!))
    return abstain("POLICY_POSTDATES_CONTEXT");
  if (
    f.missingCount > p.config.maximumMissing ||
    c.facts.requirement === "unknown"
  )
    return abstain("CONTEXT_UNSUPPORTED");
  // A currently offered unobserved action cannot be silently treated as a loser.
  if (
    ranking.some(
      (r) =>
        r.repositoryFamilies < p.config.minimumFamilies ||
        r.taskFamilies < p.config.minimumFamilies,
    )
  )
    return abstain("INSUFFICIENT_INDEPENDENT_SUPPORT");
  if (
    ranking.some(
      (r) => r.distance === null || r.distance > p.config.maximumDistance,
    )
  )
    return abstain("OUT_OF_DISTRIBUTION");
  const safe = ranking.filter(
    (r) => r.correctness.lower >= p.config.minimumCorrectness,
  );
  if (!safe.length) return abstain("CORRECTNESS_UNCERTAIN");
  // Cost is considered only among actions satisfying the hard correctness gate.
  // If measured cost cannot distinguish them, KEEP wins an advisory tie.
  let selected = safe.find((r) => r.action === "KEEP") ?? safe[0]!;
  if (safe.every((r) => r.efficiency !== null)) {
    const best = [...safe].sort(
      (a, b) => b.efficiency!.upper - a.efficiency!.upper,
    )[0]!;
    if (
      safe.every(
        (r) =>
          r.action === best.action ||
          best.efficiency!.lower > r.efficiency!.upper,
      )
    )
      selected = best;
    else if (!safe.some((r) => r.action === "KEEP") && safe.length > 1)
      return abstain("OVERLAPPING_COST_UNCERTAINTY");
  } else if (safe.length > 1 && !safe.some((r) => r.action === "KEEP"))
    return abstain("COST_UNKNOWN");
  return { ...base, action: selected.action, reason: "SHADOW_RECOMMENDATION" };
}
