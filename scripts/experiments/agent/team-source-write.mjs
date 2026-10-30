// Linux worker only. Atomic whole-file writes; stdin JSON never becomes code.
// Directory descriptors anchor every lookup beneath the src mount, including
// concurrent symlink replacement. No shell evaluation or code normalization.
import * as fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
export function writeSource(raw, root = "/workspace/src") {
  const value = JSON.parse(raw);
  if (
    Object.keys(value).sort().join() !== "content,expectedSha256,path" ||
    typeof value.content !== "string" ||
    !/^src\/(?:[A-Za-z0-9_()[\].-]+\/)*[A-Za-z0-9_()[\].-]+\.(ts|tsx|css|svg)$/.test(
      value.path,
    ) ||
    value.path
      .split("/")
      .some((p) => p === "." || p === ".." || p.startsWith(".env")) ||
    !(
      value.expectedSha256 === null ||
      /^[a-f0-9]{64}$/.test(value.expectedSha256)
    ) ||
    Buffer.byteLength(value.content) > 2_097_152
  )
    throw new Error("INVALID_SOURCE_WRITE");
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const bytes = Buffer.from(value.content);
  const descriptors = [];
  let temporary;
  let parent;
  try {
    const flags =
      fs.constants.O_RDONLY |
      fs.constants.O_DIRECTORY |
      fs.constants.O_NOFOLLOW;
    let directory = fs.openSync(root, flags);
    descriptors.push(directory);
    const parts = value.path.split("/").slice(1);
    for (const part of parts.slice(0, -1)) {
      const next = `/proc/self/fd/${directory}/${part}`;
      try {
        fs.mkdirSync(next, { mode: 0o700 });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      directory = fs.openSync(next, flags);
      descriptors.push(directory);
    }
    parent = `/proc/self/fd/${directory}`;
    const target = `${parent}/${parts.at(-1)}`;
    function current() {
      let fd;
      try {
        fd = fs.openSync(
          target,
          fs.constants.O_RDONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK,
        );
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2_097_152)
          throw new Error("INVALID_WRITE_TARGET");
        return hash(fs.readFileSync(fd));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
    if (current() !== value.expectedSha256)
      throw new Error("SOURCE_WRITE_CONFLICT");
    temporary = `${parent}/.forecode-write-${randomUUID()}`;
    const fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
        if (count <= 0) throw new Error("INCOMPLETE_SOURCE_WRITE");
        offset += count;
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (current() !== value.expectedSha256)
      throw new Error("SOURCE_WRITE_CONFLICT");
    fs.renameSync(temporary, target);
    temporary = undefined;
    fs.fsyncSync(directory);
    return { path: value.path, bytes: bytes.length, sha256: hash(bytes) };
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
    for (const fd of descriptors.reverse()) fs.closeSync(fd);
  }
}
