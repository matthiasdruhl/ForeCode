import { constants } from "node:fs";
import {
  open,
  lstat,
  realpath,
  mkdir,
  writeFile,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { snapshotTree } from "../../evaluator/booking-v1/snapshot";
import { jsonDigest, sha256 } from "../../../src/lib/report/digests";

export function disjoint(a: string, b: string) {
  const within = (root: string, other: string) => {
    const rel = path.relative(root, other);
    return (
      rel === "" ||
      (!rel.startsWith(`..${path.sep}`) &&
        rel !== ".." &&
        !path.isAbsolute(rel))
    );
  };
  if (within(a, b) || within(b, a))
    throw new Error("Controller paths must be disjoint.");
}
export async function privateDirectory(input: string) {
  const resolved = await realpath(input);
  if (resolved !== path.resolve(input))
    throw new Error("Controller directory aliases are forbidden.");
  const info = await lstat(resolved);
  if (
    !info.isDirectory() ||
    (info.mode & 0o077) !== 0 ||
    info.uid !== process.getuid?.()
  )
    throw new Error(
      "Controller directory must be owned by this operator and mode 0700.",
    );
  return resolved;
}
export async function protectedRead(file: string, limit = 1_048_576) {
  if ((await realpath(file)) !== path.resolve(file))
    throw new Error("Protected file aliases are forbidden.");
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid?.() ||
      before.mode & 0o022 ||
      before.size > limit
    )
      throw new Error("Invalid protected regular file.");
    const bytes = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    const linked = await lstat(file);
    if (
      linked.ino !== before.ino ||
      linked.dev !== before.dev ||
      linked.isSymbolicLink() ||
      bytesRead > limit ||
      bytesRead !== before.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("Protected file changed or exceeded bound.");
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
export const CandidateEnvelopeSchema = z.strictObject({
  runId: z.string().uuid(),
  files: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(240),
        base64: z.string().max(2_800_000),
      }),
    )
    .min(1)
    .max(100),
});
export type CandidateEnvelope = z.infer<typeof CandidateEnvelopeSchema>;
export async function captureReviewedTree(
  root: string,
  runId: string,
): Promise<CandidateEnvelope> {
  const first = await snapshotTree(root);
  const files = await Promise.all(
    first.files.map(async (file) => {
      const bytes = await protectedRead(path.join(root, file.path), 2_097_152);
      if (sha256(bytes) !== file.sha256)
        throw new Error("Source mutation during capture.");
      return { path: file.path, base64: bytes.toString("base64") };
    }),
  );
  if ((await snapshotTree(root)).treeSha256 !== first.treeSha256)
    throw new Error("Source mutation during capture.");
  return { runId, files };
}
// Candidate bytes are data only. Never import, install, build or run them here.
export async function freezeCandidate(
  input: unknown,
  expectedRun: string,
  destination: string,
  baseline: CandidateEnvelope,
) {
  const envelope = CandidateEnvelopeSchema.parse(input);
  if (envelope.runId !== expectedRun)
    throw new Error("Wrong or stale candidate run.");
  const seen = new Set<string>();
  let total = 0;
  const pinned = new Map(
    baseline.files
      .filter((f) => !f.path.startsWith("src/"))
      .map((f) => [f.path, f.base64]),
  );
  const files = envelope.files.map((file) => {
    if (
      !/^(?:src\/(?:[A-Za-z0-9_()[\].-]+\/)*[A-Za-z0-9_()[\].-]+\.(?:ts|tsx|css|svg)|[A-Za-z0-9_.-]+|tests\/visible\/[A-Za-z0-9_.-]+\.ts)$/.test(
        file.path,
      ) ||
      file.path
        .split("/")
        .some((p) => p === "." || p === ".." || p.startsWith(".env")) ||
      seen.has(file.path)
    )
      throw new Error("Unsafe candidate path.");
    if (!file.path.startsWith("src/") && pinned.get(file.path) !== file.base64)
      throw new Error(
        "Candidate changed pinned configuration or visible tests.",
      );
    seen.add(file.path);
    const bytes = Buffer.from(file.base64, "base64");
    if (
      bytes.toString("base64") !== file.base64 ||
      bytes.length > 2_097_152 ||
      (total += bytes.length) > 8_000_000
    )
      throw new Error("Candidate exceeds transfer policy.");
    return { path: file.path, bytes, sha256: sha256(bytes) };
  });
  if ([...pinned.keys()].some((name) => !seen.has(name)))
    throw new Error("Candidate omitted pinned files.");
  await mkdir(destination, { mode: 0o700 });
  for (const file of files) {
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, file.bytes, { flag: "wx", mode: 0o400 });
  }
  const manifest = files
    .map(({ path: name, sha256: hash }) => ({ path: name, sha256: hash }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const treeSha256 = jsonDigest(manifest);
  if ((await snapshotTree(destination)).treeSha256 !== treeSha256)
    throw new Error("Frozen candidate mismatch.");
  // Files are immutable to normal writers; hashes are rechecked before/after grading.
  for (const directory of new Set(
    files.map((file) => path.dirname(path.join(destination, file.path))),
  ))
    await chmod(directory, 0o500);
  await chmod(destination, 0o500);
  for (const file of envelope.files) Object.freeze(file);
  Object.freeze(envelope.files);
  Object.freeze(envelope);
  return { directory: destination, treeSha256, manifest, envelope };
}
