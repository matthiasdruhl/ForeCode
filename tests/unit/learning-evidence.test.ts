import { afterEach, describe, expect, it } from "vitest";
import { chmod, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { admitObservation } from "../../scripts/learning/intake";
import { assessReward } from "../../scripts/learning/reward";
import { retrieveEvidence } from "../../scripts/learning/memory";
import { learningFixture, snapshotOf, h, t } from "../support/learning";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { force: true, recursive: true })),
  );
});

describe("learning intake through actual custody and protected-store boundaries — SYNTHETIC only", () => {
  it("admits exact approved bytes, keeps ties and charges preparation without leaking private diagnostics", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit();
    expect(Object.isFrozen(o.projection.context)).toBe(true);
    expect(() => assessReward(o)).toThrow("Synthetic");
    const rewards = assessReward(o, "SYNTHETIC");
    expect(rewards.map((r) => r.correctness)).toEqual([1, 1]);
    expect(rewards.map((r) => r.totalCostUsd)).toEqual([3, 5]);
    expect(rewards[0]!.efficiency).toBeCloseTo(0.4);
    expect(rewards[1]!.efficiency).toBe(0);
    expect(rewards.every((r) => r.reasons.includes("CORRECTNESS_TIE"))).toBe(
      true,
    );
    expect(JSON.stringify(o)).not.toContain("PRIVATE_GRADER_SENTINEL");
  });
  it.each([
    "forged-approval",
    "forged-evaluation",
    "changed-projection",
    "revoked",
    "stale-source",
    "tampered-check",
    "expired",
  ])("rejects %s", async (defect) => {
    const f = await learningFixture(cleanup);
    if (defect === "forged-approval") {
      const actual = f.input.loadRecord;
      f.input.loadRecord = async (id) =>
        JSON.parse(JSON.stringify(await actual(id)));
    }
    if (defect === "forged-evaluation") {
      const actual = f.input.loadEvaluation;
      f.input.loadEvaluation = async (id) =>
        JSON.parse(JSON.stringify(await actual(id)));
    }
    if (defect === "changed-projection")
      f.projection.arms[0]!.downstreamCostUsd = 0;
    if (defect === "revoked") {
      const file = path.join(f.root, "revocations.json");
      await chmod(file, 0o600);
      await writeFile(
        file,
        JSON.stringify({ revokedIds: [f.input.approvalId] }),
      );
    }
    if (defect === "stale-source")
      f.evalEntries.values().next().value!.identity.evaluatedTreeSha256 =
        h("different");
    if (defect === "tampered-check") {
      const ref = f.projection.arms[0]!.future,
        file = path.join(f.evalRoot, ref.runId, "check.json");
      await chmod(file, 0o600);
      await writeFile(file, "{}");
    }
    if (defect === "expired") f.input.assessmentAt = "2026-10-30T12:00:00.000Z";
    await expect(f.admit()).rejects.toThrow();
  });
  it.each([
    "late-context",
    "late-observation",
    "duplicate-receipt",
    "baseline-failure",
    "wrong-protocol",
    "missing-attempt",
  ])("rejects approved but inconsistent %s", async (defect) => {
    const f = await learningFixture(cleanup, {
      baselineFailure: defect === "baseline-failure",
      mutate: (p) => {
        if (defect === "late-context") p.context.frozenAt = t(8);
        if (defect === "late-observation") p.observedAt = t(40);
        if (defect === "duplicate-receipt")
          p.arms[1]!.future = p.arms[0]!.future;
        if (defect === "wrong-protocol") p.protocolOriginalSha256 = h("other");
        if (defect === "missing-attempt") p.attempts[1]!.id = "other-run";
      },
    });
    await expect(f.admit()).rejects.toThrow();
  });
  it("gives correctness hard priority over cheap failure and preserves both failures", async () => {
    const f = await learningFixture(cleanup, { failures: ["BOUNDARY"] });
    const rewards = assessReward(await f.admit(), "SYNTHETIC");
    expect(rewards.map((r) => r.correctness)).toEqual([1, 0]);
    expect(rewards.every((r) => r.efficiency === null)).toBe(true);
    const both = await learningFixture(cleanup, {
      id: "both",
      failures: ["KEEP", "BOUNDARY"],
    });
    const failed = assessReward(await both.admit(), "SYNTHETIC");
    expect(failed.map((r) => r.correctness)).toEqual([0, 0]);
    expect(
      failed.every(
        (r) => r.reasons.includes("BOTH_FAILED") && r.efficiency === null,
      ),
    ).toBe(true);
  });
  it.each(["missing-check", "invalid", "blocked", "retry", "cancelled"])(
    "retains %s without numeric rewards",
    async (defect) => {
      const f = await learningFixture(cleanup, {
        missing: defect === "missing-check" ? ["BOUNDARY"] : [],
        mutate: (p) => {
          if (defect === "invalid") p.comparison = "INVALID";
          if (defect === "blocked") p.comparison = "BLOCKED";
          if (defect === "retry")
            p.attempts.push({
              ...p.attempts[0]!,
              id: "failed-first-attempt",
              status: "failed",
            });
          if (defect === "cancelled") p.attempts[0]!.status = "cancelled";
        },
      });
      const o = await f.admit();
      expect(
        assessReward(o, "SYNTHETIC").every(
          (r) => r.correctness === null && r.efficiency === null,
        ),
      ).toBe(true);
      expect(o.projection.attempts).toHaveLength(defect === "retry" ? 3 : 2);
    },
  );
  it("keeps missing prep unknown, guards zero denominators and never prefers complexity on equal costs", async () => {
    const f = await learningFixture(cleanup, {
      mutate: (p) => {
        p.arms[1]!.preparationCostUsd = null;
      },
    });
    const rewards = assessReward(await f.admit(), "SYNTHETIC");
    expect(rewards[1]!.totalCostUsd).toBeNull();
    expect(rewards.every((r) => r.efficiency === null)).toBe(true);
    const zero = await learningFixture(cleanup, {
      id: "zero",
      mutate: (p) => {
        for (const a of p.arms) {
          a.preparationCostUsd = 0;
          a.downstreamCostUsd = 0;
        }
      },
    });
    expect(
      assessReward(await zero.admit(), "SYNTHETIC").map((r) => r.efficiency),
    ).toEqual([1, 1]);
  });
  it("retrieves positive and negative cases with original references but abstains on one independent family", async () => {
    const f = await learningFixture(cleanup, { failures: ["BOUNDARY"] }),
      o = await f.admit(),
      snapshot = snapshotOf([o]);
    const query = { ...o.projection.context, frozenAt: t(21) };
    expect(() =>
      retrieveEvidence(snapshot, o.projection.context, { mode: "SYNTHETIC" }),
    ).toThrow("postdates");
    const memory = retrieveEvidence(snapshot, query, {
      mode: "SYNTHETIC",
    });
    expect(memory.status).toBe("ABSTAIN");
    expect(memory.taskFamilies).toBe(1);
    expect(memory.matches[0]!.rewards.map((r) => r.correctness)).toEqual([
      1, 0,
    ]);
    expect(memory.matches[0]!.evidence.receiptIds).toEqual(
      o.evidence.receiptIds,
    );
    expect(() => retrieveEvidence(snapshot, o.projection.context)).toThrow(
      "Synthetic",
    );
    expect(
      retrieveEvidence(
        snapshot,
        {
          ...query,
          facts: { ...o.projection.context.facts, requirement: "dependency" },
        },
        { mode: "SYNTHETIC" },
      ).matches,
    ).toHaveLength(0);
  });
  it("cannot mint an observation by supplying a verified string or serialized admitted object", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit();
    expect(() =>
      assessReward(JSON.parse(JSON.stringify(o)), "SYNTHETIC"),
    ).toThrow();
    await expect(
      admitObservation({ ...f.input, projection: { verified: true } }),
    ).rejects.toThrow();
  });
});
