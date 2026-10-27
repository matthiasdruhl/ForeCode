// Fresh synthetic protected records. Never imported by production source.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  CheckResultV1,
  EvaluatorReceiptV1,
} from "@/lib/contracts/evidence";
import type { RecordingRegistration } from "@/server/artifacts/recorded-verification";
import { createProtectedEvaluationStore } from "@/server/artifacts/evaluation-store";
import {
  checkArtifactDigest,
  receiptManifestDigest,
  sha256,
} from "@/lib/report/digests";
import {
  check,
  evaluationIdentity,
  experimentRun,
  time,
} from "./research-data";

export const privateSentinel = "PRIVATE_SENTINEL_NOT_FOR_DISPLAY";
export const syntheticRegistration = (): RecordingRegistration => ({
  metadata: {
    id: "synthetic-recording",
    evaluationId: "synthetic-evaluation",
    runId: "run-unit",
    receiptId: "receipt-unit",
    verificationId: "verify-receipt-unit",
    title: "Synthetic protected recording — test only",
    scope: "Synthetic fixed check acceptance only.",
    category: "infrastructure_acceptance",
    checks: [
      {
        id: "regression",
        label: "Synthetic regression",
        description: "Approved synthetic regression description.",
        publishArtifactDigest: true,
      },
      {
        id: "baseline",
        label: "Synthetic baseline",
        description: "Approved synthetic baseline description.",
        publishArtifactDigest: true,
      },
    ],
    publicIdentities: [
      "manifestSha256",
      "evaluatedTreeSha256",
      "fixtureSha256",
      "evaluatorSha256",
      "testSuiteSha256",
      "requiredPolicySha256",
      "checkArtifactSha256",
    ],
    publicMetrics: [
      "elapsedMs",
      "tokens",
      "costUsd",
      "iterations",
      "filesTouched",
    ],
    limitations: ["Synthetic records for tests only; never real measurements."],
  },
  run: {
    ...experimentRun(),
    isolationAttestationId: null,
    limitations: [privateSentinel],
  },
});

export async function syntheticRecordingFixture(
  cleanup: string[],
  results: CheckResultV1[] = [check("baseline"), check("regression")],
) {
  const parent = await mkdtemp(path.join(tmpdir(), "forecode-recorded-unit-"));
  cleanup.push(parent);
  const root = path.join(parent, "protected");
  const workspace = path.join(parent, "workspace");
  const directory = path.join(root, "synthetic");
  await mkdir(path.join(directory, "checks"), { recursive: true });
  await mkdir(workspace);
  const checks = structuredClone(results);
  for (const result of checks) {
    result.scope = `${privateSentinel} hidden-case description`;
    if (result.evidencePath !== null) {
      result.evidencePath = `checks/${privateSentinel}-${result.id}.json`;
      const bytes = JSON.stringify({
        stdout: privateSentinel,
        stderr: "private diagnostic",
        testBody: "private test contents",
        credentials: "synthetic-secret-token",
      });
      result.artifactSha256 = sha256(bytes);
      await writeFile(path.join(directory, result.evidencePath), bytes);
    }
  }
  const identity = evaluationIdentity();
  const receipt: EvaluatorReceiptV1 = {
    schemaVersion: "evaluator-receipt.v1",
    id: "receipt-unit",
    ...identity,
    checkArtifactSha256: checkArtifactDigest(checks),
    startedAt: time,
    finishedAt: time,
    issuer: "trusted-local-evaluator",
    integrity: {
      kind: "trusted-local-artifact",
      manifestSha256: "0".repeat(64),
    },
  };
  receipt.integrity.manifestSha256 = receiptManifestDigest(receipt);
  const bundle = { receipt, checks };
  const bytes = JSON.stringify(bundle);
  await writeFile(path.join(directory, "evaluation.json"), bytes);
  const store = {
    root,
    agentWorkspaceRoot: workspace,
    entries: new Map([
      [
        "synthetic-evaluation",
        { directory: "synthetic", identity, bundleSha256: sha256(bytes) },
      ],
    ]),
  };
  return {
    parent,
    directory,
    bundle,
    config: { recordings: [syntheticRegistration()], store },
    trusted: async () =>
      (await createProtectedEvaluationStore(store)).load(
        "synthetic-evaluation",
      ),
  };
}
