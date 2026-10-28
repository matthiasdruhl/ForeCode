import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GitCommitSchema } from "../../../src/lib/contracts/common";
import {
  ExperimentRunV1Schema,
  type ExperimentRunV1,
} from "../../../src/lib/contracts/evidence";
import {
  invariant,
  orderedTime,
  validateReceiptRelationships,
} from "../../../src/lib/contracts/validation";
import { canonicalJson } from "../../../src/lib/report/canonical";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";
import {
  isTrustedEvaluation,
  type TrustedEvaluation,
} from "../../../src/server/artifacts/evaluation-store";
import type { OfflineConfig } from "../isolation/offline-config";
import { boundedProcess } from "../runner/process";
import { captureReviewedTree, privateDirectory, protectedRead } from "./files";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const fixturePrefix = "fixtures/booking-v1/";
async function git(args: string[]) {
  const result = await boundedProcess(
    "/usr/bin/git",
    ["-C", project, ...args],
    {
      milliseconds: 5000,
      maxBytes: 1_048_576,
    },
  );
  invariant(
    result.reason === "completed" && result.exitCode === 0,
    "Source Git identity unavailable.",
  );
  return result.stdout;
}

// Fixed local root only. Compare committed blob identities to the exact captured
// bytes, not merely HEAD or a clean status label. No fixture code is executed.
export async function captureOfflineSource(
  acceptanceId: string,
  fixtureSha256: string,
) {
  const repoCommit = GitCommitSchema.parse(
    (await git(["rev-parse", "HEAD"])).trim(),
  );
  invariant(
    (await git([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      "fixtures/booking-v1",
    ])) === "",
    "Dirty fixture identity.",
  );
  const tracked = (
    await git(["ls-tree", "-r", "-z", repoCommit, "--", "fixtures/booking-v1"])
  )
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = /^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
      invariant(
        match && match[2]!.startsWith(fixturePrefix),
        "Invalid committed fixture binding.",
      );
      return { blob: match[1]!, path: match[2]!.slice(fixturePrefix.length) };
    });
  const baseline = await captureReviewedTree(
    path.join(project, "fixtures/booking-v1"),
    acceptanceId,
  );
  invariant(
    tracked.length > 0 && tracked.length === baseline.files.length,
    "Missing fixture source binding.",
  );
  const manifest = baseline.files
    .map((file) => {
      const bytes = Buffer.from(file.base64, "base64");
      const blob = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      invariant(
        tracked.some((t) => t.path === file.path && t.blob === blob),
        "Fixture differs from source commit.",
      );
      return { path: file.path, sha256: sha256(bytes) };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  invariant(jsonDigest(manifest) === fixtureSha256, "Fixture freeze mismatch.");
  invariant(
    (await git(["rev-parse", "HEAD"])).trim() === repoCommit,
    "Source commit changed during capture.",
  );
  return { repoCommit, fixtureSha256, baseline };
}

export function offlineRunProfile(
  config: OfflineConfig,
  runtimePins: Record<string, string>,
) {
  return {
    domain: "forecode/no-agent-fixed-offline-acceptance/v1",
    agent: "none",
    variant: "A" as const,
    scope: config.scope,
    candidateSelection: "code-owned-four-fixed-cases",
    build: "next-build-webpack",
    tools: {
      sbx: config.sbx,
      sbxSha256: config.sbxSha256,
      graderSandbox: config.graderSandbox,
      graderImage: config.graderImage,
      ...runtimePins,
    },
    network: "offline-grader",
  };
}

// Fixed filenames, canonical bounded bytes, private custody and atomic exclusive
// link publication. A partial write remains a private .pending diagnostic only.
export async function writeOfflineOriginal(
  directory: string,
  runId: string,
  name:
    | "source-context.json"
    | "experiment-run.json"
    | "experiment-run-failed.json",
  value: unknown,
) {
  invariant(
    path.basename(directory) === runId &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        runId,
      ),
    "Invalid source record directory.",
  );
  invariant(
    [
      "source-context.json",
      "experiment-run.json",
      "experiment-run-failed.json",
    ].includes(name),
    "Invalid source record filename.",
  );
  await privateDirectory(path.dirname(directory));
  await privateDirectory(directory);
  const custody = await lstat(directory);
  const bytes = canonicalJson(value);
  invariant(
    Buffer.byteLength(bytes) <= 1_048_576,
    "Source record exceeds bound.",
  );
  const staging = path.join(directory, `.${name}.pending`);
  const handle = await open(
    staging,
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
  invariant(
    (await protectedRead(staging)).toString() === bytes,
    "Source record write changed.",
  );
  await privateDirectory(directory);
  const current = await lstat(directory);
  invariant(
    current.ino === custody.ino && current.dev === custody.dev,
    "Source record custody changed.",
  );
  await link(staging, path.join(directory, name));
  await unlink(staging);
  return { runId, directory: runId, file: name, sha256: sha256(bytes) };
}

export async function publishOfflineRun(
  directory: string,
  input: ExperimentRunV1,
  evaluation: TrustedEvaluation | null,
  failedPublication = false,
) {
  const run = ExperimentRunV1Schema.parse(input);
  orderedTime(run.startedAt, run.endedAt);
  if (run.receiptId !== null || run.verificationId !== null) {
    invariant(
      isTrustedEvaluation(evaluation),
      "Authenticated original evaluation required.",
    );
    validateReceiptRelationships(
      evaluation.receipt,
      evaluation.verification,
      run,
    );
    invariant(
      Date.parse(run.startedAt) <= Date.parse(evaluation.receipt.startedAt) &&
        Date.parse(run.endedAt) >= Date.parse(evaluation.receipt.finishedAt),
      "Run must enclose receipt.",
    );
  } else {
    invariant(
      run.status !== "completed" && evaluation === null,
      "Completion needs protected evaluator evidence.",
    );
  }
  invariant(
    run.variant === "A" &&
      run.evidenceOrigin === "none" &&
      run.presentationMode === "recorded" &&
      run.seed === null &&
      run.isolationAttestationId === null,
    "Invalid fixed acceptance provenance.",
  );
  return writeOfflineOriginal(
    directory,
    run.id,
    failedPublication ? "experiment-run-failed.json" : "experiment-run.json",
    run,
  );
}
