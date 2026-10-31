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
// Post-rename storage failure must report that replacement already happened.
const originalFsync = fs.fsyncSync;
fs.fsyncSync = (fd) => {
  if (fs.fstatSync(fd).isDirectory())
    throw new Error("synthetic directory fsync failure");
  return originalFsync(fd);
};
syncBuiltinESMExports();
try {
  assert.throws(
    () =>
      write({ path, expectedSha256: hash(text), content: "// committed\n" }),
    (error) => error.sourceCommitted === true,
  );
} finally {
  fs.fsyncSync = originalFsync;
  syncBuiltinESMExports();
}
assert.equal(fs.readFileSync(target, "utf8"), "// committed\n");
write({ path, expectedSha256: hash("// committed\n"), content: text });
// Validation failures and cooperating writer contention leave prior source.
assert.throws(() =>
  writeSource(
    JSON.stringify({ path, expectedSha256: hash(text), content: "broken" }),
    "/workspace/src",
    () => {
      throw new Error("synthetic interface rejection");
    },
  ),
);
assert.equal(fs.readFileSync(target, "utf8"), text);
writeSource(
  JSON.stringify({ path, expectedSha256: hash(text), content: text }),
  "/workspace/src",
  () => {
    assert.throws(() =>
      write({ path, expectedSha256: hash(text), content: "overlap" }),
    );
  },
);
assert.equal(fs.readFileSync(target, "utf8"), text);
// An incomplete staging write must not truncate/replace the prior target.
fs.writeSync = () => 0;
syncBuiltinESMExports();
try {
  assert.throws(() =>
    write({ path, expectedSha256: hash(text), content: "incomplete" }),
  );
} finally {
  fs.writeSync = original;
  syncBuiltinESMExports();
}
assert.equal(fs.readFileSync(target, "utf8"), text);
fs.linkSync(target, "/workspace/src/hardlink-control.ts");
try {
  assert.throws(() =>
    write({ path, expectedSha256: hash(text), content: "wrong" }),
  );
} finally {
  fs.unlinkSync("/workspace/src/hardlink-control.ts");
}
assert.equal(fs.readFileSync(target, "utf8"), text);

// Deterministically replace a parent after its no-follow descriptor opens.
// The write stays anchored in the original source directory and cannot follow
// the replacement symlink into the worker's separate /tmp mount.
fs.mkdirSync("/workspace/src/race-parent");
const originalOpen = fs.openSync;
let replaced = false;
fs.openSync = (name, ...args) => {
  const fd = originalOpen(name, ...args);
  if (!replaced && String(name).endsWith("/race-parent")) {
    replaced = true;
    fs.renameSync("/workspace/src/race-parent", "/workspace/src/race-retained");
    fs.symlinkSync("/tmp", "/workspace/src/race-parent");
  }
  return fd;
};
syncBuiltinESMExports();
try {
  write({
    path: "src/race-parent/forecode-race-control.ts",
    expectedSha256: null,
    content: "// inert race control",
  });
  assert.ok(replaced);
  assert.equal(fs.existsSync("/tmp/forecode-race-control.ts"), false);
  assert.equal(
    fs.readFileSync(
      "/workspace/src/race-retained/forecode-race-control.ts",
      "utf8",
    ),
    "// inert race control",
  );
} finally {
  fs.openSync = originalOpen;
  syncBuiltinESMExports();
  fs.unlinkSync("/workspace/src/race-parent");
  fs.rmSync("/workspace/src/race-retained", { recursive: true });
}
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
// A real proposed adapter missing its factory cannot replace the saved one.
const adapterPath = "/workspace/src/server/team-benchmark.ts";
const adapterBefore = fs.readFileSync(adapterPath, "utf8");
const rejected = spawnSync(
  "/usr/local/bin/node",
  ["/run/team-workflow.mjs", "write"],
  {
    input: JSON.stringify({
      path: "src/server/team-benchmark.ts",
      expectedSha256: hash(adapterBefore),
      content: "export const partial = 1;\n",
    }),
    env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
  },
);
assert.notEqual(rejected.status, 0);
assert.match(rejected.stdout.toString(), /SOURCE_WRITE_BLOCKED/);
assert.equal(fs.readFileSync(adapterPath, "utf8"), adapterBefore);
assert.throws(() => fs.writeFileSync("/workspace/package.json", "wrong"));
write({
  path,
  expectedSha256: hash(text),
  content: "export const checked = 1;\n",
});
console.log(
  "SOURCE_WRITE_CONTROLS_PASS quotes backslashes multiline short-writes conflicts partial-input bounds paths symlinks readonly deadline",
);
