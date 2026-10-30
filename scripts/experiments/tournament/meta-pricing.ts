// Rate-card estimates from validated provider usage, never invoiced charges.
// Integer nanoUSD preserve Contributor's sub-microUSD token prices exactly.
export const metaPricingSource = {
  url: "https://dev.meta.ai/docs/pricing-rate-limits",
  checkedOn: "2026-10-30",
} as const;
const rates = {
  "muse-spark-1.3-contributor": { input: 100n, cached: 2n, output: 200n },
  "muse-spark-1.3": { input: 1250n, cached: 150n, output: 4250n },
} as const;
export function estimateMetaUsageCost(input: {
  model: keyof typeof rates;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}) {
  const rate = rates[input.model];
  if (
    !rate ||
    ![input.inputTokens, input.cachedTokens, input.outputTokens].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    input.cachedTokens > input.inputTokens
  )
    throw new Error("Invalid priced model or usage.");
  const nanoUsd =
    BigInt(input.inputTokens - input.cachedTokens) * rate.input +
    BigInt(input.cachedTokens) * rate.cached +
    BigInt(input.outputTokens) * rate.output;
  return {
    ...input,
    pricing: metaPricingSource,
    basis: "validated_usage_rate_card_estimate" as const,
    estimatedNanoUsd: nanoUsd.toString(),
    estimatedCostUsd: `${nanoUsd / 1_000_000_000n}.${(nanoUsd % 1_000_000_000n).toString().padStart(9, "0")}`,
    actualInvoicedCostUsd: null,
  };
}
