import {
  mkdtemp,
  readFile,
  stat,
  chmod,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { retainTeamControlFailure } from "../../scripts/experiments/tournament/team-control-diagnostics";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await chmod(root, 0o700);
    await rm(root, { recursive: true, force: true });
  }
});
const record = {
  schemaVersion: "team-control-failure.local.v1",
  stage: "command",
  origin: "synthetic_no_inference",
  studyId: "synthetic-control",
  runId: null,
  implementationSha256: "a".repeat(64),
  inventorySha256: "b".repeat(64),
  compositionSha256: "c".repeat(64),
  observedAt: "2026-10-30T12:00:00.000Z",
  errorClass: null,
  commandSha256: "d".repeat(64),
  limitMilliseconds: 30000,
  maxBytes: 8000000,
  recentObservations: [
    {
      operation: "exec",
      commandSha256: "d".repeat(64),
      reason: "timed_out",
      exitCode: null,
      stdoutSha256: "e".repeat(64),
      stderrSha256: "f".repeat(64),
    },
  ],
};
it("durably retains only bounded hashes/counters in immutable private custody", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "team-control-failure-")),
  );
  roots.push(root);
  const file = await retainTeamControlFailure(root, record);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual(record);
  expect((await stat(file)).mode & 0o777).toBe(0o400);
  expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
  const second = await retainTeamControlFailure(root, record);
  expect(second).not.toBe(file);
  await expect(
    retainTeamControlFailure(root, { ...record, stderr: "SECRET" }),
  ).rejects.toThrow();
  await expect(
    retainTeamControlFailure(root, {
      ...record,
      recentObservations: Array(17).fill(record.recentObservations[0]),
    }),
  ).rejects.toThrow();
  await expect(
    retainTeamControlFailure(root, { ...record, errorClass: "RAW SECRET" }),
  ).rejects.toThrow();
});
it("refuses nonprivate roots and diagnostic directory aliases", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "team-control-custody-")),
  );
  roots.push(root);
  await chmod(root, 0o755);
  await expect(retainTeamControlFailure(root, record)).rejects.toThrow("0700");
  await chmod(root, 0o700);
  await symlink(root, path.join(root, "control-failures"));
  await expect(retainTeamControlFailure(root, record)).rejects.toThrow(
    "aliases",
  );
});
