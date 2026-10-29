// Trusted guest only. The request never supplies a package path or command.
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  TeamGradeProfileSchema,
  validateTeamProfile,
  teamOnlyCheckIds,
  type TeamGradeProfile,
} from "./grade-profile";

export const teamInstallationRoot = "/opt/forecode-booking/future";
const ManifestSchema = z.strictObject({
  schemaVersion: z.literal("booking-team-oracle-installation.v1"),
  profile: TeamGradeProfileSchema,
});
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function readProtected(filename: string, ownerUid: number) {
  if ((await realpath(filename)) !== path.resolve(filename))
    throw new Error("Oracle alias refused.");
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.uid !== ownerUid ||
      before.nlink !== 1 ||
      (before.mode & 0o222) !== 0 ||
      before.size > 1048576
    )
      throw new Error("Oracle custody refused.");
    const buffer = Buffer.alloc(1048577);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    const linked = await lstat(filename);
    if (
      bytesRead !== before.size ||
      linked.ino !== before.ino ||
      linked.dev !== before.dev ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      linked.isSymbolicLink()
    )
      throw new Error("Oracle changed during read.");
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// The explicit directory/UID seam is for synthetic custody tests. Production
// entry below always uses the fixed root and root UID, never descriptor input.
export async function inspectTeamInstallation(
  directory: string,
  expected: TeamGradeProfile,
  ownerUid = 0,
) {
  const profile = validateTeamProfile(expected);
  if ((await realpath(directory)) !== path.resolve(directory))
    throw new Error("Oracle root alias refused.");
  const info = await lstat(directory);
  if (!info.isDirectory() || info.uid !== ownerUid || (info.mode & 0o077) !== 0)
    throw new Error("Oracle root custody refused.");
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify(["manifest.json", "oracle.mjs"]))
    throw new Error("Unexpected private package files.");
  const bytes = await readProtected(
    path.join(directory, "manifest.json"),
    ownerUid,
  );
  const manifest = ManifestSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  if (
    JSON.stringify(validateTeamProfile(manifest.profile)) !==
    JSON.stringify(profile)
  )
    throw new Error("Installed oracle profile mismatch.");
  const oracle = await readProtected(
    path.join(directory, "oracle.mjs"),
    ownerUid,
  );
  if (digest(oracle) !== profile.testSuiteSha256)
    throw new Error("Private oracle source changed.");
  return { manifestSha256: digest(bytes), oracleSha256: digest(oracle) };
}

export async function requireInstalledTeamProfile(profile: TeamGradeProfile) {
  for (const directory of ["/opt", "/opt/forecode-booking"]) {
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== 0 ||
      (info.mode & 0o022) !== 0
    )
      throw new Error("Oracle parent custody refused.");
  }
  return inspectTeamInstallation(teamInstallationRoot, profile);
}

// Private module is a reviewed self-contained ESM bundle, dependency closure
// limited to pinned runtime/built-ins. No package is installed by this code.
export async function runInstalledTeamCheck(
  kind: string,
  profile: TeamGradeProfile,
  rpc: (request: unknown) => unknown,
) {
  if (!(teamOnlyCheckIds as readonly string[]).includes(kind))
    throw new Error("Unsupported private check.");
  const before = await requireInstalledTeamProfile(profile);
  const oracle = (await import(
    pathToFileURL(path.join(teamInstallationRoot, "oracle.mjs")).href
  )) as {
    runTeamOracle?: (
      check: string,
      rpc: (request: unknown) => unknown,
    ) => Promise<void>;
  };
  if (typeof oracle.runTeamOracle !== "function")
    throw new Error("Private oracle export missing.");
  // The oracle's assertion failure is a genuine required failure. Its output and
  // diagnostics stay private; no assertion counts or expectations reach workers.
  try {
    await oracle.runTeamOracle(kind, rpc);
  } finally {
    const after = await requireInstalledTeamProfile(profile);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Private package freshness changed.");
  }
}
