import { readFile } from "node:fs/promises";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { immutable } from "../experiments/tournament/custody";
import { TrainerSourceSchema } from "./shadow-contracts";

// Fixed reviewed source inventory; no CLI paths, source discovery, oracle or
// executable loading. A checksum is lineage, not a signature or release gate.
const files = [
  "package-lock.json",
  "src/lib/contracts/common.ts",
  "src/lib/contracts/validation.ts",
  "src/lib/report/canonical.ts",
  "src/lib/report/digests.ts",
  "src/lib/learning/contracts.ts",
  "src/lib/learning/features.ts",
  "scripts/learning/intake.ts",
  "scripts/learning/source.ts",
  "scripts/learning/ledger.ts",
  "scripts/learning/dataset.ts",
  "scripts/learning/reward.ts",
  "scripts/learning/policy.ts",
  "scripts/learning/registry.ts",
  "scripts/learning/shadow-contracts.ts",
  "scripts/learning/shadow.ts",
  "scripts/learning/trainer-identity.ts",
] as const;

export async function learningTrainerIdentity() {
  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      sha256: sha256(await readFile(new URL("../../" + file, import.meta.url))),
    })),
  );
  const manifest = immutable(
    TrainerSourceSchema.parse({
      schemaVersion: "learning-trainer-source.local.v1",
      node: process.version,
      sources,
    }),
  );
  return immutable({ manifest, sha256: jsonDigest(manifest) });
}
