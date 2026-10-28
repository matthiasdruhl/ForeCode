import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleEvaluatorReceipt } from "../../evaluator/booking-v1/receipt";
import type { EvaluationIdentity } from "../../../src/server/artifacts/evaluation-store";
import type { CheckResultV1 } from "../../../src/lib/contracts/evidence";
import { sha256 } from "../../../src/lib/report/digests";
import type { GradeReport } from "../runner/protocol";

const kinds: Record<string, CheckResultV1["kind"]> = {
  typecheck: "typecheck",
  build: "build",
  "baseline-domain": "acceptance",
  "http-integration": "integration",
  boundary: "boundary",
};
// Invoked only by the local trusted controller after cleanup and freshness checks.
// Authority is protected OS custody + exact controller allowlist pins, not hashes.
export async function publishEvaluation(
  directory: string,
  identity: EvaluationIdentity,
  report: GradeReport,
  startedAt: string,
  finishedAt: string,
  runtimePins: Record<string, string>,
) {
  await mkdir(path.join(directory, "checks"), { mode: 0o700 });
  const checks: CheckResultV1[] = [];
  for (const id of identity.requiredCheckIds) {
    const observation = report.checks.find((check) => check.id === id) ?? {
      id,
      status: "not_run" as const,
      exitCode: null,
      detail: "Required check absent from protected grader observations.",
    };
    const evidencePath =
      observation.status === "not_run" ? null : `checks/${observation.id}.json`;
    const bytes = JSON.stringify({ observation, runtimePins });
    if (evidencePath)
      await writeFile(path.join(directory, evidencePath), bytes, {
        flag: "wx",
        mode: 0o400,
      });
    checks.push({
      schemaVersion: "check-result.v1",
      id: observation.id,
      runId: identity.runId,
      kind: kinds[observation.id]!,
      status: observation.status === "error" ? "invalid" : observation.status,
      exitCode: observation.exitCode,
      evidencePath,
      artifactSha256: evidencePath ? sha256(bytes) : null,
      scope: `Public booking baseline: ${observation.id}; exact frozen candidate only.`,
    });
  }
  const bundle = assembleEvaluatorReceipt({
    id: `receipt-${identity.runId}`,
    identity,
    checks,
    startedAt,
    finishedAt,
  });
  const bytes = JSON.stringify(bundle);
  const staging = path.join(directory, ".evaluation.pending");
  await writeFile(staging, bytes, { flag: "wx", mode: 0o400 });
  await link(staging, path.join(directory, "evaluation.json"));
  await unlink(staging);
  // Local registration record only. The hosted app has no registration route.
  const entry = {
    directory: path.basename(directory),
    bundleSha256: sha256(bytes),
    identity,
  };
  await writeFile(
    path.join(directory, "allowlist-entry.json"),
    JSON.stringify(entry),
    { flag: "wx", mode: 0o400 },
  );
  return entry;
}
