import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { snapshotTree } from "./snapshot";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";

// Preparation only: never imports/executes fixture code or starts a process.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = await snapshotTree(path.join(root, "fixtures/booking-v1"));
const evaluator = await snapshotTree(
  path.join(root, "scripts/evaluator/booking-v1"),
);
const trustedPaths = [
  "src/lib/contracts",
  "src/lib/report",
  "src/lib/verify",
  "src/server/artifacts",
];
const trustedManifests = await Promise.all(
  trustedPaths.map(async (prefix) => ({
    prefix,
    snapshot: await snapshotTree(path.join(root, prefix)),
  })),
);
const evaluatorManifest = [
  ...evaluator.files.map((file) => ({
    ...file,
    path: `scripts/evaluator/booking-v1/${file.path}`,
  })),
  ...trustedManifests.flatMap(({ prefix, snapshot }) =>
    snapshot.files.map((file) => ({ ...file, path: `${prefix}/${file.path}` })),
  ),
  ...(await Promise.all(
    ["package.json", "package-lock.json"].map(async (name) => ({
      path: name,
      sha256: sha256(await readFile(path.join(root, name))),
    })),
  )),
].sort((left, right) =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
);
const suiteFiles = ["oracle.ts", "http-oracle.ts"];
const suite = await Promise.all(
  suiteFiles.map(async (name) => ({
    path: name,
    content: await readFile(
      path.join(root, "scripts/evaluator/booking-v1", name),
      "utf8",
    ),
  })),
);
const policy = {
  schemaVersion: "booking-required-policy.v1",
  requiredCheckIds: [
    "typecheck",
    "build",
    "baseline-domain",
    "http-integration",
    "boundary",
  ],
  oracleVisibility: "public_baseline",
  hiddenHoldout: false,
};
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: "booking-source-freeze.v1",
      frozenAt: new Date().toISOString(),
      fixtureSha256: fixture.treeSha256,
      evaluatorSha256: jsonDigest(evaluatorManifest),
      testSuiteSha256: jsonDigest(suite),
      requiredPolicySha256: jsonDigest(policy),
      policy,
      fixtureManifest: fixture.files,
      evaluatorManifest,
      evidenceOrigin: "none",
      executionStatus: "NOT_RUN",
      limitations: [
        "Source commitment only; no candidate code or test was executed by this command.",
        "No sandbox attestation, protected run receipt, future heldout or architecture comparison is implied.",
      ],
    },
    null,
    2,
  )}\n`,
);
