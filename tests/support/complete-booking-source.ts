// Full public reviewed fixture bytes; data-only, never import/build/execute it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { snapshotTree } from "../../scripts/evaluator/booking-v1/snapshot";
export async function completeBookingSource() {
  const root = path.resolve("fixtures/booking-v1");
  const snapshot = await snapshotTree(root);
  const files = Object.fromEntries(
    await Promise.all(
      snapshot.files.map(
        async (entry) =>
          [
            entry.path,
            await readFile(path.join(root, entry.path), "utf8"),
          ] as const,
      ),
    ),
  );
  return { files, manifest: snapshot.files, treeSha256: snapshot.treeSha256 };
}
