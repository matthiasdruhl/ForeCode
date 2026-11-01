// Explicit trusted guest/root maintenance. Synthetic assertions, no oracle run,
// candidate, grading receipt, provider, signing key or production journal write.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type * as Channel from "../../scripts/evaluator/booking-v1/team-authorization";

if (process.platform !== "linux" || process.getuid?.() !== 0)
  throw new Error("Explicit trusted guest/root control required.");
const file = "/opt/forecode-booking/controller/team-authorization.ts";
const channel = (await import(file)) as typeof Channel;
const input = JSON.parse(readFileSync(0, "utf8")) as {
  workerImage: string;
  pendingOperationId: string;
};
if (!/^sha256:[a-f0-9]{64}$/.test(input.workerImage))
  throw new Error("Exact inert worker image required.");
if (
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    input.pendingOperationId,
  )
)
  throw new Error("Exact existing pending operation required.");
const pendingPackage = `/var/lib/forecode-pending-instrumentation/${input.pendingOperationId}/package`;
assert.equal(lstatSync(pendingPackage).mode & 0o777, 0o700);
assert.equal(lstatSync(pendingPackage).uid, 0);
assert.equal(lstatSync(pendingPackage + "/oracle.mjs").mode & 0o777, 0o400);
const root = mkdtempSync("/var/lib/forecode-authorization-controls-");
const journal = root + "/journal";
const checks = [
  "team-permissions-domain",
  "team-permissions-http",
  "team-permissions-adversarial",
] as const;
const instrumentation = {
  schemaVersion: "booking-team-authorization-instrumentation.v1",
  semanticsSha256: "a".repeat(64),
  cases: checks.map((checkId, i) => ({
    checkId,
    caseId: `synthetic-control-${i}`,
  })),
};
const identity = {
  runId: randomUUID(),
  evaluatedTreeSha256: "b".repeat(64),
  evaluatorSha256: "c".repeat(64),
  testSuiteSha256: "d".repeat(64),
  requiredPolicySha256: "e".repeat(64),
};
for (const [i, checkId] of checks.entries()) {
  const collector = channel.createTeamAuthorizationCollector({
    instrumentation,
    identity,
    checkId,
    retain: (checkpoint) =>
      channel.retainTeamAuthorizationCheckpoint(journal, checkpoint),
  });
  if (i === 2) {
    const failure = new assert.AssertionError({
      message: "SYNTHETIC ASSERTION NOT AN ORACLE",
    });
    await assert.rejects(
      collector.observeCase(`synthetic-control-${i}`, () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  } else
    await collector.observeCase(`synthetic-control-${i}`, () =>
      assert.equal(2, 2),
    );
  collector.finish(i === 2 ? "fail" : "pass");
  let executed = false;
  await assert.rejects(
    collector.observeCase(`synthetic-control-${i}`, () => {
      executed = true;
    }),
  );
  assert.equal(executed, false);
}
const exported = channel.readTeamAuthorizationJournal(
  journal,
  identity,
  channel.authorizationInstrumentationDigest(instrumentation),
);
assert.equal(exported.groups.length, 3);
assert.deepEqual(
  exported.groups.map((g) => g.cases[0]!.outcome),
  ["pass", "pass", "fail"],
);
assert(exported.groups.every((g) => g.finalized && g.complete));
assert.throws(() =>
  channel.retainTeamAuthorizationCheckpoint(journal, exported.groups[0]),
);
const immutable = `${journal}/${identity.runId}/team-permissions-domain-003.json`;
assert.equal(lstatSync(immutable).mode & 0o777, 0o400);
const partialIdentity = { ...identity, runId: randomUUID() };
const partial = channel.createTeamAuthorizationCollector({
  instrumentation,
  identity: partialIdentity,
  checkId: checks[0],
  retain: (c) => channel.retainTeamAuthorizationCheckpoint(journal, c),
});
await partial.observeCase("synthetic-control-0", () => {});
assert.throws(() =>
  channel.readTeamAuthorizationJournal(
    journal,
    partialIdentity,
    channel.authorizationInstrumentationDigest(instrumentation),
  ),
);
await assert.rejects(partial.observeCase("synthetic-control-0", () => {}));
partial.finish("error"); // Retain incomplete/duplicate failure rather than reset.
const runtimeIdentity = { ...identity, runId: randomUUID() };
let runtimeFinal: Channel.TeamAuthorizationCheckpoint | undefined;
const runtime = channel.createTeamAuthorizationCollector({
  instrumentation,
  identity: runtimeIdentity,
  checkId: checks[0],
  retain: (c) => {
    channel.retainTeamAuthorizationCheckpoint(journal, c);
    if (c.finalized) runtimeFinal = c;
  },
});
const runtimeFailure = new Error("synthetic runtime failure");
await assert.rejects(
  runtime.observeCase("synthetic-control-0", () => {
    throw runtimeFailure;
  }),
  (error) => error === runtimeFailure,
);
runtime.finish("error");
assert.equal(runtimeFinal?.complete, false);
assert.equal(runtimeFinal?.cases[0]?.outcome, "invalid");

// Storage exceptions before or after a write never replace original assertions.
for (const failedOrdinal of [0, 1, 2, 3]) {
  for (const assertionFails of [false, true]) {
    const failure = new assert.AssertionError({
      message: "synthetic retained assertion",
    });
    let writes = 0,
      executed = false;
    const storageIdentity = { ...identity, runId: randomUUID() };
    const collector = channel.createTeamAuthorizationCollector({
      instrumentation,
      identity: storageIdentity,
      checkId: checks[0],
      retain: (c) => {
        channel.retainTeamAuthorizationCheckpoint(journal, c);
        if (writes++ === failedOrdinal)
          throw Error("synthetic post-write failure");
      },
    });
    const pending = collector.observeCase("synthetic-control-0", () => {
      executed = true;
      if (assertionFails) throw failure;
    });
    if (assertionFails) await assert.rejects(pending, (e) => e === failure);
    else await pending;
    collector.finish(assertionFails ? "fail" : "pass");
    assert(executed);
    assert.equal(collector.retentionAvailable(), false);
    assert.throws(() =>
      channel.readTeamAuthorizationJournal(
        journal,
        storageIdentity,
        channel.authorizationInstrumentationDigest(instrumentation),
      ),
    );
  }
}

function docker(args: string[]) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 65536,
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", NODE_ENV: "production" },
  });
}
for (const uid of [1000, 65534]) {
  const name = "forecode-authorization-denial-" + randomUUID();
  let removed = false;
  try {
    const probe = `const a=require('node:assert/strict'),f=require('node:fs');a.equal(process.getuid(),${uid});a.throws(()=>f.readFileSync('/protected-journal/${identity.runId}/team-permissions-domain-003.json'),e=>e.code==='EACCES');a.throws(()=>f.readFileSync('/protected-pending/oracle.mjs'),e=>e.code==='EACCES');process.stdout.write('PRIVATE_JOURNAL_AND_PENDING_PACKAGE_DENIED');`;
    const denied = docker([
      "run",
      "--rm",
      "--name",
      name,
      "--label",
      "forecode.booking.authorization.control=" + name,
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      `--user=${uid}:${uid}`,
      "--cpus=1",
      "--memory=128m",
      "--pids-limit=32",
      "--restart=no",
      "--mount",
      `type=bind,src=${journal},dst=/protected-journal,readonly`,
      "--mount",
      `type=bind,src=${pendingPackage},dst=/protected-pending,readonly`,
      "--entrypoint",
      "/usr/local/bin/node",
      input.workerImage,
      "-e",
      probe,
    ]);
    assert.equal(denied.status, 0, "Harmless private journal denial failed.");
    assert.equal(denied.stdout, "PRIVATE_JOURNAL_AND_PENDING_PACKAGE_DENIED");
    const rows = docker(["ps", "-aq", "--filter", "name=^/" + name + "$"]);
    assert.equal(rows.status, 0);
    assert.equal(rows.stdout.trim(), "");
    removed = true;
  } finally {
    if (!removed) {
      const cleanup = docker(["rm", "-f", name]);
      if (cleanup.status !== 0)
        throw new Error("Owned control cleanup requires review.");
    }
  }
}
const observation = {
  schemaVersion: "installed-team-authorization-control.v1",
  origin: "actual_guest_filesystem_and_denial_control_synthetic_assertions",
  controlRoot: root,
  providerRequests: 0,
  grading: "NOT_RUN",
  privateOracle: "NOT_EXECUTED",
  caseOutcomes: ["pass", "pass", "fail"],
  storageFailurePreservesVerdict: true,
  privateJournalDenied: true,
  privatePendingPackageDenied: true,
  deniedWorkerUids: [1000, 65534],
  collisionRefused: true,
  lateCallbackRefused: true,
  partialExportRefused: true,
  duplicateIncompleteRetained: true,
  runtimeInvalidRetained: true,
  ownedWorkerAbsent: true,
  journalSha256: exported.journalSha256,
};
writeFileSync(root + "/observations.json", JSON.stringify(observation), {
  flag: "wx",
  mode: 0o400,
});
process.stdout.write(JSON.stringify(observation));
