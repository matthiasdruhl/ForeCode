import { constants } from "node:fs";
import { open, realpath, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { protectedRead } from "../artifacts/files";
import { sha256 } from "../../../src/lib/report/digests";
// Large image archives and installed tool binaries are hashed without loading
// their bytes into memory. Never follows a final symlink or reads a special file.
export async function largeFileIdentity(
  file: string,
  maxBytes = 2 * 1024 ** 3,
) {
  if ((await realpath(file)) !== path.resolve(file))
    throw new Error("Artifact alias forbidden");
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes || before.mode & 0o022)
      throw new Error("Invalid bounded artifact");
    const digest = createHash("sha256");
    let used = 0;
    for await (const bytes of handle.createReadStream({ autoClose: false })) {
      used += bytes.length;
      if (used > maxBytes) throw new Error("Artifact bound");
      digest.update(bytes);
    }
    const after = await handle.stat();
    if (
      used !== before.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("Artifact changed while hashing");
    return { sha256: digest.digest("hex"), bytes: used };
  } finally {
    await handle.close();
  }
}
export async function verifyToolingContext(
  root: string,
  manifest: { path: string; sha256: string; bytes: number }[],
) {
  const expected = [
    ".dockerignore",
    "Dockerfile",
    "package-lock.json",
    "package.json",
  ];
  const actual = (await readdir(root)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Unexpected tooling context input");
  for (const name of expected) {
    const bytes = await protectedRead(path.join(root, name), 2_097_152);
    const pin = manifest.find((f) => f.path === `toolchain/${name}`);
    if (!pin || sha256(bytes) !== pin.sha256 || bytes.length !== pin.bytes)
      throw new Error("Trusted tooling context changed");
  }
}
