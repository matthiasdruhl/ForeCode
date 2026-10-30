// Private fixed profile. Data validation is not runtime admission.
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import { futureTaskDigest } from "../../../src/lib/experiment/future-task";
import {
  baselineCheckIds,
  teamCheckIds,
  teamTaskSha256,
  validateTeamProfile,
} from "../../evaluator/booking-v1/grade-profile";
import { validateStudyDefinition, type StudyDefinition } from "./study";
import { immutable } from "./custody";

export const teamNetworkPolicy = immutable({
  worker: "none",
  broker: "fixed_meta_responses_no_redirects",
  grader: "none",
});
export const teamCredentialPolicy = immutable({
  worker: "no_host_credentials_or_sockets",
  provider: "trusted_broker_only",
  grader: "no_provider_credentials",
});
export const teamAgentId = "codex-supervised-team-v1";
export const teamTools = ["source-shell"] as const;
// source-shell denotes the confined shell/patch capability, not a command allowlist.
export const teamProviderTools = [
  "shell",
  "exec_command",
  "write_stdin",
  "apply_patch",
] as const;

export function teamRoadmapDigest(
  d: Pick<StudyDefinition, "protocol" | "adapterInstructions">,
) {
  return jsonDigest({
    task: d.protocol.task,
    adapterInstructions: d.adapterInstructions,
  });
}

export function teamEnforcementPlan(raw: unknown) {
  const d = validateStudyDefinition(raw),
    p = d.protocol,
    c = p.conditions[0]!,
    e = p.executionConditions[0]!;
  invariant(
    futureTaskDigest(p.task) === teamTaskSha256,
    "Only the frozen team task is supported.",
  );
  invariant(e.agentId === teamAgentId, "Unsupported team agent.");
  invariant(
    jsonDigest(d.toolAllowlist) === jsonDigest(teamTools),
    "Unsupported tool capability.",
  );
  invariant(c.seed === null, "Provider seed enforcement is unavailable.");
  invariant(
    c.budget.maxSeconds <= 600 &&
      c.budget.tokenLimit! <= 32_000_000 &&
      c.budget.spendUsd! > 0 &&
      c.budget.spendUsd! <= 40,
    "Unsupported runtime budget.",
  );
  const spendMicroUsd = c.budget.spendUsd! * 1_000_000;
  const prompt = JSON.stringify({
    task: p.task,
    prompt: d.downstreamPrompt,
    adapterInstructions: d.adapterInstructions,
    scenario: {
      request: p.scenario.request,
      assumptions: p.scenario.assumptions,
      acceptanceIds: p.scenario.acceptanceIds,
    },
  });
  // Minimum only: the broker separately reserves actual full request bytes,
  // tools, source context, framing and opaque replay before every paid send.
  const minimumInputReservation = 16384 + Buffer.byteLength(prompt, "utf8");
  invariant(
    c.budget.tokenLimit! >= minimumInputReservation + 16,
    "Token ceiling cannot cover even the fixed input.",
  );
  invariant(
    Number.isSafeInteger(spendMicroUsd),
    "Spend must have exact microUSD precision.",
  );
  invariant(
    e.resources.cpus === 1 &&
      e.resources.memoryMiB === 768 &&
      e.resources.pids === 128 &&
      e.resources.outputBytes >= 1024 &&
      e.resources.outputBytes <= 8_000_000 &&
      e.resources.diskMiB <= 65536,
    "Unsupported worker or VM resource limit.",
  );
  invariant(
    c.networkPolicySha256 === jsonDigest(teamNetworkPolicy) &&
      c.credentialPolicySha256 === jsonDigest(teamCredentialPolicy),
    "Unsupported network or credential policy.",
  );
  invariant(
    c.visibleRoadmapSha256 === teamRoadmapDigest(d),
    "Additional roadmap bytes cannot be enforced.",
  );
  invariant(
    d.restrictions.maxOutputTokens <= c.budget.tokenLimit!,
    "Output ceiling exceeds total token ceiling.",
  );
  invariant(
    sameIds(p.futureOracle.baselineOracle.requiredCheckIds, baselineCheckIds) &&
      sameIds(p.futureOracle.oracle.requiredCheckIds, teamCheckIds),
    "Fixed five/eight-check policies required.",
  );
  const profile = validateTeamProfile({
    kind: "booking-team-permissions.v1",
    taskId: "booking-team-permissions-v1",
    taskDefinitionSha256: teamTaskSha256,
    descriptorSha256: jsonDigest(p.futureOracle),
    fixtureSha256: p.fixtureSha256,
    dependencyLockSha256: c.dependencyLockSha256,
    baselineEvaluatorSha256: p.futureOracle.baselineOracle.evaluatorSha256,
    evaluatorSha256: p.futureOracle.oracle.evaluatorSha256,
    testSuiteSha256: p.futureOracle.oracle.testSuiteSha256,
    requiredPolicySha256: p.futureOracle.oracle.requiredPolicySha256,
  });
  return immutable({
    schemaVersion: "supervised-team-enforcement.local.v1" as const,
    definitionSha256: jsonDigest(d),
    taskSha256: teamTaskSha256,
    // Complete public input, no receipt, opposing result, proposal or oracle source.
    prompt,
    minimumInputReservation,
    model: e.modelId,
    agent: e.agentId,
    runtime: d.runtime,
    agentConfigSha256: c.agentConfigSha256,
    tools: [...teamTools],
    providerTools: [...teamProviderTools],
    restrictions: d.restrictions,
    maxSeconds: c.budget.maxSeconds,
    tokenLimit: c.budget.tokenLimit!,
    nativeRolloutTokenLimit: Math.min(c.budget.tokenLimit!, 1_000_000),
    spendMicroUsd,
    maxIterations: c.budget.maxIterations,
    iterationUnit: "upstream_responses_request" as const,
    resources: e.resources,
    vm: {
      cpus: 2,
      memoryMiB: 4096,
      pids: 512,
      diskBytes: e.resources.diskMiB * 1024 ** 2,
    },
    profile,
  });
}
export type TeamEnforcementPlan = ReturnType<typeof teamEnforcementPlan>;
