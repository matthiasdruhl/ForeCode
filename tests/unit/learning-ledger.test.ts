import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { learningSourceFixture } from "../support/learning-source";
import { t } from "../support/learning";
import { openEvidenceLedger } from "../../scripts/learning/ledger";
import { jsonDigest } from "../../src/lib/report/digests";
import { canonicalJson } from "../../src/lib/report/canonical";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(
  options: Parameters<typeof learningSourceFixture>[1] = {},
) {
  const f = await learningSourceFixture(cleanup, options),
    root = path.join(f.parent, "ledger");
  await mkdir(root, { mode: 0o700 });
  const source = await f.source(),
    result = await source.load("approved-unit", t(30));
  const config = {
    root,
    excludedRoots: [f.sourceRoot, path.join(f.parent, "worker")],
    expectedHead: { sequence: 0, sha256: null },
    mode: "SYNTHETIC" as const,
  };
  return {
    ...f,
    source,
    result,
    ledgerRoot: root,
    ledgerConfig: config,
    ledger: await openEvidenceLedger(config),
  };
}
describe("append-only admission ledger — synthetic originals, externally retained head", () => {
  it("preserves negative cases, replay and exclusions without issuing new training authority", async () => {
    const f = await fixture({ failures: ["BOUNDARY"] });
    const first = await f.ledger.append({
      sourceId: "approved-unit",
      at: t(30),
      result: f.result,
    });
    expect(first.entry.record.failedActions).toEqual(["BOUNDARY"]);
    expect(first.entry.record.correctnessRewards).toBe(2);
    expect(first.entry.record.costRewards).toBe(0);
    expect(first.entry.record.sourceAssessedAt).toBe(t(30));
    const replay = await f.ledger.append({
      sourceId: "approved-unit",
      at: t(31),
      result: await f.source.load("approved-unit", t(31)),
    });
    expect(replay.entry.record.status).toBe("REPLAY");
    expect(replay.entry.record.correctnessRewards).toBe(0);
    const rejected = await f.ledger.append({
      sourceId: "missing",
      at: t(32),
      result: await f.source.load("missing", t(32)),
    });
    expect(rejected.entry.record.status).toBe("BLOCKED");
    expect(rejected.entry.record.previousSha256).toBe(replay.head.sha256);
    const reopened = await openEvidenceLedger({
      ...f.ledgerConfig,
      expectedHead: rejected.head,
    });
    expect(
      (await reopened.inspect()).entries.map((e) => e.record.status),
    ).toEqual(["ADMITTED", "REPLAY", "BLOCKED"]);
    expect(
      await readFile(path.join(f.ledgerRoot, "entry-00000001.json"), "utf8"),
    ).toBe(canonicalJson(first.entry));
    expect(JSON.stringify(await reopened.inspect())).not.toContain(
      "PRIVATE_GRADER_SENTINEL",
    );
    expect(JSON.stringify(await reopened.inspect())).not.toContain(f.parent);
    await expect(openEvidenceLedger(f.ledgerConfig)).rejects.toThrow(
      "unanchored",
    );
  });
  it("records trusted but ineligible/blocked observations with unknown cost and no reward", async () => {
    const f = await fixture({
      mutate: (p) => {
        p.comparison = "BLOCKED";
        p.arms[1]!.preparationCostUsd = null;
      },
    });
    const entry = await f.ledger.append({
      sourceId: "approved-unit",
      at: t(30),
      result: f.result,
    });
    expect(entry.entry.record.status).toBe("ADMITTED");
    expect(entry.entry.record.reason).toBe("REWARD_INELIGIBLE");
    expect(entry.entry.record.correctnessRewards).toBe(0);
    expect(entry.entry.record.costRewards).toBe(0);
  });
  it.each(["suffix-deletion", "tamper", "rehashed-tamper", "extra-file"])(
    "rejects %s against the independently retained head",
    async (defect) => {
      const f = await fixture(),
        first = await f.ledger.append({
          sourceId: "approved-unit",
          at: t(30),
          result: f.result,
        });
      const file = path.join(f.ledgerRoot, "entry-00000001.json");
      if (defect === "suffix-deletion") await unlink(file);
      if (defect === "extra-file")
        await writeFile(path.join(f.ledgerRoot, "unexpected.json"), "{}");
      if (defect === "tamper" || defect === "rehashed-tamper") {
        const entry = structuredClone(first.entry);
        entry.record.sourceId = "different-source";
        if (defect === "rehashed-tamper")
          entry.sha256 = jsonDigest(entry.record);
        await chmod(file, 0o600);
        await writeFile(file, canonicalJson(entry));
      }
      await expect(
        openEvidenceLedger({ ...f.ledgerConfig, expectedHead: first.head }),
      ).rejects.toThrow();
    },
  );
  it("rejects forged source envelopes, synthetic-origin mismatch and backdated audits", async () => {
    const f = await fixture();
    await expect(
      f.ledger.append({
        sourceId: "wrong-source",
        at: t(30),
        result: f.result,
      }),
    ).rejects.toThrow("Source id mismatch");
    await expect(
      f.ledger.append({
        sourceId: "approved-unit",
        at: t(30),
        result: structuredClone(f.result),
      }),
    ).rejects.toThrow("Authenticated");
    await expect(
      f.ledger.append({
        sourceId: "approved-unit",
        at: t(29),
        result: f.result,
      }),
    ).rejects.toThrow("predates source");
    const other = path.join(f.parent, "authentic-ledger");
    await mkdir(other, { mode: 0o700 });
    const authentic = await openEvidenceLedger({
      ...f.ledgerConfig,
      root: other,
      mode: "AUTHENTIC",
    });
    await expect(
      authentic.append({
        sourceId: "approved-unit",
        at: t(30),
        result: f.result,
      }),
    ).rejects.toThrow("origin");
    await f.ledger.append({
      sourceId: "approved-unit",
      at: t(30),
      result: f.result,
    });
    await expect(
      f.ledger.append({
        sourceId: "unknown",
        at: t(29),
        result: { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" },
      }),
    ).rejects.toThrow("Backdated");
  });
  it("rejects stale/concurrent writers and stale locks without overwriting or stealing", async () => {
    const f = await fixture(),
      secondWriter = await openEvidenceLedger(f.ledgerConfig);
    const first = await f.ledger.append({
      sourceId: "approved-unit",
      at: t(30),
      result: f.result,
    });
    await expect(
      secondWriter.append({
        sourceId: "other",
        at: t(31),
        result: { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" },
      }),
    ).rejects.toThrow("unanchored");
    const lockfile = path.join(f.ledgerRoot, "intake.lock");
    await writeFile(lockfile, "operator-owned stale lock", { mode: 0o400 });
    await expect(f.ledger.inspect()).rejects.toThrow();
    expect(await readFile(lockfile, "utf8")).toBe("operator-owned stale lock");
    await unlink(lockfile);
    expect((await f.ledger.inspect()).head).toEqual(first.head);
    const results = await Promise.allSettled([
      f.ledger.append({
        sourceId: "one",
        at: t(31),
        result: { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" },
      }),
      f.ledger.append({
        sourceId: "two",
        at: t(31),
        result: { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" },
      }),
    ]);
    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const audit = await f.ledger.inspect();
    expect(audit.entries).toHaveLength(1 + successes.length);
    expect(new Set(audit.entries.map((e) => e.record.sequence)).size).toBe(
      audit.entries.length,
    );
  });
  it("requires private, canonical roots separated from originals/workspaces", async () => {
    const f = await fixture();
    await expect(
      openEvidenceLedger({ ...f.ledgerConfig, excludedRoots: [] }),
    ).rejects.toThrow();
    await expect(
      openEvidenceLedger({ ...f.ledgerConfig, excludedRoots: [f.parent] }),
    ).rejects.toThrow("disjoint");
    const alias = path.join(f.parent, "ledger-alias");
    await symlink(f.ledgerRoot, alias);
    await expect(
      openEvidenceLedger({ ...f.ledgerConfig, root: alias }),
    ).rejects.toThrow("aliases");
    await chmod(f.ledgerRoot, 0o755);
    await expect(openEvidenceLedger(f.ledgerConfig)).rejects.toThrow("0700");
  });
  it("fresh source reload observes revocation while historical failed outcomes remain in the ledger", async () => {
    const f = await fixture({ failures: ["BOUNDARY"] });
    await f.ledger.append({
      sourceId: "approved-unit",
      at: t(30),
      result: f.result,
    });
    const file = path.join(f.root, "revocations.json");
    await chmod(file, 0o600);
    await writeFile(file, canonicalJson({ revokedIds: ["learning-export"] }));
    const revoked = await f.source.load("approved-unit", t(31));
    expect(revoked.status).toBe("REJECTED");
    await f.ledger.append({
      sourceId: "approved-unit",
      at: t(31),
      result: revoked,
    });
    const audit = await f.ledger.inspect();
    expect(audit.entries.map((e) => e.record.status)).toEqual([
      "ADMITTED",
      "REJECTED",
    ]);
    expect(audit.entries[0]!.record.failedActions).toEqual(["BOUNDARY"]);
  });
});
