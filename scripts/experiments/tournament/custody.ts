// Private operator boundary. No signer, authority creation, discovery or web import.
import { createPublicKey, verify } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IdSchema,
  Sha256Schema,
  UtcTimestampSchema,
} from "../../../src/lib/contracts/common";
import { invariant } from "../../../src/lib/contracts/validation";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { sha256 } from "../../../src/lib/report/digests";
import { disjoint, privateDirectory, protectedRead } from "../artifacts/files";

export { CustodianRecordSchema } from "../../../src/lib/experiment/scientist-custody";
import {
  CustodianEnvelopeSchema as EnvelopeSchema,
  type CustodianRecord,
} from "../../../src/lib/experiment/scientist-custody";
export type { CustodianRecord } from "../../../src/lib/experiment/scientist-custody";
export type HeldRecord = Readonly<{ record: CustodianRecord; sha256: string }>;
export type CustodyConfig = {
  // Supplied only by independently reviewed operator composition, never a draft.
  originalRoot: string;
  publicKeyPem: string;
  publicKeySha256: string;
  revocationSha256: string;
  workspaceRoots: readonly string[];
  entries: ReadonlyMap<string, { file: string; sha256: string }>;
};
const trusted = new WeakSet<object>();
export function isHeldRecord(value: unknown): value is HeldRecord {
  return !!value && typeof value === "object" && trusted.has(value);
}
export function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

// Like the protected evaluation store, authority lives in trusted configuration.
// An externally pinned key AND original-byte allowlist are required. A signature
// from a draft-supplied key is never consulted. An empty catalog grants nothing.
export async function createStudyCustodyStore(input: CustodyConfig) {
  const config = {
    ...input,
    workspaceRoots: [...input.workspaceRoots],
    entries: new Map(input.entries),
  };
  const root = await privateDirectory(config.originalRoot);
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  disjoint(root, repository);
  disjoint(root, path.resolve(repository, "../AgentHarness-Planning"));
  invariant(
    config.workspaceRoots.length > 0,
    "Custody workspace inventory required.",
  );
  for (const workspace of config.workspaceRoots)
    disjoint(root, await realpath(workspace));
  invariant(
    sha256(config.publicKeyPem) === Sha256Schema.parse(config.publicKeySha256),
    "Authority key changed.",
  );
  const key = createPublicKey(config.publicKeyPem);
  invariant(
    key.asymmetricKeyType === "ed25519",
    "Exact Ed25519 authority required.",
  );
  Sha256Schema.parse(config.revocationSha256);
  const seenFiles = new Set<string>();
  const seenHashes = new Set<string>();
  const entries = new Map(
    [...config.entries].map(([id, value]) => {
      IdSchema.parse(id);
      invariant(
        /^[A-Za-z0-9_-]+\.json$/.test(value.file) &&
          !seenFiles.has(value.file) &&
          !seenHashes.has(value.sha256),
        "Reused custody record.",
      );
      seenFiles.add(value.file);
      seenHashes.add(value.sha256);
      return [
        id,
        immutable({
          file: value.file,
          sha256: Sha256Schema.parse(value.sha256),
        }),
      ] as const;
    }),
  );
  return Object.freeze({
    async load(id: string): Promise<HeldRecord | null> {
      try {
        const entry = entries.get(id);
        if (!entry) return null;
        await privateDirectory(root);
        const revocationBytes = await protectedRead(
          path.join(root, "revocations.json"),
        );
        invariant(
          sha256(revocationBytes) === config.revocationSha256,
          "Revocation state changed.",
        );
        const revocations = z
          .strictObject({ revokedIds: z.array(IdSchema).max(10000) })
          .parse(JSON.parse(revocationBytes.toString("utf8")));
        invariant(!revocations.revokedIds.includes(id), "Record revoked.");
        const bytes = await protectedRead(path.join(root, entry.file));
        invariant(
          sha256(bytes) === entry.sha256,
          "Original commitment altered.",
        );
        const { record, signature } = EnvelopeSchema.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
        invariant(
          record.id === id &&
            Date.parse(record.heldAt) < Date.parse(record.expiresAt),
          "Invalid original record.",
        );
        invariant(
          verify(
            null,
            Buffer.from(canonicalJson(record)),
            key,
            Buffer.from(signature, "base64"),
          ),
          "Unauthenticated custodian record.",
        );
        const held = immutable({ record, sha256: entry.sha256 });
        trusted.add(held);
        return held;
      } catch {
        return null;
      }
    },
  });
}
export function requireHeldRecord(
  value: unknown,
  expected: {
    studyId: string;
    kind: CustodianRecord["kind"];
    subjectSha256: string;
    predecessorSha256: string | null;
    at: string;
  },
): HeldRecord {
  invariant(
    isHeldRecord(value),
    "Original independent custody record required.",
  );
  const r = value.record;
  invariant(
    r.studyId === expected.studyId &&
      r.kind === expected.kind &&
      r.subjectSha256 === expected.subjectSha256 &&
      r.predecessorSha256 === expected.predecessorSha256,
    "Custody record binding mismatch.",
  );
  const at = Date.parse(UtcTimestampSchema.parse(expected.at));
  invariant(
    Date.parse(r.heldAt) <= at && at < Date.parse(r.expiresAt),
    "Custody record late or expired.",
  );
  return value;
}
