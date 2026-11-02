// Disposable Linux guest only. Real workflow/checker CLIs, synthetic source,
// no provider calls, historical candidate bytes or protected correctness claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

assert.equal(process.platform, "linux", "confined Linux guest required");
const node = "/usr/local/bin/node";
const adapter = "/workspace/src/server/team-benchmark.ts";
assert.equal(existsSync(adapter), false, "fresh reviewed fixture required");
assert.equal(existsSync("/workspace/node_modules"), false);
const deadline = Math.floor(Date.now() / 1000) + 439;
writeFileSync(
  "/tmp/forecode-progress.json",
  JSON.stringify({
    admittedRequests: 0,
    maxRequests: 19,
    completionReserveRequests: 3,
    deadline,
  }),
  { flag: "wx", mode: 0o600 },
);
const env = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  FORECODE_DEADLINE: String(deadline),
  NEXT_TELEMETRY_DISABLED: "1",
};
const rows = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const currentHash = () =>
  existsSync(adapter) ? hash(readFileSync(adapter)) : null;
function invoke(caseName, args, input, timeout = 25_000, options = {}) {
  const result = spawnSync(node, args, {
    cwd: options.cwd ?? "/workspace",
    input,
    env: { ...env, ...options.env },
    timeout,
    maxBuffer: 262_144,
    encoding: "utf8",
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const row = {
    case: caseName,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
  rows.push(row);
  assert.equal(result.error, undefined, JSON.stringify(row));
  assert.equal(result.signal, null, JSON.stringify(row));
  return { ...row, output };
}
function write(caseName, content, expectedSha256) {
  // stdin bypasses shell quoting while exercising the actual JSON parser,
  // whole-file writer, proposed-adapter check and post-write quick check.
  return invoke(
    caseName,
    ["/run/team-workflow.mjs", "write"],
    JSON.stringify({
      path: "src/server/team-benchmark.ts",
      expectedSha256,
      content,
    }),
  );
}
function receipt(row, content) {
  const saved = row.stdout
    .split("\n")
    .find((line) => line.startsWith("SOURCE_WRITE "));
  assert.ok(saved, JSON.stringify(row));
  const value = JSON.parse(saved.slice("SOURCE_WRITE ".length));
  assert.equal(value.sha256, hash(content));
  assert.equal(readFileSync(adapter, "utf8"), content);
  return value;
}
function accepted(row, content) {
  assert.equal(row.exitCode, 0, JSON.stringify(row));
  receipt(row, content);
  assert.match(row.stdout, /PUBLIC_READINESS QUICK_PASS/);
}
function rejected(row, before, code) {
  assert.notEqual(row.exitCode, 0, JSON.stringify(row));
  assert.ok(
    row.output.includes(`PUBLIC_WORKFLOW_REJECTION ${code}:`),
    JSON.stringify(row),
  );
  assert.equal(
    currentHash(),
    before,
    "rejected proposal replaced saved source",
  );
}
function refused(row, before) {
  rejected(row, before, "SOURCE_WRITE_INTERFACE");
  assert.match(row.stdout, /SOURCE_WRITE_BLOCKED public adapter interface/);
  assert.match(row.stdout, /PUBLIC_READINESS BLOCKED/);
}

// Bare ESM resolution from the readonly fixture is distinct from the public
// checker, which supplies dependencies inside disposable writable scratch.
const bare = invoke("bare-esm-dependency", [
  "--input-type=module",
  "-e",
  'await import("zod");',
]);
assert.notEqual(bare.exitCode, 0, JSON.stringify(bare));
assert.match(bare.output, /ERR_MODULE_NOT_FOUND/);
const nodePath = invoke(
  "node-path-does-not-repair-esm",
  ["--input-type=module", "-e", 'await import("zod");'],
  undefined,
  25_000,
  { env: { NODE_PATH: "/toolchain/node_modules" } },
);
assert.notEqual(nodePath.exitCode, 0, JSON.stringify(nodePath));
assert.match(nodePath.output, /ERR_MODULE_NOT_FOUND/);
const toolchain = invoke(
  "toolchain-dependency-only-probe",
  [
    "--input-type=module",
    "-e",
    'import { z } from "zod"; if (!z.string().safeParse("synthetic").success) throw new Error("probe failed"); console.log("DEPENDENCY_ONLY_PROBE_PASS");',
  ],
  undefined,
  25_000,
  { cwd: "/toolchain" },
);
assert.equal(toolchain.exitCode, 0, JSON.stringify(toolchain));
assert.match(toolchain.stdout, /DEPENDENCY_ONLY_PROBE_PASS/);

const initial = readFileSync(
  new URL("./team-public-control-adapter.txt", import.meta.url),
  "utf8",
);
refused(
  write("missing-export-new-file", "export const unrelated = 1;\n", null),
  null,
);
const malformedNew = invoke(
  "malformed-json-new-file",
  ["/run/team-workflow.mjs", "write"],
  '{"path":"src/server/team-benchmark.ts","content":"unfinished',
);
rejected(malformedNew, null, "SOURCE_WRITE_JSON");
accepted(write("valid-bootstrap", initial, null), initial);
const before = currentHash();
const malformedReplacement = invoke(
  "malformed-json-replacement",
  ["/run/team-workflow.mjs", "write"],
  '{"path":"src/server/team-benchmark.ts","content":"unfinished',
);
rejected(malformedReplacement, before, "SOURCE_WRITE_JSON");
rejected(
  write("stale-digest", initial, "0".repeat(64)),
  before,
  "SOURCE_WRITE_CONFLICT",
);
rejected(
  write("null-for-existing-file", initial, null),
  before,
  "SOURCE_WRITE_CONFLICT",
);
const invalidShape = invoke(
  "invalid-write-shape",
  ["/run/team-workflow.mjs", "write"],
  JSON.stringify({ path: "src/server/team-benchmark.ts", content: initial }),
);
rejected(invalidShape, before, "INVALID_SOURCE_WRITE");

const syntax = write(
  "malformed-typescript",
  "export function createTeamBenchmark( {\n",
  before,
);
refused(syntax, before);
assert.match(
  syntax.output,
  /Transform failed|Syntax error|Unexpected|Expected/,
);

const placeholder = write(
  "undefined-placeholder",
  "placeholder;\n" + initial,
  before,
);
refused(placeholder, before);
assert.match(placeholder.output, /ReferenceError: placeholder is not defined/);

const missingExport = write(
  "missing-factory-export",
  "export const unrelated = 1;\n",
  before,
);
refused(missingExport, before);
assert.match(
  missingExport.output,
  /public createTeamBenchmark export required/,
);

const missingMethods = write(
  "missing-domain-http-interface",
  "export function createTeamBenchmark(){return {domain:1,http:1};}\n",
  before,
);
refused(missingMethods, before);
assert.match(missingMethods.output, /public domain\/http interface required/);

// An interface-valid source is committed before the later quick cookie check.
// A nonzero CLI exit therefore does not imply that this write was rejected.
const missingCookie =
  "export function createTeamBenchmark(){return {domain(){return {};},http(){return Response.json({});}};}\n";
const committedFailure = write(
  "committed-write-with-quick-cookie-failure",
  missingCookie,
  before,
);
assert.notEqual(committedFailure.exitCode, 0, JSON.stringify(committedFailure));
const committedReceipt = receipt(committedFailure, missingCookie);
assert.equal(currentHash(), committedReceipt.sha256);
assert.match(committedFailure.stdout, /PUBLIC_CHECK adapter-session FAIL/);
assert.match(committedFailure.stdout, /PUBLIC_READINESS BLOCKED/);
assert.doesNotMatch(committedFailure.output, /SOURCE_WRITE_BLOCKED/);
assert.doesNotMatch(committedFailure.output, /PUBLIC_WORKFLOW_REJECTION/);

const repaired = initial.replace("=synthetic;", "=synthetic-repaired;");
accepted(
  write("repaired-bootstrap", repaired, committedReceipt.sha256),
  repaired,
);
assert.notEqual(currentHash(), before);
const repairedHash = currentHash();

const quick = invoke("quick-public-check", [
  "/run/team-public-checks.mjs",
  "--quick",
]);
assert.equal(quick.exitCode, 0, JSON.stringify(quick));
assert.match(quick.stdout, /PUBLIC_CHECK adapter-session PASS/);
assert.match(quick.stdout, /PUBLIC_READINESS QUICK_PASS/);
assert.equal(currentHash(), repairedHash);

const full = invoke(
  "full-public-check",
  ["/run/team-public-checks.mjs"],
  undefined,
  180_000,
);
assert.equal(full.exitCode, 0, JSON.stringify(full));
for (const check of [
  "source-boundary",
  "adapter-session",
  "typegen",
  "typecheck",
  "build",
  "session-cookie",
  "team-public-behavior",
])
  assert.ok(
    full.stdout.includes(`PUBLIC_CHECK ${check} PASS`),
    JSON.stringify(full),
  );
assert.match(full.stdout, /PUBLIC_READINESS READY/);
assert.equal(currentHash(), repairedHash);
assert.equal(existsSync("/workspace/node_modules"), false);

// The real supervisor uses Python time.time(), so its deadline has fractional
// milliseconds. Exercise the actual CLIs below the 180s/90s timeout caps; the
// original integer-only progress fixture hid Node's integer timeout validation.
function fractionalProgress(milliseconds, admittedRequests) {
  const fractionalDeadline = (Date.now() + milliseconds + 0.25) / 1000;
  assert.equal(Number.isInteger(fractionalDeadline * 1000), false);
  writeFileSync(
    "/tmp/forecode-progress.json",
    JSON.stringify({
      admittedRequests,
      maxRequests: 19,
      completionReserveRequests: 3,
      deadline: fractionalDeadline,
    }),
  );
  return fractionalDeadline;
}
const fractionalSource = repaired.replace(
  "=synthetic-repaired;",
  "=synthetic-fractional;",
);
fractionalProgress(147_494, 16);
const fractionalWrite = write(
  "fractional-deadline-committed-auto-quick",
  fractionalSource,
  repairedHash,
);
receipt(fractionalWrite, fractionalSource);
const shortFractionalSource = fractionalSource.replace(
  "=synthetic-fractional;",
  "=synthetic-short;",
);
fractionalProgress(18_000, 16);
const shortFractionalWrite = write(
  "fractional-short-deadline-proposed-interface",
  shortFractionalSource,
  currentHash(),
);
fractionalProgress(147_494, 12);
const fractionalCheckpoint = invoke(
  "fractional-deadline-full-checkpoint",
  ["/run/team-workflow.mjs", "checkpoint"],
  undefined,
  180_000,
);
const fractionalPublicDeadline = fractionalProgress(60_000, 12);
const fractionalPublic = invoke(
  "fractional-deadline-direct-full-checker",
  ["/run/team-public-checks.mjs"],
  undefined,
  70_000,
  { env: { FORECODE_DEADLINE: String(fractionalPublicDeadline) } },
);
// Collect all positive results before asserting, so the failing-source run shows
// both the workflow wrapper and the nested public-checker failure paths.
const fractionalRows = [
  fractionalWrite,
  shortFractionalWrite,
  fractionalCheckpoint,
  fractionalPublic,
];
console.log("FRACTIONAL_TIMEOUT_CONTROLS " + JSON.stringify(fractionalRows));
for (const row of fractionalRows) {
  assert.equal(row.exitCode, 0, JSON.stringify(row));
  assert.doesNotMatch(row.output, /PUBLIC_WORKFLOW_FAILED/);
}
assert.match(fractionalWrite.stdout, /PUBLIC_READINESS QUICK_PASS/);
receipt(shortFractionalWrite, shortFractionalSource);
assert.match(shortFractionalWrite.stdout, /PUBLIC_READINESS QUICK_PASS/);
for (const row of [fractionalCheckpoint, fractionalPublic]) {
  assert.match(row.stdout, /PUBLIC_CHECK typecheck PASS/);
  assert.match(row.stdout, /PUBLIC_CHECK build PASS/);
  assert.match(row.stdout, /PUBLIC_READINESS READY/);
}
// An expired fractional deadline must fail closed without admitting a checker.
fractionalProgress(-1, 12);
const expired = invoke("expired-fractional-deadline", [
  "/run/team-workflow.mjs",
  "quick",
]);
assert.equal(expired.exitCode, 124, JSON.stringify(expired));
assert.match(expired.stdout, /PUBLIC_READINESS NOT_CHECKED deadline/);
assert.doesNotMatch(expired.stdout, /PUBLIC_CHECK /);
// Change only the synthetic fixture digest, forcing the checkpoint interface
// path to check the already-expired deadline instead of using its cached pass.
const expiredSource = "/workspace/src/expired-timeout-control.ts";
writeFileSync(expiredSource, "// synthetic expired-deadline control\n", {
  flag: "wx",
});
const expiredCheckpoint = invoke("expired-fractional-interface-checkpoint", [
  "/run/team-workflow.mjs",
  "checkpoint",
]);
assert.equal(
  expiredCheckpoint.exitCode,
  124,
  JSON.stringify(expiredCheckpoint),
);
assert.match(expiredCheckpoint.stdout, /PUBLIC_INTERFACE_MILESTONE BLOCKED/);
assert.match(expiredCheckpoint.stdout, /PUBLIC_READINESS NOT_CHECKED deadline/);
assert.doesNotMatch(expiredCheckpoint.stdout, /PUBLIC_CHECK /);
rmSync(expiredSource);
const expiredPublic = invoke(
  "expired-fractional-direct-checker",
  ["/run/team-public-checks.mjs"],
  undefined,
  25_000,
  { env: { FORECODE_DEADLINE: String((Date.now() - 1 + 0.25) / 1000) } },
);
assert.equal(expiredPublic.exitCode, 1, JSON.stringify(expiredPublic));
assert.match(expiredPublic.stdout, /PUBLIC_CHECK source-boundary FAIL/);
assert.doesNotMatch(expiredPublic.stdout, /PUBLIC_CHECK adapter-session/);
assert.equal(currentHash(), hash(shortFractionalSource));
console.log(
  JSON.stringify({
    origin: "synthetic-real-public-workflow-cli",
    providerRequests: 0,
    protectedCorrectness: "NOT_MEASURED",
    unchangedAfterRejection: true,
    postCommitCheckFailurePreservedReceipt: true,
    repairedUsingCommittedDigest: true,
    scratchDependencyWorkflowPassed: true,
    fractionalDeadlineWorkflowAndCheckerPassed: true,
    rows,
  }),
);
