import { describe, expect, it } from "vitest";
import { buildTournamentReplay } from "@/lib/replay";
import { replayFixture, start, end } from "./replay-fixture";

describe("recorded intervals versus conceptual stage order", () => {
  it("leaves model issuance, checks, receipt publication and decision timestamps unknown", () => {
    const r = buildTournamentReplay(replayFixture());
    for (const e of r.events.filter((e) =>
      [
        "research_context",
        "architecture_preparation",
        "independent_check",
        "independent_verification",
        "engineering_decision",
        "evidence_unavailable",
      ].includes(e.data.kind),
    )) {
      expect(e.timing).toEqual({
        startedAt: null,
        endedAt: null,
        state: "unknown",
        issues: [],
      });
    }
  });
  it("preserves equal timestamps and never establishes cross-arm concurrency or global ordering", () => {
    const p = replayFixture();
    p.attempts.forEach((a) => {
      a.endedAt = a.startedAt;
    });
    p.arms.forEach((a) => {
      a.endedAt = a.startedAt;
    });
    const r = buildTournamentReplay(p);
    expect(r.chronology.commonClock).toBe("not_established");
    expect(r.chronology.globalOrder).toBe("conceptual_stages_only");
    const track = r.chronology.tracks.find((t) =>
      t.eventId.endsWith("coding-attempt:run-A"),
    )!;
    expect(track.observations).toEqual([
      { boundary: "start", recordedAt: start },
      { boundary: "end", recordedAt: start },
    ]);
    expect(r).toEqual(buildTournamentReplay(p));
  });
  it("does not use declared order or input array order as evidence of actual chronology", () => {
    const p = replayFixture();
    p.order = "B_then_A";
    p.attempts.reverse();
    const r = buildTournamentReplay(p);
    expect(r.declaredOrder).toBe("B_then_A");
    expect(r.chronology.globalOrder).toBe("conceptual_stages_only");
    expect(r.events.map((e) => e.id)).toEqual(
      buildTournamentReplay(replayFixture()).events.map((e) => e.id),
    );
  });
  it.each(["preparation", "attempt", "arm"] as const)(
    "fails closed only for a contradictory %s interval",
    (kind) => {
      const p = replayFixture();
      if (kind === "preparation")
        p.preparationAttempts[0]!.finishedAt = "2026-10-29T11:00:00.000Z";
      if (kind === "attempt")
        p.attempts[0]!.endedAt = "2026-10-29T11:00:00.000Z";
      if (kind === "arm") p.arms[0]!.endedAt = "2026-10-29T11:00:00.000Z";
      const r = buildTournamentReplay(p);
      const bad = r.chronology.tracks.filter((t) => t.state === "inconsistent");
      expect(bad.length).toBeGreaterThan(0);
      expect(bad.every((t) => t.observations.length === 0)).toBe(true);
      expect(r.missing.some((m) => m.code === "END_BEFORE_START")).toBe(true);
      expect(
        r.events.filter((e) => e.data.kind === "coding_attempt"),
      ).toHaveLength(2);
      expect(
        r.chronology.tracks.some((t) => t.state === "recorded_interval"),
      ).toBe(true);
    },
  );
  it("reports arm/attempt time contradictions without silently rewriting either source", () => {
    const p = replayFixture();
    p.arms[0]!.startedAt = "2026-10-29T11:00:00.000Z";
    const r = buildTournamentReplay(p);
    expect(
      r.missing.filter((m) => m.code === "ARM_ATTEMPT_TIME_MISMATCH"),
    ).toHaveLength(2);
    expect(
      r.events.find((e) => e.variant === "A" && e.data.kind === "arm_outcome")!
        .timing.startedAt,
    ).toBe(p.arms[0]!.startedAt);
    expect(
      r.events.find(
        (e) => e.variant === "A" && e.data.kind === "coding_attempt",
      )!.timing.startedAt,
    ).toBe(start);
  });
  it("retains partial and missing arm timestamps without interpolation", () => {
    const p = replayFixture();
    p.arms[0]!.startedAt = null;
    p.arms[1]!.startedAt = null;
    p.arms[1]!.endedAt = null;
    const r = buildTournamentReplay(p);
    expect(
      r.events.find((e) => e.variant === "A" && e.data.kind === "arm_outcome")!
        .timing.state,
    ).toBe("partial_interval");
    expect(
      r.events.find((e) => e.variant === "B" && e.data.kind === "arm_outcome")!
        .timing.state,
    ).toBe("unknown");
    expect(
      r.chronology.tracks.find((t) => t.eventId.endsWith("outcome:A"))!
        .observations,
    ).toEqual([{ boundary: "end", recordedAt: end }]);
  });
  it("detects sub-millisecond inversions and treats equivalent UTC fractions equally", () => {
    const p = replayFixture();
    p.preparationAttempts[0]!.startedAt = "2026-10-29T12:00:00.0009Z";
    p.preparationAttempts[0]!.finishedAt = "2026-10-29T12:00:00.0001Z";
    p.arms[0]!.startedAt = "2026-10-29T12:00:00Z";
    const r = buildTournamentReplay(p);
    expect(
      r.chronology.tracks.find((t) =>
        t.eventId.endsWith("preparation-attempt:prep-1"),
      )!.observations,
    ).toEqual([]);
    expect(
      r.events.find((e) => e.variant === "A" && e.data.kind === "arm_outcome")!
        .timing.state,
    ).toBe("recorded_interval");
  });
  it("rejects malformed timestamps without exposing source text in errors", () => {
    const p = replayFixture();
    p.attempts[0]!.startedAt = "private-invalid-timestamp";
    expect(() => buildTournamentReplay(p)).toThrow(
      "Replay projection is malformed or internally inconsistent.",
    );
  });
});
