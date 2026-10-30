// Protected operator diagnostics only. Never included in receipts, RPC replies,
// source exports, public evidence or any coding worker input.
import {
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export function retainTeamDiagnostic(
  root: string,
  runId: string,
  kind: string,
  identity: { evaluatedTreeSha256: string; evaluatorSha256: string },
  observation: unknown,
) {
  if (
    !/^[a-f0-9-]{36}$/.test(runId) ||
    !/^team-permissions-(domain|http|adversarial)$/.test(kind)
  )
    throw new Error("Fixed private diagnostic identity required.");
  const record = JSON.stringify({
    schemaVersion: "protected-team-diagnostic.local.v1",
    runId,
    kind,
    ...identity,
    observation,
  });
  if (Buffer.byteLength(record) > 524288)
    throw new Error("Private diagnostic bound.");
  for (const directory of [root, path.join(root, runId)]) {
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stat = lstatSync(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o777) !== 0o700
    )
      throw new Error("Private diagnostic custody required.");
  }
  const file = path.join(root, runId, `${kind}.json`);
  const fd = openSync(file, "wx", 0o400);
  try {
    writeFileSync(fd, record);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const directory = openSync(path.dirname(file), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  return createHash("sha256").update(record).digest("hex");
}
