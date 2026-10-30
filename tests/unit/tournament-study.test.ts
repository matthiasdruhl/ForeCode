import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, rm, writeFile, symlink, readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import {
  createStudyCustodyStore,
  requireHeldRecord,
} from "../../scripts/experiments/tournament/custody";
import {
  validatePreparedStudy,
  validateStudyDefinition,
  sourceDiff,
} from "../../scripts/experiments/tournament/study";
import {
  recordExternalCommitment,
  loadOperatorStudy,
} from "../../scripts/experiments/tournament/operator";
import { tournamentCli } from "../../scripts/experiments/tournament/cli";
import { studyFixture } from "../support/tournament-study";
import { hash } from "../support/research-data";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const data = await studyFixture();
  roots.push(data.parent);
  return data;
}
async function replaceTestOriginal(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
}
async function writeInputs(data: Awaited<ReturnType<typeof fixture>>) {
  for (const [name, value] of [
    ["definition", data.input.definition],
    ["draft", data.input.draft],
    ["preparation", data.input.evidence],
  ] as const)
    await writeFile(
      path.join(data.studyRoot, `${name}.json`),
      canonicalJson(value),
      { mode: 0o400 },
    );
}
describe("independently held tournament commitments (synthetic keys, no inference)", () => {
  it("defines protocol without any prepared B or observed cost and authenticates separate original records", async () => {
    const d = await fixture();
    expect(validateStudyDefinition(d.input.definition)).toEqual(
      d.input.definition,
    );
    expect(JSON.stringify(d.input.definition)).not.toContain(
      d.input.evidence.record.prepared.treeSha256,
    );
    expect(Object.isFrozen(d.study.evidence.record.metrics)).toBe(true);
    expect(d.study.changedFiles).toEqual(["src/policy.ts", "src/service.ts"]);
    expect(d.study.evidence.record.metrics.costUsd).toBeNull();
    expect(d.input.evidence.record.metrics).not.toBe(
      d.study.evidence.record.metrics,
    );
  });
  it.each([
    "task",
    "oracle",
    "policy",
    "original",
    "lock",
    "budget",
    "adapter",
    "prompt",
    "runtime",
    "model",
    "order",
  ])("rejects %s changed after the original freeze", async (field) => {
    const d = await fixture(),
      v = d.input.definition;
    if (field === "task") v.protocol.task.specification += " Changed";
    if (field === "oracle")
      v.protocol.futureOracle.oracle.testSuiteSha256 = hash("0");
    if (field === "policy")
      v.protocol.futureOracle.oracle.requiredPolicySha256 = hash("0");
    if (field === "original")
      v.protocol.conditions[0]!.originalTreeSha256 = hash("0");
    if (field === "lock")
      v.protocol.conditions[0]!.dependencyLockSha256 = hash("0");
    if (field === "budget") v.protocol.conditions[0]!.budget.maxSeconds++;
    if (field === "adapter") v.adapterInstructions += " Other";
    if (field === "prompt") v.downstreamPrompt += " Other";
    if (field === "runtime") v.runtime.supervisorSha256 = hash("0");
    if (field === "model") v.protocol.executionConditions[1]!.modelId = "other";
    if (field === "order") v.protocol.trialPolicy.order = "B_then_A";
    expect(() => validatePreparedStudy(d.input)).toThrow();
  });
  it.each([
    "forged",
    "late",
    "expired",
    "reused-study",
    "wrong-key",
    "tamper",
    "revoked",
    "symlink",
    "public-root",
    "workspace",
  ])("rejects custody defect %s", async (defect) => {
    const d = await fixture();
    if (defect === "forged") {
      expect(() =>
        validatePreparedStudy({
          ...d.input,
          protocol: structuredClone(d.input.protocol),
        }),
      ).toThrow();
      return;
    }
    if (["late", "expired", "reused-study"].includes(defect)) {
      const p = d.input.protocol.record;
      const held = await d.hold({
        ...p,
        id: "invalid-original",
        heldAt: defect === "late" ? "2026-10-28T12:01:00.000Z" : p.heldAt,
        expiresAt:
          defect === "expired" ? "2026-10-28T12:00:00.000Z" : p.expiresAt,
        studyId: defect === "reused-study" ? "other-study" : p.studyId,
      });
      expect(() =>
        validatePreparedStudy({ ...d.input, protocol: held }),
      ).toThrow();
      return;
    }
    if (defect === "wrong-key") d.config.publicKeyPem += " ";
    if (defect === "tamper")
      await replaceTestOriginal(
        path.join(d.root, "protocol-original.json"),
        "{}",
      );
    if (defect === "revoked")
      await replaceTestOriginal(
        path.join(d.root, "revocations.json"),
        canonicalJson({ revokedIds: ["protocol-original"] }),
      );
    if (defect === "symlink") {
      const file = path.join(d.root, "alias.json");
      await symlink(path.join(d.root, "protocol-original.json"), file);
      d.config.entries.get("protocol-original")!.file = "alias.json";
    }
    if (defect === "public-root") await chmod(d.root, 0o755);
    if (defect === "workspace") d.config.workspaceRoots = [d.root];
    try {
      expect(
        await (
          await createStudyCustodyStore(d.config)
        ).load("protocol-original"),
      ).toBeNull();
    } catch (error) {
      expect(["wrong-key", "public-root", "workspace"]).toContain(defect);
      expect(error).toBeInstanceOf(Error);
    }
  });
  it.each([
    "selection",
    "unauthorized",
    "negative-metrics",
    "forged-metrics",
    "inconsistent-time",
    "changed-B",
    "missing-history",
    "duplicate",
    "authorization-reuse",
  ])("rejects preparation defect %s", async (defect) => {
    const d = await fixture(),
      e = d.input.evidence;
    if (defect === "selection") e.selectionAt = "2026-10-28T11:00:00.000Z";
    if (defect === "unauthorized") d.input.authorizations.clear();
    if (defect === "negative-metrics") e.record.metrics.costUsd = -1;
    if (defect === "forged-metrics") e.record.metrics.costUsd = 0.25;
    if (defect === "inconsistent-time")
      e.record.finishedAt = e.record.startedAt;
    if (defect === "changed-B") e.preparedManifest[1]!.sha256 = hash("0");
    if (defect === "missing-history") e.attempts = [];
    if (defect === "duplicate") e.attempts.push({ ...e.attempts[0]! });
    if (defect === "authorization-reuse")
      e.attempts.push({ ...e.attempts[0]!, id: "prep-2" });
    expect(() => validatePreparedStudy(d.input)).toThrow();
  });
  it("rejects duplicate runs, noncanonical manifests and changes beyond src", async () => {
    const d = await fixture();
    d.input.definition.protocol.arms[1]!.runId =
      d.input.definition.protocol.arms[0]!.runId;
    expect(() => validateStudyDefinition(d.input.definition)).toThrow();
    expect(() =>
      sourceDiff(
        [{ path: "package-lock.json", sha256: hash("1") }],
        [{ path: "package-lock.json", sha256: hash("2") }],
      ),
    ).toThrow();
    expect(() =>
      sourceDiff(
        d.input.evidence.originalManifest,
        [...d.input.evidence.preparedManifest].reverse(),
      ),
    ).toThrow();
  });
  it("freshly reloads originals and writes only an exclusive reference; recovery cannot overwrite it", async () => {
    const d = await fixture();
    await writeInputs(d);
    expect(
      (await loadOperatorStudy(d.studyRoot, d.operatorConfig)).prepared.sha256,
    ).toBe(d.study.prepared.sha256);
    const index = await recordExternalCommitment(
      d.studyRoot,
      d.operatorConfig,
      "protocol",
    );
    expect(index.execution).toBe("DISABLED");
    const original = await readFile(
      path.join(d.studyRoot, "protocol-original-index.json"),
    );
    await expect(
      recordExternalCommitment(d.studyRoot, d.operatorConfig, "protocol"),
    ).rejects.toThrow();
    expect(
      await readFile(path.join(d.studyRoot, "protocol-original-index.json")),
    ).toEqual(original);
    await replaceTestOriginal(
      path.join(d.root, "prepared-original.json"),
      "{}",
    );
    await expect(
      loadOperatorStudy(d.studyRoot, d.operatorConfig),
    ).rejects.toThrow();
  });
  it("does not disclose task text, private paths or keys in CLI status and refuses execution", async () => {
    const d = await fixture();
    await writeInputs(d);
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(await tournamentCli(["--protocol", d.studyRoot])).toBe(2);
    expect(await tournamentCli(["--readiness", d.studyRoot])).toBe(2);
    const text = out.mock.calls.flat().join("");
    for (const secret of [
      d.root,
      d.input.definition.protocol.task.specification,
      d.config.publicKeyPem,
    ])
      expect(text).not.toContain(secret);
    expect(text).toContain("EXTERNAL_CUSTODY_NOT_CONFIGURED");
    expect(await tournamentCli(["--execute", d.studyRoot])).toBe(1);
  });
  it("rejects JSON approval labels, incorrect signatures and reused original pins", async () => {
    const d = await fixture();
    expect(() =>
      requireHeldRecord(
        { record: d.study.protocol.record, sha256: sha256("forged") },
        {
          studyId: d.study.draft.plan.manifest.id,
          kind: "protocol",
          subjectSha256: hash("0"),
          predecessorSha256: null,
          at: "2026-10-28T12:00:00.000Z",
        },
      ),
    ).toThrow();
    const entry = d.config.entries.get("protocol-original")!;
    const bytes = JSON.parse(
      await readFile(path.join(d.root, entry.file), "utf8"),
    );
    bytes.signature = Buffer.alloc(64).toString("base64");
    await replaceTestOriginal(
      path.join(d.root, entry.file),
      canonicalJson(bytes),
    );
    entry.sha256 = sha256(canonicalJson(bytes));
    expect(
      await (await createStudyCustodyStore(d.config)).load("protocol-original"),
    ).toBeNull();
    d.entries.set("reused", { ...entry });
    await expect(createStudyCustodyStore(d.config)).rejects.toThrow("Reused");
  });
});
