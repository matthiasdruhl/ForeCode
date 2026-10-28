import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createProtectedEvaluationStore,
  isTrustedEvaluation,
} from "@/server/artifacts/evaluation-store";
import { sha256 } from "@/lib/report/digests";
import {
  assembleSyntheticFutureEvaluation,
  futureEvaluationVerdict,
  prepareFutureEvaluation,
  validateFutureOracle,
} from "../../scripts/evaluator/booking-v1/future";
import { futureStudyData } from "../support/future-study-data";
import { check, hash } from "../support/research-data";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fixture(
  options: { fail?: boolean; missing?: boolean; unrun?: boolean } = {},
) {
  const draft = futureStudyData();
  const expected = { descriptor: draft.futureOracle, task: draft.task };
  const request = prepareFutureEvaluation({
    ...expected,
    runId: "synthetic-future-run",
    evaluatedTreeSha256: hash("a"),
    fixtureSha256: draft.plan.manifest.fixtureSha256,
  });
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-future-oracle-unit-")),
  );
  temporary.push(parent);
  const root = path.join(parent, "protected");
  const workspace = path.join(parent, "task");
  await mkdir(path.join(root, "record", "checks"), { recursive: true });
  await mkdir(workspace);
  const checks = request.identity.requiredCheckIds
    .filter((_, i) => !options.missing || i > 0)
    .map((id, i) => ({
      ...check(
        id,
        options.fail && i === 0
          ? "fail"
          : options.unrun && i === 0
            ? "not_run"
            : "pass",
      ),
      runId: request.identity.runId,
    }));
  for (const result of checks)
    if (result.evidencePath) {
      const bytes = JSON.stringify({
        evidenceOrigin: "synthetic",
        status: result.status,
      });
      result.artifactSha256 = sha256(bytes);
      await writeFile(path.join(root, "record", result.evidencePath), bytes);
    }
  const synthetic = assembleSyntheticFutureEvaluation(request, {
    id: "synthetic-future-receipt",
    checks,
    startedAt: "2026-10-28T17:00:00.000Z",
    finishedAt: "2026-10-28T17:00:01.000Z",
  });
  const bytes = JSON.stringify(synthetic.bundle);
  const filename = path.join(root, "record", "evaluation.json");
  await writeFile(filename, bytes);
  const store = await createProtectedEvaluationStore({
    root,
    agentWorkspaceRoot: workspace,
    entries: new Map([
      [
        request.identity.runId,
        {
          directory: "record",
          bundleSha256: sha256(bytes),
          identity: request.identity,
        },
      ],
    ]),
  });
  return {
    draft,
    expected,
    request,
    synthetic,
    root,
    workspace,
    filename,
    store,
    verdict: (evidence: unknown) =>
      futureEvaluationVerdict(request, evidence, expected),
  };
}

describe("future oracle integration with existing protected store (synthetic only)", () => {
  it("uses original check bytes for exact candidate/policy verification; assembly alone has no authority", async () => {
    const data = await fixture();
    expect(isTrustedEvaluation(data.synthetic)).toBe(false);
    expect(data.verdict(data.synthetic.bundle)).toBe("INSUFFICIENT_EVIDENCE");
    const loaded = await data.store.load(data.request.identity.runId);
    expect(data.verdict(loaded)).toBe("VERIFIED");
    expect(data.verdict(JSON.parse(JSON.stringify(loaded)))).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(data.synthetic.executionStatus).toBe("NOT_RUN");
  });
  it.each([
    [{ missing: true }, "INSUFFICIENT_EVIDENCE"],
    [{ unrun: true }, "INSUFFICIENT_EVIDENCE"],
    [{ fail: true }, "REJECTED"],
    [{ missing: true, fail: true }, "REJECTED"],
  ] as const)(
    "preserves missing, unexecuted and failed observations %j",
    async (options, verdict) => {
      const data = await fixture(options);
      expect(
        data.verdict(await data.store.load(data.request.identity.runId)),
      ).toBe(verdict);
    },
  );
  it.each([
    "evaluatedTreeSha256",
    "evaluatorSha256",
    "testSuiteSha256",
    "requiredPolicySha256",
    "fixtureSha256",
  ] as const)("rejects stale/substituted %s", async (field) => {
    const data = await fixture();
    const evidence = await data.store.load(data.request.identity.runId);
    const changed = structuredClone(data.request);
    changed.identity[field] = hash("0");
    expect(futureEvaluationVerdict(changed, evidence, data.expected)).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
  });
  it("binds task and descriptor commitments and rejects forged process success", async () => {
    const data = await fixture();
    const loaded = await data.store.load(data.request.identity.runId);
    for (const field of ["taskDefinitionSha256", "descriptorSha256"] as const)
      expect(
        futureEvaluationVerdict(
          { ...data.request, [field]: hash("0") },
          loaded,
          data.expected,
        ),
      ).toBe("INSUFFICIENT_EVIDENCE");
    expect(
      data.verdict({
        exitCode: 0,
        verdict: "VERIFIED",
        checks: data.synthetic.bundle.checks,
      }),
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
  it.each(["receipt", "check-bytes", "evidence-symlink"])(
    "fresh reload rejects tampered %s",
    async (defect) => {
      const data = await fixture();
      if (defect === "receipt")
        await writeFile(
          data.filename,
          JSON.stringify({
            ...data.synthetic.bundle,
            receipt: {
              ...data.synthetic.bundle.receipt,
              evaluatorSha256: hash("0"),
            },
          }),
        );
      else {
        const target = path.join(
          data.root,
          "record",
          data.synthetic.bundle.checks[0]!.evidencePath!,
        );
        if (defect === "check-bytes") await writeFile(target, "changed bytes");
        else {
          await rm(target);
          await symlink(data.filename, target);
        }
      }
      expect(
        data.verdict(await data.store.load(data.request.identity.runId)),
      ).toBe("INSUFFICIENT_EVIDENCE");
    },
  );
  it("refuses overlapping task/protected custody and cannot resolve agent-selected records", async () => {
    const data = await fixture();
    await expect(
      createProtectedEvaluationStore({
        root: data.root,
        agentWorkspaceRoot: data.root,
        entries: new Map(),
      }),
    ).rejects.toThrow("disjoint");
    expect(await data.store.load("../record")).toBeNull();
    expect(await data.store.load("agent-success")).toBeNull();
  });
  it("preserves baseline policy and requires separate future suite/evaluator identities", () => {
    const draft = futureStudyData();
    const changes = [
      (d: typeof draft) => {
        d.futureOracle.baselineOracle.requiredCheckIds.pop();
      },
      (d: typeof draft) => {
        d.futureOracle.oracle.requiredCheckIds.pop();
      },
      (d: typeof draft) => {
        d.futureOracle.oracle.requiredCheckIds[1] =
          d.futureOracle.oracle.requiredCheckIds[0]!;
      },
      (d: typeof draft) => {
        d.futureOracle.oracle.evaluatorSha256 =
          d.futureOracle.baselineOracle.evaluatorSha256;
      },
      (d: typeof draft) => {
        d.futureOracle.taskDefinitionSha256 = hash("0");
      },
    ];
    for (const change of changes) {
      const altered = structuredClone(draft);
      change(altered);
      expect(() =>
        validateFutureOracle(altered.futureOracle, altered.task),
      ).toThrow();
    }
  });
});
