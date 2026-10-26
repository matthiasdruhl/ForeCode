import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { snapshotTree } from "../../scripts/evaluator/booking-v1/snapshot";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "forecode-snapshot-unit-"));
  directories.push(root);
  return root;
}
it("hashes a sorted path/content manifest and excludes generated caches", async () => {
  const root = await setup();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "b.ts"), "export const value = 1;");
  const first = await snapshotTree(root);
  await mkdir(path.join(root, ".next"));
  await writeFile(path.join(root, ".next", "cache"), "unrelated");
  expect((await snapshotTree(root)).treeSha256).toBe(first.treeSha256);
  await writeFile(path.join(root, "src", "b.ts"), "export const value = 2;");
  expect((await snapshotTree(root)).treeSha256).not.toBe(first.treeSha256);
});
it("refuses secrets and symlinks before creating a task manifest", async () => {
  const root = await setup();
  await writeFile(path.join(root, ".env.local"), "UNIT_SECRET=fake");
  await expect(snapshotTree(root)).rejects.toThrow("Secret-bearing");
  await rm(path.join(root, ".env.local"));
  await writeFile(path.join(root, "source.ts"), "export {};");
  await symlink(path.join(root, "source.ts"), path.join(root, "link.ts"));
  await expect(snapshotTree(root)).rejects.toThrow("symlinks");
});
