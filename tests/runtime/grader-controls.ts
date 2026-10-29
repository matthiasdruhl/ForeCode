// Explicit disposable integration only. Never invoked by the application or CI.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { boundedProcess } from "../../scripts/experiments/runner/process";
import { prepareBookingWorkspace } from "../../scripts/experiments/prepare-booking";
import {
  captureReviewedTree,
  freezeCandidate,
} from "../../scripts/experiments/artifacts/files";
import { freezeBooking } from "../../scripts/evaluator/booking-v1/freeze";
import {
  validateGradeReport,
  type GradeInput,
} from "../../scripts/experiments/runner/protocol";
import { publishEvaluation } from "../../scripts/experiments/artifacts/publish";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "../../src/server/artifacts/evaluation-store";
import { jsonDigest } from "../../src/lib/report/digests";
const [record, docker] = process.argv.slice(2);
assert.ok(
  record && docker && path.isAbsolute(record) && path.isAbsolute(docker),
);
const selected = JSON.parse(await readFile(record, "utf8")) as {
  agentControl: string;
  graderControl: string;
  guestRoot: string;
  workerImage: string;
};
assert.match(selected.agentControl, /^forecode-trusted-controls-/);
assert.match(selected.graderControl, /^forecode-grader-controls-/);
assert.match(selected.workerImage, /^sha256:[a-f0-9]{64}$/);
const root = await realpath(
  await mkdtemp(path.join(tmpdir(), "forecode-protected-grader-controls-")),
);
await mkdir(path.join(root, "protected"), { mode: 0o700 });
await mkdir(path.join(root, "scratch"), { mode: 0o700 });
const pins = await freezeBooking();
const results: unknown[] = [];
async function control(
  args: string[],
  input?: unknown,
  milliseconds = 600_000,
) {
  return boundedProcess(docker!, args, {
    milliseconds,
    maxBytes: 2_097_152,
    input: input === undefined ? undefined : JSON.stringify(input),
  });
}
const node = [
  "exec",
  "-i",
  selected.graderControl,
  "/opt/forecode-booking/bin/node",
  "--conditions=react-server",
  "--import",
  "/opt/forecode-booking/node_modules/tsx/dist/loader.mjs",
  "/opt/forecode-booking/controller/guest.ts",
];
const evaluatorSha256 = jsonDigest({
  classification: "DISPOSABLE_NO_INFERENCE_HARNESS",
  implementationSha256: pins.evaluatorSha256,
  workerImage: selected.workerImage,
});
for (const mode of ["booking-pass", "booking-reject"]) {
  const runId = randomUUID(),
    nonce = randomUUID();
  const exported = path.join(root, "scratch", runId);
  await prepareBookingWorkspace(path.resolve("fixtures/booking-v1"), exported);
  const baseline = await captureReviewedTree(exported, runId);
  const request = {
    runId,
    nonce,
    candidate: baseline,
    workerImage:
      "sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d",
    prompt: "HARMLESS DISPOSABLE TRANSFORM ONLY — no coding agent",
    codexBinarySha256: "a".repeat(64),
    agentConfigSha256: "b".repeat(64),
    maxSeconds: 10,
    maxOutputBytes: 4096,
    model: "gpt-5.6-sol",
    tokenLimit: 100000,
    spendMicroUsd: 1000000,
    provider: {
      endpoint: "https://api.openai.com/v1/responses",
      maxOutputTokens: 32,
      inputMicroUsdPerToken: 1,
      outputMicroUsdPerToken: 1,
    },
  };
  const sealed = await control(
    [
      "exec",
      "-i",
      selected.agentControl,
      "python3",
      path.resolve("tests/runtime/modified-source-control.py"),
      selected.guestRoot,
    ],
    { mode, request },
    30_000,
  );
  assert.equal(sealed.reason, "completed");
  assert.equal(sealed.exitCode, 0, sealed.stderr);
  const output = JSON.parse(sealed.stdout);
  assert.equal(output.classification, "HARMLESS_TRANSFORM_NO_CODING_AGENT");
  assert.equal(jsonDigest(output.candidate), output.candidateSha256);
  const directory = path.join(root, "protected", runId);
  await mkdir(directory, { mode: 0o700 });
  const candidate = await freezeCandidate(
    output.candidate,
    runId,
    path.join(directory, "candidate"),
    baseline,
  );
  assert.notEqual(candidate.treeSha256, pins.fixtureSha256);
  const expected = {
    runId,
    evaluatedTreeSha256: candidate.treeSha256,
    evaluatorSha256,
    testSuiteSha256: pins.testSuiteSha256,
    requiredPolicySha256: pins.requiredPolicySha256,
  };
  const input: GradeInput = {
    ...expected,
    candidate: candidate.envelope,
    workerImage: selected.workerImage,
  };
  const started = new Date().toISOString();
  const graded = await control(node, input);
  const ended = new Date().toISOString();
  await writeFile(path.join(directory, "grader-observed.txt"), graded.stdout, {
    flag: "wx",
    mode: 0o400,
  });
  await writeFile(path.join(directory, "grader-stderr.txt"), graded.stderr, {
    flag: "wx",
    mode: 0o400,
  });
  assert.equal(graded.reason, "completed");
  assert.equal(graded.exitCode, 0, graded.stderr);
  const report = validateGradeReport(JSON.parse(graded.stdout), expected);
  const cleanup = await control([
    "exec",
    selected.graderControl,
    "/opt/forecode-booking/bin/node",
    "/opt/forecode-booking/controller/lifecycle.mjs",
    "cleanup",
    runId,
  ]);
  assert.equal(cleanup.exitCode, 0, cleanup.stderr);
  const entry = await publishEvaluation(
    directory,
    {
      ...expected,
      fixtureSha256: pins.fixtureSha256,
      requiredCheckIds: pins.policy.requiredCheckIds,
    },
    report,
    started,
    ended,
    {
      classification: "TEST_ONLY_NOT_AGENT_EVIDENCE",
      implementationSha256: pins.evaluatorSha256,
      workerImage: selected.workerImage,
    },
  );
  const trusted = await (
    await createProtectedEvaluationStore({
      root: path.join(root, "protected"),
      agentWorkspaceRoot: path.join(root, "scratch"),
      entries: new Map([[runId, entry]]),
    })
  ).load(runId);
  assert.ok(isTrustedEvaluation(trusted));
  assert.equal(
    trusted.verification.verdict,
    mode === "booking-pass" ? "VERIFIED" : "REJECTED",
  );
  assert.equal(trusted.receipt.evaluatedTreeSha256, candidate.treeSha256);
  results.push({
    mode,
    classification: "HARMLESS_TRANSFORM_NOT_AGENT_EXPERIMENT",
    verdict: trusted.verification.verdict,
    checks: trusted.checks.map((c) => ({ id: c.id, status: c.status })),
    modifiedTreeEvaluated: true,
    authenticatedTestReceipt: true,
    cleanup: true,
  });
  console.log(JSON.stringify(results.at(-1)));
  const badId = randomUUID();
  const bad = {
    ...input,
    runId: badId,
    candidate: { ...input.candidate, runId: badId },
    evaluatedTreeSha256: "f".repeat(64),
  };
  const refused = await control(node, bad);
  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.stdout, "");
  const badCleanup = await control([
    "exec",
    selected.graderControl,
    "/opt/forecode-booking/bin/node",
    "/opt/forecode-booking/controller/lifecycle.mjs",
    "cleanup",
    badId,
  ]);
  assert.equal(badCleanup.exitCode, 0);
  results.push({
    mode: "tampered-" + mode,
    classification: "NEGATIVE_CONTROL",
    refused: true,
    published: false,
  });
}
assert.equal((await freezeBooking()).evaluatorSha256, pins.evaluatorSha256);
await writeFile(
  path.join(root, "observation.json"),
  JSON.stringify(
    {
      classification: "DISPOSABLE_PROTECTED_GRADER_NO_CODING_AGENT",
      results,
      realAgent: "NOT_RUN",
      sbxGuestIsolation: "NOT_TESTED",
      realRuntimeAdmission: "NOT_SUPPLIED",
    },
    null,
    2,
  ),
  { flag: "wx", mode: 0o400 },
);
console.log(
  JSON.stringify({
    status: "PASS",
    results: results.length,
    realAgent: "NOT_RUN",
    artifactRoot: root,
  }),
);
