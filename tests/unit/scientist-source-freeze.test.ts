import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { freezeBooking } from "../../scripts/evaluator/booking-v1/freeze";

describe("Scientist implementation identity", () => {
  it("binds transport/flow/diagnostic/config/error source bodies without changing fixture pins", async () => {
    const current = await freezeBooking();
    const root = await mkdtemp(
      path.join(tmpdir(), "forecode-scientist-source-freeze-"),
    );
    try {
      // Source DATA only: never import or execute the copied fixture or tooling.
      for (const entry of [
        ...current.evaluatorManifest,
        ...current.fixtureManifest.map((e) => ({
          ...e,
          path: "fixtures/booking-v1/" + e.path,
        })),
      ]) {
        await mkdir(path.dirname(path.join(root, entry.path)), {
          recursive: true,
        });
        await writeFile(
          path.join(root, entry.path),
          await readFile(entry.path),
        );
      }
      const baseline = await freezeBooking(root);
      expect(baseline.evaluatorSha256).toBe(current.evaluatorSha256);
      for (const file of [
        "src/server/meta/failure-observation.ts",
        "src/server/meta/transport.ts",
        "src/server/meta/service.ts",
        "src/lib/foresight/prompts.ts",
        "src/server/config/meta.ts",
        "src/server/http/errors.ts",
      ]) {
        expect(baseline.evaluatorManifest.some((e) => e.path === file)).toBe(
          true,
        );
        const original = await readFile(path.join(root, file));
        await writeFile(
          path.join(root, file),
          Buffer.concat([
            original,
            Buffer.from("\n// synthetic identity change\n"),
          ]),
        );
        const changed = await freezeBooking(root);
        expect(changed.evaluatorSha256).not.toBe(baseline.evaluatorSha256);
        expect(changed.fixtureSha256).toBe(baseline.fixtureSha256);
        expect(changed.testSuiteSha256).toBe(baseline.testSuiteSha256);
        expect(changed.requiredPolicySha256).toBe(
          baseline.requiredPolicySha256,
        );
        await writeFile(path.join(root, file), original);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
