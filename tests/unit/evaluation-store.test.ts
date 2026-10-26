import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
  type EvaluationAllowlistEntry,
} from "@/server/artifacts/evaluation-store";
import { assembleEvaluatorReceipt } from "../../scripts/evaluator/booking-v1/receipt";
import { sha256 } from "@/lib/report/digests";
import { untrustedPreview } from "@/lib/verify/results";
import {
  check,
  evaluationIdentity,
  hash,
  time,
} from "../support/research-data";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(
  options: { failure?: boolean; missing?: boolean; duplicate?: boolean } = {},
) {
  const parent = await mkdtemp(path.join(tmpdir(), "forecode-custody-unit-"));
  temporary.push(parent);
  const root = path.join(parent, "protected");
  const workspace = path.join(parent, "task");
  await mkdir(path.join(root, "record", "checks"), { recursive: true });
  await mkdir(workspace);
  const checks = [
    check("baseline", options.failure ? "fail" : "pass"),
    ...(options.missing ? [] : [check("regression")]),
  ];
  for (const result of checks) {
    const bytes = JSON.stringify({
      fixture: "synthetic unit data",
      checkId: result.id,
      status: result.status,
    });
    result.artifactSha256 = sha256(bytes);
    await writeFile(path.join(root, "record", result.evidencePath!), bytes);
  }
  const identity = evaluationIdentity();
  const bundle = assembleEvaluatorReceipt({
    id: "receipt-unit",
    identity,
    checks,
    startedAt: time,
    finishedAt: time,
  });
  if (options.duplicate) bundle.checks.push(bundle.checks[0]!);
  const bytes = JSON.stringify(bundle);
  await writeFile(path.join(root, "record", "evaluation.json"), bytes);
  const entry: EvaluationAllowlistEntry = {
    directory: "record",
    bundleSha256: sha256(bytes),
    identity,
  };
  return {
    parent,
    root,
    workspace,
    entry,
    bundle,
    store: () =>
      createProtectedEvaluationStore({
        root,
        agentWorkspaceRoot: workspace,
        entries: new Map([["evaluation-unit", entry]]),
      }),
  };
}

describe("protected evaluator artifact custody", () => {
  it("loads only allowlisted exact bytes and returns immutable scoped verification", async () => {
    const data = await fixture();
    const store = await data.store();
    const trusted = await store.load("evaluation-unit");
    expect(trusted?.verification.verdict).toBe("VERIFIED");
    expect(isTrustedEvaluation(trusted)).toBe(true);
    expect(Object.isFrozen(trusted?.checks)).toBe(true);
    expect(isTrustedEvaluation(JSON.parse(JSON.stringify(trusted)))).toBe(
      false,
    );
    expect(await store.load("../../record")).toBeNull();
    expect(await store.load("missing")).toBeNull();
  });
  it("keeps forged agent success reports insufficient", () => {
    const preview = untrustedPreview(
      "preview-unit",
      "run-unit",
      ["baseline"],
      [check("baseline")],
    );
    expect(preview.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(preview.receiptId).toBeNull();
    expect(isTrustedEvaluation(preview)).toBe(false);
    expect(() =>
      untrustedPreview(
        "preview-unit",
        "wrong-run",
        ["baseline"],
        [check("baseline")],
      ),
    ).toThrow("another run");
  });
  it("gives trusted failure precedence even when another required result is missing", async () => {
    const data = await fixture({ failure: true, missing: true });
    expect(
      (await (await data.store()).load("evaluation-unit"))?.verification
        .verdict,
    ).toBe("REJECTED");
  });
  it("treats missing required checks as insufficient", async () => {
    const data = await fixture({ missing: true });
    expect(
      (await (await data.store()).load("evaluation-unit"))?.verification
        .verdict,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
  it.each([
    "evaluatedTreeSha256",
    "fixtureSha256",
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
  ] as const)("refuses stale %s pins", async (field) => {
    const data = await fixture();
    data.entry.identity[field] = hash("f");
    expect(await (await data.store()).load("evaluation-unit")).toBeNull();
  });
  it("rejects check-policy changes, cross-run substitution and duplicate check IDs", async () => {
    const changedPolicy = await fixture();
    changedPolicy.entry.identity.requiredCheckIds = ["optional-only"];
    expect(
      await (await changedPolicy.store()).load("evaluation-unit"),
    ).toBeNull();
    const changedRun = await fixture();
    changedRun.entry.identity.runId = "other-run";
    expect(await (await changedRun.store()).load("evaluation-unit")).toBeNull();
    const duplicate = await fixture({ duplicate: true });
    expect(await (await duplicate.store()).load("evaluation-unit")).toBeNull();
  });
  it("rejects changed check evidence even when a receipt still says pass", async () => {
    const data = await fixture();
    await writeFile(
      path.join(data.root, "record", "checks", "baseline.json"),
      '{"status":"fail"}',
    );
    expect(await (await data.store()).load("evaluation-unit")).toBeNull();
  });
  it("rejects forged canonical self-hashes even if outer bytes are repinned", async () => {
    const data = await fixture();
    data.bundle.receipt.integrity.manifestSha256 = hash("a");
    const bytes = JSON.stringify(data.bundle);
    await writeFile(path.join(data.root, "record", "evaluation.json"), bytes);
    data.entry.bundleSha256 = sha256(bytes);
    expect(await (await data.store()).load("evaluation-unit")).toBeNull();
  });
  it("does not trust copied or symlinked artifacts outside the protected root", async () => {
    const data = await fixture();
    const file = path.join(data.root, "record", "checks", "baseline.json");
    const external = path.join(data.workspace, "agent-controlled.json");
    await writeFile(external, await readFile(file));
    await rm(file);
    await symlink(external, file);
    expect(await (await data.store()).load("evaluation-unit")).toBeNull();
  });
  it("refuses overlapping protected and agent workspace roots", async () => {
    const data = await fixture();
    await expect(
      createProtectedEvaluationStore({
        root: data.root,
        agentWorkspaceRoot: data.parent,
        entries: new Map(),
      }),
    ).rejects.toThrow("disjoint");
  });
  it("takes an immutable copy of the controller allowlist", async () => {
    const data = await fixture();
    const store = await data.store();
    data.entry.identity.evaluatedTreeSha256 = hash("f");
    expect((await store.load("evaluation-unit"))?.verification.verdict).toBe(
      "VERIFIED",
    );
  });
});
