import "server-only";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CheckResultV1Schema,
  EvaluatorReceiptV1Schema,
  VerificationV1Schema,
  type CheckResultV1,
  type EvaluatorReceiptV1,
  type VerificationV1,
} from "@/lib/contracts/evidence";
import { IdSchema, Sha256Schema, ids } from "@/lib/contracts/common";
import {
  invariant,
  normalizedPath,
  orderedTime,
  sameIds,
  unique,
} from "@/lib/contracts/validation";
import {
  checkArtifactDigest,
  receiptManifestDigest,
  sha256,
} from "@/lib/report/digests";
import { verdictForAuthenticatedChecks } from "@/lib/verify/results";

const MAX_ARTIFACT_BYTES = 1_048_576;
const BundleSchema = z.strictObject({
  receipt: EvaluatorReceiptV1Schema,
  checks: z.array(CheckResultV1Schema).max(100),
});
export const EvaluationIdentitySchema = z.strictObject({
  runId: IdSchema,
  evaluatedTreeSha256: Sha256Schema,
  fixtureSha256: Sha256Schema,
  evaluatorSha256: Sha256Schema,
  testSuiteSha256: Sha256Schema,
  requiredPolicySha256: Sha256Schema,
  requiredCheckIds: ids(64, 1),
});
export type EvaluationIdentity = z.infer<typeof EvaluationIdentitySchema>;
export type EvaluationAllowlistEntry = {
  directory: string;
  bundleSha256: string;
  identity: EvaluationIdentity;
};
declare const authenticatedEvaluation: unique symbol;
export type TrustedEvaluation = Readonly<{
  receipt: EvaluatorReceiptV1;
  checks: CheckResultV1[];
  verification: VerificationV1;
  [authenticatedEvaluation]: true;
}>;
const authenticatedObjects = new WeakSet<object>();
export function isTrustedEvaluation(
  value: unknown,
): value is TrustedEvaluation {
  return (
    typeof value === "object" &&
    value !== null &&
    authenticatedObjects.has(value)
  );
}

function within(root: string, location: string): boolean {
  const relative = path.relative(root, location);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
async function boundedRead(root: string, relative: string): Promise<Buffer> {
  normalizedPath(relative);
  const target = path.resolve(root, relative);
  invariant(within(root, target), "Artifact escapes protected root.");
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    invariant(
      !(await lstat(cursor)).isSymbolicLink(),
      "Artifact symlinks are not allowed.",
    );
  }
  invariant(
    within(root, await realpath(target)),
    "Artifact resolves outside protected root.",
  );
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    invariant(
      stat.isFile() && stat.size <= MAX_ARTIFACT_BYTES,
      "Artifact is not a bounded regular file.",
    );
    const buffer = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const result = await handle.read(
        buffer,
        used,
        buffer.length - used,
        null,
      );
      if (result.bytesRead === 0) break;
      used += result.bytesRead;
    }
    invariant(used <= MAX_ARTIFACT_BYTES, "Artifact exceeds size limit.");
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Instantiate only from trusted server/operator configuration. There is no web
// endpoint to add entries, choose a root, upload a receipt, or supply freshness pins.
export async function createProtectedEvaluationStore(config: {
  root: string;
  agentWorkspaceRoot: string;
  entries: ReadonlyMap<string, EvaluationAllowlistEntry>;
}) {
  const root = await realpath(config.root);
  const workspace = await realpath(config.agentWorkspaceRoot);
  invariant(
    !within(workspace, root) && !within(root, workspace),
    "Protected artifacts and agent workspace must be disjoint.",
  );
  const entries = new Map<string, EvaluationAllowlistEntry>();
  for (const [id, input] of config.entries) {
    IdSchema.parse(id);
    IdSchema.parse(input.directory);
    Sha256Schema.parse(input.bundleSha256);
    const entry = {
      directory: input.directory,
      bundleSha256: input.bundleSha256,
      identity: EvaluationIdentitySchema.parse(input.identity),
    };
    unique(entry.identity.requiredCheckIds, "pinned required check IDs");
    entries.set(id, deepFreeze(entry));
  }
  return Object.freeze({
    async load(id: string): Promise<TrustedEvaluation | null> {
      const entry = entries.get(id);
      if (!entry) return null;
      try {
        const bytes = await boundedRead(
          root,
          `${entry.directory}/evaluation.json`,
        );
        invariant(
          sha256(bytes) === entry.bundleSha256,
          "Artifact differs from controller allowlist.",
        );
        const { receipt, checks } = BundleSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
        const expected = entry.identity;
        for (const key of [
          "runId",
          "evaluatedTreeSha256",
          "fixtureSha256",
          "evaluatorSha256",
          "testSuiteSha256",
          "requiredPolicySha256",
        ] as const)
          invariant(
            receipt[key] === expected[key],
            "Stale evaluator identity.",
          );
        invariant(
          sameIds(receipt.requiredCheckIds, expected.requiredCheckIds),
          "Required policy differs from trusted pin.",
        );
        unique(
          checks.map((check) => check.id),
          "check IDs",
        );
        orderedTime(receipt.startedAt, receipt.finishedAt);
        invariant(
          receipt.checkArtifactSha256 === checkArtifactDigest(checks) &&
            receipt.integrity.manifestSha256 === receiptManifestDigest(receipt),
          "Canonical artifact digest mismatch.",
        );
        for (const check of checks) {
          invariant(
            check.runId === receipt.runId,
            "Cross-run check substitution.",
          );
          if (check.evidencePath !== null) {
            const artifact = await boundedRead(
              root,
              `${entry.directory}/${check.evidencePath}`,
            );
            invariant(
              check.artifactSha256 !== null &&
                sha256(artifact) === check.artifactSha256,
              "Check evidence bytes changed.",
            );
          }
        }
        const verification = VerificationV1Schema.parse({
          schemaVersion: "verification.v1",
          id: `verify-${receipt.id}`.slice(0, 128),
          runId: receipt.runId,
          verdict: verdictForAuthenticatedChecks(
            checks,
            expected.requiredCheckIds,
          ),
          requiredCheckIds: expected.requiredCheckIds,
          checks,
          receiptId: receipt.id,
          origin: "trusted_evaluator",
          scope:
            "Only the pinned required checks on the evaluated source tree.",
          limitations: [
            "Receipt custody and source identity do not establish experiment fairness, model benefit or sandbox containment.",
          ],
        });
        const result = deepFreeze({
          receipt,
          checks,
          verification,
        }) as TrustedEvaluation;
        authenticatedObjects.add(result);
        return result;
      } catch {
        return null;
      } // No raw paths, private test diagnostics or parse errors escape.
    },
  });
}
