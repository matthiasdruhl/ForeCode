# Contributor usage accounting

The owner authorized necessary model spending and explicitly selected `muse-spark-1.3-contributor`. The earlier unused case02 proposal selected Standard; it was retained rather than edited into a different historical protocol. Case03 freezes Contributor before source preparation and runtime admission. Its failed paid attempts and partial/unknown charges remain retained. Case04 prospectively bound the revised team HTTP transport and protected refusal diagnostics. Its HTTP 200 responses reported 8,403/8,393 output tokens against an 8,192-token cap, including 8,190 reasoning tokens each; the strict guard refused both. Separately prospective controls proved 32k output capacity and a no-summary streaming pressure response respecting its 256-token cap. Case06 commits the resulting summary omission and explicit larger/stricter guard mapping; no old UUID is replayed. No further spending confirmation is required within the authorized work; each declared attempt still has its bounded budget and no automatic retry.

Meta's [published pricing](https://dev.meta.ai/docs/pricing-rate-limits), checked October 30, 2026:

| Token class    | Contributor USD per million | Exact nanoUSD per token |
| -------------- | --------------------------: | ----------------------: |
| Uncached input |                       $0.10 |                     100 |
| Cached input   |                      $0.002 |                       2 |
| Output         |                       $0.20 |                     200 |

Cached input is a subset of input, not an extra token category to add twice. For validated counts `I` input, `C` cached and `O` output:

```text
estimated USD = ((I - C) * 0.10 + C * 0.002 + O * 0.20) / 1,000,000
```

`meta-pricing.ts` calculates this with integer nanoUSD and returns an exact nine-decimal dollar string. For example, 1,000,000 input tokens including 250,000 cached, plus 2,000,000 output tokens, estimates **$0.475500000**. A single uncached input token and output token cost $0.000000300 at this rate card. Tests separately verify Standard prices, cache subtraction, tiny amounts and invalid counts. Meta describes Contributor content as eligible for training future models; see its [model-mode description](https://dev.meta.ai/docs/models).

There are three different monetary observations:

1. **Conservative reservation:** The existing broker reserves whole microUSD per upper-bound token before every send, without refunds. Current Contributor admission uses 1 microUSD per input/output token as a ceiling. Those equal $1 per million upper-bound tokens and exceed Contributor rates. They are safety allocations, not an invoice or the published price.
2. **Rate-card estimate:** Only validated provider usage from the exact run is multiplied by the correct model rates above. Unknown failed-call usage stays unknown. Estimates never substitute reservations, requested caps or source volume for used tokens. Cached discounts apply only to the provider's observed cached count; absent cached detail is conservatively treated as uncached by the broker.
3. **Actual invoiced charge:** Remains unknown without authenticated billing evidence. `TelemetrySchema.metrics.costUsd` stays null until a real invoice exists; a rate-card estimate is recorded separately. Preparation charges and this AI conversation's usage are also unknown.

Meta confirms that [reasoning tokens count toward billed output](https://dev.meta.ai/docs/reasoning); they are already included in `O` and must not be added a second time.

The final case06 declares $6 per arm ($12 pair), 600 seconds, 20 requests/iterations, 4,000,000 aggregate conservative reserved tokens and 32,768 maximum output tokens per request identically for both arms. The unchanged worker retains its stricter 1,000,000-token native rollout guard, explicitly mapped separately from the broker reservation. Optional reasoning summaries are omitted; high reasoning and encrypted stateless replay remain enabled. Historical case03 used 4,096 and case04 used 8,192; both remain immutable and inconclusive. Case05 stopped in zero-upstream acceptance before any paid trial when the unchanged native bootstrap guard correctly rejected 4M; the explicit native/broker mapping fixes that compatibility issue without changing the smoke bridge. The separate team provider has a 120-second socket timeout capped by the remaining task deadline, while the supervisor independently enforces the absolute deadline. Failed provider outcomes still latch the no-further-calls breaker; bounded protected diagnostics preserve classification and failed HTTP 200 response bytes for owner review without storing credentials or request headers. These are maximum allowances, not an expected bill. The protocol forbids separately billed hosted tools, including web search, and never uses Standard as a silent fallback. Account access was established with a non-generating GET for the exact Contributor model before execution.

Source/runtime/study originals and detailed accounting stay owner-private. Public recording and source disclosure are separate from authorizing model spending. Same-context owner-designated AI review/custody supplies no independent human, organizational or blind review, and no general architecture or model advantage is implied.

The declared case06 pair completed once in its frozen order. All 23 upstream requests have validated usage and exact Contributor rate-card estimates in owner-private originals. Protected grading, finalization and cleanup evidence was freshly authenticated; full-task correctness remains inconclusive. The consumed registration is disabled, both guests are stopped and the coordination lease is released. A signed private reconciliation includes the earlier refused-response supplement once and retains two unknown-usage historical requests. No invoice, unknown call, preparation effort or conversation usage is represented as zero. The complete actual/failed history and source versions are retained; there is no automatic retry or public result projection.
