// Actual validators with disposable originals/inert trees; no guest or provider.
import { randomUUID } from "node:crypto";
import { chmod, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonDigest } from "@/lib/report/digests";
import {
  createRegisteredMeasurementSession,
  isRegisteredMeasurementSession,
  isProductionRegisteredMeasurementSession,
  collectFinalMeasurementBatch,
} from "../../scripts/experiments/tournament/registered-measurement";
import { createStudyCustodyStore } from "../../scripts/experiments/tournament/custody";
import { metricBaselineEvaluationRunId } from "../../scripts/experiments/tournament/metric-observation";
import { authorizationInstrumentationDigest } from "../../scripts/evaluator/booking-v1/team-authorization";
import {
  teamOnlyCheckIds,
  teamCheckIds,
} from "../../scripts/evaluator/booking-v1/grade-profile";
import {
  captureReviewedTree,
  freezeCandidate,
} from "../../scripts/experiments/artifacts/files";
import { measuredFixture } from "../support/tournament-measured";
import { publicationFixture } from "../support/tournament-publication";
import { scientistHarness } from "../support/scientist-harness";
import { syntheticEvaluation } from "../support/tournament-evidence";
import { removeMetricFixture } from "../support/protected-metrics";
import type { TrustedEvaluation } from "@/server/artifacts/evaluation-store";
vi.mock("@/lib/foresight/booking-context", async (original) => ({
  ...(await original<typeof import("@/lib/foresight/booking-context")>()),
  bookingGraph: {
    ...(await original<typeof import("@/lib/foresight/booking-context")>())
      .bookingGraph,
    repoCommit: "1".repeat(40),
  },
}));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeMetricFixture(root);
});
async function seal(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory()) await seal(path.join(directory, entry.name));
  await chmod(directory, 0o500);
}
async function fixture(
  v2 = false,
  fullFixture = false,
  assetMode: "valid" | "wrong" | "legacy" = "valid",
) {
  const full = fullFixture
    ? await (
        await import("../support/complete-booking-source")
      ).completeBookingSource()
    : null;
  const f = await measuredFixture({ sourceFiles: full?.files });
  roots.push(f.parent);
  const publication = await publicationFixture({}, f);
  const h = await scientistHarness(publication, {
    schemaVersion:
      fullFixture && assetMode !== "legacy"
        ? "prospective-tournament-metrics.v3"
        : v2
          ? "prospective-tournament-metrics.v2"
          : "prospective-tournament-metrics.v1",
    ...(v2
      ? { baselineAuthorization: "not_applicable_before_future_requirement" }
      : {}),
    externalPackages: full
      ? ["react", "next", "server-only", "zod", "node:crypto"]
      : [],
    stylesheetPaths: full ? ["src/app/style.css"] : [],
    ...(full && assetMode !== "legacy"
      ? {
          staticAssets: [
            {
              path: "src/app/icon.svg",
              sha256:
                assetMode === "wrong"
                  ? "0".repeat(64)
                  : full.manifest.find((f) => f.path === "src/app/icon.svg")!
                      .sha256,
            },
          ],
        }
      : {}),
    boundaryRules: full
      ? [
          {
            id: "http-store",
            from: "src/server/http.ts",
            to: "src/server/booking-store.ts",
          },
        ]
      : [{ id: "self", from: "src/service.ts", to: "src/service.ts" }],
    authorizationCaseIds: f.study.definition.protocol.task.acceptance.map(
      (c) => c.id,
    ),
    observationWindow: "prepared_baseline_and_sealed_final_tree",
    duplicatePolicy: "one_resolved_edge_or_case_per_arm_snapshot",
    prediction: "B_fewer_final_forbidden_edges_than_A",
  });
  await h.service.register(h.registration.id, h.issued.hypothesis.id);
  h.advance(Date.parse("2026-10-28T12:05:50.000Z") - h.now());
  const descriptor = {
    schemaVersion: "booking-team-authorization-instrumentation.v1",
    semanticsSha256: "a".repeat(64),
    cases: h.commitment.measurementPlan.authorizationCaseIds as string[],
  };
  const instrumentation = {
    ...descriptor,
    cases: descriptor.cases.map((caseId) => ({
      caseId,
      checkId: "team-permissions-domain",
    })),
  };
  const instrumentationSha256 =
    authorizationInstrumentationDigest(instrumentation);
  function exported(evaluation: TrustedEvaluation) {
    const {
      runId,
      evaluatedTreeSha256,
      evaluatorSha256,
      testSuiteSha256,
      requiredPolicySha256,
    } = evaluation.receipt;
    const identity = {
      runId,
      evaluatedTreeSha256,
      evaluatorSha256,
      testSuiteSha256,
      requiredPolicySha256,
    };
    return {
      schemaVersion: "booking-team-authorization-export.v1",
      identity,
      instrumentationSha256,
      journalSha256: "b".repeat(64),
      groups: teamOnlyCheckIds.map((checkId) => ({
        schemaVersion: "booking-team-authorization-checkpoint.v1",
        identity,
        instrumentationSha256,
        checkId,
        ordinal: 0,
        finalized: true,
        complete: true,
        groupOutcome: "pass",
        cases:
          checkId === "team-permissions-domain"
            ? descriptor.cases.map((caseId) => ({ caseId, outcome: "pass" }))
            : [],
      })),
    };
  }
  let mode = "valid";
  const heldIds: string[] = [];
  const options: Parameters<typeof createRegisteredMeasurementSession>[0] = {
    study: f.study,
    implementationSha256: f.observations[0]!.implementationSha256,
    instrumentation,
    now: h.now,
    resolveRegistration: () =>
      h.service.resolveRegistered(h.registration.id, h.issued.hypothesis.id),
    pairedAdmissionIds: {
      A: f.loaded[0]!.admission.record.id,
      B: f.loaded[1]!.admission.record.id,
    },
    ...(v2
      ? {
          baselineEvaluationRunIds: {
            A: f.observations[0]!.baselineRunId,
            B: f.observations[1]!.baselineRunId,
          },
        }
      : {}),
    loadRecord: async (id) =>
      (await createStudyCustodyStore(f.config)).load(id),
    holdSnapshot: async (original, predecessorSha256) => {
      if (mode === "missing") return "absent-snapshot";
      const id = `dispatch-snapshot-${randomUUID()}`;
      heldIds.push(id);
      await f.hold({
        id,
        studyId: f.study.definition.protocol.studyId,
        kind: "telemetry",
        subjectSha256:
          mode === "misbound" ? "f".repeat(64) : jsonDigest(original),
        predecessorSha256,
        heldAt: new Date(h.now()).toISOString(),
        ...(["expired", "short"].includes(mode)
          ? { expiresAt: new Date(h.now() + 20).toISOString() }
          : {}),
      });
      if (mode === "expired") h.advance(21);
      return id;
    },
    holdExecution: async (input) =>
      f.loaded.find((a) => a.variant === input.variant)!.originalRecord.record
        .id,
  };
  async function capture(variant: "A" | "B") {
    const i = variant === "A" ? 0 : 1,
      arm = f.study.draft.plan.manifest.arms[i]!;
    const runId = v2
      ? f.observations[i]!.baselineRunId
      : metricBaselineEvaluationRunId(arm.runId!);
    const evaluation = v2
      ? f.evaluations.get(runId)!
      : await syntheticEvaluation({
          root: f.evaluationRoot,
          workspace: f.workspace,
          identity: {
            runId,
            evaluatedTreeSha256: arm.initialTreeSha256,
            fixtureSha256: f.study.draft.plan.manifest.fixtureSha256,
            evaluatorSha256: f.study.draft.plan.futureOracle.evaluatorSha256,
            testSuiteSha256: f.study.draft.plan.futureOracle.testSuiteSha256,
            requiredPolicySha256:
              f.study.draft.plan.futureOracle.requiredPolicySha256,
            requiredCheckIds: [...teamCheckIds],
          },
          startedAt: "2026-10-28T12:05:35.000Z",
          finishedAt: "2026-10-28T12:05:40.000Z",
        });
    await seal(f.sources[variant]);
    return {
      variant,
      directory: f.sources[variant],
      manifest:
        variant === "A"
          ? f.study.evidence.originalManifest
          : f.study.evidence.preparedManifest,
      treeSha256: arm.initialTreeSha256,
      evaluation: evaluation.loaded!,
      reloadEvaluation: () => evaluation.store.load(runId),
      authorizationExport: v2 ? null : exported(evaluation.loaded!),
    };
  }
  return {
    f,
    h,
    options,
    capture,
    exported,
    heldIds,
    mode: (value: string) => {
      mode = value;
    },
  };
}
describe("registered measurement release lifecycle (synthetic originals only)", () => {
  it("v3 authenticates full 22-file fixture captures and both held baselines before release without faking production admission", async () => {
    const x = await fixture(true, true),
      session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    expect(isProductionRegisteredMeasurementSession(session)).toBe(false);
    await session.captureBaseline(await x.capture("A"), signal);
    await expect(session.release(signal)).rejects.toThrow(
      "Both independently held",
    );
    await session.captureBaseline(await x.capture("B"), signal);
    await session.release(signal);
    for (const ref of session.references().baseline) {
      expect(ref.original.manifest).toHaveLength(22);
      expect(ref.original).toMatchObject({
        schemaVersion: "protected-metric-snapshot.local.v3",
        boundary: { complete: true, unresolvedImports: 0 },
        authorization: { kind: "not_applicable_before_future_requirement" },
      });
      expect(
        await (await createStudyCustodyStore(x.f.config)).load(ref.custodyId),
      ).not.toBeNull();
    }
  });
  it.each(["wrong", "legacy"] as const)(
    "retains a genuinely held but rejected full-fixture %s snapshot without granting release",
    async (assetMode) => {
      const x = await fixture(true, true, assetMode),
        session = await createRegisteredMeasurementSession(x.options),
        signal = new AbortController().signal;
      await expect(
        session.captureBaseline(await x.capture("A"), signal),
      ).rejects.toThrow("coverage");
      expect(x.heldIds).toHaveLength(1);
      expect(
        await (await createStudyCustodyStore(x.f.config)).load(x.heldIds[0]!),
      ).not.toBeNull();
      expect(session.references().baseline).toEqual([]);
      await expect(session.release(signal)).rejects.toThrow(
        "Both independently held",
      );
    },
  );
  it("v2 releases exact static plus personal5 baselines while future-feature authorization remains not applicable", async () => {
    const x = await fixture(true),
      session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    await session.captureBaseline(await x.capture("A"), signal);
    await session.captureBaseline(await x.capture("B"), signal);
    await session.release(signal);
    for (const reference of session.references().baseline)
      expect(reference.original).toMatchObject({
        schemaVersion: "protected-metric-snapshot.local.v2",
        role: "baseline",
        authorization: { kind: "not_applicable_before_future_requirement" },
      });
    expect(
      session.references().baseline[0]!.original.authorization,
    ).not.toHaveProperty("cases");
  });
  it("requires both authentic same-suite snapshots before releasing dispatch and retains final execution lineage", async () => {
    const x = await fixture(),
      session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    expect(isRegisteredMeasurementSession(session)).toBe(true);
    expect(isProductionRegisteredMeasurementSession(session)).toBe(false);
    expect(
      isRegisteredMeasurementSession(structuredClone(session.protocol)),
    ).toBe(false);
    await session.captureBaseline(await x.capture("A"), signal);
    await expect(session.release(signal)).rejects.toThrow(
      "Both independently held",
    );
    await session.captureBaseline(await x.capture("B"), signal);
    await expect(session.release(signal)).resolves.toBeUndefined();
    expect(session.references().baseline).toHaveLength(2);
    x.h.advance(5 * 60_000);
    const original = x.f.observations[0]!,
      finalRun = original.run.id;
    const initial = await captureReviewedTree(x.f.sources.A, finalRun);
    const candidate = {
      runId: finalRun,
      files: initial.files.map((file) =>
        file.path === "src/service.ts"
          ? {
              ...file,
              base64: Buffer.from("// inert final A").toString("base64"),
            }
          : file,
      ),
    };
    const sealed = await freezeCandidate(
      candidate,
      finalRun,
      path.join(x.f.parent, "dispatch-final-A"),
      initial,
    );
    await seal(sealed.directory);
    const future = x.f.evaluations.get(finalRun)!;
    await session.captureFinal(
      {
        variant: "A",
        directory: sealed.directory,
        manifest: sealed.manifest,
        treeSha256: sealed.treeSha256,
        evaluation: future.loaded!,
        reloadEvaluation: () => future.store.load(finalRun),
        authorizationExport: x.exported(future.loaded!),
        runEndedAt: original.run.endedAt,
        runtimeOriginalSha256: jsonDigest(original),
      },
      signal,
    );
    expect(session.references().final).toHaveLength(1);
  });
  it.each(["missing", "expired", "misbound"])(
    "withholds dispatch when baseline custody is %s",
    async (mode) => {
      const x = await fixture();
      x.mode(mode);
      const session = await createRegisteredMeasurementSession(x.options),
        signal = new AbortController().signal,
        agent = vi.fn();
      await expect(
        session.captureBaseline(await x.capture("A"), signal),
      ).rejects.toThrow();
      await expect(session.release(signal).then(agent)).rejects.toThrow();
      expect(agent).not.toHaveBeenCalled();
    },
  );
  it("rejects schema-shaped registration instead of current service issuance", async () => {
    const x = await fixture();
    x.options.resolveRegistration = async () => x.h.binding;
    await expect(createRegisteredMeasurementSession(x.options)).rejects.toThrow(
      "Live authenticated",
    );
  });
  it("does not turn unobserved or partial authorization cases into a baseline release", async () => {
    const x = await fixture(),
      session = await createRegisteredMeasurementSession(x.options),
      input = await x.capture("A");
    const raw = input.authorizationExport;
    raw!.groups[0]!.complete = false;
    await expect(
      session.captureBaseline(input, new AbortController().signal),
    ).rejects.toThrow("Incomplete protected");
    expect(x.heldIds).toHaveLength(0);
  });
  it("freshly refuses a held baseline after expiry before paid dispatch", async () => {
    const x = await fixture();
    x.mode("short");
    const session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    await session.captureBaseline(await x.capture("A"), signal);
    await session.captureBaseline(await x.capture("B"), signal);
    await session.release(signal);
    x.h.advance(21);
    await expect(session.release(signal)).rejects.toThrow();
  });
  it("rejects a different fresh receipt with the same run/source identity after snapshot holding", async () => {
    const x = await fixture(),
      session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    const first = await x.capture("A");
    let current: unknown = first.evaluation;
    first.reloadEvaluation = async () => current as TrustedEvaluation;
    await session.captureBaseline(first, signal);
    await session.captureBaseline(await x.capture("B"), signal);
    const { receipt } = first.evaluation;
    const replacement = await syntheticEvaluation({
      root: path.join(x.f.parent, "replacement-receipt"),
      workspace: x.f.workspace,
      identity: {
        runId: receipt.runId,
        evaluatedTreeSha256: receipt.evaluatedTreeSha256,
        fixtureSha256: receipt.fixtureSha256,
        evaluatorSha256: receipt.evaluatorSha256,
        testSuiteSha256: receipt.testSuiteSha256,
        requiredPolicySha256: receipt.requiredPolicySha256,
        requiredCheckIds: receipt.requiredCheckIds,
      },
      startedAt: receipt.startedAt,
      finishedAt: receipt.finishedAt,
      fail: "team-permissions-domain",
    });
    current = replacement.loaded;
    await expect(session.release(signal)).rejects.toThrow(
      "Protected authorization identity mismatch",
    );
  });
  it("retains both runtime originals and attempts B final custody after A final custody fails", async () => {
    const x = await fixture(),
      calls: string[] = [];
    x.options.holdExecution = async (input) => {
      for (const original of x.f.observations)
        expect(
          await readFile(
            path.join(
              x.f.runtimeRoot,
              original.run.id,
              "runtime-observation.json",
            ),
            "utf8",
          ),
        ).toContain(original.run.id);
      calls.push(input.variant);
      if (input.variant === "A")
        throw new Error("Synthetic independent custody declined.");
      return x.f.loaded[1]!.originalRecord.record.id;
    };
    const session = await createRegisteredMeasurementSession(x.options),
      signal = new AbortController().signal;
    await session.captureBaseline(await x.capture("A"), signal);
    await session.captureBaseline(await x.capture("B"), signal);
    x.h.advance(5 * 60_000);
    const inputs = [];
    for (const variant of ["A", "B"] as const) {
      const i = variant === "A" ? 0 : 1,
        original = x.f.observations[i]!,
        runId = original.run.id;
      const source = await captureReviewedTree(x.f.sources[variant], runId);
      const candidate = {
        runId,
        files: source.files.map((file) =>
          file.path === "src/service.ts"
            ? {
                ...file,
                base64: Buffer.from(`// inert final ${variant}`).toString(
                  "base64",
                ),
              }
            : file,
        ),
      };
      const sealed = await freezeCandidate(
        candidate,
        runId,
        path.join(x.f.parent, `batch-final-${variant}`),
        source,
      );
      await seal(sealed.directory);
      const future = x.f.evaluations.get(runId)!;
      inputs.push({
        variant,
        directory: sealed.directory,
        manifest: sealed.manifest,
        treeSha256: sealed.treeSha256,
        evaluation: future.loaded!,
        reloadEvaluation: () => future.store.load(runId),
        authorizationExport: x.exported(future.loaded!),
        runEndedAt: original.run.endedAt,
        runtimeOriginalSha256: jsonDigest(original),
      });
    }
    const retained = vi.fn(async () => {});
    expect(
      await collectFinalMeasurementBatch(session, inputs, retained, signal),
    ).toEqual(["A"]);
    expect(calls).toEqual(["A", "B"]);
    expect(session.references().final.map((ref) => ref.variant)).toEqual(["B"]);
    expect(retained).toHaveBeenCalledTimes(1);
  });
});
