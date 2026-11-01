import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  buildTournamentReplay,
  matchesReplayEvidence,
  projectTournamentReplayCatalog,
  type ReplayEvidenceReference,
} from "@/lib/replay";
import { replayFixture, missingFuture } from "./replay-fixture";

describe("safe projection evidence selectors", () => {
  it("resolves every observed reference against the same supplied study", () => {
    const p = replayFixture();
    const r = buildTournamentReplay(p);
    for (const e of r.events)
      for (const ref of e.evidence)
        expect(matchesReplayEvidence(p, ref)).toBe(true);
    for (const variant of ["A", "B"] as const) {
      const arm = p.arms.find((a) => a.variant === variant)!;
      const future = r.events.find(
        (e) =>
          e.variant === variant &&
          e.data.kind === "independent_verification" &&
          e.data.phase === "future",
      )!.evidence[0]!;
      expect(future).toMatchObject({
        studyId: p.studyId,
        variant,
        runId: arm.runId,
        receiptId: arm.receiptId,
        sourceTreeSha256: arm.finalTreeSha256,
      });
      const baseline = r.events.find(
        (e) =>
          e.variant === variant &&
          e.data.kind === "independent_verification" &&
          e.data.phase === "baseline",
      )!.evidence[0]!;
      expect(baseline).toMatchObject({
        runId: null,
        receiptId: arm.baselineReceiptId,
        sourceTreeSha256: arm.initialTreeSha256,
      });
    }
  });
  it.each([
    "runId",
    "receiptId",
    "sourceTreeSha256",
    "checkId",
    "studyId",
    "variant",
  ] as const)("rejects substituted %s in an evidence reference", (field) => {
    const p = replayFixture(),
      r = buildTournamentReplay(p);
    const ref = r.events.find(
      (e) => e.variant === "A" && e.data.kind === "independent_check",
    )!.evidence[0]!;
    const values = {
      runId: "run-B",
      receiptId: "future-B",
      sourceTreeSha256: p.arms[1]!.finalTreeSha256,
      checkId: "unrelated-check",
      studyId: "unrelated-study",
      variant: "B",
    };
    expect(
      matchesReplayEvidence(p, {
        ...ref,
        [field]: values[field],
      } as ReplayEvidenceReference),
    ).toBe(false);
  });
  it("rejects a cross-arm run swap against the attempt mapping", () => {
    const p = replayFixture();
    [p.arms[0]!.runId, p.arms[1]!.runId] = [p.arms[1]!.runId, p.arms[0]!.runId];
    expect(() => buildTournamentReplay(p)).toThrow();
  });
  it.each(["runId", "receiptId", "baselineReceiptId"] as const)(
    "rejects reused %s across arms",
    (field) => {
      const p = replayFixture();
      p.arms[1]![field] = p.arms[0]![field];
      expect(() => buildTournamentReplay(p)).toThrow();
    },
  );
  it("rejects reuse across baseline and future receipts", () => {
    const p = replayFixture();
    p.arms[1]!.baselineReceiptId = p.arms[0]!.receiptId;
    expect(() => buildTournamentReplay(p)).toThrow();
  });
  it("cannot detect coherent forged receipt swaps without originals and never claims authentication", () => {
    const p = replayFixture();
    [p.arms[0]!.receiptId, p.arms[1]!.receiptId] = [
      p.arms[1]!.receiptId,
      p.arms[0]!.receiptId,
    ];
    const r = buildTournamentReplay(p);
    expect(r.provenance).toBe("UNAUTHENTICATED_PROJECTION");
    const ref = r.events.find(
      (e) => e.variant === "A" && e.data.kind === "independent_check",
    )!.evidence[0]!;
    expect(matchesReplayEvidence(replayFixture(), ref)).toBe(false);
  });
  it.each(["attempts", "preparationAttempts"] as const)(
    "rejects duplicate %s before event IDs can collide",
    (field) => {
      const p = replayFixture();
      p[field].push(p[field][0]! as never);
      expect(() => buildTournamentReplay(p)).toThrow();
    },
  );
  it("rejects duplicate arm and required-check identities", () => {
    const p = replayFixture();
    p.arms[1]!.variant = "A";
    expect(() => buildTournamentReplay(p)).toThrow();
    const q = replayFixture();
    q.arms[0]!.checks[1]!.id = q.arms[0]!.checks[0]!.id;
    expect(() => buildTournamentReplay(q)).toThrow();
  });
  it("rejects a third lane instead of inventing or silently omitting C", () => {
    const p = replayFixture();
    p.attempts.push({ ...p.attempts[0]!, id: "unapproved-C", variant: "C" });
    expect(() => buildTournamentReplay(p)).toThrow();
  });
  it("rejects false successful outcomes without receipt/source support", () => {
    const p = replayFixture();
    p.arms[0]!.receiptId = null;
    expect(() => buildTournamentReplay(p)).toThrow();
    const q = replayFixture();
    q.arms[0]!.finalTreeSha256 = null;
    expect(() => buildTournamentReplay(q)).toThrow();
    const r = missingFuture(replayFixture());
    r.arms[1]!.checks[0]!.status = "pass";
    expect(() => buildTournamentReplay(r)).toThrow();
  });
  it("preserves only published source comparisons and never creates source operations", () => {
    const p = replayFixture();
    p.sourceComparison = [
      {
        path: "src/auth.ts",
        beforeSha256: "a".repeat(64),
        afterSha256: "b".repeat(64),
      },
    ];
    const r = buildTournamentReplay(p),
      event = r.events.find((e) => e.data.kind === "source_comparison")!;
    expect(event.variant).toBeNull();
    expect(event.timing.state).toBe("unknown");
    expect(event.evidence[0]!.comparison).toEqual(p.sourceComparison[0]);
    expect(matchesReplayEvidence(p, event.evidence[0]!)).toBe(true);
    expect(
      matchesReplayEvidence(p, {
        ...event.evidence[0]!,
        comparison: { ...p.sourceComparison[0]!, afterSha256: "c".repeat(64) },
      }),
    ).toBe(false);
    expect(
      r.events.some((e) => /source_edit|propagation/.test(e.data.kind)),
    ).toBe(false);
    const absent = buildTournamentReplay(replayFixture());
    expect(
      absent.events.find((e) => e.id.endsWith("source-comparison"))!
        .availability,
    ).toBe("unknown");
    p.sourceComparison = [];
    expect(
      buildTournamentReplay(p).events.find(
        (e) => e.data.kind === "source_comparison",
      )!.availability,
    ).toBe("observed_in_projection");
  });
  it.each([
    "/private/results.json",
    "src/../private/results.json",
    "src/./file.ts",
    "src//file.ts",
  ])("rejects unsafe comparison path %s", (path) => {
    const p = replayFixture();
    p.sourceComparison = [{ path, beforeSha256: null, afterSha256: null }];
    expect(() => buildTournamentReplay(p)).toThrow();
  });
  it.each([
    "credentials",
    "privatePath",
    "rawProviderOutput",
    "hiddenCheckBody",
    "signature",
    "verified",
  ])("rejects extraneous %s without copying it into output/errors", (key) => {
    const p = { ...replayFixture(), [key]: "DO_NOT_DISCLOSE" };
    try {
      buildTournamentReplay(p);
      expect.fail("Expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain("DO_NOT_DISCLOSE");
    }
  });
  it("rejects accessor payloads without invoking them", () => {
    const p = replayFixture(),
      getter = vi.fn(() => "secret");
    Object.defineProperty(p, "hypothesis", { get: getter, enumerable: true });
    expect(() => buildTournamentReplay(p)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("bounds excessive attempt history and repeated catalog studies", () => {
    const p = replayFixture();
    p.attempts = Array.from({ length: 101 }, (_, i) => ({
      ...p.attempts[0]!,
      id: `attempt-${i}`,
    }));
    expect(() => buildTournamentReplay(p)).toThrow();
    expect(() =>
      projectTournamentReplayCatalog({
        state: "available",
        studies: [replayFixture(), replayFixture()],
        unavailableCount: 0,
      }),
    ).toThrow();
  });
  it("rejects malformed selectors and reference accessors without invoking them", () => {
    const p = replayFixture();
    const ref = buildTournamentReplay(p).events[0]!.evidence[0]!;
    expect(
      matchesReplayEvidence(p, {
        ...ref,
        selector: { kind: "unknown" },
      } as unknown as ReplayEvidenceReference),
    ).toBe(false);
    expect(
      matchesReplayEvidence(p, {
        ...ref,
        selector: { kind: "study", privatePath: "/private/secret" },
      } as unknown as ReplayEvidenceReference),
    ).toBe(false);
    const getter = vi.fn(() => ref.selector),
      untrusted = { ...ref };
    Object.defineProperty(untrusted, "selector", {
      get: getter,
      enumerable: true,
    });
    expect(matchesReplayEvidence(p, untrusted)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it("bounds text and array inputs before snapshotting them", () => {
    const p = replayFixture();
    p.hypothesis = "x".repeat(512001);
    expect(() => buildTournamentReplay(p)).toThrow();
    const q = replayFixture();
    q.sourceComparison = [
      { path: "src/" + "a".repeat(513), beforeSha256: null, afterSha256: null },
    ];
    expect(() => buildTournamentReplay(q)).toThrow();
  });
  it("has no execution, inference, credential, persistence or decision algorithm dependencies", async () => {
    for (const file of [
      "assemble.ts",
      "chronology.ts",
      "contracts.ts",
      "evidence-links.ts",
      "index.ts",
    ]) {
      const source = await readFile(
        new URL(`../../src/lib/replay/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(
        /(?:node:fs|node:child_process|server\/|server-only|assessDecisionReport|fetch\(|process\.env|Date\.now|Math\.random|setInterval|WebSocket)/,
      );
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      buildTournamentReplay(replayFixture());
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
