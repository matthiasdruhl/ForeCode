import "server-only";
import { CustodianEnvelopeSchema } from "@/lib/experiment/scientist-custody";
import { jsonDigest } from "@/lib/report/digests";
import { constants } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import {
  PublicationArtifactSchema,
  DisclosureEnvelopeSchema,
  disclosureSubject,
} from "@/lib/experiment/tournament-publication";
import { canonicalJson } from "@/lib/report/canonical";
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
const authorizationTelemetryFailures = new WeakSet<object>();
// Only a negative supplementary-channel fact escapes authenticated check bytes.
// This never changes the receipt, required checks or deterministic verdict.
export function hasAuthorizationTelemetryFailure(value: unknown): boolean {
  return (
    isTrustedEvaluation(value) && authorizationTelemetryFailures.has(value)
  );
}
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
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
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
        let authorizationTelemetryFailed = false;
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
            if (check.id.startsWith("team-permissions-")) {
              try {
                const raw = JSON.parse(artifact.toString("utf8"));
                if (
                  typeof raw?.observation?.detail === "string" &&
                  raw.observation.detail.endsWith(
                    " Authorization telemetry unavailable.",
                  )
                )
                  authorizationTelemetryFailed = true;
              } catch {
                // Historical opaque evidence remains valid for its old verdict.
              }
            }
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
        if (authorizationTelemetryFailed)
          authorizationTelemetryFailures.add(result);
        return result;
      } catch {
        return null;
      } // No raw paths, private test diagnostics or parse errors escape.
    },
  });
}

// Fixed read-only publication custody inside the sole reviewed filesystem
// boundary. No arbitrary file names, uploads, discovery, runner or public API.
export type TournamentPublicationEntry = {
  directory: string;
  publicationSha256: string;
  disclosureId: string;
  disclosureSha256: string;
};
type PublicationArtifact = ReturnType<typeof PublicationArtifactSchema.parse>;
export type TrustedTournamentPublication = Readonly<{
  artifact: PublicationArtifact;
  disclosureId: string;
  disclosureHeldAt: string;
}>;
const authenticatedPublications = new WeakSet<object>();
export function isTrustedTournamentPublication(
  value: unknown,
): value is TrustedTournamentPublication {
  return (
    !!value && typeof value === "object" && authenticatedPublications.has(value)
  );
}
async function privateRoot(input: string) {
  const root = await realpath(input),
    stat = await lstat(root);
  invariant(
    root === path.resolve(input) &&
      stat.isDirectory() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 0o077) === 0,
    "Invalid private publication custody.",
  );
  return root;
}
async function publicationRead(
  base: string,
  relative: string,
  privateMode = false,
) {
  const filename = path.join(base, relative),
    before = await lstat(filename);
  invariant(
    before.isFile() &&
      before.nlink === 1 &&
      before.uid === process.getuid?.() &&
      (before.mode & 0o222) === 0 &&
      (!privateMode || (before.mode & 0o777) === 0o400),
    "Publication original custody invalid.",
  );
  const bytes = await boundedRead(base, relative),
    after = await lstat(filename);
  invariant(
    before.ino === after.ino &&
      before.dev === after.dev &&
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs,
    "Publication original changed during read.",
  );
  return bytes;
}

export async function createProtectedTournamentPublicationStore(config: {
  root: string;
  authorityRoot: string;
  agentWorkspaceRoots: readonly string[];
  authorityPublicKeyPem: string;
  authorityPublicKeySha256: string;
  revocationSha256: string;
  entries: ReadonlyMap<string, TournamentPublicationEntry>;
}) {
  const root = await privateRoot(config.root),
    authorityRoot = await privateRoot(config.authorityRoot);
  const separate = (a: string, b: string) =>
    invariant(
      !within(a, b) && !within(b, a),
      "Overlapping publication custody.",
    );
  separate(root, authorityRoot);
  const repository = process.cwd();
  for (const directory of [root, authorityRoot]) {
    separate(directory, repository);
    separate(directory, path.resolve(repository, "../AgentHarness-Planning"));
  }
  invariant(
    config.agentWorkspaceRoots.length > 0,
    "Complete workspace inventory required.",
  );
  for (const input of config.agentWorkspaceRoots) {
    const workspace = await realpath(input);
    separate(root, workspace);
    separate(authorityRoot, workspace);
  }
  const authorityPem = config.authorityPublicKeyPem,
    revocationSha256 = Sha256Schema.parse(config.revocationSha256);
  invariant(
    sha256(authorityPem) ===
      Sha256Schema.parse(config.authorityPublicKeySha256),
    "Authority changed.",
  );
  const key = createPublicKey(authorityPem);
  invariant(
    key.asymmetricKeyType === "ed25519",
    "Exact publication authority required.",
  );
  const entries = new Map<string, TournamentPublicationEntry>();
  const originals = new Set<string>();
  for (const [id, value] of config.entries) {
    IdSchema.parse(id);
    IdSchema.parse(value.directory);
    IdSchema.parse(value.disclosureId);
    Sha256Schema.parse(value.publicationSha256);
    Sha256Schema.parse(value.disclosureSha256);
    invariant(
      !originals.has(value.disclosureId),
      "Reused disclosure original.",
    );
    originals.add(value.disclosureId);
    entries.set(id, deepFreeze({ ...value }));
  }
  return Object.freeze({
    async load(
      id: string,
      now = Date.now(),
    ): Promise<TrustedTournamentPublication | null> {
      const entry = entries.get(id);
      if (!entry) return null;
      try {
        await privateRoot(root);
        await privateRoot(authorityRoot);
        const bytes = await publicationRead(
          root,
          `${entry.directory}/tournament-publication.json`,
        );
        invariant(
          sha256(bytes) === entry.publicationSha256,
          "Publication changed.",
        );
        const artifact = PublicationArtifactSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
        const original = await publicationRead(
          authorityRoot,
          `${entry.disclosureId}/disclosure-original.json`,
        );
        invariant(
          sha256(original) === entry.disclosureSha256,
          "Disclosure original changed.",
        );
        const { record, signature } = DisclosureEnvelopeSchema.parse(
          JSON.parse(original.toString("utf8")),
        );
        const revocations = await publicationRead(
          authorityRoot,
          "revocations.json",
        );
        invariant(
          sha256(revocations) === revocationSha256,
          "Disclosure revocation state changed.",
        );
        const revoked = z
          .strictObject({ revokedIds: z.array(IdSchema).max(10000) })
          .parse(JSON.parse(revocations.toString("utf8")));
        invariant(
          !revoked.revokedIds.includes(record.id) &&
            record.id === entry.disclosureId &&
            record.studyId === artifact.projection.studyId &&
            record.studyId === id &&
            record.predecessorSha256 ===
              artifact.projection.preparedOriginalSha256 &&
            record.subjectSha256 === disclosureSubject(artifact) &&
            Date.parse(record.heldAt) <= now &&
            now < Date.parse(record.expiresAt),
          "Disclosure stale, revoked or mismatched.",
        );
        invariant(
          verify(
            null,
            Buffer.from(canonicalJson(record)),
            key,
            Buffer.from(signature, "base64"),
          ),
          "Unauthenticated disclosure.",
        );
        const loaded = deepFreeze({
          artifact,
          disclosureId: record.id,
          disclosureHeldAt: record.heldAt,
        });
        authenticatedPublications.add(loaded);
        return loaded;
      } catch {
        return null;
      }
    },
  });
}

// Registration uses the SAME independently pinned Ed25519 custody envelopes as
// the operator. Only fixed allowlisted files can be read; no signing or writes.
export type ScientistCustodyConfig = {
  originalRoot: string;
  publicKeyPem: string;
  publicKeySha256: string;
  revocationSha256: string;
  workspaceRoots: readonly string[];
  entries: ReadonlyMap<
    string,
    {
      file: string;
      sha256: string;
      documentFile: string;
      documentSha256: string;
    }
  >;
};
export async function createProtectedScientistCustodyStore(
  input: ScientistCustodyConfig,
) {
  const root = await privateRoot(input.originalRoot);
  const separate = (other: string) =>
    invariant(
      !within(root, other) && !within(other, root),
      "Overlapping scientist custody.",
    );
  separate(process.cwd());
  separate(path.resolve(process.cwd(), "../AgentHarness-Planning"));
  invariant(input.workspaceRoots.length > 0, "Workspace inventory required.");
  for (const workspace of input.workspaceRoots)
    separate(await realpath(workspace));
  const pem = input.publicKeyPem;
  invariant(
    sha256(pem) === Sha256Schema.parse(input.publicKeySha256),
    "Authority changed.",
  );
  const key = createPublicKey(pem);
  invariant(
    key.asymmetricKeyType === "ed25519",
    "Exact custody authority required.",
  );
  const revocationSha256 = Sha256Schema.parse(input.revocationSha256);
  const files = new Set(["revocations.json"]),
    hashes = new Set<string>();
  invariant(input.entries.size <= 256, "Excessive scientist originals.");
  const entries = new Map(
    [...input.entries].map(([id, value]) => {
      IdSchema.parse(id);
      const entry = { ...value };
      for (const [file, hash] of [
        [entry.file, entry.sha256],
        [entry.documentFile, entry.documentSha256],
      ] as const) {
        invariant(
          /^[A-Za-z0-9_-]+\.json$/.test(file) &&
            !files.has(file) &&
            !hashes.has(hash),
          "Duplicate or unsafe original.",
        );
        files.add(file);
        hashes.add(Sha256Schema.parse(hash));
      }
      return [id, deepFreeze(entry)] as const;
    }),
  );
  return Object.freeze({
    async load(id: string) {
      try {
        const entry = entries.get(id);
        if (!entry) return null;
        await privateRoot(root);
        const revocations = await publicationRead(
          root,
          "revocations.json",
          true,
        );
        invariant(
          sha256(revocations) === revocationSha256,
          "Revocation state changed.",
        );
        const revoked = z
          .strictObject({ revokedIds: z.array(IdSchema).max(10000) })
          .parse(JSON.parse(revocations.toString("utf8")));
        invariant(!revoked.revokedIds.includes(id), "Original revoked.");
        const bytes = await publicationRead(root, entry.file, true);
        const documentBytes = await publicationRead(
          root,
          entry.documentFile,
          true,
        );
        invariant(
          sha256(bytes) === entry.sha256 &&
            sha256(documentBytes) === entry.documentSha256,
          "Original bytes changed.",
        );
        const { record, signature } = CustodianEnvelopeSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
        const document: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(documentBytes),
        );
        invariant(
          record.id === id &&
            record.subjectSha256 === jsonDigest(document) &&
            Date.parse(record.heldAt) < Date.parse(record.expiresAt),
          "Original subject mismatch.",
        );
        invariant(
          verify(
            null,
            Buffer.from(canonicalJson(record)),
            key,
            Buffer.from(signature, "base64"),
          ),
          "Unauthenticated custody original.",
        );
        return deepFreeze({ record, sha256: entry.sha256, document });
      } catch {
        return null;
      }
    },
  });
}
