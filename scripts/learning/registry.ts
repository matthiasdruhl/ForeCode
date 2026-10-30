import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import {
  Sha256Schema,
  UtcTimestampSchema,
} from "../../src/lib/contracts/common";
import { invariant } from "../../src/lib/contracts/validation";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest } from "../../src/lib/report/digests";
import {
  disjoint,
  privateDirectory,
  protectedRead,
} from "../experiments/artifacts/files";
import { parsePolicy, type PolicyArtifact } from "./policy";
import { createSnapshot, isSnapshot, type Snapshot } from "./dataset";
import type { AdmittedObservation } from "./intake";

// Private deterministic local storage. Caller creates a separate mode-0700
// directory. No CLI accepts uploads and no web code can reach this module.
export async function openLearningRegistry(directory: string) {
  const root = await privateDirectory(directory);
  const repository = new URL("../../", import.meta.url);
  const { fileURLToPath } = await import("node:url");
  disjoint(root, fileURLToPath(repository));
  disjoint(
    root,
    path.resolve(fileURLToPath(repository), "../AgentHarness-Planning"),
  );
  async function write(kind: string, hash: string, value: unknown) {
    await privateDirectory(root);
    const file = path.join(
      root,
      kind + "-" + Sha256Schema.parse(hash) + ".json",
    );
    const bytes = canonicalJson(value);
    try {
      const handle = await open(
        file,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o400,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
      invariant(
        (await protectedRead(file)).toString("utf8") === bytes,
        "Immutable artifact conflict.",
      );
    }
    return hash;
  }
  async function read(kind: string, hash: string): Promise<unknown> {
    await privateDirectory(root);
    const bytes = await protectedRead(
      path.join(root, kind + "-" + Sha256Schema.parse(hash) + ".json"),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  async function loadPolicy(hash: string) {
    const artifact = parsePolicy(await read("policy", hash));
    invariant(artifact.sha256 === hash, "Registry identity mismatch.");
    return artifact;
  }
  return Object.freeze({
    async savePolicy(artifact: PolicyArtifact) {
      const a = parsePolicy(artifact);
      if (a.policy.parentSha256) {
        const parent = await loadPolicy(a.policy.parentSha256);
        invariant(
          a.policy.version === parent.policy.version + 1 &&
            a.policy.origin === parent.policy.origin &&
            a.policy.trainerSha256 === parent.policy.trainerSha256 &&
            jsonDigest(a.policy.config) === jsonDigest(parent.policy.config),
          "Policy ancestry mismatch.",
        );
      }
      return write("policy", a.sha256, a);
    },
    loadPolicy,
    async saveSnapshot(snapshot: Snapshot) {
      invariant(isSnapshot(snapshot), "Authenticated snapshot required.");
      return write("dataset", snapshot.sha256, snapshot.manifest);
    },
    async loadSnapshot(
      hash: string,
      freshlyAdmitted: readonly AdmittedObservation[],
    ) {
      const snapshot = createSnapshot(
        await read("dataset", hash),
        freshlyAdmitted,
      );
      invariant(snapshot.sha256 === hash, "Dataset digest mismatch.");
      return snapshot;
    },
    async rollback(from: string, to: string, at: string) {
      UtcTimestampSchema.parse(at);
      let current = await loadPolicy(from);
      const target = await loadPolicy(to);
      const visited = new Set<string>();
      while (current.sha256 !== target.sha256) {
        invariant(
          !visited.has(current.sha256) && current.policy.parentSha256 !== null,
          "Rollback target is not an ancestor.",
        );
        visited.add(current.sha256);
        current = await loadPolicy(current.policy.parentSha256);
      }
      const event = { schemaVersion: "learning-rollback.v1", from, to, at };
      const eventSha256 = jsonDigest(event);
      await write("rollback", eventSha256, event);
      return { artifact: target, eventSha256 };
    },
  });
}
