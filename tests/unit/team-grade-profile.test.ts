import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import {
  bookingPolicy,
  freezeBooking,
} from "../../scripts/evaluator/booking-v1/freeze";
import {
  baselineCheckIds,
  selectedChecks,
  validateGradeInput,
  validateGradeReport,
  validateGradeReportForInput,
  teamTaskSha256,
  teamEvaluatorIdentity,
} from "../../scripts/evaluator/booking-v1/grade-profile";
import { futureTaskDigest } from "@/lib/experiment/future-task";
import {
  futurePolicy,
  prepareFutureEvaluation,
  prepareTeamGradeInput,
  validateTeamGradeObservation,
} from "../../scripts/evaluator/booking-v1/future";
import { teamGradeData } from "../support/team-grade-data";

describe("fixed grading profile and candidate data integrity", () => {
  it("validates a returned protected grade against full execution input without weakening strict identity", () => {
    const data = teamGradeData();
    // This reproduces the diagnostic wrapper's post-grading failure. TypeScript
    // structural assignability allows the call, but the runtime schema rejects
    // candidate, workerImage and evaluationProfile as extra identity keys.
    expect(() =>
      validateGradeReport(data.report, data.input, data.profile),
    ).toThrow();
    expect(
      validateGradeReportForInput(
        JSON.parse(JSON.stringify(data.report)),
        data.input,
      ),
    ).toEqual(data.report);
    const incomplete = {
      ...data.report,
      checks: data.report.checks.slice(0, 5),
    };
    expect(
      validateGradeReportForInput(incomplete, data.input).checks,
    ).toHaveLength(5);
    const failed = structuredClone(data.report);
    failed.checks[0] = { ...failed.checks[0]!, status: "fail", exitCode: 1 };
    expect(
      validateGradeReportForInput(failed, data.input).checks[0]?.status,
    ).toBe("fail");
  });
  it("binds wrapper observations to candidate bytes, all five identities and the selected profile", () => {
    const data = teamGradeData();
    for (const key of [
      "runId",
      "evaluatedTreeSha256",
      "evaluatorSha256",
      "testSuiteSha256",
      "requiredPolicySha256",
    ] as const)
      expect(() =>
        validateGradeReportForInput(
          {
            ...data.report,
            [key]:
              key === "runId"
                ? "11111111-1111-4111-8111-111111111111"
                : "0".repeat(64),
          },
          data.input,
        ),
      ).toThrow();
    const changed = structuredClone(data.input);
    changed.candidate.files[1]!.base64 =
      Buffer.from("substituted source").toString("base64");
    expect(() => validateGradeReportForInput(data.report, changed)).toThrow(
      "Candidate identity mismatch",
    );
    expect(() =>
      validateGradeReportForInput(
        { ...data.report, evaluationProfile: undefined },
        data.input,
      ),
    ).toThrow("Unexpected grading profile");
    expect(() =>
      validateGradeReportForInput(data.report, {
        ...data.input,
        ignored: true,
      }),
    ).toThrow();
  });
  it("keeps five baseline checks and requires all eight in the team policy", () => {
    const data = teamGradeData();
    expect(selectedChecks()).toEqual(bookingPolicy.requiredCheckIds);
    expect(selectedChecks(data.profile)).toHaveLength(8);
    expect(futureTaskDigest(data.draft.task)).toBe(teamTaskSha256);
    expect(
      validateGradeReport(data.report, data.identity, data.profile),
    ).toEqual(data.report);
    const baseline = {
      ...data.report,
      evaluationProfile: undefined,
      checks: data.report.checks.filter((item) =>
        (baselineCheckIds as readonly string[]).includes(item.id),
      ),
    };
    expect(validateGradeReport(baseline, data.identity).checks).toHaveLength(5);
    expect(() => validateGradeReport(data.report, data.identity)).toThrow(
      "profile",
    );
  });
  it("rejects unsupported checks/profiles and candidate-supplied verdicts/paths", () => {
    const data = teamGradeData();
    for (const raw of [
      { ...data.report, verdict: "VERIFIED" },
      { ...data.report, checks: [{ ...data.report.checks[0], id: "shell" }] },
      {
        ...data.report,
        evaluationProfile: { ...data.profile, modulePath: "/tmp/oracle.mjs" },
      },
      {
        ...data.report,
        evaluationProfile: { ...data.profile, kind: "arbitrary-task" },
      },
    ])
      expect(() =>
        validateGradeReport(raw, data.identity, data.profile),
      ).toThrow();
  });
  it.each([
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
    "evaluatedTreeSha256",
    "runId",
  ] as const)("rejects substituted report %s", (key) => {
    const data = teamGradeData();
    expect(() =>
      validateGradeReport(
        {
          ...data.report,
          [key]:
            key === "runId"
              ? "11111111-1111-4111-8111-111111111111"
              : "0".repeat(64),
        },
        data.identity,
        data.profile,
      ),
    ).toThrow();
  });
  it("rejects wrong task/policy/closure, duplicate checks and forged exit pairs", () => {
    const data = teamGradeData();
    for (const profile of [
      { ...data.profile, taskId: "other-task" },
      { ...data.profile, taskDefinitionSha256: "0".repeat(64) },
      { ...data.profile, requiredPolicySha256: "0".repeat(64) },
      { ...data.profile, baselineEvaluatorSha256: "0".repeat(64) },
    ])
      expect(() =>
        validateGradeInput({ ...data.input, evaluationProfile: profile }),
      ).toThrow();
    expect(() =>
      validateGradeReport(
        {
          ...data.report,
          checks: [data.report.checks[0], data.report.checks[0]],
        },
        data.identity,
        data.profile,
      ),
    ).toThrow("check set");
    expect(() =>
      validateGradeReport(
        { ...data.report, checks: [{ ...data.report.checks[0], exitCode: 1 }] },
        data.identity,
        data.profile,
      ),
    ).toThrow("status/exit");
  });
  it("validates exact source/run/lock before execution, including traversal and base64", () => {
    const data = teamGradeData();
    expect(validateGradeInput(data.input)).toEqual(data.input);
    const mutations = [
      (d: typeof data) => {
        d.input.candidate.files[1]!.base64 =
          Buffer.from("changed").toString("base64");
      },
      (d: typeof data) => {
        d.input.candidate.runId = "11111111-1111-4111-8111-111111111111";
      },
      (d: typeof data) => {
        d.input.candidate.files[0]!.path = "../escape";
      },
      (d: typeof data) => {
        d.input.candidate.files[0]!.base64 = "noncanonical!";
      },
      (d: typeof data) => {
        d.input.evaluationProfile!.dependencyLockSha256 = "0".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(data);
      mutate(altered);
      expect(() => validateGradeInput(altered.input)).toThrow();
    }
  });
  it("keeps missing checks incomplete rather than inferring pass from process completion", () => {
    const data = teamGradeData();
    const report = validateGradeReport(
      { ...data.report, checks: data.report.checks.slice(0, 5) },
      data.identity,
      data.profile,
    );
    expect(report.checks).toHaveLength(5);
    expect(() =>
      validateTeamGradeObservation(data.report, data.input, {
        ...data.request,
        descriptorSha256: "0".repeat(64),
      }),
    ).toThrow("request mismatch");
    expect(() =>
      validateTeamGradeObservation(data.report, data.input, {
        ...data.request,
        identity: { ...data.request.identity, requiredCheckIds: ["typecheck"] },
      }),
    ).toThrow("required checks");
  });
  it("prepares a data-only request using fresh public evaluator and real lock pins, rejecting stale dependencies", async () => {
    const data = teamGradeData();
    const pins = await freezeBooking();
    const descriptor = structuredClone(data.descriptor);
    descriptor.baselineOracle = {
      evaluatorSha256: pins.evaluatorSha256,
      testSuiteSha256: pins.testSuiteSha256,
      requiredPolicySha256: pins.requiredPolicySha256,
      requiredCheckIds: [...baselineCheckIds],
    };
    descriptor.oracle.evaluatorSha256 = teamEvaluatorIdentity(
      pins.evaluatorSha256,
      descriptor.oracle.testSuiteSha256,
    );
    descriptor.oracle.requiredPolicySha256 = jsonDigest(
      futurePolicy(data.draft.task, descriptor.baselineOracle),
    );
    const candidate = structuredClone(data.input.candidate);
    candidate.files[0]!.base64 = (
      await readFile("fixtures/booking-v1/package-lock.json")
    ).toString("base64");
    const tree = jsonDigest(
      candidate.files.map((file) => ({
        path: file.path,
        sha256: sha256(Buffer.from(file.base64, "base64")),
      })),
    );
    const request = prepareFutureEvaluation({
      descriptor,
      task: data.draft.task,
      runId: candidate.runId,
      evaluatedTreeSha256: tree,
      fixtureSha256: pins.fixtureSha256,
    });
    const prepared = await prepareTeamGradeInput({
      descriptor,
      task: data.draft.task,
      request,
      candidate,
      workerImage: data.input.workerImage,
    });
    expect(prepared.evaluationProfile?.dependencyLockSha256).toBe(
      pins.fixtureManifest.find((file) => file.path === "package-lock.json")!
        .sha256,
    );
    await expect(
      prepareTeamGradeInput({
        descriptor: data.descriptor,
        task: data.draft.task,
        request,
        candidate,
        workerImage: data.input.workerImage,
      }),
    ).rejects.toThrow("Stale public evaluator");
  });
});
