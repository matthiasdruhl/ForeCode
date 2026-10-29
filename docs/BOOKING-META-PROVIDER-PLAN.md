> October 28 Contributor update: the owner explicitly selected `muse-spark-1.3-contributor`, including Meta’s use of submitted content for training. The disabled Meta example and current private operator profile now select that exact model, with conservative integer ceilings of 1/1 microUSD per input/output token (published Contributor prices $0.10/$0.20 per million). Standard remains supported explicitly; no fallback is permitted. Historical Standard execution evidence below is unchanged and does not verify a Contributor generation. Fresh source/runtime review and per-run admission remain required.

# Meta Muse provider adaptation

October 28, 2026. The owner prefers Meta Muse inference for the local booking coding worker. This changes the previous OpenAI-only model selection; it does not authorize a paid call or a new task/evaluator. Author this adaptation here during the event. External planning was consulted as read-only design context; no planning implementation is copied.

Meta documents Codex integration against its Responses API. Keep the reviewed Codex executable as the tool-execution harness, existing root supervisor, source-only writable worker, separate offline grader, cleanup/lease, exact proposal and admission checks. The actual coding model is Meta `muse-spark-1.3` Standard, served only at `https://api.meta.ai/v1/responses`. This is not the separate Muse Code CLI. Standard is selected explicitly; Contributor selection is now explicitly authorized as noted above. Keep OpenAI's prior exact pair usable for historical configurations, with no automatic fallback or arbitrary endpoint/model override.

Implementation order:

1. Add closed model/endpoint pairs to private configuration validation and bind the selected pair into the existing proposal and review comparison.
2. Carry the exact approved model from controller through trusted supervisor task bytes into the worker launcher. The worker checks the model allowlist before starting its pinned binary.
3. Extend the existing serial budget broker to the fixed Meta endpoint and a fixed host-proxy placeholder. Preserve pre-request durable reservations, zero retries, stateless same-attempt opaque replay, no hosted tools/media, exact response/model/tier checks and permanent refusal after uncertain outcomes. Meta's minimum output cap is16; reserve at least that amount or send nothing. Unknown optional cache details are never used for a discount.
4. Add a disabled Meta example, using illustrative integer ceilings2/5 input/output microUSD per token, rounded up from the documented October28 Standard prices1.25/4.25 dollars per million. Account-specific prices/access and actual proxy injection remain unverified until observed. No actual key enters a worker, image, task file or report.
5. Validate both model paths and mismatched endpoint/model/review refusals with no inference. Review a new source-bound bundle before any installed helper update. Collect actual installation/inventory under the shared lease; preserve historical records and keep execution disabled.

The Meta credential uses a sandbox-scoped Docker custom secret for exact host `api.meta.ai`, fixed placeholder `forecode-meta-sandbox`, resolved only on the trusted host. Only the trusted outer broker may send that sentinel. The nested worker receives neither the real key nor external network access. A new minimal outer egress allowance and actual no-inference credential/proxy observations must be reviewed before operational admission. Provider configuration alone is not access or spending authority.

Frozen application contracts and direct Meta Scientist hypothesis/challenge transport remain unchanged. All comparative arms must use the same selected coding model/harness/budgets. No Meta-vs-OpenAI comparison is relabeled an architecture result. These software changes alone establish no hackathon eligibility, genuine agent evidence or measured Meta benefit.

Sources: https://dev.meta.ai/docs/coding-agents ; https://dev.meta.ai/docs/protocols/responses ; https://dev.meta.ai/docs/pricing-rate-limits .
