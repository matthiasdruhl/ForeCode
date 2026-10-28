import { randomUUID } from "node:crypto";
import { jsonDigest, sha256 } from "@/lib/report/digests";
import { futureStudyData } from "./future-study-data";
import { prepareFutureEvaluation } from "../../scripts/evaluator/booking-v1/future";
import {
  selectedChecks,
  teamEvaluatorIdentity,
  type GradeInput,
  type GradeReport,
  type TeamGradeProfile,
} from "../../scripts/evaluator/booking-v1/grade-profile";

// Inert data/observations only. None of these source bytes are ever executed.
export const syntheticOracleBytes =
  "export const evidenceOrigin = 'synthetic transport sample; not an oracle';\n";
export function teamGradeData() {
  const draft = futureStudyData();
  const descriptor = draft.futureOracle;
  descriptor.oracle.testSuiteSha256 = sha256(syntheticOracleBytes);
  descriptor.oracle.evaluatorSha256 = teamEvaluatorIdentity(
    descriptor.baselineOracle.evaluatorSha256,
    descriptor.oracle.testSuiteSha256,
  );
  const files = [
    {
      path: "package-lock.json",
      base64: Buffer.from("synthetic lock").toString("base64"),
    },
    {
      path: "src/inert.ts",
      base64: Buffer.from("// synthetic bytes; never execute\n").toString(
        "base64",
      ),
    },
  ];
  const tree = jsonDigest(
    files.map((file) => ({
      path: file.path,
      sha256: sha256(Buffer.from(file.base64, "base64")),
    })),
  );
  const request = prepareFutureEvaluation({
    descriptor,
    task: draft.task,
    runId: randomUUID(),
    evaluatedTreeSha256: tree,
    fixtureSha256: draft.plan.manifest.fixtureSha256,
  });
  const profile: TeamGradeProfile = {
    kind: "booking-team-permissions.v1",
    taskId: "booking-team-permissions-v1",
    taskDefinitionSha256:
      descriptor.taskDefinitionSha256 as TeamGradeProfile["taskDefinitionSha256"],
    descriptorSha256: request.descriptorSha256,
    fixtureSha256: request.identity.fixtureSha256,
    dependencyLockSha256: sha256("synthetic lock"),
    baselineEvaluatorSha256: descriptor.baselineOracle.evaluatorSha256,
    evaluatorSha256: descriptor.oracle.evaluatorSha256,
    testSuiteSha256: descriptor.oracle.testSuiteSha256,
    requiredPolicySha256: descriptor.oracle.requiredPolicySha256,
  };
  const identity = {
    runId: request.identity.runId,
    evaluatedTreeSha256: tree,
    evaluatorSha256: profile.evaluatorSha256,
    testSuiteSha256: profile.testSuiteSha256,
    requiredPolicySha256: profile.requiredPolicySha256,
  };
  const input: GradeInput = {
    ...identity,
    workerImage: `sha256:${"a".repeat(64)}`,
    candidate: { runId: identity.runId, files },
    evaluationProfile: profile,
  };
  const report: GradeReport = {
    schemaVersion: "booking-grade-observation.v1",
    ...identity,
    evaluationProfile: profile,
    checks: selectedChecks(profile).map((id) => ({
      id,
      status: "pass",
      exitCode: 0,
      detail: "Synthetic transport observation; no candidate execution.",
    })),
  };
  return { draft, descriptor, request, input, profile, report, identity };
}
