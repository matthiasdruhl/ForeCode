import { describe, expect, it } from "vitest";
import { estimateMetaUsageCost } from "../../scripts/experiments/tournament/meta-pricing";

describe("Meta validated-usage rate-card estimates", () => {
  const model = "muse-spark-1.3-contributor" as const;
  it.each([
    [1_000_000, 0, 0, "0.100000000"],
    [1_000_000, 1_000_000, 0, "0.002000000"],
    [0, 0, 1_000_000, "0.200000000"],
    [1_000_000, 250_000, 2_000_000, "0.475500000"],
    [1, 0, 1, "0.000000300"],
  ])(
    "prices Contributor input=%i cached=%i output=%i",
    (inputTokens, cachedTokens, outputTokens, expected) => {
      const cost = estimateMetaUsageCost({
        model,
        inputTokens,
        cachedTokens,
        outputTokens,
      });
      expect(cost.estimatedCostUsd).toBe(expected);
      expect(cost.actualInvoicedCostUsd).toBeNull();
    },
  );
  it("keeps Standard prices distinct", () => {
    expect(
      estimateMetaUsageCost({
        model: "muse-spark-1.3",
        inputTokens: 1_000_000,
        cachedTokens: 250_000,
        outputTokens: 2_000_000,
      }).estimatedCostUsd,
    ).toBe("9.475000000");
  });
  it.each([
    { inputTokens: 1, cachedTokens: 2, outputTokens: 0 },
    { inputTokens: -1, cachedTokens: 0, outputTokens: 0 },
    { inputTokens: 1.5, cachedTokens: 0, outputTokens: 0 },
    {
      inputTokens: Number.MAX_SAFE_INTEGER + 1,
      cachedTokens: 0,
      outputTokens: 0,
    },
  ])("rejects invalid usage", (usage) => {
    expect(() => estimateMetaUsageCost({ model, ...usage })).toThrow();
  });
});
