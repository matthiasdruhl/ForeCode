// Shared data-only commitment projection; never grants runtime authority.
import { jsonDigest } from "../../../src/lib/report/digests";
import { invariant } from "../../../src/lib/contracts/validation";
import { isPreparedStudy, type PreparedStudy } from "./study";
import { immutable } from "./custody";

export type Variant = "A" | "B";
export function sharedFutureTask(study: PreparedStudy) {
  invariant(isPreparedStudy(study), "Authenticated study required.");
  const d = study.definition,
    p = d.protocol;
  return immutable({
    task: p.task,
    prompt: d.downstreamPrompt,
    adapterInstructions: d.adapterInstructions,
    tools: d.toolAllowlist,
    model: p.executionConditions[0]!.modelId,
    agent: p.executionConditions[0]!.agentId,
    resources: p.executionConditions[0]!.resources,
    runtime: d.runtime,
    restrictions: d.restrictions,
    seed: p.conditions[0]!.seed,
    budget: p.conditions[0]!.budget,
  });
}
export function pairedRuntimeSubject(
  study: PreparedStudy,
  implementationSha256: string,
  variant: Variant,
) {
  const arm = study.draft.plan.manifest.arms.find(
    (x) => x.variant === variant,
  )!;
  return jsonDigest({
    purpose: "supervised-booking-team-future-v1",
    preparedOriginalSha256: study.prepared.sha256,
    implementationSha256,
    variant,
    runId: arm.runId,
    sourceCommit: arm.initialCommit,
    sourceTreeSha256: arm.initialTreeSha256,
    sharedTaskSha256: jsonDigest(sharedFutureTask(study)),
  });
}
