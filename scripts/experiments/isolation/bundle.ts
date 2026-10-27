// Preparation only: exact trusted allowlist, no Docker/sbx/process invocation.
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { freezeBooking } from "../../evaluator/booking-v1/freeze";
import { controllerFiles } from "../../evaluator/booking-v1/installed";
import { protectedRead, disjoint } from "../artifacts/files";
import { sha256, jsonDigest } from "../../../src/lib/report/digests";
const project = fileURLToPath(new URL("../../../", import.meta.url));
export const runtimeBundleInputs = [
  ...controllerFiles.map((name) => ({
    source: `scripts/evaluator/booking-v1/${name}`,
    target: `controller/${name}`,
  })),
  ...["Dockerfile", "package.json", "package-lock.json", ".dockerignore"].map(
    (name) => ({
      source: `scripts/evaluator/booking-v1/toolchain/${name}`,
      target: `toolchain/${name}`,
    }),
  ),
  {
    source: "scripts/experiments/isolation/installed-smoke.py",
    target: "installed-smoke.py",
  },
  {
    source: "scripts/experiments/isolation/runtime-files.py",
    target: "runtime-files.py",
  },
  {
    source: "scripts/experiments/isolation/toolchain-audit.mjs",
    target: "toolchain-audit.mjs",
  },
];

export async function prepareRuntimeBundle(destination: string) {
  if (!path.isAbsolute(destination))
    throw new Error("Absolute new bundle destination required");
  disjoint(destination, path.resolve(project, "../AgentHarness-Planning"));
  const parent = await realpath(path.dirname(destination));
  if (parent !== path.dirname(destination))
    throw new Error("Bundle parent alias forbidden");
  disjoint(project, destination);
  const before = await freezeBooking();
  await mkdir(destination, { mode: 0o700 });
  const files: { path: string; sha256: string; bytes: number }[] = [];
  for (const file of runtimeBundleInputs) {
    const bytes = await protectedRead(
      path.join(project, file.source),
      2_097_152,
    );
    if (
      before.evaluatorManifest.find((f) => f.path === file.source)?.sha256 !==
      sha256(bytes)
    )
      throw new Error("Trusted bundle source changed");
    await mkdir(path.dirname(path.join(destination, file.target)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(path.join(destination, file.target), bytes, {
      mode: 0o400,
      flag: "wx",
    });
    files.push({
      path: file.target,
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  }
  if ((await freezeBooking()).evaluatorSha256 !== before.evaluatorSha256)
    throw new Error("Implementation changed during bundling");
  const manifest = {
    schemaVersion: "booking-trusted-runtime-bundle.v1",
    implementationSha256: before.evaluatorSha256,
    fixtureSha256: before.fixtureSha256,
    testSuiteSha256: before.testSuiteSha256,
    requiredPolicySha256: before.requiredPolicySha256,
    files,
    filesSha256: jsonDigest(files),
    toolingContext: "toolchain/",
    installedRuntime: null,
    imageDigest: null,
    executionStatus: "NOT_RUN",
    installationStatus: "NOT_INSTALLED",
    note: "Owner must bind actual image ID/repository digest, Node/lock/dependency tree and controller bytes using runtime-files.py and reviewed inventory. Null fields are not admission evidence.",
  };
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o400, flag: "wx" },
  );
  return manifest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { output: { type: "string" } },
    strict: true,
  });
  if (!values.output) throw new Error("--output required");
  process.stdout.write(
    JSON.stringify(await prepareRuntimeBundle(values.output), null, 2) + "\n",
  );
}
