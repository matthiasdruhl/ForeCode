import { ContextSchema } from "../../src/lib/learning/contracts";
import { extractFeatures } from "../../src/lib/learning/features";
import { invariant } from "../../src/lib/contracts/validation";
import { isSnapshot, type Snapshot } from "./dataset";
import { featureDistance } from "./policy";
import { assessReward } from "./reward";

export function retrieveEvidence(
  snapshot: Snapshot,
  input: unknown,
  options: {
    minimumFamilies?: number;
    maximumDistance?: number;
    mode?: "AUTHENTIC" | "SYNTHETIC";
  } = {},
) {
  invariant(isSnapshot(snapshot), "Authenticated snapshot required.");
  const mode = options.mode ?? "AUTHENTIC";
  invariant(snapshot.manifest.origin === mode, "Synthetic evidence isolation.");
  const c = ContextSchema.parse(input),
    f = extractFeatures(c);
  const matches = snapshot.observations
    .flatMap((o) => {
      const row = snapshot.manifest.rows.find(
        (r) => r.observationSha256 === o.sha256,
      )!;
      // Retrieval for future advice cannot reveal held-out examples.
      if (
        row.split !== "train" ||
        o.projection.context.facts.requirement !== c.facts.requirement
      )
        return [];
      const rewards = assessReward(o, mode);
      if (!rewards.some((r) => r.correctness !== null)) return [];
      if (
        !c.actions.eligible.every((a) =>
          o.projection.context.actions.eligible.includes(a),
        )
      )
        return [];
      const distance = featureDistance(
        f.values,
        extractFeatures(o.projection.context).values,
      );
      if (distance > (options.maximumDistance ?? 0.25)) return [];
      return [
        {
          observationSha256: o.sha256,
          evidence: o.evidence,
          distance,
          repositoryFamily: row.repositoryFamily,
          taskFamily: row.taskFamily,
          rewards,
          missingFeatures: extractFeatures(o.projection.context).missingCount,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.observationSha256.localeCompare(b.observationSha256),
    );
  const repositoryFamilies = new Set(matches.map((m) => m.repositoryFamily))
    .size;
  const taskFamilies = new Set(matches.map((m) => m.taskFamily)).size;
  return {
    schemaVersion: "learning-memory.v1",
    matches,
    repositoryFamilies,
    taskFamilies,
    status:
      repositoryFamilies >= (options.minimumFamilies ?? 2) &&
      taskFamilies >= (options.minimumFamilies ?? 2)
        ? "CASES_AVAILABLE"
        : "ABSTAIN",
    uncertainty:
      "Descriptive comparable cases; repeated runs are not independent families. No calibrated probability.",
  };
}
