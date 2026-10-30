import { afterEach, describe, expect, it } from "vitest";
import { chmod, rm, writeFile, symlink, link } from "node:fs/promises";
import path from "node:path";
import { learningSourceFixture } from "../support/learning-source";
import { t, h } from "../support/learning";
import {
  createApprovedEvidenceSource,
  decisionCommitmentSubject,
  unprovisionedEvidenceSource,
} from "../../scripts/learning/source";
import { isAdmitted } from "../../scripts/learning/intake";
import { assessReward } from "../../scripts/learning/reward";
import { canonicalJson } from "../../src/lib/report/canonical";
import { sha256 } from "../../src/lib/report/digests";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function replace(file: string, bytes: string) {
  await chmod(file, 0o600);
  await writeFile(file, bytes);
}
describe("pinned approved export source — synthetic custody/store integration", () => {
  it("freshly loads signed originals and exact protected receipts without leaking diagnostics", async () => {
    const f = await learningSourceFixture(cleanup, { failures: ["BOUNDARY"] }),
      source = await f.source(),
      result = await source.load("approved-unit", t(30));
    expect(result.status).toBe("ADMITTED");
    if (result.status !== "ADMITTED")
      throw new Error("Expected synthetic admitted result.");
    expect(isAdmitted(result.observation)).toBe(true);
    expect(
      assessReward(result.observation, "SYNTHETIC").map((r) => r.correctness),
    ).toEqual([1, 0]);
    expect(() => assessReward(result.observation)).toThrow("Synthetic");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_GRADER_SENTINEL");
    expect(JSON.stringify(result)).not.toContain(f.parent);
    f.config.entries.clear();
    f.entry.bytesSha256 = h("changed");
    expect((await source.load("approved-unit", t(30))).status).toBe("ADMITTED");
  });
  it("defaults to authentic origin and exposes a genuinely empty unprovisioned production source", async () => {
    const f = await learningSourceFixture(cleanup);
    const source = await createApprovedEvidenceSource({
      ...f.config,
      mode: "AUTHENTIC",
    });
    expect(await source.load("approved-unit", t(30))).toEqual({
      status: "REJECTED",
      reason: "SYNTHETIC_SOURCE_ISOLATED",
    });
    expect(await source.load("../../private", t(30))).toEqual({
      status: "BLOCKED",
      reason: "SOURCE_ID_UNKNOWN",
    });
    expect(unprovisionedEvidenceSource.entryCount).toBe(0);
    expect(await unprovisionedEvidenceSource.load("anything", t(30))).toEqual({
      status: "BLOCKED",
      reason: "SOURCE_NOT_CONFIGURED",
    });
  });
  it.each([
    "bytes",
    "receipt",
    "revoked",
    "expired",
    "forged-record",
    "forged-evaluation",
    "symlink",
    "hardlink",
    "oversized",
    "unknown-key",
    "draft",
  ])("rejects %s source defect with fixed safe reason", async (defect) => {
    const f = await learningSourceFixture(cleanup);
    if (defect === "bytes") await replace(f.file, "{}");
    if (defect === "receipt")
      await replace(
        path.join(f.evalRoot, f.projection.arms[0]!.future.runId, "check.json"),
        "{}",
      );
    if (defect === "revoked")
      await replace(
        path.join(f.root, "revocations.json"),
        '{"revokedIds":["learning-export"]}',
      );
    if (defect === "symlink" || defect === "hardlink") {
      const alias = path.join(f.sourceRoot, "alias.json");
      if (defect === "symlink") await symlink(f.file, alias);
      else await link(f.file, alias);
      f.entry.file = "alias.json";
    }
    if (defect === "oversized") await replace(f.file, "x".repeat(1_048_577));
    if (defect === "unknown-key" || defect === "draft") {
      const bytes = canonicalJson(
        defect === "draft"
          ? { schemaVersion: "learning-tournament-draft.local.v1" }
          : { ...f.packet, gradingAuthority: "self-verified" },
      );
      await replace(f.file, bytes);
      f.entry.bytesSha256 = sha256(bytes);
    }
    if (defect === "forged-record") {
      const load = f.config.loadRecord;
      f.config.loadRecord = async (id) => structuredClone(await load(id));
    }
    if (defect === "forged-evaluation") {
      const load = f.config.loadEvaluation;
      f.config.loadEvaluation = async (id) => structuredClone(await load(id));
    }
    const result = await (
      await f.source()
    ).load(
      "approved-unit",
      defect === "expired" ? "2026-10-30T00:00:00.000Z" : t(30),
    );
    expect(result).toEqual({
      status: "REJECTED",
      reason: "ORIGINAL_OR_APPROVAL_INVALID",
    });
  });
  it("rejects a decision record written after outcomes even when the projection has an early timestamp", async () => {
    const f = await learningSourceFixture(cleanup);
    const late = await f.hold({
      schemaVersion: "tournament-custodian-record.local.v1",
      id: "late-decision",
      kind: "disclosure",
      studyId: f.projection.studyId,
      subjectSha256: decisionCommitmentSubject(f.projection),
      predecessorSha256: f.projection.protocolOriginalSha256,
      heldAt: t(11),
      expiresAt: "2026-10-29T12:00:00.000Z",
    });
    f.entry.decisionRecordId = late!.record.id;
    expect((await (await f.source()).load("approved-unit", t(30))).status).toBe(
      "REJECTED",
    );
  });
  it("rejects an approved packet with duplicate regression labels instead of hiding a negative result", async () => {
    const f = await learningSourceFixture(cleanup, {
      mutate: (p) => {
        p.regressions = [
          { action: "KEEP", occurred: false },
          { action: "KEEP", occurred: true },
        ];
      },
    });
    expect((await (await f.source()).load("approved-unit", t(30))).status).toBe(
      "REJECTED",
    );
  });
  it("rejects path, source-workspace, duplicate pin and custody-role configuration errors", async () => {
    const f = await learningSourceFixture(cleanup);
    await expect(
      createApprovedEvidenceSource({ ...f.config, excludedRoots: [] }),
    ).rejects.toThrow();
    await expect(
      createApprovedEvidenceSource({ ...f.config, excludedRoots: [f.parent] }),
    ).rejects.toThrow("disjoint");
    await expect(
      createApprovedEvidenceSource({
        ...f.config,
        entries: new Map([["one", { ...f.entry, file: "../private.json" }]]),
      }),
    ).rejects.toThrow();
    await expect(
      createApprovedEvidenceSource({
        ...f.config,
        entries: new Map([
          ["one", f.entry],
          ["two", f.entry],
        ]),
      }),
    ).rejects.toThrow("Reused");
    await expect(
      createApprovedEvidenceSource({
        ...f.config,
        entries: new Map([
          [
            "one",
            { ...f.entry, exportApprovalId: f.entry.projectionApprovalId },
          ],
        ]),
      }),
    ).rejects.toThrow("distinct");
  });
});
