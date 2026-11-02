# Scientist inference repair — November 1, 2026

The failing Scientist request now succeeds after replacing three lookahead-based path expressions in its **wire response schema** with a mathematically equivalent expression. The frozen Zod validators, developer prompt, model, limits, strict mode and response shape remain intact. The current production builder generates the exact payload that received HTTP200, and the captured response passes the production transport and full proposal validation.

This supersedes the unresolved-schema disposition of [the initial investigation](INFERENCE-BLOCKER-DIAGNOSIS-20261101.md). Historical studies and that investigation's evidence remain preserved. No historical study was reopened or represented as successful.

## Controlled live evidence

The user explicitly authorized all necessary execution/testing and delegated operator decisions. Three diagnostic requests were made, each with an exclusive durable reservation before sending and no automatic retries. These are diagnostic observations, not a new registered architecture experiment.

| Diagnostic | Observed UTC      | Request                                                              | Result                                                   | Provider request ID                    |
| ---------- | ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| 20         | 22:56:56–22:56:58 | Synthetic input, trivial strict schema, same Contributor model       | HTTP200, `{"ok":true}`                                   | `0cc6ef41-a21e-4b68-b462-07bc96806dad` |
| 21         | 22:58:38          | Exact Study09 production payload                                     | HTTP500, `server_error`, message `internal server error` | `da2950c4-82e5-4661-b21d-dd13fefeb88a` |
| 22         | 23:00:08–23:00:18 | Same full payload, changing only three wire path-pattern expressions | HTTP200; frozen content schema accepted                  | `76c5b879-f42c-4c17-a598-bea159ef900a` |

The original failed payload's canonical SHA-256 is `0f012a22455ee2f8167af6fee4a75083fede963c7a37d009f614d69d0e38a5e2`. The successful repaired payload is `c946ab9415d3a40875e1b563ca178b8c3fd360df9171498073c70fcfd00612a8`. Its 12,443 bytes differ only in the three response-format path patterns. The developer message still contains the original frozen schema, so the model-facing instructions did not change.

This is strong evidence of a schema-expression compatibility problem and a verified working local repair. Meta's internal compiler/regex engine is still unknown. The provider returned a generic 500 rather than identifying an unsupported expression; no assertion about a specific engine is needed for the fix. [Meta's structured-output documentation](https://dev.meta.ai/docs/structured-output) describes schema-constrained decoding but does not establish the regex dialect inspected here.

## Change and validation boundary

[provider-schema.ts](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode/src/lib/foresight/provider-schema.ts) clones the generated schema and recognizes only the frozen `RelativePathSchema` pattern. It replaces its encoding in the three proposal fields: change-plan module, constraint from, constraint to. Hypothesis and challenge schemas are unchanged. [prompts.ts](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode/src/lib/foresight/prompts.ts) applies this translation only to `response_format.json_schema.schema`.

Both patterns allow the original character set, forbid a leading slash and forbid a path segment exactly `..`. They preserve empty later segments, trailing slashes, single-dot segments and three-or-more dots. Min/max lengths and every other JSON Schema constraint remain unchanged. Existing frozen path/content/flow validators still independently reject invalid model output.

Regression tests compare 299,593 exhaustive short paths plus longer and invalid edge cases, prove that only three pattern values change, and verify the original schema is not mutated. The implementation-identity test now explicitly covers the new schema adapter. The offline diagnostic recognizes the exact historical encoding separately from the repaired builder; unknown drift and tampered payloads still refuse.

The private [repair validation](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/repair-validation.json) confirms:

- Current production payload SHA equals the live successful request SHA.
- The actual received envelope passes `createMetaTransport` on offline replay.
- Its proposal passes `createForesightService.run` and `validateFlowOutput`, with no transport, content or semantic failure.
- This replay makes no additional provider request and creates no registered experimental result.

## Runtime and conserved accounting

Fresh daemon inspection at 23:03:22 UTC confirmed both fixed sandboxes stopped, zero sessions and no mounts. The agent has exactly one narrow TCP allow for `api.meta.ai:443`, plus global default deny. The daemon reports that Meta destination allowed. No policy was changed and no guest started. The earlier login-service failure was a restriction on the inspecting process; the same inspection works with appropriate host access. [Fresh metadata](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/fresh-runtime-metadata.json).

The three conservative reservations were 21,715 + 38,932 + 39,163 = **99,810 microUSD ($0.099810)**. Cumulative Scientist allocation is now **22 reservations / 701,785 microUSD**, leaving **298,215 microUSD** under the unchanged 1,000,000 ceiling. Reservations are not invoices. The successful full request reported 2,980 input and 1,160 output tokens, total 4,140; failed-request usage remains unknown. The original overall ceiling remains 65,000,000 microUSD. Including 194,700 prior coding reservations gives 896,485 internally reserved microUSD overall. No refund/reset occurred. Downstream residual limits remain 439 seconds, 19 requests/iterations, 31,902,650 tokens/microUSD per arm.

Private immutable plans, reservations, HTTP headers and response bodies are retained in the sibling `ForeCode-Inference-Diagnosis-20261101` directory, under `generic-live`, `live` and `portable-live`. Future accounting must include these diagnostic extensions rather than using Study09's older 19-call seed as the current total.

## Scope of the result

This verifies the repair to the actual Scientist inference blocker. It does not establish a completed paid A/B pair or protected future grades. Study06's 403 had a separate demonstrated local egress cause; its narrow repair remains in effect. Successful host Chat Completions inference does not independently test the coding broker's Responses route.

A genuine new pair must use fresh study/run identities, current implementation closure and fresh runtime/custody records with these conserved allocations. Closed 06/09 originals and one-shot locks remain untouched. The user authorization is present; freshness and source-specific admission are mechanical execution prerequisites, not another request for user permission.

Validation completed: `npm run check` exited 0 with 1,885 tests / 86 files, lint, both TypeScript checks and both production builds. `npm run test:e2e` exited 0 with 82 desktop/mobile browser cases. All automated suites use synthetic providers; the three observations above are the live acceptance evidence. The first restricted run had two local Unix-socket permission failures; rerunning with the required host capability passed without changing the tests. Logs are recorded in the implementation log.
