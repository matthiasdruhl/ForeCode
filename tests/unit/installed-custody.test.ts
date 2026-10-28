import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  realpath,
  writeFile,
  chmod,
  rm,
  symlink,
  link,
  mkdir,
  open,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { sha256 } from "../../src/lib/report/digests";
import { dependencyRowsJson } from "../../scripts/experiments/isolation/toolchain-audit.mjs";
import { controllerFiles } from "../../scripts/evaluator/booking-v1/installed";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
// Import only the trusted inventory functions. Never call main(), ldd, Docker,
// a copied Node executable or any candidate; synthetic files remain inert data.
function inventory(
  file: string,
  executable = false,
  directory = false,
  syntheticMetadata = false,
  mutate = false,
) {
  return spawnSync(
    "python3",
    [
      "-I",
      "-c",
      `
import importlib.util, sys, json, os, pathlib
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('inventory', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
if sys.argv[5] == 'yes':
    # macOS sandbox strips setuid bits on chmod: simulate this metadata only.
    actual = pathlib.Path.lstat
    def altered(p):
        fields = list(actual(p))
        fields[0] |= 0o4000
        return os.stat_result(fields)
    pathlib.Path.lstat = altered
module.trusted_metadata(sys.argv[2], executable=sys.argv[3] == 'yes', directory=sys.argv[4] == 'yes')
if sys.argv[6] == 'yes':
    os.chmod(sys.argv[2], 0o555)
module.assert_unchanged()
print(json.dumps(module.metadata, sort_keys=True))
`,
      path.resolve("scripts/experiments/isolation/runtime-files.py"),
      file,
      executable ? "yes" : "no",
      directory ? "yes" : "no",
      syntheticMetadata ? "yes" : "no",
      mutate ? "yes" : "no",
    ],
    { encoding: "utf8", timeout: 2000, maxBuffer: 8192 },
  );
}
describe("installed custody guards — synthetic inert files, no VM or runtime execution", () => {
  it("hashes a current-size inert Codex artifact only with its explicit bounded allowance", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "forecode-codex-size-")),
    );
    roots.push(root);
    const file = path.join(root, "inert-data");
    const handle = await open(file, "wx", 0o644);
    await handle.truncate(269094232);
    await handle.close();
    const observed = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        `
import importlib.util, sys, json
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('inventory', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module.hashed(sys.argv[2])
    raise AssertionError('default grader bound widened')
except ValueError:
    pass
module.total = 0
accepted = module.hashed(sys.argv[2], maximum_bytes=384 * 1024**2)
module.total = 0
try:
    module.hashed(sys.argv[2], maximum_bytes=269094231)
    raise AssertionError('explicit executable bound ignored')
except ValueError:
    pass
print(json.dumps({'digest': accepted}))
`,
        path.resolve("scripts/experiments/isolation/runtime-files.py"),
        file,
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 8192 },
    );
    expect(observed.status, observed.stderr).toBe(0);
    expect(JSON.parse(observed.stdout).digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("matches the image dependency digest for nested paths and filename prefixes", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "forecode-custody-order-")),
    );
    roots.push(root);
    const installed = path.join(root, "opt/forecode-booking");
    for (const name of [
      "opt",
      "opt/forecode-booking",
      "opt/forecode-booking/bin",
      "opt/forecode-booking/controller",
      "opt/forecode-booking/node_modules",
      "opt/forecode-booking/node_modules/pkg",
      "opt/forecode-booking/node_modules/.bin",
    ]) {
      await mkdir(path.join(root, name), { mode: 0o755 });
    }
    for (const name of [
      "bin/node",
      "package.json",
      "package-lock.json",
      ...controllerFiles.map((name) => `controller/${name}`),
    ]) {
      await writeFile(path.join(installed, name), "INERT TRUSTED TEST DATA", {
        mode: name === "bin/node" ? 0o755 : 0o644,
      });
    }
    const files = ["pkg.js", "pkg/item.js", "pkg/bin.js", "\u{1f600}"];
    const rows: string[][] = [];
    for (const name of files) {
      const bytes = `INERT DEPENDENCY ${name}`;
      await writeFile(path.join(installed, "node_modules", name), bytes, {
        mode: 0o644,
      });
      rows.push([name, sha256(bytes)]);
    }
    await symlink(
      "../pkg/bin.js",
      path.join(installed, "node_modules/.bin/tool"),
    );
    rows.push([".bin/tool", "link", "../pkg/bin.js"]);
    const executable = path.join(root, "inert-executable");
    await writeFile(executable, "NEVER EXECUTE THIS INERT FILE", {
      mode: 0o755,
    });
    const observed = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        `
import importlib.util, sys, os, pathlib
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('inventory', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = type(pathlib.Path())
fixture_root, executable = sys.argv[2], sys.argv[3]
def mapped(value):
    value = os.fspath(value)
    if value == '/usr/bin/ldd':
        return original(executable)
    return original(fixture_root + value if value == '/opt' or value.startswith('/opt/') else value)
module.pathlib.Path = mapped
module.shutil.which = lambda name, path=None: executable
# No reviewed Node pin: main hashes inert files, never invokes ldd or Node.
sys.argv = [sys.argv[0], 'grader']
module.main()
`,
        path.resolve("scripts/experiments/isolation/runtime-files.py"),
        root,
        executable,
      ],
      { encoding: "utf8", timeout: 2000, maxBuffer: 16384 },
    );
    expect(observed.status, observed.stderr).toBe(0);
    expect(JSON.parse(observed.stdout).node_modules).toBe(
      sha256(dependencyRowsJson(rows)),
    );
  });
  it.each([0o600, 0o644, 0o666, 0o777])(
    "rejects Node mode %s despite unchanged executable bytes",
    async (mode) => {
      const root = await realpath(
        await mkdtemp(path.join(tmpdir(), "forecode-custody-")),
      );
      roots.push(root);
      const file = path.join(root, "node");
      await writeFile(file, "INERT SYNTHETIC EXECUTABLE DATA", { mode });
      await chmod(file, mode);
      const observed = inventory(file, true);
      expect(observed.status).toBe(1);
      expect(observed.stderr).toContain(
        "untrusted runtime custody or executable mode",
      );
    },
  );
  it("retains owner/group/mode identity and rejects writeable directories, aliases and hardlinks", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "forecode-custody-")),
    );
    roots.push(root);
    const file = path.join(root, "node");
    await writeFile(file, "INERT SYNTHETIC DATA", { mode: 0o755 });
    const good = inventory(file, true);
    expect(good.status).toBe(0);
    expect(inventory(file, true, false, true).status).toBe(1);
    expect(JSON.parse(good.stdout)[file]).toEqual([
      process.getuid?.(),
      process.getgid?.(),
      0o755,
    ]);
    expect(inventory(file, true, false, false, true).status).toBe(1);
    await chmod(file, 0o555);
    expect(inventory(file, true).stdout).not.toBe(good.stdout);
    await symlink(file, path.join(root, "alias"));
    expect(inventory(path.join(root, "alias"), true).status).toBe(1);
    await link(file, path.join(root, "hardlink"));
    expect(inventory(file, true).status).toBe(1);
    expect(inventory(root, false, true).status).toBe(1); // 0700 prevents worker traversal.
    await chmod(root, 0o755);
    expect(inventory(root, false, true).status).toBe(0);
    await chmod(root, 0o777);
    expect(inventory(root, false, true).status).toBe(1);
  });
});
