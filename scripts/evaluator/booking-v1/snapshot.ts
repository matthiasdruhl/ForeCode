import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";

const ignored = new Set([
  ".git",
  "node_modules",
  ".next",
  "coverage",
  "test-results",
  "playwright-report",
]);
export async function snapshotTree(rootInput: string) {
  const root = await realpath(rootInput);
  const files: { path: string; sha256: string }[] = [];
  let visited = 0;
  let totalBytes = 0;
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (++visited > 10_000 || relative.split("/").length > 32)
        throw new Error("Task snapshot traversal exceeds fixture limits.");
      if (
        prefix === "" &&
        (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo"))
      )
        continue;
      if (ignored.has(entry.name))
        throw new Error(
          "Nested generated/dependency directories are forbidden in source snapshots.",
        );
      if (entry.name.startsWith(".env") && entry.name !== ".env.example")
        throw new Error(
          "Secret-bearing configuration is forbidden in a task snapshot.",
        );
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink())
        throw new Error("Task snapshots must not contain symlinks.");
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) {
        if (files.length >= 5000 || info.size > 2_097_152)
          throw new Error("Task snapshot exceeds fixture limits.");
        totalBytes += info.size;
        if (totalBytes > 52_428_800)
          throw new Error("Task snapshot exceeds total byte limit.");
        files.push({
          path: relative,
          sha256: sha256(await readFile(absolute)),
        });
      } else throw new Error("Task snapshots contain regular files only.");
    }
  }
  await walk(root, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, treeSha256: jsonDigest(files) };
}
