// Newly authored synthetic unit inputs. These are never demo measurements.
import type { ResearchContext } from "@/lib/contracts/validation";
import { confirmIntent } from "@/lib/intents/lifecycle";
import type { CheckResultV1, ExperimentRunV1 } from "@/lib/contracts/evidence";
import type { EvaluationIdentity } from "@/server/artifacts/evaluation-store";

export const time = "2026-10-26T21:00:00.000Z";
export const commit = "1".repeat(40);
export const hash = (digit: string) => digit.repeat(64);
export function researchContext(): ResearchContext {
  return {
    intents: [
      confirmIntent(
        {
          title: "Shared room access",
          statement: "Allow approved team members to see shared room bookings.",
          priority: "high",
          horizon: "near",
        },
        "intent-access",
        new Date(time),
      ),
    ],
    graph: {
      schemaVersion: "graph.v1",
      id: "graph-booking",
      repoCommit: commit,
      modules: [
        { id: "service", path: "src/service.ts", kind: "source" },
        { id: "route", path: "src/route.ts", kind: "route" },
      ],
      edges: [{ from: "route", to: "service", kind: "static_import" }],
      unknowns: [],
    },
    candidates: [
      {
        schemaVersion: "architecture-candidate.v1",
        id: "baseline",
        label: "Direct owner checks",
        baselineCommit: commit,
        description: "Keep the current owner checks in the service.",
        changePlan: [],
        constraints: [],
        estimatedUpfrontCost: 0,
        estimatedCostUnit: "modeled_effort_points_v1",
        metaProvenance: "template",
        modelId: null,
        promptVersion: "unit-1",
        limitations: [],
      },
      {
        schemaVersion: "architecture-candidate.v1",
        id: "policy",
        label: "Explicit access policy",
        baselineCommit: commit,
        description: "Introduce one policy boundary in the existing service.",
        changePlan: [
          {
            module: "src/service.ts",
            action: "introduce_boundary",
            rationale: "Separate the access decision.",
          },
        ],
        constraints: [],
        estimatedUpfrontCost: 3,
        estimatedCostUnit: "modeled_effort_points_v1",
        metaProvenance: "template",
        modelId: null,
        promptVersion: "unit-1",
        limitations: ["This is a synthetic test proposal."],
      },
    ],
    scenarios: [
      {
        schemaVersion: "scenario.v1",
        id: "shared-rooms",
        origin: "developer_confirmed",
        intentIds: ["intent-access"],
        request: "Allow approved members to view shared bookings.",
        assumptions: [],
        acceptanceIds: ["membership-read"],
        frozen: true,
        baselineCommit: commit,
      },
    ],
  };
}
export function evaluationIdentity(): EvaluationIdentity {
  return {
    runId: "run-unit",
    evaluatedTreeSha256: hash("2"),
    fixtureSha256: hash("3"),
    evaluatorSha256: hash("4"),
    testSuiteSha256: hash("5"),
    requiredPolicySha256: hash("6"),
    requiredCheckIds: ["baseline", "regression"],
  };
}
export function check(
  id: string,
  status: CheckResultV1["status"] = "pass",
): CheckResultV1 {
  const observed = status === "pass" || status === "fail";
  return {
    schemaVersion: "check-result.v1",
    id,
    runId: "run-unit",
    kind: "acceptance",
    status,
    exitCode: observed ? (status === "pass" ? 0 : 1) : null,
    evidencePath: observed ? `checks/${id}.json` : null,
    scope: "Synthetic unit-test check.",
    artifactSha256: observed ? hash("7") : null,
  };
}
export function experimentRun(): ExperimentRunV1 {
  const identity = evaluationIdentity();
  return {
    schemaVersion: "experiment-run.v1",
    id: identity.runId,
    variant: "A",
    status: "completed",
    repoCommit: commit,
    evaluatedTreeSha256: identity.evaluatedTreeSha256,
    fixtureSha256: identity.fixtureSha256,
    agentConfigSha256: hash("8"),
    evaluatorSha256: identity.evaluatorSha256,
    requiredPolicySha256: identity.requiredPolicySha256,
    isolationAttestationId: "synthetic-unit-attestation",
    seed: 5,
    startedAt: time,
    endedAt: time,
    verificationId: "verify-receipt-unit",
    receiptId: "receipt-unit",
    metrics: {
      elapsedMs: null,
      tokens: null,
      costUsd: null,
      iterations: null,
      filesTouched: null,
    },
    evidenceOrigin: "none",
    presentationMode: "recorded",
    limitations: ["Synthetic unit fixture, never experiment evidence."],
  };
}
