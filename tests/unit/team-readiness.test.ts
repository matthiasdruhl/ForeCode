import { describe, expect, it } from "vitest";
import { PublicReadinessSchema } from "../../scripts/experiments/tournament/team-readiness";
describe("source-bound public readiness", () => {
  const candidateSha256 = "a".repeat(64);
  it.each([
    { status: "READY", reason: "deadline" },
    { status: "READY", reason: "public-checks-passed" },
    { status: "BLOCKED", reason: "public-checks-passed" },
    { status: "NOT_CHECKED", reason: "public-checks-failed-or-interrupted" },
  ])("rejects inconsistent success-shaped state %j", (value) => {
    expect(
      PublicReadinessSchema.safeParse({ ...value, candidateSha256 }).success,
    ).toBe(false);
  });
  it("accepts a source-bound pass and explicit failures", () => {
    for (const value of [
      {
        status: "READY",
        reason: "public-checks-passed",
        outputSha256: "b".repeat(64),
      },
      { status: "BLOCKED", reason: "public-checks-failed-or-interrupted" },
      { status: "NOT_CHECKED", reason: "deadline" },
    ])
      expect(
        PublicReadinessSchema.safeParse({ ...value, candidateSha256 }).success,
      ).toBe(true);
  });
});
