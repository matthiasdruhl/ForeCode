import { z } from "zod";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import {
  FutureOracleDescriptorSchema,
  validateFutureOracle,
} from "../../evaluator/booking-v1/future";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
  RelativePathSchema,
} from "../../../src/lib/contracts/common";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import {
  FutureTaskSchema,
  futureTaskRequest,
  futureTaskDigest,
  validateFutureTask,
} from "../../../src/lib/experiment/future-task";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { ArmConditionsSchema, TournamentPlanSchema } from "./plan";
import {
  ExecutionConditionsSchema,
  PreparationRecordSchema,
  futureProtocolCommitment,
  requireFutureStudyCommitments,
  validateFutureStudy,
} from "./future-study";
import { immutable, requireHeldRecord, type HeldRecord } from "./custody";

// Constructible before B exists. Contains no fabricated prepared source or cost.
export const ProtocolSchema = z.strictObject({
  schemaVersion: z.literal("booking-future-protocol-commitment.local.v1"),
  task: FutureTaskSchema,
  futureOracle: FutureOracleDescriptorSchema,
  conditions: z.array(ArmConditionsSchema).length(2),
  executionConditions: z.array(ExecutionConditionsSchema).length(2),
  trialPolicy: TournamentPlanSchema.shape.trialPolicy,
  studyKind: TournamentPlanSchema.shape.studyKind,
  intentRevision: TournamentPlanSchema.shape.intentRevision,
  scenario: TournamentPlanSchema.shape.scenario,
  studyId: IdSchema,
  fixtureSha256: Sha256Schema,
  arms: z
    .array(
      z.strictObject({ variant: z.enum(["A", "B"]), runId: z.string().uuid() }),
    )
    .length(2),
});
const image = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const StudyDefinitionSchema = z.strictObject({
  schemaVersion: z.literal("tournament-definition.local.v1"),
  protocol: ProtocolSchema,
  downstreamPrompt: z.string().min(1).max(32000),
  adapterInstructions: z.string().min(1).max(16000),
  toolAllowlist: z.array(IdSchema).min(1).max(32),
  runtime: z.strictObject({
    agentImage: image,
    graderImage: image,
    workerImage: image,
    agentBinarySha256: Sha256Schema,
    nodeSha256: Sha256Schema,
    supervisorSha256: Sha256Schema,
    brokerSha256: Sha256Schema,
    graderExecutableSha256: Sha256Schema,
  }),
  restrictions: z.strictObject({
    writablePaths: z.tuple([z.literal("src/")]),
    network: z.literal("none"),
    credentials: z.literal("trusted_broker_only"),
    maxRequests: z.number().int().min(1).max(100),
    maxOutputTokens: z.number().int().min(16).max(8192),
  }),
  comparisonMetrics: z.tuple([
    z.literal("correctness"),
    z.literal("preparation_inclusive_effort"),
    z.literal("trusted_usage_only"),
  ]),
});
export type StudyDefinition = z.infer<typeof StudyDefinitionSchema>;
export function validateStudyDefinition(input: unknown): StudyDefinition {
  const definition = StudyDefinitionSchema.parse(input),
    p = definition.protocol;
  const task = validateFutureTask(p.task);
  validateFutureOracle(p.futureOracle, task);
  invariant(
    p.scenario.request === futureTaskRequest(task) &&
      p.scenario.origin === "developer_confirmed" &&
      p.scenario.frozen &&
      p.scenario.intentIds.includes(p.intentRevision.id) &&
      sameIds(p.scenario.acceptanceIds, [
        ...task.acceptance.map((x) => x.id),
        ...task.invariants,
      ]),
    "Protocol task or intent changed.",
  );
  invariant(
    sameIds(
      p.arms.map((x) => x.variant),
      ["A", "B"],
    ) && new Set(p.arms.map((x) => x.runId)).size === 2,
    "Duplicate arms or run identifiers.",
  );
  invariant(
    sameIds(
      p.conditions.map((x) => x.variant),
      ["A", "B"],
    ) &&
      sameIds(
        p.executionConditions.map((x) => x.variant),
        ["A", "B"],
      ),
    "Missing matched conditions.",
  );
  for (const items of [p.conditions, p.executionConditions]) {
    const values = items.map(({ variant, ...value }) => {
      void variant;
      return jsonDigest(value);
    });
    invariant(values[0] === values[1], "Unequal downstream conditions.");
  }
  const conditions = p.conditions[0]!;
  invariant(
    p.scenario.baselineCommit === conditions.originalCommit &&
      p.fixtureSha256 === conditions.originalTreeSha256,
    "Original source mismatch.",
  );
  const taskSha256 = jsonDigest({
    taskId: task.id,
    request: p.scenario.request,
    assumptions: p.scenario.assumptions,
    acceptanceIds: p.scenario.acceptanceIds,
  });
  invariant(
    conditions.taskSha256 === taskSha256 &&
      conditions.promptTemplateSha256 === sha256(definition.downstreamPrompt) &&
      conditions.toolAllowlistSha256 === jsonDigest(definition.toolAllowlist) &&
      conditions.runtimeSha256 === jsonDigest(definition.runtime),
    "Protocol executable inputs changed.",
  );
  invariant(
    ["muse-spark-1.3", "muse-spark-1.3-contributor"].includes(
      p.executionConditions[0]!.modelId,
    ),
    "Exact Meta model required.",
  );
  invariant(
    conditions.budget.tokenLimit !== null &&
      conditions.budget.spendUsd !== null,
    "Bounded token and spending limits required.",
  );
  return definition;
}
export function protocolSubject(definition: unknown) {
  return jsonDigest(validateStudyDefinition(definition));
}
export function preparationSubject(
  definition: unknown,
  proposal: string,
  instructions: string,
) {
  return jsonDigest({
    definitionSha256: protocolSubject(definition),
    proposalSha256: sha256(proposal),
    instructionsSha256: sha256(instructions),
  });
}
const ManifestSchema = z
  .array(z.strictObject({ path: RelativePathSchema, sha256: Sha256Schema }))
  .min(1)
  .max(100);
export const PreparationEvidenceSchema = z.strictObject({
  record: PreparationRecordSchema,
  selectionAt: UtcTimestampSchema,
  proposal: z.string().min(1).max(32000),
  instructions: z.string().min(1).max(32000),
  selectedAttemptId: IdSchema,
  attempts: z
    .array(
      z.strictObject({
        id: IdSchema,
        status: z.enum([
          "completed",
          "failed",
          "cancelled",
          "timed_out",
          "blocked",
        ]),
        startedAt: UtcTimestampSchema,
        finishedAt: UtcTimestampSchema,
        authorizationId: IdSchema,
      }),
    )
    .min(1)
    .max(100),
  originalManifest: ManifestSchema,
  preparedManifest: ManifestSchema,
});
export type PreparationEvidence = z.infer<typeof PreparationEvidenceSchema>;
export function sourceDiff(
  original: z.infer<typeof ManifestSchema>,
  prepared: z.infer<typeof ManifestSchema>,
) {
  for (const manifest of [original, prepared]) {
    invariant(
      new Set(manifest.map((x) => x.path)).size === manifest.length,
      "Duplicate manifest path.",
    );
    invariant(
      manifest.every((x, i) => !i || manifest[i - 1]!.path < x.path),
      "Noncanonical source manifest.",
    );
  }
  const a = new Map(original.map((x) => [x.path, x.sha256])),
    b = new Map(prepared.map((x) => [x.path, x.sha256]));
  const changed = [...new Set([...a.keys(), ...b.keys()])]
    .filter((p) => a.get(p) !== b.get(p))
    .sort();
  invariant(
    changed.every(
      (p) =>
        p.startsWith("src/") &&
        !p.split("/").some((x) => x.startsWith(".env") || x === ".."),
    ),
    "Preparation outside authorized source boundary.",
  );
  return changed;
}
const preparations = new WeakSet<object>();
export type PreparedStudy = Readonly<{
  definition: StudyDefinition;
  draft: ReturnType<typeof validateFutureStudy>;
  evidence: PreparationEvidence;
  protocol: HeldRecord;
  prepared: HeldRecord;
  changedFiles: string[];
}>;
export function isPreparedStudy(value: unknown): value is PreparedStudy {
  return !!value && typeof value === "object" && preparations.has(value);
}
export function validatePreparedStudy(input: {
  definition: unknown;
  draft: unknown;
  evidence: unknown;
  protocol: unknown;
  prepared: unknown;
  authorizations: ReadonlyMap<string, unknown>;
  preparationTelemetry?: unknown;
}): PreparedStudy {
  const definition = validateStudyDefinition(input.definition),
    draft = validateFutureStudy(input.draft);
  const evidence = PreparationEvidenceSchema.parse(input.evidence),
    record = evidence.record;
  const p = definition.protocol,
    studyId = p.studyId;
  invariant(
    jsonDigest(p) === futureProtocolCommitment(draft),
    "Protocol changed after freeze.",
  );
  const protocol = requireHeldRecord(input.protocol, {
    studyId,
    kind: "protocol",
    subjectSha256: protocolSubject(definition),
    predecessorSha256: null,
    at: draft.proposedChronology.independentFreezeAt,
  });
  invariant(
    Date.parse(evidence.selectionAt) ===
      Date.parse(draft.proposedChronology.architectureSelectionAt) &&
      Date.parse(protocol.record.heldAt) < Date.parse(evidence.selectionAt),
    "B selected before protocol custody.",
  );
  invariant(
    new Set(evidence.attempts.map((x) => x.id)).size ===
      evidence.attempts.length,
    "Duplicate preparation attempt.",
  );
  let previous = Date.parse(evidence.selectionAt);
  const used = new Set<string>();
  for (const attempt of evidence.attempts) {
    invariant(
      !used.has(attempt.authorizationId),
      "Preparation authorization reused.",
    );
    used.add(attempt.authorizationId);
    const authorization = requireHeldRecord(
      input.authorizations.get(attempt.authorizationId),
      {
        studyId,
        kind: "preparation",
        subjectSha256: jsonDigest({
          preparationSha256: preparationSubject(
            definition,
            evidence.proposal,
            evidence.instructions,
          ),
          attemptId: attempt.id,
        }),
        predecessorSha256: protocol.sha256,
        at: attempt.startedAt,
      },
    );
    invariant(
      authorization.record.id === attempt.authorizationId &&
        Date.parse(authorization.record.heldAt) >=
          Date.parse(evidence.selectionAt) &&
        Date.parse(attempt.finishedAt) <
          Date.parse(authorization.record.expiresAt) &&
        Date.parse(attempt.startedAt) >= previous &&
        Date.parse(attempt.finishedAt) >= Date.parse(attempt.startedAt),
      "Preparation before selection/authorization or invalid history.",
    );
    previous = Date.parse(attempt.finishedAt);
  }
  const selected = evidence.attempts.find(
    (x) => x.id === evidence.selectedAttemptId,
  );
  invariant(
    selected?.status === "completed" &&
      evidence.attempts[0]!.startedAt === record.startedAt &&
      evidence.attempts.at(-1)!.finishedAt === record.finishedAt &&
      selected.id === evidence.attempts.at(-1)!.id &&
      previous < Date.parse(draft.plan.manifest.frozenAt),
    "Preparation completion/history mismatch.",
  );
  const condition = p.conditions[0]!,
    b = draft.plan.manifest.arms.find((x) => x.variant === "B")!;
  invariant(
    record.studyId === studyId &&
      record.taskDefinitionSha256 === futureTaskDigest(p.task) &&
      record.protocolSha256 === jsonDigest(p) &&
      record.original.commit === condition.originalCommit &&
      record.original.treeSha256 === condition.originalTreeSha256 &&
      record.original.dependencyLockSha256 === condition.dependencyLockSha256 &&
      record.prepared.commit === b.initialCommit &&
      record.prepared.treeSha256 === b.initialTreeSha256 &&
      record.prepared.dependencyLockSha256 === condition.dependencyLockSha256 &&
      record.preparationPromptSha256 === sha256(evidence.instructions) &&
      record.reviewRecordSha256 ===
        (input.authorizations.get(selected.authorizationId) as HeldRecord)
          .sha256,
    "Preparation source/task/review binding mismatch.",
  );
  invariant(
    jsonDigest(record.metrics) === jsonDigest(b.upfrontMetrics),
    "Preparation metrics differ from frozen draft.",
  );
  const changedFiles = sourceDiff(
    evidence.originalManifest,
    evidence.preparedManifest,
  );
  invariant(
    jsonDigest(evidence.originalManifest) === record.original.treeSha256 &&
      jsonDigest(evidence.preparedManifest) === record.prepared.treeSha256 &&
      changedFiles.length > 0 &&
      record.original.commit !== record.prepared.commit,
    "Preparation source manifest mismatch or absent B change.",
  );
  for (const manifest of [evidence.originalManifest, evidence.preparedManifest])
    invariant(
      manifest.find((x) => x.path === "package-lock.json")?.sha256 ===
        condition.dependencyLockSha256,
      "Preparation dependency lock changed.",
    );
  if (record.metrics.filesTouched !== null)
    invariant(
      record.metrics.filesTouched === changedFiles.length,
      "Inconsistent changed-file metric.",
    );
  if (record.metrics.elapsedMs !== null)
    invariant(
      record.metrics.elapsedMs ===
        Date.parse(record.finishedAt) - Date.parse(record.startedAt),
      "Inconsistent preparation elapsed metric.",
    );
  if (Object.values(record.metrics).some((x) => x !== null))
    requireHeldRecord(input.preparationTelemetry, {
      studyId,
      kind: "telemetry",
      subjectSha256: jsonDigest({
        phase: "preparation",
        recordSha256: sha256(canonicalJson(record)),
        metrics: record.metrics,
        changedFiles,
      }),
      predecessorSha256: protocol.sha256,
      at: draft.plan.manifest.frozenAt,
    });
  const recordSha256 = sha256(canonicalJson(record));
  invariant(
    draft.preparationRecordSha256 === recordSha256,
    "Preparation record bytes changed.",
  );
  const prepared = requireHeldRecord(input.prepared, {
    studyId,
    kind: "prepared",
    subjectSha256: preparedSubject(definition, draft, evidence),
    predecessorSha256: protocol.sha256,
    at: draft.plan.manifest.frozenAt,
  });
  invariant(
    Date.parse(prepared.record.heldAt) > previous &&
      Date.parse(prepared.record.heldAt) > Date.parse(protocol.record.heldAt),
    "Final commitment precedes preparation.",
  );
  requireFutureStudyCommitments(draft, {
    protocolSha256: jsonDigest(p),
    draftSha256: jsonDigest(draft),
  });
  const result = immutable({
    definition,
    draft,
    evidence,
    protocol,
    prepared,
    changedFiles,
  });
  preparations.add(result);
  return result;
}

export function preparedSubject(
  definition: unknown,
  draft: unknown,
  evidence: unknown,
) {
  return jsonDigest({
    definitionSha256: protocolSubject(definition),
    draftSha256: jsonDigest(validateFutureStudy(draft)),
    preparationSha256: jsonDigest(PreparationEvidenceSchema.parse(evidence)),
  });
}

// Reads bytes/manifests only; never imports or executes either tree.
export async function inspectPreparationSources(
  study: PreparedStudy,
  roots: { original: string; prepared: string },
) {
  invariant(isPreparedStudy(study), "Authenticated prepared study required.");
  const original = await snapshotTree(roots.original),
    prepared = await snapshotTree(roots.prepared);
  invariant(
    original.treeSha256 === study.evidence.record.original.treeSha256 &&
      prepared.treeSha256 === study.evidence.record.prepared.treeSha256,
    "Prepared source changed after freeze.",
  );
  return {
    changedFiles: sourceDiff(original.files, prepared.files),
    originalTreeSha256: original.treeSha256,
    preparedTreeSha256: prepared.treeSha256,
  };
}
