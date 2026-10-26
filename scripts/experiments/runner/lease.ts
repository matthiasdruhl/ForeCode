import { randomUUID } from "node:crypto";
import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { privateDirectory, protectedRead } from "../artifacts/files";

// All controllers and the sandbox owner must coordinate on this same root.
// A dead host PID says nothing about guest state. Never auto-recover a lock.
export async function acquireBookingLease(root: string, runId: string) {
  const directory = path.join(
    await privateDirectory(root),
    ".booking-run.lock",
  );
  await mkdir(directory, { mode: 0o700 });
  const identity = await lstat(directory);
  const bytes = JSON.stringify({
    runId,
    nonce: randomUUID(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    recovery:
      "Establish guest termination and owner coordination before manual recovery.",
  });
  const ownerFile = path.join(directory, "owner.json");
  await writeFile(ownerFile, bytes, { flag: "wx", mode: 0o600 });
  async function assertOwned() {
    const current = await lstat(directory);
    if (
      current.isSymbolicLink() ||
      current.ino !== identity.ino ||
      current.dev !== identity.dev ||
      (await protectedRead(ownerFile)).toString() !== bytes
    )
      throw new Error("Lease ownership changed; manual coordination required");
  }
  return {
    directory,
    assertOwned,
    async release() {
      await assertOwned();
      await rm(directory, { recursive: true });
    },
  };
}
