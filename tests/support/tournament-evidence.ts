// Test-owned originals only. Authentic loader integrity is not real execution.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../../src/lib/report/digests";
import { assembleEvaluatorReceipt } from "../../scripts/evaluator/booking-v1/receipt";
import {
  createProtectedEvaluationStore,
  type EvaluationIdentity,
} from "../../src/server/artifacts/evaluation-store";
import { check } from "./research-data";
export async function syntheticEvaluation(input: {
  root: string;
  workspace: string;
  identity: EvaluationIdentity;
  startedAt: string;
  finishedAt: string;
  fail?: string;
  missing?: string;
}) {
  const { identity } = input,
    directory = identity.runId;
  await mkdir(path.join(input.root, directory, "checks"), {
    recursive: true,
    mode: 0o700,
  });
  const checks = identity.requiredCheckIds
    .filter((id) => id !== input.missing)
    .map((id) => ({
      ...check(id, id === input.fail ? "fail" : "pass"),
      runId: identity.runId,
    }));
  for (const observed of checks) {
    const bytes = JSON.stringify({
      evidenceOrigin: "synthetic",
      checkId: observed.id,
    });
    observed.artifactSha256 = sha256(bytes);
    await writeFile(
      path.join(input.root, directory, observed.evidencePath!),
      bytes,
      { mode: 0o400 },
    );
  }
  const bundle = assembleEvaluatorReceipt({
    id: `receipt-${identity.runId}`,
    identity,
    checks,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  });
  const bytes = JSON.stringify(bundle);
  await writeFile(path.join(input.root, directory, "evaluation.json"), bytes, {
    mode: 0o400,
  });
  const entry = { directory, bundleSha256: sha256(bytes), identity };
  const store = await createProtectedEvaluationStore({
    root: input.root,
    agentWorkspaceRoot: input.workspace,
    entries: new Map([[identity.runId, entry]]),
  });
  return { store, entry, loaded: await store.load(identity.runId) };
}
