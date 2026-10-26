import { z } from "zod";
import {
  ArchitectureCandidateV1Schema,
  DecisionV1Schema,
  GraphV1Schema,
  ScenarioV1Schema,
  type ArchitectureCandidateV1,
  type DecisionV1,
  type GraphV1,
  type ScenarioV1,
} from "./architecture";
import { IntentV1Schema, type IntentV1 } from "./intents";
import {
  PairManifestV1Schema,
  MetaComparisonManifestV1Schema,
  ExperimentRunV1Schema,
  CertificateV1Schema,
  EvaluatorReceiptV1Schema,
  VerificationV1Schema,
  type ExperimentRunV1,
  type EvaluatorReceiptV1,
  type VerificationV1,
  type PairManifestV1,
  type CertificateV1,
  type MetaComparisonManifestV1,
} from "./evidence";
import {
  MetaHypothesisV1Schema,
  MetaChallengeV1Schema,
  ScientistEvidenceSummaryV1Schema,
  MetaEvidenceInterpretationV1Schema,
  type MetaHypothesisV1,
  type MetaChallengeV1,
  type ScientistEvidenceSummaryV1,
  type MetaEvidenceInterpretationV1,
} from "./scientist";
import { canonicalJson } from "../report/canonical";

export class ContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractViolation";
  }
}
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new ContractViolation(message);
}
export function unique(values: readonly string[], scope: string): void {
  invariant(new Set(values).size === values.length, `Duplicate ${scope}.`);
}
export function sameIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}
export function orderedTime(start: string, end: string): void {
  invariant(Date.parse(start) <= Date.parse(end), "Timestamps are reversed.");
}
export function normalizedPath(value: string, allowGlob = false): void {
  invariant(
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..") &&
      (allowGlob || !value.includes("*")),
    "Path is not normalized.",
  );
}
export const actionWeights = Object.freeze({
  introduce_boundary: 3,
  extract_module: 2,
  move_module: 2,
  add_interface: 2,
  leave_unchanged: 0,
});

export type ResearchContext = {
  intents: IntentV1[];
  graph: GraphV1;
  candidates: ArchitectureCandidateV1[];
  scenarios: ScenarioV1[];
};

export function validateResearchContext(
  input: ResearchContext,
  options = { modelVisible: true },
): ResearchContext {
  const context = z
    .strictObject({
      intents: z.array(IntentV1Schema).min(1).max(24),
      graph: GraphV1Schema,
      candidates: z.array(ArchitectureCandidateV1Schema).min(2).max(12),
      scenarios: z.array(ScenarioV1Schema).max(24),
    })
    .parse(input);
  unique(
    context.intents.map((item) => item.id),
    "intent IDs",
  );
  unique(
    context.graph.modules.map((item) => item.id),
    "module IDs",
  );
  unique(
    context.graph.modules.map((item) => item.path),
    "module paths",
  );
  const modules = new Set(context.graph.modules.map((item) => item.id));
  const intents = new Set(context.intents.map((item) => item.id));
  for (const intent of context.intents) {
    invariant(
      intent.status === "confirmed" && intent.source.kind === "user_confirmed",
      "Only user-confirmed intents may guide research.",
    );
  }
  for (const sourceModule of context.graph.modules)
    normalizedPath(sourceModule.path);
  for (const edge of context.graph.edges)
    invariant(
      modules.has(edge.from) && modules.has(edge.to),
      "Dangling graph edge.",
    );
  unique(
    context.candidates.map((item) => item.id),
    "candidate IDs",
  );
  invariant(
    context.candidates.some(
      (candidate) =>
        candidate.changePlan.length === 0 &&
        candidate.estimatedUpfrontCost === 0,
    ),
    "A credible status quo candidate is required.",
  );
  invariant(
    context.candidates.some((candidate) =>
      candidate.changePlan.some((item) => item.action !== "leave_unchanged"),
    ),
    "A meaningful alternative is required.",
  );
  for (const candidate of context.candidates) {
    invariant(
      candidate.baselineCommit === context.graph.repoCommit,
      "Candidate baseline mismatch.",
    );
    unique(
      candidate.changePlan.map((item) => `${item.module}:${item.action}`),
      "plan actions",
    );
    for (const item of candidate.changePlan) normalizedPath(item.module, true);
    for (const constraint of candidate.constraints) {
      normalizedPath(constraint.from, true);
      normalizedPath(constraint.to, true);
    }
    invariant(
      candidate.estimatedUpfrontCost ===
        candidate.changePlan.reduce(
          (sum, item) => sum + actionWeights[item.action],
          0,
        ),
      "Candidate upfront score differs from the fixed rubric.",
    );
  }
  unique(
    context.scenarios.map((item) => item.id),
    "scenario IDs",
  );
  for (const scenario of context.scenarios) {
    invariant(
      scenario.baselineCommit === context.graph.repoCommit,
      "Scenario baseline mismatch.",
    );
    invariant(
      !options.modelVisible || scenario.origin !== "evaluator_heldout",
      "Held-out scenarios cannot enter model context.",
    );
    unique(scenario.intentIds, "scenario intent references");
    unique(scenario.acceptanceIds, "acceptance IDs");
    for (const id of scenario.intentIds)
      invariant(intents.has(id), "Dangling scenario intent.");
  }
  return context;
}

export function validateDecision(
  input: DecisionV1,
  contextInput: ResearchContext,
): DecisionV1 {
  const context = validateResearchContext(contextInput);
  const decision = DecisionV1Schema.parse(input);
  invariant(
    decision.graphId === context.graph.id &&
      decision.baselineCommit === context.graph.repoCommit,
    "Decision graph mismatch.",
  );
  invariant(
    sameIds(
      decision.scenarioIds,
      context.scenarios.map((item) => item.id),
    ) &&
      sameIds(
        decision.candidateIds,
        context.candidates.map((item) => item.id),
      ),
    "Decision context is incomplete.",
  );
  if (decision.perScenario.length === 0) return decision;
  invariant(
    decision.perScenario.length ===
      context.candidates.length * context.scenarios.length,
    "Score matrix must be complete.",
  );
  unique(
    decision.perScenario.map(
      (score) => `${score.candidateId}:${score.scenarioId}`,
    ),
    "score pairs",
  );
  for (const score of decision.perScenario) {
    const candidate = context.candidates.find(
      (item) => item.id === score.candidateId,
    );
    invariant(
      candidate && decision.scenarioIds.includes(score.scenarioId),
      "Dangling score reference.",
    );
    unique(score.basis.projectedChangedModules, "projected paths");
    const approvedPaths = new Set([
      ...context.graph.modules.map((item) => item.path),
      ...candidate.changePlan.map((item) => item.module),
    ]);
    for (const path of score.basis.projectedChangedModules) {
      normalizedPath(path);
      invariant(approvedPaths.has(path), "Unreviewed projected path.");
    }
    const downstream =
      2 * score.basis.projectedChangedModules.length +
      score.basis.projectedRouteChanges +
      2 * score.basis.unresolvedRelevantDependencies;
    invariant(
      score.upfrontCost === candidate.estimatedUpfrontCost &&
        score.downstreamCost === downstream &&
        score.totalCost === score.upfrontCost + downstream,
      "Score differs from the fixed additive rubric.",
    );
    const scenarioScores = decision.perScenario.filter(
      (other) => other.scenarioId === score.scenarioId,
    );
    invariant(
      score.regret ===
        score.totalCost -
          Math.min(...scenarioScores.map((other) => other.totalCost)),
      "Invalid scenario regret.",
    );
  }
  const ranked = [...context.candidates].sort((left, right) => {
    const worst = (id: string) =>
      Math.max(
        ...decision.perScenario
          .filter((score) => score.candidateId === id)
          .map((score) => score.regret),
      );
    return (
      worst(left.id) - worst(right.id) ||
      left.estimatedUpfrontCost - right.estimatedUpfrontCost ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    );
  });
  invariant(
    decision.recommendationId === ranked[0]?.id,
    "Recommendation differs from deterministic minimax regret.",
  );
  return decision;
}

export function validateReceiptRelationships(
  receiptInput: EvaluatorReceiptV1,
  verificationInput: VerificationV1,
  runInput: ExperimentRunV1,
): void {
  const receipt = EvaluatorReceiptV1Schema.parse(receiptInput);
  const verification = VerificationV1Schema.parse(verificationInput);
  const run = ExperimentRunV1Schema.parse(runInput);
  orderedTime(receipt.startedAt, receipt.finishedAt);
  orderedTime(run.startedAt, run.endedAt);
  unique(receipt.requiredCheckIds, "required check IDs");
  unique(
    verification.checks.map((check) => check.id),
    "check IDs",
  );
  invariant(
    receipt.runId === run.id &&
      verification.runId === run.id &&
      run.receiptId === receipt.id &&
      verification.receiptId === receipt.id &&
      run.verificationId === verification.id,
    "Run/receipt/verification identity mismatch.",
  );
  invariant(
    verification.origin === "trusted_evaluator" &&
      sameIds(receipt.requiredCheckIds, verification.requiredCheckIds),
    "Required-check policy mismatch.",
  );
  for (const check of verification.checks)
    invariant(check.runId === run.id, "Cross-run check substitution.");
  const required = verification.checks.filter((check) =>
    receipt.requiredCheckIds.includes(check.id),
  );
  const expectedVerdict = required.some((check) => check.status === "fail")
    ? "REJECTED"
    : receipt.requiredCheckIds.every((id) =>
          required.some((check) => check.id === id && check.status === "pass"),
        )
      ? "VERIFIED"
      : "INSUFFICIENT_EVIDENCE";
  invariant(
    verification.verdict === expectedVerdict,
    "Verification verdict differs from required check outcomes.",
  );
  for (const field of [
    "evaluatedTreeSha256",
    "fixtureSha256",
    "evaluatorSha256",
    "requiredPolicySha256",
  ] as const)
    invariant(
      receipt[field] === run[field],
      "Evidence source identity mismatch.",
    );
  if (run.evidenceOrigin === "measured")
    invariant(
      run.status === "completed" && run.isolationAttestationId !== null,
      "Measured runs require completed isolated execution.",
    );
}

export function validatePair(
  input: PairManifestV1,
  runs: readonly ExperimentRunV1[],
  scenarios: readonly ScenarioV1[],
): PairManifestV1 {
  const pair = PairManifestV1Schema.parse(input);
  invariant(
    sameIds(
      pair.arms.map((arm) => arm.variant),
      ["A", "B"],
    ),
    "The pair must contain A and B exactly once.",
  );
  const scenario = scenarios.find((item) => item.id === pair.scenarioId);
  invariant(scenario?.frozen, "Pair scenario must be frozen before execution.");
  unique(
    runs.map((run) => run.id),
    "run IDs",
  );
  const runIds = pair.arms.flatMap((arm) =>
    arm.runId === null ? [] : [arm.runId],
  );
  unique(runIds, "arm run references");
  for (const arm of pair.arms) {
    if (arm.runId === null) continue;
    const run = runs.find((item) => item.id === arm.runId);
    invariant(run && run.variant === arm.variant, "Pair arm/run mismatch.");
    invariant(
      Date.parse(pair.frozenAt) <= Date.parse(run.startedAt),
      "Pair was not frozen before execution.",
    );
    for (const key of [
      "fixtureSha256",
      "agentConfigSha256",
      "evaluatorSha256",
      "requiredPolicySha256",
    ] as const)
      invariant(pair[key] === run[key], "Unequal experiment conditions.");
  }
  return pair;
}

export function validateCertificateReferences(
  input: CertificateV1,
  recordsInput: {
    intents: IntentV1[];
    decision: DecisionV1 | null;
    scenarios: ScenarioV1[];
    runs: ExperimentRunV1[];
    verifications: VerificationV1[];
    receipts: EvaluatorReceiptV1[];
  },
): CertificateV1 {
  const certificate = CertificateV1Schema.parse(input);
  const records = z
    .strictObject({
      intents: z.array(IntentV1Schema).max(32),
      decision: DecisionV1Schema.nullable(),
      scenarios: z.array(ScenarioV1Schema).max(24),
      runs: z.array(ExperimentRunV1Schema).max(100),
      verifications: z.array(VerificationV1Schema).max(100),
      receipts: z.array(EvaluatorReceiptV1Schema).max(100),
    })
    .parse(recordsInput);
  for (const collection of [
    records.intents,
    records.scenarios,
    records.runs,
    records.verifications,
    records.receipts,
  ])
    unique(
      collection.map((item) => item.id),
      "certificate source IDs",
    );
  for (const field of [
    "scenarioIds",
    "experimentRunIds",
    "verificationIds",
    "receiptIds",
  ] as const)
    unique(certificate[field], field);
  unique(
    certificate.intentRevisions.map((item) => item.intentId),
    "certificate intent IDs",
  );
  for (const ref of certificate.intentRevisions)
    invariant(
      records.intents.some(
        (intent) =>
          intent.id === ref.intentId &&
          intent.revision === ref.revision &&
          intent.status === "confirmed",
      ),
      "Certificate intent reference is stale.",
    );
  invariant(
    certificate.decisionId === (records.decision?.id ?? null),
    "Certificate decision reference mismatch.",
  );
  if (records.decision)
    invariant(
      records.decision.baselineCommit === certificate.baselineCommit,
      "Certificate baseline mismatch.",
    );
  for (const id of certificate.scenarioIds)
    invariant(
      records.scenarios.some(
        (scenario) =>
          scenario.id === id &&
          scenario.baselineCommit === certificate.baselineCommit,
      ),
      "Certificate scenario reference mismatch.",
    );
  const selectedRuns = certificate.experimentRunIds.map((id) => {
    const run = records.runs.find((item) => item.id === id);
    invariant(run, "Missing certificate run.");
    return run;
  });
  for (const run of selectedRuns) {
    const receipt = records.receipts.find((item) => item.id === run.receiptId);
    const verification = records.verifications.find(
      (item) => item.id === run.verificationId,
    );
    invariant(
      receipt &&
        verification &&
        certificate.receiptIds.includes(receipt.id) &&
        certificate.verificationIds.includes(verification.id),
      "Incomplete certificate evidence links.",
    );
    validateReceiptRelationships(receipt, verification, run);
    invariant(
      Date.parse(certificate.generatedAt) >= Date.parse(run.endedAt),
      "Certificate predates its evidence.",
    );
  }
  invariant(
    sameIds(
      certificate.receiptIds,
      selectedRuns.map((run) => run.receiptId!),
    ) &&
      sameIds(
        certificate.verificationIds,
        selectedRuns.map((run) => run.verificationId!),
      ),
    "Extraneous certificate evidence links.",
  );
  if (certificate.evidenceOrigin === "measured")
    invariant(
      selectedRuns.length > 0 &&
        selectedRuns.every((run) => run.evidenceOrigin === "measured"),
      "Measured certificate requires measured runs.",
    );
  return certificate; // Relationships alone do not authenticate these records.
}

export function validateHypothesis(
  input: MetaHypothesisV1,
  contextInput: ResearchContext,
): MetaHypothesisV1 {
  const context = validateResearchContext(contextInput);
  const hypothesis = MetaHypothesisV1Schema.parse(input);
  invariant(
    hypothesis.baselineCommit === context.graph.repoCommit &&
      context.candidates.some(
        (candidate) => candidate.id === hypothesis.candidateId,
      ),
    "Hypothesis candidate/baseline mismatch.",
  );
  unique(hypothesis.intentIds, "hypothesis intent IDs");
  unique(hypothesis.visibleScenarioIds, "hypothesis scenario IDs");
  for (const id of hypothesis.intentIds)
    invariant(
      context.intents.some((intent) => intent.id === id),
      "Unapproved hypothesis intent.",
    );
  for (const id of hypothesis.visibleScenarioIds)
    invariant(
      context.scenarios.some((scenario) => scenario.id === id),
      "Unknown visible hypothesis scenario.",
    );
  return hypothesis;
}
export function validateChallenge(
  input: MetaChallengeV1,
  hypotheses: readonly MetaHypothesisV1[],
  context: ResearchContext,
): MetaChallengeV1 {
  const challenge = MetaChallengeV1Schema.parse(input);
  unique(
    hypotheses.map((item) => item.id),
    "hypothesis IDs",
  );
  const hypothesis = hypotheses.find(
    (item) => item.id === challenge.hypothesisId,
  );
  invariant(hypothesis, "Unknown challenged hypothesis.");
  validateHypothesis(hypothesis, context);
  invariant(
    challenge.baselineCommit === hypothesis.baselineCommit &&
      challenge.targetCandidateId === hypothesis.candidateId,
    "Challenge does not target its hypothesis.",
  );
  unique(challenge.change.intentIds, "challenge intent IDs");
  for (const id of challenge.change.intentIds)
    invariant(
      context.intents.some((intent) => intent.id === id),
      "Unapproved challenge intent.",
    );
  return challenge;
}
export function validateSummaryReferences(
  input: ScientistEvidenceSummaryV1,
  hypothesis: MetaHypothesisV1,
  runs: readonly ExperimentRunV1[],
  receipts: readonly EvaluatorReceiptV1[],
  checks: VerificationV1["checks"],
): ScientistEvidenceSummaryV1 {
  const summary = ScientistEvidenceSummaryV1Schema.parse(input);
  invariant(
    summary.hypothesisId === hypothesis.id &&
      summary.baselineCommit === hypothesis.baselineCommit,
    "Summary hypothesis/baseline mismatch.",
  );
  unique(summary.runIds, "summary run IDs");
  unique(summary.receiptIds, "summary receipt IDs");
  unique(
    summary.observedChecks.map((item) => `${item.runId}:${item.checkId}`),
    "summary observations",
  );
  for (const id of summary.runIds) {
    const run = runs.find((item) => item.id === id);
    invariant(
      run &&
        run.evidenceOrigin === "measured" &&
        run.status === "completed" &&
        run.receiptId !== null &&
        summary.receiptIds.includes(run.receiptId),
      "Summary run has no linked measured receipt.",
    );
  }
  for (const id of summary.receiptIds)
    invariant(
      receipts.some(
        (receipt) =>
          receipt.id === id && summary.runIds.includes(receipt.runId),
      ),
      "Summary receipt is dangling.",
    );
  for (const observation of summary.observedChecks)
    invariant(
      summary.runIds.includes(observation.runId) &&
        checks.some(
          (check) =>
            check.runId === observation.runId &&
            check.id === observation.checkId &&
            check.status === observation.status,
        ),
      "Summary observation differs from checks.",
    );
  return summary; // Custody/sanitization must also be established by a trusted loader.
}
export function validateInterpretation(
  input: MetaEvidenceInterpretationV1,
  hypothesis: MetaHypothesisV1,
  summary: ScientistEvidenceSummaryV1,
): MetaEvidenceInterpretationV1 {
  const interpretation = MetaEvidenceInterpretationV1Schema.parse(input);
  invariant(
    summary.hypothesisId === hypothesis.id &&
      summary.baselineCommit === hypothesis.baselineCommit &&
      interpretation.hypothesisId === hypothesis.id &&
      interpretation.evidenceSummaryId === summary.id,
    "Interpretation evidence binding mismatch.",
  );
  return interpretation;
}
export function validateProviderBinding(outer: unknown, nested: unknown): void {
  invariant(
    canonicalJson(outer) === canonicalJson(nested),
    "Top-level and nested provider provenance disagree.",
  );
}

export function validateMetaComparison(
  input: MetaComparisonManifestV1,
  contextInput: ResearchContext,
  runs: readonly ExperimentRunV1[],
): MetaComparisonManifestV1 {
  const context = validateResearchContext(contextInput);
  const manifest = MetaComparisonManifestV1Schema.parse(input);
  invariant(
    manifest.metaCandidateId !== manifest.templateCandidateId,
    "Meta and template controls must be distinct candidates.",
  );
  for (const id of [manifest.metaCandidateId, manifest.templateCandidateId])
    invariant(
      context.candidates.some((candidate) => candidate.id === id),
      "Unknown comparison candidate.",
    );
  invariant(
    context.scenarios.some(
      (scenario) => scenario.id === manifest.scenarioId && scenario.frozen,
    ),
    "Comparison scenario must be frozen.",
  );
  invariant(
    manifest.metaRunId === null ||
      manifest.metaRunId !== manifest.templateRunId,
    "Comparison cannot reuse a run.",
  );
  for (const id of [manifest.metaRunId, manifest.templateRunId]) {
    if (id === null) continue;
    const run = runs.find((item) => item.id === id);
    invariant(run, "Comparison references an unknown run.");
    invariant(
      Date.parse(manifest.frozenAt) <= Date.parse(run.startedAt),
      "Comparison was not frozen before execution.",
    );
    for (const field of [
      "fixtureSha256",
      "agentConfigSha256",
      "evaluatorSha256",
      "requiredPolicySha256",
    ] as const)
      invariant(
        manifest[field] === run[field],
        "Comparison conditions differ.",
      );
  }
  return manifest;
}
