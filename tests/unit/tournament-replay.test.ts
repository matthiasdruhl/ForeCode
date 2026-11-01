import { describe, expect, it } from "vitest";
import { PublicTournamentSchema } from "@/lib/experiment/tournament-publication";
import {
  buildTournamentReplay,
  projectTournamentReplayCatalog,
} from "@/lib/replay";
import { approvedTournamentPublication } from "@/server/artifacts/approved-tournament-publication";
import { replayFixture, missingFuture } from "./replay-fixture";

describe("read-only tournament replay", () => {
  it("assembles deterministic, detached, deeply immutable A/B data with five stages", () => {
    const p = replayFixture(),
      snapshot = structuredClone(p),
      r = buildTournamentReplay(p);
    expect(r).toEqual(buildTournamentReplay(p));
    expect(p).toEqual(snapshot);
    expect(r.stages.map((s) => s.stage)).toEqual([
      "hypothesis",
      "preparation",
      "coding",
      "verification",
      "decision",
    ]);
    expect(r.arms.map((a) => a.variant)).toEqual(["A", "B"]);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(r.events.length);
    expect(Object.isFrozen(r.arms[0]!.checks[0])).toBe(true);
    expect(() => {
      (r.arms[0] as { status: string }).status = "failed";
    }).toThrow();
    p.arms[0]!.checks[0]!.status = "fail";
    expect(r.arms[0]!.checks[0]!.status).toBe("pass");
    expect(
      r.events
        .filter((e) => e.basis === "projection_observation")
        .every((e) => e.evidence.length > 0),
    ).toBe(true);
  });
  it.each(["empty", "unavailable"] as const)(
    "renders an honest %s catalog",
    (state) => {
      const r = projectTournamentReplayCatalog({
        state,
        studies: [],
        unavailableCount: state === "empty" ? 0 : 1,
      });
      expect(r.replays).toEqual([]);
      expect(r.stages).toHaveLength(5);
      expect(
        r.stages.every(
          (s) =>
            s.availability ===
            (state === "empty" ? "unknown" : "publication_unavailable"),
        ),
      ).toBe(true);
      expect(r.provenance).toBe("UNAUTHENTICATED_PROJECTION");
    },
  );
  it("retains partial catalog failures and rejects stale studies in unavailable catalogs", () => {
    expect(
      projectTournamentReplayCatalog({
        state: "available",
        studies: [replayFixture()],
        unavailableCount: 1,
      }).unavailableCount,
    ).toBe(1);
    expect(() =>
      projectTournamentReplayCatalog({
        state: "unavailable",
        studies: [replayFixture()],
        unavailableCount: 1,
      }),
    ).toThrow();
  });
  it.each([
    ["VERIFIED", "VERIFIED", "BOTH_VERIFIED"],
    ["VERIFIED", "REJECTED", "A_ONLY_VERIFIED"],
    ["REJECTED", "VERIFIED", "B_ONLY_VERIFIED"],
    ["REJECTED", "REJECTED", "BOTH_REJECTED"],
  ] as const)(
    "preserves %s/%s correctness without calculating a recommendation",
    (a, b, correctness) => {
      const p = replayFixture();
      p.correctness = correctness;
      p.arms.forEach((arm, i) => {
        arm.verdict = i ? b : a;
        if (arm.verdict === "REJECTED") arm.checks[7]!.status = "fail";
      });
      const r = buildTournamentReplay(p);
      expect(r.correctness).toBe(correctness);
      expect(r.arms.map((arm) => arm.verdict)).toEqual([a, b]);
      expect(r).not.toHaveProperty("decision");
      expect(r).not.toHaveProperty("winner");
      expect(r).not.toHaveProperty("verified");
      expect(r.decisionReference.state).toBe("not_supplied");
    },
  );
  it("retains an incomplete final result without promoting not_run placeholders", () => {
    const p = missingFuture(replayFixture());
    p.arms[1]!.finalTreeSha256 = null;
    const r = buildTournamentReplay(p);
    expect(r.arms[1]!.status).toBe("completed");
    expect(r.arms[1]!.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.missing.map((m) => m.code)).toEqual(
      expect.arrayContaining(["FINAL_TREE_ABSENT", "FUTURE_RECEIPT_ABSENT"]),
    );
    expect(
      r.events
        .filter((e) => e.variant === "B" && e.data.kind === "independent_check")
        .every((e) => e.availability === "unknown"),
    ).toBe(true);
  });
  it.each(["failed", "cancelled", "timed_out", "blocked"] as const)(
    "preserves %s attempts and unassigned preparation history",
    (status) => {
      const p = replayFixture();
      p.attempts.unshift({
        ...p.attempts[0]!,
        id: `earlier-${status}`,
        status,
      });
      p.preparationAttempts.push({
        ...p.preparationAttempts[0]!,
        id: `prep-${status}`,
        status,
      });
      const r = buildTournamentReplay(p);
      expect(
        r.events.filter((e) => e.data.kind === "coding_attempt"),
      ).toHaveLength(3);
      expect(
        r.events.some(
          (e) =>
            e.data.kind === "coding_attempt" &&
            e.data.attemptId === `earlier-${status}` &&
            e.availability === status,
        ),
      ).toBe(true);
      expect(
        r.events
          .filter((e) => e.data.kind === "preparation_attempt")
          .every(
            (e) =>
              e.variant === null &&
              e.evidence.every((ref) => ref.variant === null),
          ),
      ).toBe(true);
      expect(
        r.events.some(
          (e) =>
            e.data.kind === "preparation_attempt" && e.availability === status,
        ),
      ).toBe(true);
    },
  );
  it("does not invent missing attempt or preparation histories", () => {
    const p = replayFixture();
    p.attempts = [];
    p.preparationAttempts = [];
    const r = buildTournamentReplay(p);
    expect(
      r.events.some(
        (e) =>
          e.data.kind === "coding_attempt" ||
          e.data.kind === "preparation_attempt",
      ),
    ).toBe(false);
    expect(
      r.missing.filter((m) => m.code === "ATTEMPT_HISTORY_ABSENT"),
    ).toHaveLength(2);
  });
  it("distinguishes an explicitly unrun arm from a blocked or unknown outcome", () => {
    const p = missingFuture(replayFixture());
    const b = p.arms[1]!;
    b.status = "not_run";
    b.runId = null;
    b.startedAt = null;
    b.endedAt = null;
    b.finalTreeSha256 = null;
    p.attempts = p.attempts.filter((a) => a.variant !== "B");
    const r = buildTournamentReplay(p);
    expect(
      r.events.find((e) => e.variant === "B" && e.data.kind === "arm_outcome")!
        .availability,
    ).toBe("not_run");
  });
  it.each(["blocked", "failed", "cancelled", "timed_out"] as const)(
    "preserves an explicit %s arm even without a run identity",
    (status) => {
      const p = missingFuture(replayFixture());
      const b = p.arms[1]!;
      b.status = status;
      b.runId = null;
      b.startedAt = null;
      b.endedAt = null;
      p.attempts = p.attempts.filter((a) => a.variant !== "B");
      const event = buildTournamentReplay(p).events.find(
        (e) => e.variant === "B" && e.data.kind === "arm_outcome",
      )!;
      expect(event.availability).toBe(status);
      expect(event.basis).toBe("approved_metadata_context");
    },
  );
  it("keeps null and zero metrics separate, including reservations and file-touch counts", () => {
    const p = replayFixture();
    p.arms[0]!.preparation.costUsd = 0;
    p.arms[0]!.downstream.filesTouched = 3;
    p.arms[0]!.preparation.filesTouched = 4;
    p.arms[0]!.reservedMicroUsd = 100000;
    const r = buildTournamentReplay(p);
    const arm = r.arms[0]!;
    expect(arm.preparation.costUsd).toBe(0);
    expect(arm.downstream.costUsd).toBeNull();
    expect(arm.total.filesTouched).toBeNull();
    expect(arm.inputTokens).toBeNull();
    expect(arm.outputTokens).toBeNull();
    expect(arm.total.tokens).toBeNull();
    expect(arm.reservedMicroUsd).toBe(100000);
    expect(arm.total.costUsd).toBeNull();
    expect(
      r.missing.some(
        (m) => m.code === "PREPARATION_METRICS_PARTIAL_OR_UNKNOWN",
      ),
    ).toBe(true);
  });
  it("retains incomparable classifications, blockers, deviations and published limitations", () => {
    const p = replayFixture();
    p.comparability = "NOT_COMPARABLE";
    p.correctness = "INCONCLUSIVE";
    p.blockers = ["MISSING_CONDITION"];
    p.deviations = ["EXTRA_ATTEMPT"];
    const r = buildTournamentReplay(p);
    expect(r.comparability).toBe("NOT_COMPARABLE");
    expect(r.blockers).toEqual(p.blockers);
    expect(r.deviations).toEqual(p.deviations);
    expect(r.limitations).toEqual(expect.arrayContaining(p.limitations));
    expect(r.arms[0]!.verdict).toBe("VERIFIED");
  });
  it("retains complete bounded history; no compact summary can cherry-pick failures", () => {
    const p = replayFixture();
    p.attempts = Array.from({ length: 100 }, (_, i) => ({
      ...p.attempts[0]!,
      id: `attempt-${i}`,
      variant: i % 2 ? "A" : "B",
      status: "failed",
    }));
    p.preparationAttempts = Array.from({ length: 100 }, (_, i) => ({
      ...p.preparationAttempts[0]!,
      id: `prep-${i}`,
      status: "cancelled",
    }));
    const r = buildTournamentReplay(p);
    expect(
      r.events.filter((e) => e.data.kind === "coding_attempt"),
    ).toHaveLength(100);
    expect(
      r.events.filter((e) => e.data.kind === "preparation_attempt"),
    ).toHaveLength(100);
    expect(r.events.length).toBeLessThanOrEqual(240);
    expect(r.limitations).toContain(p.limitations[0]);
  });
  it("schema parsing never elevates absent production publication or creates authority", async () => {
    const approved = await approvedTournamentPublication.loadTournaments();
    expect(approved.state).toBe("empty");
    const synthetic = buildTournamentReplay(
      PublicTournamentSchema.parse(replayFixture()),
    );
    expect(synthetic.provenance).toBe("UNAUTHENTICATED_PROJECTION");
    expect(await approvedTournamentPublication.loadTournaments()).toEqual(
      approved,
    );
    expect(synthetic).not.toHaveProperty("certificate");
    expect(synthetic).not.toHaveProperty("signature");
  });
});
