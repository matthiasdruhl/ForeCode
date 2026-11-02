// Disposable Linux guest only. Real workflow/checker CLIs, synthetic source,
// no provider calls, historical candidate bytes or protected correctness claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  mkdirSync,
} from "node:fs";
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

// Literal-file staging avoids JSON escaping while retaining the same atomic
// writer, interface validation, digest conflicts and post-commit feedback.
const stagedSource =
  '\ufeff// Literal quotes " backslash \\ dollar $HOME and escaped NUL \\u0000\nexport const staged = "Ω";\n';
const staging = "/tmp/literal-proposal.ts";
writeFileSync(staging, stagedSource);
const staged = invoke("literal-source-file-write", [
  "/run/team-workflow.mjs",
  "write-file",
  "src/staged-control.ts",
  staging,
  "null",
]);
assert.equal(staged.exitCode, 0, JSON.stringify(staged));
assert.equal(
  readFileSync("/workspace/src/staged-control.ts", "utf8"),
  stagedSource,
);
assert.match(staged.stdout, new RegExp(hash(stagedSource)));
assert.equal(currentHash(), repairedHash);
for (const [name, file] of [
  ["missing", "/tmp/absent-proposal"],
  ["directory", "/tmp/proposal-directory"],
  ["invalid-utf8", "/tmp/invalid-utf8"],
  ["symlink", "/tmp/aliased-proposal"],
  ["oversized", "/tmp/oversized-proposal"],
]) {
  if (name === "directory") mkdirSync(file);
  if (name === "invalid-utf8") writeFileSync(file, Buffer.from([0xc3, 0x28]));
  if (name === "symlink") symlinkSync(staging, file);
  if (name === "oversized") writeFileSync(file, Buffer.alloc(2_097_153));
  rejected(
    invoke(`staged-${name}`, [
      "/run/team-workflow.mjs",
      "write-file",
      "src/server/team-benchmark.ts",
      file,
      repairedHash,
    ]),
    repairedHash,
    "SOURCE_WRITE_FILE",
  );
  rmSync(file, { recursive: true, force: true });
}
linkSync(staging, "/tmp/hardlinked-proposal");
rejected(
  invoke("staged-hardlink", [
    "/run/team-workflow.mjs",
    "write-file",
    "src/server/team-benchmark.ts",
    staging,
    repairedHash,
  ]),
  repairedHash,
  "SOURCE_WRITE_FILE",
);
rmSync("/tmp/hardlinked-proposal");
symlinkSync("/tmp", "/tmp/aliased-directory");
rejected(
  invoke("staged-parent-symlink", [
    "/run/team-workflow.mjs",
    "write-file",
    "src/server/team-benchmark.ts",
    "/tmp/aliased-directory/literal-proposal.ts",
    repairedHash,
  ]),
  repairedHash,
  "SOURCE_WRITE_FILE",
);
rmSync("/tmp/aliased-directory");
rejected(
  invoke("staged-stale-digest", [
    "/run/team-workflow.mjs",
    "write-file",
    "src/server/team-benchmark.ts",
    staging,
    "0".repeat(64),
  ]),
  repairedHash,
  "SOURCE_WRITE_CONFLICT",
);
rmSync("/workspace/src/staged-control.ts");

// Reproduce the public HTTPS-origin regression AND a real compiler error in
// one source snapshot. A failed session must not hide the TypeScript message.
const originDefect = repaired.replace(
  'request.headers.get("origin") !== url.origin',
  'request.headers.get("origin") !== "http://127.0.0.1:3006"',
);
assert.notEqual(originDefect, repaired);
writeFileSync(staging, originDefect);
const dualWrite = invoke("staged-known-origin-defect", [
  "/run/team-workflow.mjs",
  "write-file",
  "src/server/team-benchmark.ts",
  staging,
  repairedHash,
]);
receipt(dualWrite, originDefect);
assert.equal(dualWrite.exitCode, 1);
writeFileSync(
  "/workspace/src/public-compile-control.ts",
  "export const broken: string = 1;\n",
);
const dual = invoke(
  "independent-https-and-compiler-diagnostics",
  ["/run/team-public-checks.mjs"],
  undefined,
  180_000,
);
assert.equal(dual.exitCode, 1, JSON.stringify(dual));
assert.match(dual.stdout, /PUBLIC_CHECK adapter-session FAIL/);
assert.match(dual.stdout, /PUBLIC_CHECK typecheck FAIL/);
assert.match(dual.output, /public-compile-control.ts\(1,14\): error TS2322/);
assert.doesNotMatch(dual.stdout, /PUBLIC_CHECK build PASS/);
rmSync("/workspace/src/public-compile-control.ts");
writeFileSync(staging, repaired);
const dualRepair = invoke("staged-origin-and-compiler-recovery", [
  "/run/team-workflow.mjs",
  "write-file",
  "src/server/team-benchmark.ts",
  staging,
  hash(originDefect),
]);
accepted(dualRepair, repaired);
assert.equal(currentHash(), repairedHash);
rmSync(staging);

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

// Each deliberate defect must fail a named assertion from PUBLIC requirements.
// These controls never read or execute a historical candidate or private test.
const mutations = [
  [
    "seed-error-code",
    'if (!parsedSeed.success) failure("INVALID_INPUT");',
    'if (!parsedSeed.success) throw new Error("INVALID_SEED");',
    /public invalid seed/,
  ],
  [
    "seed-validation",
    "if (!unique(seed.organizations.map(x => x.id))",
    "if (false && !unique(seed.organizations.map(x => x.id))",
    /public invalid seed/,
  ],
  [
    "catalog-roles",
    "return m ? [{ ...o, role: m.role }] : [];",
    'return m ? [{ ...o, role: "owner" }] : [];',
    /public organization roles and sorting/,
  ],
  [
    "returned-copies",
    "return { booking: { ...row } };",
    "return { booking: row };",
    /public booking return must be copied/,
  ],
  [
    "revoked-occupancy",
    'row.status = "revoked";',
    'row.status = "revoked"; for (const booking of rows) if (booking.createdBy === target) booking.status = "cancelled";',
    /public revocation preserves conflict occupancy/,
  ],
  [
    "strict-utf8",
    'new TextDecoder("utf-8", { fatal: true }).decode(bytes)',
    'new TextDecoder("utf-8").decode(bytes)',
    /public malformed wire body/,
  ],
  ["body-limit", "count > 8192", "count > 16384", /public malformed wire body/],
  [
    "method-order",
    "if (!allowed.includes(request.method)) return new Response(null, { status: 405 });",
    "if (!allowed.includes(request.method)) { identity(viewer); return new Response(null, { status: 405 }); }",
    /public unsupported method precedes all validation/,
  ],
];
for (const [name, beforeText, afterText, expected] of mutations) {
  const defective = repaired.replaceAll(beforeText, afterText);
  assert.notEqual(defective, repaired, `mutation ${name} was not applied`);
  writeFileSync(adapter, defective);
  const result = invoke(
    `public-negative-${name}`,
    ["/run/team-public-checks.mjs", "--behavior-only"],
    undefined,
    25_000,
  );
  assert.notEqual(result.exitCode, 0, JSON.stringify(result));
  assert.match(result.output, expected, JSON.stringify(result));
}
writeFileSync(adapter, repaired);

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
