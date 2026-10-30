// Private failure custody only. No stdout/stderr, inputs, argument arrays,
// credentials, provider bodies or exception messages are accepted by this API.
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { privateDirectory } from "../artifacts/files";
import { canonicalJson } from "../../../src/lib/report/canonical";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const Observation = z.strictObject({
  operation: z.enum([
    "exec",
    "ls",
    "inspect",
    "settings",
    "mcp",
    "policy",
    "stop",
    "version",
  ]),
  commandSha256: hash,
  reason: z.enum([
    "completed",
    "timed_out",
    "cancelled",
    "output_limit",
    "spawn_error",
  ]),
  exitCode: z.number().int().nullable(),
  stdoutSha256: hash,
  stderrSha256: hash,
});
export const TeamControlFailureSchema = z.strictObject({
  schemaVersion: z.literal("team-control-failure.local.v1"),
  stage: z.enum(["command", "agent-lifecycle"]),
  origin: z.enum(["actual_control_process", "synthetic_no_inference"]),
  studyId: z.string().min(1).max(128),
  runId: z.string().uuid().nullable(),
  implementationSha256: hash,
  inventorySha256: hash,
  compositionSha256: hash,
  observedAt: z.iso.datetime(),
  errorClass: z
    .enum(["Error", "TypeError", "SyntaxError", "RangeError", "Unknown"])
    .nullable(),
  commandSha256: hash.nullable(),
  limitMilliseconds: z.number().int().min(1).max(600000).nullable(),
  maxBytes: z.number().int().min(1).max(16000000).nullable(),
  // A command can fail before a genuine process result exists. Never invent it.
  recentObservations: z.array(Observation).max(16),
});
export async function retainTeamControlFailure(root: string, value: unknown) {
  const record = TeamControlFailureSchema.parse(value);
  const owned = await privateDirectory(root),
    directory = path.join(owned, "control-failures");
  await mkdir(directory, { mode: 0o700 }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  await privateDirectory(directory);
  const file = path.join(directory, `${randomUUID()}.json`),
    fd = await open(file, "wx", 0o400);
  try {
    await fd.writeFile(canonicalJson(record));
    await fd.sync();
  } finally {
    await fd.close();
  }
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return file;
}
