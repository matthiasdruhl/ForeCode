// Operator-local adapter only. No production catalog, key creation or signer.
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import {
  ContextSchema,
  StrategySchema,
  EvidenceReferenceSchema,
  ProposalSchema,
} from "../../src/lib/learning/contracts";
import { jsonDigest } from "../../src/lib/report/digests";
import { receiptManifestDigest } from "../../src/lib/report/digests";
import { invariant } from "../../src/lib/contracts/validation";
import { isTrustedEvaluation } from "../../src/server/artifacts/evaluation-store";
import {
  immutable,
  requireHeldRecord,
} from "../experiments/tournament/custody";

const RefSchema = z.strictObject({
  runId: IdSchema,
  receiptId: IdSchema,
  receiptSha256: Sha256Schema,
});
const cost = z.number().min(0).max(1_000_000).nullable();
export const ProjectionSchema = z.strictObject({
  schemaVersion: z.literal("approved-learning-projection.v1"),
  origin: z.enum(["AUTHENTIC", "SYNTHETIC"]),
  studyId: IdSchema,
  protocolSubjectSha256: Sha256Schema,
  protocolOriginalSha256: Sha256Schema,
  context: ContextSchema,
  decisionAt: UtcTimestampSchema,
  decision: z.strictObject({
    selected: z.enum(["KEEP", "BOUNDARY", "ADAPTER", "ABSTAIN"]),
    selector: IdSchema,
    proposal: ProposalSchema.nullable(),
  }),
  observedAt: UtcTimestampSchema,
  rightsReviewSha256: Sha256Schema,
  comparison: z.enum(["COMPARABLE", "INVALID", "BLOCKED", "UNVERIFIED"]),
  // Independent approval covers chronology, equal task/agent/oracle/budgets,
  // present-day equivalence, complete attempts, consent and telemetry custody.
  comparisonReviewSha256: Sha256Schema,
  matchedConditionsSha256: Sha256Schema,
  attemptHistorySha256: Sha256Schema,
  inference: z.strictObject({
    latencyMs: z.number().nonnegative().nullable(),
    costUsd: cost,
  }),
  regressions: z
    .array(
      z.strictObject({
        action: StrategySchema,
        occurred: z.boolean().nullable(),
      }),
    )
    .max(3),
  attempts: z
    .array(
      z.strictObject({
        id: IdSchema,
        action: StrategySchema,
        status: z.enum([
          "completed",
          "failed",
          "blocked",
          "cancelled",
          "timed_out",
        ]),
        startedAt: UtcTimestampSchema,
        endedAt: UtcTimestampSchema,
      }),
    )
    .min(2)
    .max(100),
  arms: z
    .array(
      z.strictObject({
        action: StrategySchema,
        baseline: RefSchema,
        future: RefSchema,
        // Actual aggregate charges across ALL attempts, not selected best runs.
        preparationCostUsd: cost,
        downstreamCostUsd: cost,
        costBasis: z.enum(["authenticated_actual_usd", "unknown"]),
      }),
    )
    .min(2)
    .max(3),
});
export type Projection = z.infer<typeof ProjectionSchema>;
export type AdmittedObservation = Readonly<{
  projection: Projection;
  sha256: string;
  evidence: z.infer<typeof EvidenceReferenceSchema>;
  correctness: Readonly<
    Partial<Record<z.infer<typeof StrategySchema>, 0 | 1 | null>>
  >;
}>;
const admitted = new WeakSet<object>();
export function isAdmitted(value: unknown): value is AdmittedObservation {
  return !!value && typeof value === "object" && admitted.has(value);
}

// The composition supplies freshly loaded EXISTING custody/store capabilities,
// never client JSON. This module cannot manufacture a verification verdict.
// No production implementation of this projection exporter is installed yet.
export async function admitObservation(input: {
  projection: unknown;
  approvalId: string;
  protocolId: string;
  assessmentAt: string;
  loadRecord(id: string): Promise<unknown>;
  loadEvaluation(id: string): Promise<unknown>;
}): Promise<AdmittedObservation> {
  const p = ProjectionSchema.parse(input.projection),
    digest = jsonDigest(p);
  const at = UtcTimestampSchema.parse(input.assessmentAt);
  invariant(
    p.decision.selected === "ABSTAIN" ||
      p.context.actions.eligible.includes(p.decision.selected),
    "Unsupported selected action.",
  );
  if (p.decision.proposal) {
    const proposal = p.decision.proposal;
    invariant(
      proposal.contextSha256 === jsonDigest(p.context) &&
        proposal.provenance.inputSha256 === jsonDigest(p.context) &&
        proposal.candidateSetSha256 === jsonDigest(p.context.actions) &&
        proposal.proposed.every((a) => p.context.actions.eligible.includes(a)),
      "Proposal context mismatch.",
    );
  }
  const protocol = requireHeldRecord(await input.loadRecord(input.protocolId), {
    studyId: p.studyId,
    kind: "protocol",
    subjectSha256: p.protocolSubjectSha256,
    predecessorSha256: null,
    at: p.context.frozenAt,
  });
  invariant(
    protocol.sha256 === p.protocolOriginalSha256,
    "Protocol original mismatch.",
  );
  invariant(
    Date.parse(p.context.frozenAt) < Date.parse(p.decisionAt) &&
      Date.parse(p.decisionAt) < Date.parse(p.observedAt) &&
      Date.parse(p.observedAt) <= Date.parse(at),
    "Evidence chronology invalid.",
  );
  const approval = requireHeldRecord(await input.loadRecord(input.approvalId), {
    studyId: p.studyId,
    kind: "disclosure",
    subjectSha256: digest,
    predecessorSha256: protocol.sha256,
    at,
  });
  invariant(
    Date.parse(approval.record.heldAt) >= Date.parse(p.observedAt),
    "Projection approved before outcome.",
  );
  const actions = p.arms.map((a) => a.action);
  invariant(
    new Set(actions).size === actions.length &&
      actions.every((a) => p.context.actions.eligible.includes(a)),
    "Invalid observed strategies.",
  );
  invariant(
    new Set(p.attempts.map((a) => a.id)).size === p.attempts.length,
    "Duplicate attempt.",
  );
  invariant(
    p.attempts.every(
      (a) =>
        actions.includes(a.action) &&
        Date.parse(a.startedAt) >= Date.parse(p.decisionAt) &&
        Date.parse(a.startedAt) <= Date.parse(a.endedAt) &&
        Date.parse(a.endedAt) <= Date.parse(p.observedAt),
    ),
    "Invalid attempt history.",
  );
  const correctness: Partial<
    Record<z.infer<typeof StrategySchema>, 0 | 1 | null>
  > = {};
  const receiptIds: string[] = [];
  let fixture: string | null = null,
    futureOracle: string | null = null,
    baselineOracle: string | null = null;
  for (const arm of p.arms) {
    invariant(
      p.attempts.some((a) => a.action === arm.action),
      "Observed action has no attempts.",
    );
    const outcomes = [];
    for (const [phase, ref] of [
      ["baseline", arm.baseline],
      ["future", arm.future],
    ] as const) {
      const evaluation = await input.loadEvaluation(ref.runId);
      invariant(
        isTrustedEvaluation(evaluation),
        "Original protected evaluation required.",
      );
      const r = evaluation.receipt;
      invariant(
        r.id === ref.receiptId &&
          r.runId === ref.runId &&
          receiptManifestDigest(r) === ref.receiptSha256,
        "Receipt identity mismatch.",
      );
      invariant(!receiptIds.includes(r.id), "Receipt reused.");
      receiptIds.push(r.id);
      const oracle = jsonDigest([
        r.evaluatorSha256,
        r.testSuiteSha256,
        r.requiredPolicySha256,
        [...r.requiredCheckIds].sort(),
      ]);
      if (fixture === null) fixture = r.fixtureSha256;
      invariant(fixture === r.fixtureSha256, "Different fixture.");
      if (phase === "baseline") {
        if (baselineOracle === null) baselineOracle = oracle;
        invariant(
          baselineOracle === oracle &&
            evaluation.verification.verdict === "VERIFIED",
          "Initial functionality unverified.",
        );
      } else {
        if (futureOracle === null) futureOracle = oracle;
        invariant(futureOracle === oracle, "Different future oracle.");
        invariant(
          p.attempts.some((a) => a.id === r.runId && a.action === arm.action),
          "Future receipt outside attempt history.",
        );
      }
      invariant(
        Date.parse(r.finishedAt) <= Date.parse(p.observedAt),
        "Outcome after observation.",
      );
      outcomes.push(evaluation);
    }
    const baseline = outcomes[0]!,
      future = outcomes[1]!;
    invariant(
      Date.parse(baseline.receipt.finishedAt) <=
        Date.parse(future.receipt.startedAt) &&
        Date.parse(future.receipt.startedAt) >= Date.parse(p.decisionAt),
      "Evaluation chronology invalid.",
    );
    correctness[arm.action] =
      future.verification.verdict === "VERIFIED"
        ? 1
        : future.verification.verdict === "REJECTED"
          ? 0
          : null;
  }
  const result = immutable({
    projection: p,
    sha256: digest,
    correctness,
    evidence: EvidenceReferenceSchema.parse({
      schemaVersion: "learning-evidence-reference.v1",
      studyId: p.studyId,
      projectionSha256: digest,
      approvalId: approval.record.id,
      protocolOriginalSha256: protocol.sha256,
      receiptIds,
    }),
  });
  admitted.add(result);
  return result;
}
