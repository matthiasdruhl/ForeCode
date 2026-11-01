import { usesPersonalMetricBaseline } from "../../../src/lib/experiment/prospective-metrics";
// Private source-owned orchestration. No signer, provider, CLI or web import.
import { invariant, sameIds } from "../../../src/lib/contracts/validation";
import { jsonDigest } from "../../../src/lib/report/digests";
import { matchedConditionsDigest } from "../../../src/lib/experiment/study-identities";
import { isAuthenticatedRegistration } from "../../../src/server/meta/registration-reader";
import {
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import { collectProtectedAuthorizationOriginal } from "../../evaluator/booking-v1/metric-authorization-collector";
import { TeamAuthorizationInstrumentationSchema } from "../../evaluator/booking-v1/team-authorization";
import { collectSealedMetricSnapshot } from "../../evaluator/booking-v1/metric-snapshot";
import { readProtectedAuthorizationCases } from "../../evaluator/booking-v1/metric-authorization";
import {
  baselineCheckIds,
  teamCheckIds,
} from "../../evaluator/booking-v1/grade-profile";
import type { MetricSnapshotOriginal } from "./metric-observation";
import { immutable, requireHeldRecord } from "./custody";
import { isPreparedStudy, type PreparedStudy } from "./study";
import { pairedRuntimeSubject, type Variant } from "./paired-inputs";
import {
  isLiveStagedRegistrationResolver,
  liveStagedRegistrationDeadline,
} from "./scientist-operator";

type Capture = {
  variant: Variant;
  directory: string;
  manifest: { path: string; sha256: string }[];
  treeSha256: string;
  evaluation: TrustedEvaluation;
  reloadEvaluation(): Promise<unknown>;
  authorizationExport: unknown;
};
type Reference = {
  custodyId: string;
  original: MetricSnapshotOriginal;
  directory: string;
};
const authentic = new WeakSet<object>();
const production = new WeakSet<object>();
export const isProductionRegisteredMeasurementSession = (
  value: unknown,
): value is RegisteredMeasurementSession =>
  !!value && typeof value === "object" && production.has(value);
export const isRegisteredMeasurementSession = (
  value: unknown,
): value is RegisteredMeasurementSession =>
  !!value && typeof value === "object" && authentic.has(value);

export async function createRegisteredMeasurementSession(options: {
  study: PreparedStudy;
  implementationSha256: string;
  instrumentation: unknown;
  resolveRegistration(): Promise<unknown>;
  pairedAdmissionIds: Readonly<Record<Variant, string>>;
  baselineEvaluationRunIds?: Readonly<Record<Variant, string>>;
  loadRecord(id: string): Promise<unknown>;
  // The real independent custodian holds exact documents through its existing
  // mechanism; these callbacks return only IDs for a fresh authenticated read.
  holdSnapshot(
    original: MetricSnapshotOriginal,
    predecessorSha256: string,
    signal: AbortSignal,
  ): Promise<string>;
  holdExecution(
    input: Readonly<{
      variant: Variant;
      runId: string;
      runtimeOriginalSha256: string;
      pairedAdmissionSha256: string;
    }>,
    signal: AbortSignal,
  ): Promise<string>;
  now?: () => number;
}) {
  invariant(
    isPreparedStudy(options.study),
    "Authenticated prepared study required.",
  );
  const study = options.study,
    now = options.now ?? Date.now;
  const wallClock = options.now === undefined;
  const { resolveRegistration, loadRecord, holdSnapshot, holdExecution } =
    options;
  const admissions = { ...options.pairedAdmissionIds },
    implementation = options.implementationSha256;
  const descriptor = immutable(
    TeamAuthorizationInstrumentationSchema.parse(options.instrumentation),
  );
  const first = await resolveRegistration();
  invariant(
    isAuthenticatedRegistration(first),
    "Live authenticated Scientist registration required.",
  );
  const bindingOriginalSha256 = first.bindingOriginalSha256;
  const expiresAt = Math.min(
    first.registration.expiresAt,
    liveStagedRegistrationDeadline(resolveRegistration) ??
      first.registration.expiresAt,
  );
  const protocol = first.metricProtocol;
  const baselineStaticOnly = usesPersonalMetricBaseline(protocol);
  const baselineEvaluationRunIds = options.baselineEvaluationRunIds
    ? immutable({ ...options.baselineEvaluationRunIds })
    : null;
  invariant(
    !baselineStaticOnly ||
      (baselineEvaluationRunIds &&
        baselineEvaluationRunIds.A !== baselineEvaluationRunIds.B &&
        Object.values(baselineEvaluationRunIds).every(
          (id) => !study.draft.plan.manifest.arms.some((a) => a.runId === id),
        )),
    "Personal-baseline protocol requires the exact existing public baseline run identities.",
  );
  const baseline = new Map<
    Variant,
    Reference & { reloadEvaluation(): Promise<unknown> }
  >();
  const finals = new Map<Variant, Reference>();
  const attempted = new Set<string>(),
    heldIds = new Set<string>();
  async function continuation<T>(
    work: (scoped: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const scoped = AbortSignal.any([
      signal,
      AbortSignal.timeout(
        Math.max(0, Math.min(expiresAt - now(), 2_147_483_647)),
      ),
    ]);
    invariant(!scoped.aborted, "Measurement continuation expired.");
    let abort!: () => void;
    const stopped = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("Measurement continuation stopped."));
      scoped.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([work(scoped), stopped]);
    } finally {
      scoped.removeEventListener("abort", abort);
    }
  }
  async function current(signal: AbortSignal) {
    invariant(!signal.aborted, "Measurement interrupted.");
    const registration = await resolveRegistration();
    invariant(
      isAuthenticatedRegistration(registration) &&
        registration.bindingOriginalSha256 === bindingOriginalSha256 &&
        jsonDigest(registration.metricProtocol) === jsonDigest(protocol) &&
        now() < registration.registration.expiresAt,
      "Live registration changed or expired.",
    );
    invariant(
      protocol.studyId === study.definition.protocol.studyId &&
        registration.registration.study.definitionSha256 ===
          jsonDigest(study.definition) &&
        registration.registration.study.protocolOriginalSha256 ===
          study.protocol.sha256 &&
        registration.lineage.studyProtocolSha256 ===
          jsonDigest(study.definition.protocol) &&
        registration.lineage.sourceManifestSha256 ===
          jsonDigest(study.evidence.originalManifest) &&
        registration.registration.registeredAt <
          Date.parse(study.evidence.selectionAt) &&
        protocol.taskSha256 === study.draft.taskDefinitionSha256 &&
        protocol.matchedConditionsSha256 ===
          matchedConditionsDigest(study.definition) &&
        protocol.evaluatorSha256 ===
          study.draft.plan.futureOracle.evaluatorSha256 &&
        protocol.suiteSha256 ===
          study.draft.plan.futureOracle.testSuiteSha256 &&
        protocol.policySha256 ===
          study.draft.plan.futureOracle.requiredPolicySha256 &&
        registration.lineage.variants.every((v) =>
          study.draft.plan.manifest.arms.some(
            (a) => a.variant === v.variant && a.runId === v.runId,
          ),
        ) &&
        sameIds(
          descriptor.cases.map((c) => c.caseId),
          protocol.authorizationCaseIds,
        ),
      "Registered measurement study mismatch.",
    );
    invariant(!signal.aborted, "Measurement interrupted.");
  }
  const arm = (variant: Variant) =>
    study.draft.plan.manifest.arms.find((a) => a.variant === variant)!;
  async function admission(variant: Variant) {
    return requireHeldRecord(await loadRecord(admissions[variant]), {
      studyId: protocol.studyId,
      kind: "runtime",
      subjectSha256: pairedRuntimeSubject(study, implementation, variant),
      predecessorSha256: study.prepared.sha256,
      at: new Date(now()).toISOString(),
    });
  }
  async function evaluation(
    value: unknown,
    variant: Variant,
    role: "baseline" | "final",
    tree: string,
  ) {
    const { metricBaselineEvaluationRunId } =
      await import("./metric-observation");
    invariant(
      isTrustedEvaluation(value),
      "Fresh protected measurement receipt required.",
    );
    const receipt = value.receipt;
    const personalBaseline = role === "baseline" && baselineStaticOnly;
    const oracle = personalBaseline
      ? study.draft.plan.baselineOracle
      : study.draft.plan.futureOracle;
    invariant(
      receipt.runId ===
        (role === "baseline"
          ? personalBaseline
            ? baselineEvaluationRunIds![variant]
            : metricBaselineEvaluationRunId(arm(variant).runId!)
          : arm(variant).runId) &&
        receipt.evaluatedTreeSha256 === tree &&
        receipt.fixtureSha256 === study.draft.plan.manifest.fixtureSha256 &&
        receipt.evaluatorSha256 === oracle.evaluatorSha256 &&
        receipt.testSuiteSha256 === oracle.testSuiteSha256 &&
        receipt.requiredPolicySha256 === oracle.requiredPolicySha256 &&
        sameIds(
          receipt.requiredCheckIds,
          personalBaseline ? [...baselineCheckIds] : [...teamCheckIds],
        ) &&
        (!personalBaseline || value.verification.verdict === "VERIFIED") &&
        Date.parse(receipt.finishedAt) <= now(),
      "Measurement receipt identity mismatch.",
    );
    return value;
  }
  async function hold(
    original: MetricSnapshotOriginal,
    predecessor: string,
    signal: AbortSignal,
  ) {
    const id = await continuation(
      (scoped) => holdSnapshot(immutable(original), predecessor, scoped),
      signal,
    );
    await current(signal);
    invariant(!heldIds.has(id), "Snapshot original reused.");
    const record = requireHeldRecord(await loadRecord(id), {
      studyId: protocol.studyId,
      kind: "telemetry",
      subjectSha256: jsonDigest(original),
      predecessorSha256: predecessor,
      at: new Date(now()).toISOString(),
    });
    invariant(
      Date.parse(original.finishedAt) <= Date.parse(record.record.heldAt) &&
        Date.parse(original.startedAt) <= Date.parse(original.finishedAt),
      "Snapshot custody precedes collection.",
    );
    heldIds.add(id);
    return id;
  }
  async function capture(
    input: Capture,
    role: "baseline" | "final",
    predecessor: string,
    signal: AbortSignal,
  ) {
    await current(signal);
    const receipt = await evaluation(
      await input.reloadEvaluation(),
      input.variant,
      role,
      input.treeSha256,
    );
    invariant(
      jsonDigest(receipt.receipt) === jsonDigest(input.evaluation.receipt),
      "Measurement receipt replaced.",
    );
    const {
      collectMetricSnapshotOriginal,
      createMetricBaselineAuthorizationNotApplicable,
    } = await import("./metric-observation");
    const authorization =
      role === "baseline" && baselineStaticOnly
        ? createMetricBaselineAuthorizationNotApplicable(protocol, receipt)
        : collectProtectedAuthorizationOriginal({
            instrumentation: descriptor,
            exported: input.authorizationExport,
            protocol,
            evaluation: receipt,
          });
    const original = await collectMetricSnapshotOriginal({
      protocol,
      variant: input.variant,
      runId: arm(input.variant).runId!,
      role,
      directory: input.directory,
      manifest: input.manifest,
      treeSha256: input.treeSha256,
      authorization,
      evaluation: receipt,
      clock: () => new Date(now()).toISOString(),
    });
    const custodyId = await hold(original, predecessor, signal);
    await current(signal);
    return {
      custodyId,
      original: immutable(original),
      directory: input.directory,
    };
  }
  await current(new AbortController().signal);
  const session = Object.freeze({
    protocol,
    definitionSha256: jsonDigest(study.definition),
    implementationSha256: implementation,
    baselineEvaluationRunIds,
    bindSignal: (signal: AbortSignal) =>
      AbortSignal.any([
        signal,
        AbortSignal.timeout(
          Math.max(0, Math.min(expiresAt - now(), 2_147_483_647)),
        ),
      ]),
    async captureBaseline(input: Capture, signal: AbortSignal) {
      const key = `baseline-${input.variant}`;
      invariant(
        !attempted.has(key),
        "Metric baseline attempt already consumed.",
      );
      attempted.add(key);
      invariant(
        input.treeSha256 === arm(input.variant).initialTreeSha256,
        "Metric baseline source changed.",
      );
      const paired = await admission(input.variant);
      const ref = await capture(input, "baseline", paired.sha256, signal);
      invariant(
        Date.parse(ref.original.startedAt) >=
          Math.max(
            Date.parse(study.prepared.record.heldAt),
            Date.parse(paired.record.heldAt),
          ),
        "Metric baseline preceded admission.",
      );
      invariant(
        ref.original.boundary.complete &&
          ref.original.boundary.unresolvedImports === 0,
        "Metric baseline boundary coverage incomplete.",
      );
      baseline.set(input.variant, {
        ...ref,
        reloadEvaluation: input.reloadEvaluation,
      });
    },
    async release(signal: AbortSignal) {
      await current(signal);
      invariant(
        baseline.size === 2,
        "Both independently held metric baselines required before dispatch.",
      );
      for (const variant of ["A", "B"] as const) {
        const ref = baseline.get(variant)!,
          paired = await admission(variant);
        requireHeldRecord(await loadRecord(ref.custodyId), {
          studyId: protocol.studyId,
          kind: "telemetry",
          subjectSha256: jsonDigest(ref.original),
          predecessorSha256: paired.sha256,
          at: new Date(now()).toISOString(),
        });
        const freshReceipt = await evaluation(
          await ref.reloadEvaluation(),
          variant,
          "baseline",
          ref.original.treeSha256,
        );
        if (baselineStaticOnly) {
          const { readMetricBaselineAuthorizationNotApplicable } =
            await import("./metric-observation");
          readMetricBaselineAuthorizationNotApplicable(
            ref.original.authorization,
            protocol,
            freshReceipt,
          );
        } else
          readProtectedAuthorizationCases(
            ref.original.authorization,
            protocol,
            freshReceipt,
          );
        invariant(
          ref.original.boundary.complete &&
            ref.original.boundary.unresolvedImports === 0,
          "Metric baseline boundary coverage incomplete.",
        );
        const sealed = await collectSealedMetricSnapshot({
          directory: ref.directory,
          manifest: ref.original.manifest,
          treeSha256: ref.original.treeSha256,
          protocol,
        });
        invariant(
          jsonDigest(sealed.boundary) === jsonDigest(ref.original.boundary),
          "Held metric baseline changed.",
        );
      }
      await current(signal);
    },
    async captureFinal(
      input: Capture & { runEndedAt: string; runtimeOriginalSha256: string },
      signal: AbortSignal,
    ) {
      await current(signal);
      invariant(
        Date.parse(input.runEndedAt) <= now(),
        "Final snapshot precedes terminal attempt.",
      );
      const key = `final-${input.variant}`;
      invariant(!attempted.has(key), "Metric final attempt already consumed.");
      attempted.add(key);
      const paired = await admission(input.variant);
      const executionId = await continuation(
        (scoped) =>
          holdExecution(
            immutable({
              variant: input.variant,
              runId: arm(input.variant).runId!,
              runtimeOriginalSha256: input.runtimeOriginalSha256,
              pairedAdmissionSha256: paired.sha256,
            }),
            scoped,
          ),
        signal,
      );
      await current(signal);
      const execution = requireHeldRecord(await loadRecord(executionId), {
        studyId: protocol.studyId,
        kind: "execution",
        subjectSha256: input.runtimeOriginalSha256,
        predecessorSha256: paired.sha256,
        at: new Date(now()).toISOString(),
      });
      invariant(
        Date.parse(execution.record.heldAt) >= Date.parse(input.runEndedAt),
        "Execution original predates terminal attempt.",
      );
      const ref = await capture(input, "final", execution.sha256, signal);
      invariant(
        Date.parse(ref.original.startedAt) >= Date.parse(input.runEndedAt),
        "Final snapshot preceded terminal attempt.",
      );
      finals.set(input.variant, ref);
    },
    references: () =>
      immutable({
        baseline: [...baseline].map(
          ([variant, { custodyId, original, directory }]) => ({
            variant,
            custodyId,
            original,
            directory,
          }),
        ),
        final: [...finals].map(([variant, ref]) => ({ variant, ...ref })),
      }),
  });
  authentic.add(session);
  if (wallClock && isLiveStagedRegistrationResolver(resolveRegistration))
    production.add(session);
  return session;
}
export type RegisteredMeasurementSession = Awaited<
  ReturnType<typeof createRegisteredMeasurementSession>
>;

// Called only after all runtime originals have been retained. Failure in one
// arm's independent custody must never suppress the other arm's observation.
export async function collectFinalMeasurementBatch(
  session: RegisteredMeasurementSession,
  captures: Parameters<RegisteredMeasurementSession["captureFinal"]>[0][],
  retainFailure: (variant: Variant, error: unknown) => Promise<void>,
  signal: AbortSignal,
) {
  invariant(
    isRegisteredMeasurementSession(session),
    "Registered measurement session required.",
  );
  const failures: Variant[] = [];
  for (const input of captures) {
    try {
      await session.captureFinal(
        input,
        AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
      );
    } catch (error) {
      failures.push(input.variant);
      try {
        await retainFailure(input.variant, error);
      } catch {
        /* Keep the failure even if diagnostic retention fails. */
      }
    }
  }
  return immutable(failures);
}
