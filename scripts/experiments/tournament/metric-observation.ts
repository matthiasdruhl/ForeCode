// Private additive measurement boundary. No execution, signing, registration,
// verdict changes, web import, publication, or default authority/catalog.
import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import { matchedConditionsDigest } from "../../../src/lib/experiment/study-identities";
import { isAuthenticatedRegistration } from "../../../src/server/meta/registration-reader";
import {
  MetricProtocolSchema,
  MetricBoundaryObservationSchema,
  MetricObservationsSchema,
  calculateProspectiveMetrics,
  type MetricProtocol,
  type MetricObservations,
} from "../../../src/lib/experiment/prospective-metrics";
import {
  isTrustedEvaluation,
  EvaluationIdentitySchema,
} from "../../../src/server/artifacts/evaluation-store";
import {
  collectSealedMetricSnapshot,
  validateMetricManifest,
} from "../../evaluator/booking-v1/metric-snapshot";
import {
  ProtectedAuthorizationObservationSchema,
  readProtectedAuthorizationCases,
} from "../../evaluator/booking-v1/metric-authorization";
import {
  teamTaskSha256,
  baselineCheckIds,
} from "../../evaluator/booking-v1/grade-profile";
import { bookingPolicy } from "../../evaluator/booking-v1/freeze";
import { disjoint, privateDirectory, protectedRead } from "../artifacts/files";
import { SourceManifestSchema } from "./source-manifest";
import { immutable, requireHeldRecord, isHeldRecord } from "./custody";
import { isPreparedStudy } from "./study";
import { isAuthenticatedArm, buildMeasuredTournamentReport } from "./measured";
import { sharedFutureTask } from "./paired";

export const MetricSnapshotOriginalV1Schema = z.strictObject({
  schemaVersion: z.literal("protected-metric-snapshot.local.v1"),
  studyId: IdSchema,
  protocolSha256: Sha256Schema,
  variant: z.enum(["A", "B"]),
  runId: IdSchema,
  role: z.enum(["baseline", "final"]),
  startedAt: UtcTimestampSchema,
  finishedAt: UtcTimestampSchema,
  treeSha256: Sha256Schema,
  manifest: SourceManifestSchema,
  boundary: MetricBoundaryObservationSchema,
  authorization: ProtectedAuthorizationObservationSchema,
});
export const MetricBaselineAuthorizationProofSchema = z.strictObject({
  kind: z.literal("not_applicable_before_future_requirement"),
  identity: EvaluationIdentitySchema,
  receiptSha256: Sha256Schema,
});
export const MetricSnapshotOriginalV2Schema =
  MetricSnapshotOriginalV1Schema.extend({
    schemaVersion: z.literal("protected-metric-snapshot.local.v2"),
    role: z.literal("baseline"),
    authorization: MetricBaselineAuthorizationProofSchema,
  });
export const MetricSnapshotOriginalSchema = z.union([
  MetricSnapshotOriginalV1Schema,
  MetricSnapshotOriginalV2Schema,
]);
export type MetricSnapshotOriginal = z.infer<
  typeof MetricSnapshotOriginalSchema
>;

/** A real passing personal-regression receipt, never future authorization zero. */
export function createMetricBaselineAuthorizationNotApplicable(
  protocol: unknown,
  evaluation: unknown,
) {
  invariant(
    MetricProtocolSchema.parse(protocol).schemaVersion ===
      "prospective-tournament-metrics.v2",
    "Not-applicable baseline requires v2 protocol.",
  );
  invariant(
    isTrustedEvaluation(evaluation),
    "Authenticated five-check baseline required.",
  );
  const r = evaluation.receipt;
  invariant(
    evaluation.verification.verdict === "VERIFIED" &&
      r.requiredPolicySha256 === jsonDigest(bookingPolicy) &&
      sameIds(r.requiredCheckIds, [...baselineCheckIds]) &&
      sameIds(
        evaluation.checks.map((c) => c.id),
        [...baselineCheckIds],
      ) &&
      evaluation.checks.every((c) => c.status === "pass"),
    "Verified unchanged five-check personal baseline required.",
  );
  return MetricBaselineAuthorizationProofSchema.parse({
    kind: "not_applicable_before_future_requirement",
    identity: {
      runId: r.runId,
      evaluatedTreeSha256: r.evaluatedTreeSha256,
      fixtureSha256: r.fixtureSha256,
      evaluatorSha256: r.evaluatorSha256,
      testSuiteSha256: r.testSuiteSha256,
      requiredPolicySha256: r.requiredPolicySha256,
      requiredCheckIds: r.requiredCheckIds,
    },
    receiptSha256: jsonDigest(r),
  });
}
export function readMetricBaselineAuthorizationNotApplicable(
  input: unknown,
  protocol: unknown,
  evaluation: unknown,
) {
  const observed = MetricBaselineAuthorizationProofSchema.parse(input);
  const expected = createMetricBaselineAuthorizationNotApplicable(
    protocol,
    evaluation,
  );
  invariant(
    jsonDigest(observed) === jsonDigest(expected),
    "Personal baseline receipt proof mismatch.",
  );
  return { kind: "not_applicable_before_future_requirement" as const };
}
// One baseline evaluation identity per registered terminal arm; operators cannot
// select a more favorable baseline evaluation ID after observing its outcomes.
export function metricBaselineEvaluationRunId(runId: string) {
  const downstream = z
    .string()
    .regex(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    )
    .parse(runId);
  // Private mapping v2: the former text prefix was not a valid guest run UUID.
  // This deterministic UUID-shaped identity is not randomly issued authority.
  const bytes = sha256(`forecode.metric-baseline-evaluation.v2\0${downstream}`)
    .slice(0, 32)
    .split("");
  bytes[12] = "4";
  bytes[16] = ((Number.parseInt(bytes[16]!, 16) & 3) | 8).toString(16);
  const hex = bytes.join("");
  const baseline = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  invariant(
    baseline !== downstream,
    "Metric baseline/downstream identity collision.",
  );
  return baseline;
}
const snapshotReference = z.strictObject({
  custodyId: IdSchema,
  original: MetricSnapshotOriginalSchema,
});
export const SupplementaryMetricOriginalSchema = z.strictObject({
  schemaVersion: z.literal("protected-tournament-metrics.local.v1"),
  evidenceOrigin: z.enum(["synthetic", "protected_evaluator"]),
  protocol: MetricProtocolSchema,
  metricCommitmentSha256: Sha256Schema,
  preparedOriginalSha256: Sha256Schema,
  historyOriginalSha256: Sha256Schema.nullable(),
  observations: MetricObservationsSchema,
  status: z.enum(["complete", "incomplete"]),
  arms: z
    .array(
      z.strictObject({
        variant: z.enum(["A", "B"]),
        runId: IdSchema,
        executionOriginalSha256: Sha256Schema.nullable(),
        baseline: snapshotReference.nullable(),
        final: snapshotReference.nullable(),
      }),
    )
    .length(2),
});

// Called by reviewed evaluator instrumentation at the baseline release barrier
// or terminal sealed export. The returned JSON is explicitly unauthenticated
// until existing independent custody holds its exact digest. No worker file map.
export async function collectMetricSnapshotOriginal(input: {
  protocol: MetricProtocol;
  variant: "A" | "B";
  runId: string;
  role: "baseline" | "final";
  directory: string;
  manifest: unknown;
  treeSha256: string;
  authorization: unknown;
  evaluation: unknown;
  clock?: () => string;
}): Promise<MetricSnapshotOriginal> {
  const clock = input.clock ?? (() => new Date().toISOString());
  const startedAt = clock();
  const source = await collectSealedMetricSnapshot(input);
  const baselineV2 =
    input.protocol.schemaVersion === "prospective-tournament-metrics.v2" &&
    input.role === "baseline";
  if (baselineV2) {
    readMetricBaselineAuthorizationNotApplicable(
      input.authorization,
      input.protocol,
      input.evaluation,
    );
    const proof = MetricBaselineAuthorizationProofSchema.parse(
      input.authorization,
    );
    invariant(
      proof.identity.evaluatedTreeSha256 === input.treeSha256,
      "Personal baseline source mismatch.",
    );
  } else
    readProtectedAuthorizationCases(
      input.authorization,
      input.protocol,
      input.evaluation,
    );
  return MetricSnapshotOriginalSchema.parse({
    schemaVersion: baselineV2
      ? "protected-metric-snapshot.local.v2"
      : "protected-metric-snapshot.local.v1",
    studyId: input.protocol.studyId,
    protocolSha256: jsonDigest(input.protocol),
    variant: input.variant,
    runId: input.runId,
    role: input.role,
    startedAt,
    finishedAt: clock(),
    ...source,
    authorization: input.authorization,
  });
}

export type MetricObservationReaderConfig = {
  // Fixed source-owned configuration; never request input. Agent A's future
  // resolver must supply/pin the SAME authenticated metric commitment here.
  protocol: MetricProtocol;
  root: string;
  workspaceRoots: readonly string[];
  commitmentId: string;
  // Optional only for independent metric-only studies. Registered Scientist
  // studies use the service's fresh resolveRegistered closure, never a cache.
  resolveRegistration?: () => Promise<unknown>;
  observationId: string;
  sources: ReadonlyMap<
    "A" | "B",
    {
      baseline: string | null;
      final: string | null;
      // v1 fixes a derived same-future-suite baseline UUID. v2 binds the
      // existing actual five-check baseline ID from the runtime original.
      baselineEvaluationRunId: string;
    }
  >;
  loadContext(): Promise<{
    study: unknown;
    arms: readonly unknown[];
    history: unknown;
    additionalAttempts?: readonly unknown[];
  }>;
  loadRecord(id: string): Promise<unknown>;
  loadEvaluation(id: string): Promise<unknown>;
};

export function metricMeasurementStatus(
  p: MetricProtocol,
  o: MetricObservations,
) {
  const result = calculateProspectiveMetrics(p, o);
  return o.arms.every((a) => a.status === "completed") &&
    result.arms.every((a) =>
      [a.baseline, a.final].every(
        (s) =>
          s.boundaryViolations !== null &&
          ((s === a.baseline &&
            p.schemaVersion === "prospective-tournament-metrics.v2") ||
            s.authorizationFailures !== null),
      ),
    )
    ? ("complete" as const)
    : ("incomplete" as const);
}

// No new verdict: only a supplementary comparison, gated by the existing
// authenticated report's attempt history, matching conditions and run lifecycle.
export function createProtectedMetricObservationReader(
  input: MetricObservationReaderConfig,
) {
  const config = {
    ...input,
    protocol: immutable(MetricProtocolSchema.parse(input.protocol)),
    workspaceRoots: [...input.workspaceRoots],
    sources: new Map([...input.sources].map(([k, v]) => [k, { ...v }])),
  };
  async function readOnce(assessmentAt: string) {
    const p = config.protocol;
    const context = await config.loadContext();
    invariant(
      isPreparedStudy(context.study),
      "Authenticated prepared study required.",
    );
    const study = context.study,
      plan = study.draft.plan;
    // Even a formerly authenticated in-memory object cannot bypass fresh
    // original/revocation loading. Do not let callers cache custody forever.
    const references = [
      study.protocol,
      study.prepared,
      ...context.arms
        .filter(isAuthenticatedArm)
        .flatMap((a) => [a.admission, a.originalRecord]),
      ...(isHeldRecord(context.history) ? [context.history] : []),
    ];
    for (const previous of references) {
      const fresh = await config.loadRecord(previous.record.id);
      invariant(
        isHeldRecord(fresh) &&
          fresh.sha256 === previous.sha256 &&
          Date.parse(fresh.record.heldAt) <= Date.parse(assessmentAt) &&
          Date.parse(assessmentAt) < Date.parse(fresh.record.expiresAt),
        "Referenced original unavailable or revoked.",
      );
    }
    invariant(
      p.studyId === plan.manifest.id &&
        p.taskSha256 === teamTaskSha256 &&
        p.taskSha256 === study.draft.taskDefinitionSha256 &&
        p.matchedConditionsSha256 ===
          matchedConditionsDigest(study.definition) &&
        p.evaluatorSha256 === plan.futureOracle.evaluatorSha256 &&
        p.suiteSha256 === plan.futureOracle.testSuiteSha256 &&
        p.policySha256 === plan.futureOracle.requiredPolicySha256,
      "Study metric identity mismatch.",
    );
    const registration = config.resolveRegistration
      ? await config.resolveRegistration()
      : null;
    if (config.resolveRegistration) {
      invariant(
        isAuthenticatedRegistration(registration),
        "Authenticated current registration required.",
      );
      const s = registration.registration.study;
      invariant(
        jsonDigest(registration.metricProtocol) === jsonDigest(p) &&
          registration.lineage.protocolSha256 === jsonDigest(p) &&
          s.definitionSha256 === study.protocol.record.subjectSha256 &&
          s.definitionSha256 === jsonDigest(study.definition) &&
          s.protocolOriginalSha256 === study.protocol.sha256 &&
          registration.lineage.studyProtocolSha256 ===
            jsonDigest(study.definition.protocol) &&
          registration.lineage.sourceTreeSha256 ===
            plan.manifest.fixtureSha256 &&
          registration.lineage.sourceManifestSha256 ===
            jsonDigest(study.evidence.originalManifest) &&
          registration.lineage.variants.every((v) =>
            plan.manifest.arms.some(
              (a) => a.variant === v.variant && a.runId === v.runId,
            ),
          ) &&
          registration.commitmentId === config.commitmentId &&
          registration.registration.registeredAt <
            Date.parse(study.evidence.selectionAt) &&
          Date.parse(assessmentAt) < registration.registration.expiresAt,
        "Registered study/measurement lineage mismatch.",
      );
    }
    const registered = isAuthenticatedRegistration(registration)
      ? registration
      : null;
    const commitment = requireHeldRecord(
      await config.loadRecord(config.commitmentId),
      {
        studyId: p.studyId,
        kind: registered ? "scientist-commitment" : "protocol",
        subjectSha256: registered
          ? registered.commitmentSubjectSha256
          : jsonDigest(p),
        predecessorSha256: study.protocol.sha256,
        at: study.evidence.selectionAt,
      },
    );
    invariant(
      !registered || commitment.sha256 === registered.commitmentOriginalSha256,
      "Initial measurement commitment changed.",
    );
    invariant(
      Date.parse(assessmentAt) < Date.parse(commitment.record.expiresAt) &&
        Date.parse(commitment.record.heldAt) <
          Date.parse(study.evidence.selectionAt),
      "Metric commitment must precede selection/preparation.",
    );
    const report = buildMeasuredTournamentReport({ ...context, assessmentAt });
    const root = await privateDirectory(config.root);
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    const roots = [root];
    invariant(
      config.workspaceRoots.length > 0,
      "Workspace inventory required.",
    );
    for (const source of config.sources.values())
      for (const directory of [source.baseline, source.final])
        if (directory) roots.push(await privateDirectory(directory));
    for (let i = 0; i < roots.length; i++) {
      const directory = roots[i]!;
      disjoint(directory, repository);
      disjoint(directory, path.resolve(repository, "../AgentHarness-Planning"));
      for (const workspace of config.workspaceRoots)
        disjoint(directory, await realpath(workspace));
      for (const other of roots.slice(i + 1)) disjoint(directory, other);
    }
    const bytes = await protectedRead(
      path.join(root, "metric-observation.json"),
    );
    const original = SupplementaryMetricOriginalSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const held = requireHeldRecord(
      await config.loadRecord(config.observationId),
      {
        studyId: p.studyId,
        kind: "telemetry",
        subjectSha256: sha256(bytes),
        predecessorSha256: study.prepared.sha256,
        at: assessmentAt,
      },
    );
    invariant(
      jsonDigest(original.protocol) === jsonDigest(p) &&
        original.metricCommitmentSha256 === commitment.sha256 &&
        original.preparedOriginalSha256 === study.prepared.sha256 &&
        original.historyOriginalSha256 ===
          (isHeldRecord(context.history) ? context.history.sha256 : null) &&
        (!isHeldRecord(context.history) ||
          Date.parse(context.history.record.heldAt) <=
            Date.parse(held.record.heldAt)),
      "Metric commitment substitution.",
    );
    invariant(
      new Set(original.arms.map((a) => a.variant)).size === 2 &&
        context.arms.every(isAuthenticatedArm) &&
        new Set(context.arms.map((a) => a.variant)).size ===
          context.arms.length,
      "Invalid metric arms.",
    );
    const observationFields = {
      schemaVersion:
        p.schemaVersion === "prospective-tournament-metrics.v2"
          ? "prospective-tournament-observations.v2"
          : "prospective-tournament-observations.v1",
      studyId: p.studyId,
      protocolSha256: jsonDigest(p),
      taskSha256: p.taskSha256,
      matchedConditionsSha256: p.matchedConditionsSha256,
      evaluatorSha256: p.evaluatorSha256,
      suiteSha256: p.suiteSha256,
      policySha256: p.policySha256,
    };
    const observedArms: MetricObservations["arms"][number][] = [];
    const seen = new Set<string>();
    for (const variant of ["A", "B"] as const) {
      const declared = plan.manifest.arms.find((a) => a.variant === variant)!;
      const arm = context.arms.find((a) => a.variant === variant);
      const recorded = original.arms.find((a) => a.variant === variant)!;
      invariant(
        recorded.runId === declared.runId &&
          recorded.executionOriginalSha256 ===
            (arm?.originalRecord.sha256 ?? null) &&
          (!arm ||
            (arm.original.run.id === declared.runId &&
              arm.originalRecord.record.studyId === p.studyId &&
              arm.admission.record.predecessorSha256 ===
                study.prepared.sha256 &&
              arm.original.taskDefinitionSha256 === p.taskSha256 &&
              arm.original.sharedTaskSha256 ===
                jsonDigest(sharedFutureTask(study)) &&
              jsonDigest(arm.original.initialManifest) ===
                declared.initialTreeSha256 &&
              arm.original.run.fixtureSha256 === plan.manifest.fixtureSha256 &&
              Date.parse(arm.original.run.endedAt) <=
                Date.parse(held.record.heldAt))),
        "Cross-arm/run original substitution.",
      );
      const observed: MetricObservations["arms"][number] = {
        variant,
        runId: declared.runId!,
        status: arm?.original.run.status ?? "blocked",
        baseline: null,
        final: null,
      };
      for (const role of ["baseline", "final"] as const) {
        const ref = recorded[role];
        if (!ref) continue; // Retain missingness, never synthesize zero observations.
        invariant(arm, "Measurement without authenticated terminal attempt.");
        const s = ref.original,
          source = config.sources.get(variant),
          directory = source?.[role];
        const manifest =
          role === "baseline"
            ? arm.original.initialManifest
            : arm.original.finalManifest;
        const treeSha256 =
          role === "baseline"
            ? declared.initialTreeSha256
            : arm.original.run.evaluatedTreeSha256;
        invariant(
          directory &&
            manifest &&
            treeSha256 &&
            !seen.has(ref.custodyId) &&
            s.studyId === p.studyId &&
            s.protocolSha256 === jsonDigest(p) &&
            s.variant === variant &&
            s.runId === declared.runId &&
            s.role === role &&
            s.treeSha256 === treeSha256 &&
            jsonDigest(s.manifest) === jsonDigest(manifest),
          "Snapshot provenance mismatch.",
        );
        seen.add(ref.custodyId);
        validateMetricManifest(manifest, treeSha256);
        // Frozen non-source bytes cannot change during either treatment.
        const initial = new Map(
          arm.original.initialManifest
            .filter((f) => !f.path.startsWith("src/"))
            .map((f) => [f.path, f.sha256]),
        );
        const nonSource = manifest.filter((f) => !f.path.startsWith("src/"));
        invariant(
          nonSource.length === initial.size &&
            nonSource.every((f) => initial.get(f.path) === f.sha256),
          "Unauthorized non-source change.",
        );
        const custody = requireHeldRecord(
          await config.loadRecord(ref.custodyId),
          {
            studyId: p.studyId,
            kind: "telemetry",
            subjectSha256: jsonDigest(s),
            predecessorSha256:
              role === "baseline"
                ? arm.admission.sha256
                : arm.originalRecord.sha256,
            at: role === "baseline" ? arm.original.run.startedAt : assessmentAt,
          },
        );
        const start = Date.parse(s.startedAt),
          finish = Date.parse(s.finishedAt);
        invariant(
          Date.parse(assessmentAt) < Date.parse(custody.record.expiresAt) &&
            start <= finish &&
            finish <= Date.parse(custody.record.heldAt) &&
            Date.parse(custody.record.heldAt) <=
              Date.parse(held.record.heldAt) &&
            (role === "baseline"
              ? start >=
                  Math.max(
                    Date.parse(study.prepared.record.heldAt),
                    Date.parse(arm.admission.record.heldAt),
                  ) && finish <= Date.parse(arm.original.run.startedAt)
              : start >= Date.parse(arm.original.run.endedAt)),
          "Snapshot chronology mismatch.",
        );
        const measured = await collectSealedMetricSnapshot({
          directory,
          manifest,
          treeSha256,
          protocol: p,
        });
        invariant(
          jsonDigest(measured.boundary) === jsonDigest(s.boundary),
          "Static measurement altered.",
        );
        const baselineV2 =
          p.schemaVersion === "prospective-tournament-metrics.v2" &&
          role === "baseline";
        invariant(
          baselineV2
            ? s.schemaVersion === "protected-metric-snapshot.local.v2"
            : s.schemaVersion === "protected-metric-snapshot.local.v1",
          "Metric snapshot applicability/version mismatch.",
        );
        const evaluationRunId =
          role === "baseline"
            ? source!.baselineEvaluationRunId
            : declared.runId!;
        invariant(
          (role !== "baseline" ||
            evaluationRunId ===
              (baselineV2
                ? arm.original.baselineRunId
                : metricBaselineEvaluationRunId(declared.runId!))) &&
            s.authorization.identity.runId === evaluationRunId &&
            s.authorization.identity.evaluatedTreeSha256 === treeSha256 &&
            s.authorization.identity.fixtureSha256 ===
              plan.manifest.fixtureSha256,
          "Protected observation source/run mismatch.",
        );
        const evaluation = await config.loadEvaluation(evaluationRunId);
        invariant(
          isTrustedEvaluation(evaluation) &&
            (role === "baseline"
              ? Date.parse(evaluation.receipt.finishedAt) <=
                Date.parse(arm.original.run.startedAt)
              : Date.parse(evaluation.receipt.startedAt) >=
                Date.parse(arm.original.run.startedAt)) &&
            Date.parse(evaluation.receipt.finishedAt) <=
              Date.parse(custody.record.heldAt),
          "Protected observation chronology mismatch.",
        );
        if (baselineV2) {
          const baselineOracle = plan.baselineOracle;
          invariant(
            evaluation.receipt.evaluatorSha256 ===
              baselineOracle.evaluatorSha256 &&
              evaluation.receipt.testSuiteSha256 ===
                baselineOracle.testSuiteSha256 &&
              evaluation.receipt.requiredPolicySha256 ===
                baselineOracle.requiredPolicySha256,
            "Personal baseline evaluator identity mismatch.",
          );
          observed.baseline = {
            treeSha256,
            boundary: measured.boundary,
            authorization: readMetricBaselineAuthorizationNotApplicable(
              s.authorization,
              p,
              evaluation,
            ),
          };
        } else {
          observed[role] = {
            treeSha256,
            boundary: measured.boundary,
            authorization: readProtectedAuthorizationCases(
              s.authorization,
              p,
              evaluation,
            ),
          };
        }
      }
      observedArms.push(observed);
    }
    const observations = MetricObservationsSchema.parse({
      ...observationFields,
      arms: observedArms,
    });
    // Canonical arm order is required, preventing duplicate or switched projections.
    invariant(
      jsonDigest(observations) === jsonDigest(original.observations) &&
        original.status === metricMeasurementStatus(p, observations),
      "Metric projection mismatch.",
    );
    const raw = calculateProspectiveMetrics(p, observations);
    const comparable = report.comparability === "COMPARABLE";
    const calculation = {
      ...raw,
      predictionAssessment: comparable
        ? raw.predictionAssessment
        : ("not_established" as const),
      abstentionReason: comparable
        ? raw.abstentionReason
        : "RUN_COMPARISON_NOT_ESTABLISHED",
      independentSamples: comparable ? raw.independentSamples : 0,
    };
    return immutable({
      authority: "AUTHENTICATED_SUPPLEMENTARY_METRICS" as const,
      evidenceOrigin: original.evidenceOrigin,
      studyId: p.studyId,
      hypothesisId: p.hypothesisId,
      contextSha256: p.contextSha256,
      protocolSha256: jsonDigest(p),
      originalSha256: held.sha256,
      registrationOriginalSha256: registered?.bindingOriginalSha256 ?? null,
      status: original.status,
      observations,
      calculation,
      predictionAssessment: calculation.predictionAssessment,
      comparability: report.comparability,
      attempts: report.attempts,
      preparationAttempts: report.preparationAttempts,
      effort: report.arms.map((a) => ({
        variant: a.variant,
        preparation: a.preparation,
        downstream: a.downstream,
        total: a.total,
      })),
      blockers: report.blockers,
      independentSamples: calculation.independentSamples,
    });
  }
  return Object.freeze({
    async load(assessmentAt = new Date().toISOString()) {
      try {
        UtcTimestampSchema.parse(assessmentAt);
        const first = await readOnce(assessmentAt);
        const second = await readOnce(assessmentAt);
        invariant(
          jsonDigest(first) === jsonDigest(second),
          "Metric originals changed during assessment.",
        );
        authenticated.add(second);
        return second;
      } catch {
        return null;
      } // Never leak private paths, cases, or diagnostics.
    },
  });
}
const authenticated = new WeakSet<object>();
export type AuthenticatedMetricObservation = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<typeof createProtectedMetricObservationReader>["load"]
    >
  >
>;
export function isAuthenticatedMetricObservation(
  value: unknown,
): value is AuthenticatedMetricObservation {
  return !!value && typeof value === "object" && authenticated.has(value);
}
