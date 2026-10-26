import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareBookingWorkspace } from "../../scripts/experiments/prepare-booking";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "forecode-prepare-unit-"));
  directories.push(root);
  const source = path.join(root, "fixture");
  const destination = path.join(root, "export");
  await mkdir(source);
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ name: "@forecode/booking-v1" }),
  );
  await mkdir(path.join(source, "src"));
  await writeFile(
    path.join(source, "src", "index.ts"),
    "export const fixture = true;",
  );
  return { source, destination };
}
it("exports a matching fixture snapshot without controllers or generated caches", async () => {
  const data = await setup();
  await mkdir(path.join(data.source, ".next"));
  await writeFile(path.join(data.source, ".next", "cache"), "generated");
  const result = await prepareBookingWorkspace(data.source, data.destination);
  expect(result.executionStatus).toBe("NOT_RUN");
  expect(result.files).toBe(2);
  expect(
    await readFile(path.join(data.destination, "src", "index.ts"), "utf8"),
  ).toContain("fixture");
  await expect(
    readFile(path.join(data.destination, ".next", "cache")),
  ).rejects.toThrow();
});
it("refuses existing outputs, secrets and evaluator leakage", async () => {
  const data = await setup();
  await mkdir(data.destination);
  await expect(
    prepareBookingWorkspace(data.source, data.destination),
  ).rejects.toThrow();
  await rm(data.destination, { recursive: true });
  await mkdir(path.join(data.source, "evaluator"));
  await writeFile(
    path.join(data.source, "evaluator", "private.ts"),
    "export {};",
  );
  await expect(
    prepareBookingWorkspace(data.source, data.destination),
  ).rejects.toThrow("must remain outside");
  await rm(path.join(data.source, "evaluator"), { recursive: true });
  await writeFile(path.join(data.source, ".env.local"), "UNIT_SECRET=fake");
  await expect(
    prepareBookingWorkspace(data.source, data.destination),
  ).rejects.toThrow("Secret-bearing");
});
