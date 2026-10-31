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
import { AssertionError } from "node:assert";

// Only the trusted oracle child writes this to its private stderr. Never copy
// stack/cause, request data, nested objects or generated assertion expressions.
export function privateTeamFailure(
  error: unknown,
  context: {
    kind: string;
    teamNewOrdinal: number;
    rpcOrdinal: number;
    lastOp: string | null;
  },
) {
  const own = (name: string): unknown => {
    try {
      if (!error || (typeof error !== "object" && typeof error !== "function"))
        return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(error, name);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    } catch {
      return undefined;
    }
  };
  let assertion = false;
  try {
    assertion = error instanceof AssertionError;
  } catch {
    /* opaque thrown value */
  }
  const value: Record<string, unknown> = {
    schemaVersion: "protected-team-failure.local.v1",
    ...context,
    category: assertion ? "assertion" : "runtime",
  };
  if (assertion) {
    value.code = "ERR_ASSERTION";
    const operator = own("operator"),
      message = own("message");
    if (
      typeof operator === "string" &&
      [
        "==",
        "!=",
        "===",
        "!==",
        "deepEqual",
        "notDeepEqual",
        "deepStrictEqual",
        "notDeepStrictEqual",
        "strictEqual",
        "notStrictEqual",
        "match",
        "doesNotMatch",
        "throws",
        "rejects",
        "ifError",
        "fail",
      ].includes(operator)
    )
      value.operator = operator;
    // Explicit labels are useful inside custody; Node-generated messages may
    // contain assertion source, so keep them out even of the private channel.
    if (own("generatedMessage") === false && typeof message === "string")
      value.message = Buffer.from(message.split("\n", 1)[0]!)
        .subarray(0, 1024)
        .toString("utf8");
    for (const name of ["actual", "expected"] as const) {
      const item = own(name);
      if (
        item === null ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item))
      )
        value[name] = item;
      else if (typeof item === "string")
        value[name] = Buffer.from(item).subarray(0, 1024).toString("utf8");
    }
  } else {
    const code = own("code");
    if (
      typeof code === "string" &&
      [
        "INVALID_INPUT",
        "NOT_FOUND",
        "FORBIDDEN",
        "UNAUTHENTICATED",
        "CONFLICT",
        "ERR_MODULE_NOT_FOUND",
        "BRIDGE_ERROR",
      ].includes(code)
    )
      value.code = code;
  }
  return JSON.stringify(value);
}

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
