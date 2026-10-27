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
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

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
