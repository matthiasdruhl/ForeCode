import { mkdtemp, readFile, stat, chmod, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { retainTeamDiagnostic } from "../../scripts/evaluator/booking-v1/team-diagnostics";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
it("keeps bounded protected observations outside worker inputs with immutable private custody", async () => {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "private-team-diagnostic-"),
  );
  roots.push(parent);
  const root = path.join(parent, "protected"),
    id = "11111111-1111-4111-8111-111111111111";
  const identity = {
    evaluatedTreeSha256: "a".repeat(64),
    evaluatorSha256: "b".repeat(64),
  };
  const write = (observation: unknown) =>
    retainTeamDiagnostic(
      root,
      id,
      "team-permissions-http",
      identity,
      observation,
    );
  expect(() => write("x".repeat(524288))).toThrow("bound");
  expect(write({ stdout: "private assertion failure", status: 1 })).toMatch(
    /^[a-f0-9]{64}$/,
  );
  const file = path.join(root, id, "team-permissions-http.json");
  expect((await stat(file)).mode & 0o777).toBe(0o400);
  expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
  expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
    ...identity,
    observation: { status: 1 },
  });
  expect(() => write({ status: 0 })).toThrow();
  await chmod(root, 0o755);
  expect(() => write({ status: 0 })).toThrow("custody");
  await chmod(root, 0o700);
  await symlink(root, path.join(parent, "alias"));
  expect(() =>
    retainTeamDiagnostic(
      path.join(parent, "alias"),
      id,
      "team-permissions-domain",
      identity,
      {},
    ),
  ).toThrow("custody");
  expect(() =>
    retainTeamDiagnostic(
      root,
      "../../outside",
      "team-permissions-domain",
      identity,
      {},
    ),
  ).toThrow("identity");
});
