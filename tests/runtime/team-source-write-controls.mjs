// Guest-only deterministic production writer controls. Never imports candidate.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { writeSource } from "/run/team-source-write.mjs";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const text =
  'export const escaped = "\\\\ \\" \\u0000 $HOME `literal`";\n// second line\n';
const path = "src/write-control.ts";
const target = "/workspace/" + path;
const write = (value) => writeSource(JSON.stringify(value));
// Simulate short OS writes on the actual production implementation.
const original = fs.writeSync;
fs.writeSync = (fd, buffer, offset, length) =>
  original(fd, buffer, offset, Math.min(7, length));
syncBuiltinESMExports();
try {
  assert.equal(
    write({ path, expectedSha256: null, content: text }).sha256,
    hash(text),
  );
} finally {
  fs.writeSync = original;
  syncBuiltinESMExports();
}
assert.equal(fs.readFileSync(target, "utf8"), text);
assert.throws(() => write({ path, expectedSha256: null, content: "wrong" }));
assert.throws(() =>
  writeSource('{"path":"src/write-control.ts","content":"partial'),
);
assert.equal(fs.readFileSync(target, "utf8"), text);
assert.throws(() =>
  write({ path, expectedSha256: hash(text), content: "x".repeat(2_097_153) }),
);
for (const path of [
  "package.json",
  "src/../package.json",
  "/tmp/escape.ts",
  "src/.env.ts",
  "src//bad.ts",
]) {
  assert.throws(() => write({ path, expectedSha256: null, content: "wrong" }));
}
fs.symlinkSync("/tmp", "/workspace/src/write-alias");
try {
  assert.throws(() =>
    write({
      path: "src/write-alias/escaped.ts",
      expectedSha256: null,
      content: "wrong",
    }),
  );
} finally {
  fs.unlinkSync("/workspace/src/write-alias");
}
fs.symlinkSync("/workspace/package.json", "/workspace/src/write-link.ts");
try {
  assert.throws(() =>
    write({
      path: "src/write-link.ts",
      expectedSha256: null,
      content: "wrong",
    }),
  );
} finally {
  fs.unlinkSync("/workspace/src/write-link.ts");
}
// Abrupt death while reading partial stdin cannot touch the original file.
const stalled = spawn(
  "/usr/local/bin/node",
  ["/run/team-workflow.mjs", "write"],
  { stdio: ["pipe", "ignore", "ignore"] },
);
stalled.stdin.write('{"path":"src/write-control.ts","content":"partial');
await new Promise((resolve) => setTimeout(resolve, 50));
stalled.kill("SIGKILL");
await new Promise((resolve) => stalled.once("close", resolve));
const expired = spawnSync(
  "/usr/local/bin/node",
  ["/run/team-public-checks.mjs"],
  { env: { PATH: "/usr/local/bin:/usr/bin:/bin", FORECODE_DEADLINE: "1" } },
);
assert.notEqual(expired.status, 0);
assert.equal(fs.readFileSync(target, "utf8"), text);
assert.throws(() => fs.writeFileSync("/workspace/package.json", "wrong"));
write({
  path,
  expectedSha256: hash(text),
  content: "export const checked = 1;\n",
});
console.log(
  "SOURCE_WRITE_CONTROLS_PASS quotes backslashes multiline short-writes conflicts partial-input bounds paths symlinks readonly deadline",
);
