// Source packaging only. No installation, policy/authority generation or runtime.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRuntimeBundle } from "../isolation/bundle";
import { protectedRead } from "../artifacts/files";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { sha256 } from "../../../src/lib/report/digests";
const extras = [
  {
    source: "scripts/experiments/agent/team-config.toml",
    target: "team/agent/config.toml",
  },
  {
    source: "scripts/experiments/agent/team-supervisor.py",
    target: "team/agent/team-supervisor.py",
  },
  {
    source: "scripts/evaluator/booking-v1/team-profile-inventory.ts",
    target: "team/controller/team-profile-inventory.ts",
  },
  {
    source: "scripts/experiments/isolation/team-runtime-files.py",
    target: "team/team-runtime-files.py",
  },
] as const;
export async function prepareTeamRuntimeBundle(destination: string) {
  // The reviewed base packager validates a new disjoint canonical private root.
  const baseline = await prepareRuntimeBundle(destination);
  const project = fileURLToPath(new URL("../../../", import.meta.url));
  const files = [];
  for (const file of extras) {
    const bytes = await protectedRead(path.join(project, file.source));
    await mkdir(path.dirname(path.join(destination, file.target)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(path.join(destination, file.target), bytes, {
      flag: "wx",
      mode: 0o400,
    });
    files.push({
      path: file.target,
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  }
  if ((await freezeBooking()).evaluatorSha256 !== baseline.implementationSha256)
    throw new Error("Team bundle source changed.");
  const manifest = {
    schemaVersion: "supervised-team-source-bundle.local.v1",
    implementationSha256: baseline.implementationSha256,
    baseManifestSha256: sha256(
      await protectedRead(path.join(destination, "manifest.json")),
    ),
    files,
    execution: "NOT_RUN",
    installation: "NOT_INSTALLED",
    admission: "NOT_ADMITTED",
    privatePolicy: "EXCLUDED_REQUIRES_INDEPENDENT_OPERATOR_CUSTODY",
  };
  await writeFile(
    path.join(destination, "team-manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx", mode: 0o400 },
  );
  return manifest;
}
