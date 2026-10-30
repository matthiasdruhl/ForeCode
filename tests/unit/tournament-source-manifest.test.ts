import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { snapshotTree } from "../../scripts/evaluator/booking-v1/snapshot";
import { SourceManifestSchema } from "../../scripts/experiments/tournament/source-manifest";

describe("literal tournament source manifests", () => {
  it("accepts the complete actual fixture including dynamic route filenames", async () => {
    const snapshot = await snapshotTree(
      fileURLToPath(new URL("../../fixtures/booking-v1", import.meta.url)),
    );
    expect(snapshot.files.some((row) => row.path.includes("[id]"))).toBe(true);
    expect(SourceManifestSchema.parse(snapshot.files)).toEqual(snapshot.files);
  });
  it.each([
    "/src/a.ts",
    "../a.ts",
    "src/../a.ts",
    "src/./a.ts",
    "src//a.ts",
    "src/",
    "src\\a.ts",
    "src/*.ts",
    "src/a\n.ts",
    "src/$(id).ts",
  ])("rejects nonliteral or escaping path %s", (path) => {
    expect(
      SourceManifestSchema.safeParse([{ path, sha256: "a".repeat(64) }])
        .success,
    ).toBe(false);
  });
});
