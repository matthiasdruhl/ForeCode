import { mkdtemp, readFile, stat, chmod, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  retainTeamDiagnostic,
  privateTeamFailure,
} from "../../scripts/evaluator/booking-v1/team-diagnostics";
import assert, { AssertionError } from "node:assert/strict";
const roots: string[] = [];
const context = {
  kind: "team-permissions-adversarial",
  teamNewOrdinal: 3,
  rpcOrdinal: 9,
  lastOp: "team-domain",
};
it("identifies private assertion context without serializing generated source, stacks or objects", () => {
  let failure: unknown;
  try {
    assert.equal("one", "two");
  } catch (error) {
    failure = error;
  }
  const record = JSON.parse(privateTeamFailure(failure, context));
  expect(record).toMatchObject({
    ...context,
    category: "assertion",
    code: "ERR_ASSERTION",
    actual: "one",
    expected: "two",
  });
  expect(record).not.toHaveProperty("message");
  const explicit = new AssertionError({
    message: "private case label",
    actual: { secret: "not serialized" },
    expected: "x".repeat(10000),
    operator: "deepStrictEqual",
  });
  Object.defineProperty(explicit, "actual", {
    get() {
      throw new Error("getter must not execute");
    },
  });
  const raw = privateTeamFailure(explicit, context);
  expect(JSON.parse(raw)).toMatchObject({
    message: "private case label",
    expected: "x".repeat(1024),
  });
  expect(raw).not.toContain("stack");
  expect(raw).not.toContain("not serialized");
  expect(raw).not.toContain("getter");
});
it("bounds multibyte private text and handles opaque thrown values without changing check status", () => {
  const failure = new AssertionError({
    message: "🔒".repeat(10000),
    actual: "🔒".repeat(10000),
    expected: null,
    operator: "strictEqual",
  });
  expect(Buffer.byteLength(privateTeamFailure(failure, context))).toBeLessThan(
    10000,
  );
  expect(
    JSON.parse(
      privateTeamFailure(
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error("opaque");
            },
            getOwnPropertyDescriptor() {
              throw new Error("opaque");
            },
          },
        ),
        context,
      ),
    ),
  ).toMatchObject({ category: "runtime" });
});
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
