import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import {
  EvaluationOutcomeSchema,
  StrategySchema,
} from "../../src/lib/learning/contracts";
import { invariant } from "../../src/lib/contracts/validation";
import { jsonDigest } from "../../src/lib/report/digests";
import { requireHeldRecord } from "../experiments/tournament/custody";
import { isAdmitted, type AdmittedObservation } from "./intake";
import { assessReward } from "./reward";
import { isSnapshot, type Snapshot } from "./dataset";
import { parsePolicy, type PolicyArtifact } from "./policy";

export const AblationProtocolSchema = z.strictObject({
  schemaVersion: z.literal("glimmer-selector-ablation.v1"),
  id: IdSchema,
  frozenAt: UtcTimestampSchema,
  baseModel: z.literal("meta-models/Muse-Glimmer-30B"),
  baseRevision: z.string().regex(/^[a-f0-9]{40}$/),
  tokenizerRevision: z.string().regex(/^[a-f0-9]{40}$/),
  adapterSha256: Sha256Schema,
  fixedPolicy: z.literal("roadmap-fixed.v1"),
  learnedPolicySha256: Sha256Schema,
  // Captures equal visible information, candidate set, task/agent/tools/oracle,
  // execution budgets, costs and attempt rules, reviewed before experiments.
  matchedConditionsSha256: Sha256Schema,
  heldoutRepositoryFamilies: z.array(Sha256Schema).min(1).max(1000),
  heldoutTaskFamilies: z.array(Sha256Schema).min(1).max(1000),
  nonMetaControl: z.enum(["SEPARATELY_REQUIRED", "SEPARATELY_REGISTERED"]),
});
export type EvaluationCase = {
  condition: "A" | "B" | "C" | "D";
  observation: AdmittedObservation;
  selected: z.infer<typeof StrategySchema> | "ABSTAIN";
};

// Offline matched-result analysis only. No experiment execution or automatic
// statistical/Meta-uplift claim. Missing cases and metrics stay visible.
export function evaluateAblation(input: {
  protocol: unknown;
  preregistration: unknown;
  training: Snapshot;
  policy: PolicyArtifact;
  cases: readonly EvaluationCase[];
  mode?: "AUTHENTIC" | "SYNTHETIC";
}) {
  const protocol = AblationProtocolSchema.parse(input.protocol),
    mode = input.mode ?? "AUTHENTIC";
  invariant(
    isSnapshot(input.training) && input.training.manifest.origin === mode,
    "Training snapshot mismatch.",
  );
  const policy = parsePolicy(input.policy);
  invariant(
    protocol.learnedPolicySha256 === policy.sha256 &&
      policy.policy.origin === mode &&
      policy.policy.snapshots.includes(input.training.sha256),
    "Policy/training lineage mismatch.",
  );
  requireHeldRecord(input.preregistration, {
    studyId: protocol.id,
    kind: "protocol",
    subjectSha256: jsonDigest(protocol),
    predecessorSha256: null,
    at: protocol.frozenAt,
  });
  const seen = new Set<string>(),
    conditions = new Map<string, Set<string>>();
  const observations = new Set<string>(),
    studies = new Set<string>(),
    receipts = new Set<string>();
  const trainingRepo = new Set(
      policy.policy.support.map((r) => r.repositoryFamily),
    ),
    trainingTask = new Set(policy.policy.support.map((r) => r.taskFamily));
  for (const family of protocol.heldoutRepositoryFamilies)
    invariant(!trainingRepo.has(family), "Held-out repository leaked.");
  for (const family of protocol.heldoutTaskFamilies)
    invariant(!trainingTask.has(family), "Held-out task leaked.");
  for (const sample of input.cases) {
    const o = sample.observation;
    invariant(
      isAdmitted(o) && o.projection.origin === mode,
      "Original observation required.",
    );
    const c = o.projection.context;
    const decision = o.projection.decision,
      provenance = decision.proposal?.provenance;
    invariant(decision.selected === sample.selected, "Post-outcome selection.");
    invariant(
      decision.selector ===
        (sample.condition === "A" || sample.condition === "B"
          ? protocol.fixedPolicy
          : policy.sha256),
      "Selector condition mismatch.",
    );
    invariant(
      provenance?.provider === "open_weight_local" &&
        provenance.modelId === protocol.baseModel &&
        provenance.revision === protocol.baseRevision &&
        provenance.tokenizerRevision === protocol.tokenizerRevision,
      "Model checkpoint mismatch.",
    );
    const tuned = sample.condition === "B" || sample.condition === "D";
    invariant(
      provenance.adaptation === (tuned ? "qlora_sft" : "none") &&
        provenance.adapterSha256 === (tuned ? protocol.adapterSha256 : null),
      "Adapter condition mismatch.",
    );
    invariant(
      Date.parse(protocol.frozenAt) < Date.parse(c.frozenAt),
      "Evaluation registered after selection.",
    );
    invariant(
      protocol.heldoutRepositoryFamilies.includes(c.repositoryFamily) &&
        protocol.heldoutTaskFamilies.includes(c.taskFamily),
      "Unregistered evaluation family.",
    );
    invariant(
      !trainingRepo.has(c.repositoryFamily) && !trainingTask.has(c.taskFamily),
      "Training/evaluation leakage.",
    );
    invariant(
      o.projection.matchedConditionsSha256 === protocol.matchedConditionsSha256,
      "Unmatched experiment conditions.",
    );
    invariant(
      sample.selected === "ABSTAIN" ||
        c.actions.eligible.includes(sample.selected),
      "Unsupported selected action.",
    );
    const key = jsonDigest(c);
    invariant(!seen.has(key + sample.condition), "Repeated condition.");
    seen.add(key + sample.condition);
    invariant(
      !observations.has(o.sha256) && !studies.has(o.projection.studyId),
      "Reused evaluation outcome.",
    );
    observations.add(o.sha256);
    studies.add(o.projection.studyId);
    for (const receipt of o.evidence.receiptIds) {
      invariant(!receipts.has(receipt), "Reused evaluation receipt.");
      receipts.add(receipt);
    }
    const group = conditions.get(key) ?? new Set<string>();
    group.add(sample.condition);
    conditions.set(key, group);
  }
  // Report incomplete groups; never silently drop them to improve averages.
  const incompleteContexts = [...conditions]
    .filter(([, c]) => c.size !== 4)
    .map(([id]) => id)
    .sort();
  const reports = (["A", "B", "C", "D"] as const).map((condition) => {
    const samples = input.cases.filter((s) => s.condition === condition);
    let verified = 0,
      failed = 0,
      missing = 0,
      abstained = 0;
    const cost: (number | null)[] = [],
      latency: (number | null)[] = [],
      regression: (boolean | null)[] = [],
      avoidable: (boolean | null)[] = [];
    for (const s of samples) {
      if (s.selected === "ABSTAIN") {
        abstained++;
        continue;
      }
      const rewards = assessReward(s.observation, mode),
        selected = rewards.find((r) => r.action === s.selected);
      if (selected?.correctness === 1) verified++;
      else if (selected?.correctness === 0) failed++;
      else missing++;
      const inference = s.observation.projection.inference;
      cost.push(
        selected?.totalCostUsd !== null &&
          selected?.totalCostUsd !== undefined &&
          inference.costUsd !== null
          ? selected.totalCostUsd + inference.costUsd
          : null,
      );
      latency.push(inference.latencyMs);
      regression.push(
        s.observation.projection.regressions.find(
          (r) => r.action === s.selected,
        )?.occurred ?? null,
      );
      const keep = rewards.find((r) => r.action === "KEEP");
      avoidable.push(
        s.selected === "KEEP"
          ? false
          : selected?.correctness === 1 &&
              keep?.correctness === 1 &&
              keep.totalCostUsd !== null &&
              selected.totalCostUsd !== null
            ? selected.totalCostUsd >= keep.totalCostUsd
            : null,
      );
    }
    const fraction = (v: (boolean | null)[]) =>
      v.length && v.every((x) => x !== null)
        ? v.filter(Boolean).length / v.length
        : null;
    return {
      condition,
      ...EvaluationOutcomeSchema.parse({
        schemaVersion: "learning-evaluation.v1",
        protocolSha256: jsonDigest(protocol),
        datasetSha256: input.training.sha256,
        policySha256: policy.sha256,
        independentRepositoryFamilies: new Set(
          samples.map((s) => s.observation.projection.context.repositoryFamily),
        ).size,
        independentTaskFamilies: new Set(
          samples.map((s) => s.observation.projection.context.taskFamily),
        ).size,
        attempted: samples.length,
        verified,
        failed,
        missing,
        abstained,
        coverage: samples.length
          ? (samples.length - abstained) / samples.length
          : null,
        totalCostUsd:
          cost.length && cost.every((c) => c !== null)
            ? (cost as number[]).reduce((a, b) => a + b, 0)
            : null,
        avoidableRefactorRate: fraction(avoidable),
        regressionRate: fraction(regression),
        meanLatencyMs:
          latency.length && latency.every((l) => l !== null)
            ? (latency as number[]).reduce((a, b) => a + b, 0) / latency.length
            : null,
        brierScore: null,
        conclusion: "DESCRIPTIVE_ONLY",
      }),
    };
  });
  return {
    schemaVersion: "learning-ablation-report.v1",
    reports,
    incompleteContexts,
    status:
      input.cases.length && !incompleteContexts.length
        ? "DESCRIPTIVE_MATCHED_CASES"
        : "INSUFFICIENT_EVIDENCE",
    limitations: [
      "A=untuned/fixed; B=QLoRA/fixed; C=untuned/learned; D=QLoRA/learned. Same original Glimmer checkpoint required.",
      "Independent paired task-family experiments and model/selector provenance still require core operator review.",
      "No confidence intervals or calibration from sparse uncalibrated scores. No counterfactual result for untested actions.",
      "A distinct equally informed non-Meta control is required for Meta incremental claims.",
      "Failures, incomplete groups and null measurements remain in denominators; repeated seeds do not add independent families.",
    ],
  };
}
