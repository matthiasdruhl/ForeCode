# Historical A/B failure repairs — November 2, 2026

The owner requested continued work on all identified failures, then explicitly approved unpaid protected diagnostic grading. Historical candidates and outcomes remain immutable. The repaired implementations are separate copies, not new model-generated tournament arms.

## Observed source failures and repairs

The improved public checker reproduced B's HTTPS session rejection and nine real TypeScript diagnostics in the original source: TS2532 at line 103 and TS2345 at lines 462, 468, 481, 483, 484, 491, 493 and 494. The copy now uses the request URL's origin and asserts array elements only where existing runtime length checks establish them. It also dispatches unsupported methods before decoding parameters and applies the same-origin decision before parameter decoding for mutations.

A's source accepted unknown seed users and team resource IDs in the personal namespace; its copy rejects them. HTTP method/origin/decoding order was corrected. This copy still passed only seven protected checks. A further controlled change stopped swallowing seed validation failures: construction now rejects invalid seeds instead of returning a poisoned subject. With this change, the same protected adversarial check passed. The private assertion source was never inspected; the change's observed effect does not disclose the exact assertion.

The public checker requires invalid seeds to be rejected before serving, and remains strict about constructor rejection. An intermediate investigation briefly tested a broader poisoned-subject interpretation; the final checker retains the original strict check. A temporary error introduced while moving URI decoding returned an internal error; the diagnostic copy corrected it to the public INVALID_INPUT response before grading. Failed observations remain preserved.

## Actual protected results

| Diagnostic copy                  | Fresh run ID                           | Protected result        |
| -------------------------------- | -------------------------------------- | ----------------------- |
| A, before constructor correction | `470f28ff-99d9-4635-9b04-7b70f5c0852b` | 7/8; adversarial failed |
| A, corrected                     | `807f9b10-0b13-4cfe-ab3b-5babb7a2b9c3` | **8/8**                 |
| B, corrected                     | `7d275c43-c145-440a-9bc7-2fb0d4fec231` | **8/8**                 |

The unchanged protected grader was freshly inventoried against the registered Node, dependency, controller, worker-image and private-package hashes. The shared lease was held, each diagnostic used fresh identities, owned workers were cleaned up, the grader was stopped, and zero sessions/mounts and lease release were confirmed. No provider calls occurred. Private assertions were withheld.

Fresh receipts were published through the actual evaluator publisher after cleanup and exact source/report validation, then reloaded through the protected evaluation store. Both corrected copies reauthenticated as VERIFIED for their pinned eight checks. Classification is `DIAGNOSTIC_MANUAL_REPAIR_NOT_NEW_MODEL_TOURNAMENT`. These results do not replace Study21 or establish an architecture benefit.

## Provider failures

New study defaults opt into at most two retries for definite HTTP 503 responses. Each attempt consumes its own call/token/money reservation inside the same absolute deadline; reservations are never refunded and unknown failed-call usage remains unknown. The worker receives the actual admitted-attempt count after recovery. Other HTTP errors, timeouts and malformed/partial responses retain fail-closed behavior. Old definitions with no retry setting retain their no-retry policy.

Nine actual local-broker transport controls passed, including one/two 503 recovery, exhausted retries, original no-retry behavior, exhausted call allowance, insufficient deadline, non-503 errors, unknown transport failure and invalid response. These use synthetic upstreams, not real provider calls. A provider can still remain unavailable beyond the retry allowance.

## Repository and runtime status

The current source passes 1,973 tests across 90 files, lint, strict app/fixture types, both production builds, 82 browser cases and the public repair-loop diagnostic. The original A/B source hashes are unchanged.

After separate explicit owner approval, all eleven runtime helper files were installed with preimage verification and immutable backups. The installed hashes were independently rechecked. The retired paid-run policy remains disabled and byte-identical; daemon policy is unchanged.

The actual native CLI passed the scripted 503-recovery control (four admitted attempts, including the failed attempt), exited 0 and finalized public READY. It also passed 100 scripted requests, including the tool-free final response, exited 0 and finalized public READY. These are synthetic transport/workflow controls with zero provider calls, not model-generated correctness results.

The first 100-request control deliberately accumulated large dummy history and stopped at 90 requests after reserving 31,645,173 tokens; the next request correctly exceeded the 32M reservation ceiling. Its failure and cleanup are retained. A compact-history revision then reached 100 without relaxing any production guard. Thus call, token, money, native rollout and time ceilings apply together; the configuration cannot promise 100 calls for every history size. The control revision also preserves the original failure diagnostic instead of masking it with an assertion about call 100 during cleanup.

Both runtime validation operations cleaned up owned workers, stopped the agent sandbox, confirmed zero sessions/mounts and released the shared lease. A final independent inspect confirmed the grader remains stopped with zero sessions/mounts. Installation and native-control evidence is retained under `runtime-d51c5913-9519-47a0-8f44-e8acb84ff122` and `native-100-compact-d51c5913-9519-47a0-8f44-e8acb84ff122` in the diagnostic root and durable archive. The approved plan and initial failed test remain unchanged.

Working diagnostic root: `/private/tmp/forecode-candidate-repairs-20261102`. Earlier archives and the protected oracle remain unchanged. No new paid A/B tournament is claimed.


## Fresh full-run findings and additional repairs

The actual Study22 full wrapper completed with A public READY / protected 8/8 and B public READY / protected 7/8. Its authenticated comparison is A_ONLY_VERIFIED; the original result remains unchanged. The successful isolated B correction was to return the public typed INVALID_INPUT error when rejecting invalid seed data. A fresh diagnostic receipt authenticated the corrected copy at 8/8. Public examples now reject plain thrown errors in that case, and a dedicated mutant verifies detection. These are separate diagnostic and prospective workflow repairs, not a promotion of the historical B result.

Study23 stopped before coding when a read-only sandbox policy inventory timed out. The controller now allows one bounded retry only for exact fixed-role policy-list reads after timeout, with source, CLI, lease and registration rechecks and separate retained failure records. Other errors and all mutations remain fail-closed. Eleven fault controls and actual stopped-role probes passed. Both roles were retired after the incomplete study.

Current full validation passes 1,987 tests in 91 files, lint, strict types, both production builds, 82 browser cases, two fixture browser cases, 128 planning-contract checks and 45 isolated public repair-loop controls. A genuine fresh full Study24 is in progress; its model-generated grades and final report must be observed before claiming a complete 8/8 pair. Durable evidence for the prior full and incomplete runs is preserved separately in ForeCode-Full-Tournament-Study22-20261102 and ForeCode-Study23-Incomplete-20261102.

## Larger allowances after real 8/8 implementations hit the old guard

The real Study24 A and B implementations both passed every protected check and reached public READY. Each native process then failed at the original32M token reservation ceiling after29 requests. Its authenticated result remains inconclusive with both process failures; these passing grades do not promote native completion. The complete actual report, local-browser checks, retirement and frozen source are retained in ForeCode-Full-Tournament-Study24-20261102.

The owner explicitly requested much larger resources. Fresh unsigned definitions now allow1,000 calls/iterations,1B broker tokens and an explicitly committed1B native rollout guard, with a matching USD1,000 conservative spending ceiling and the requested30minute deadline. Original provider context/output and confinement limits remain. Legacy definitions without the native-guard field preserve their original guard. All1,000 synthetic broker reservations and call1,001 refusal pass. Installed real-native synthetic replay crossed the former32M ceiling through100 calls, exited0 and finalized READY; actual503 recovery also passed. These controls make no provider calls. Full validation now passes1,989 tests/91files plus82 browser,2 fixture browser and128 planning checks.

A genuine fresh Study25 is running with these larger matched limits. Its end-to-end success must be established from actual completed processes and fresh grades; it is not assumed from the previous8/8 implementations or synthetic controls. The original stale private setup fingerprints were rejected before dispatch and retained; corrected versioned private readiness passed current isolation/source/egress preflight. No prior result was rewritten.

## Fresh real passing pair verified

Study26 completed end to end: **A8/8 VERIFIED and B8/8 VERIFIED**, both public READY and both native processes exited0. The actual full wrapper exited0 and authenticated the COMPARABLE / BOTH_VERIFIED report9dcafc7b447116dacd44a09b3668ee8bfffa3a5ba246c900b56aba250ca8e539. A successfully used37 requests and45M conservative token reservations, beyond the previous32M cutoff; B used24 requests. Total64 real provider calls (including3 Scientist calls),3,142,766 reported tokens and unknown invoice charges. This new passing pair leaves every previous failure unchanged.

The actual-result UI passed desktop/tablet/mobile grade/status/identity, privacy, overflow, keyboard and cleanup checks. Exact runtime authorization was retired with backups, both sandboxes stopped with zero sessions/mounts and lease released. The unchanged private oracle was never inspected. Both forbidden-import counts were0; the architecture prediction was contradicted by the tie and the engineering decision remains inconclusive despite verified correctness.

The corrected runtime preserves the separately reviewed team entry file, and the new pre-generation gate checks all11 same-named installed helper hashes before any paid callback. The failed Study25 mapping, its three Scientist calls and zero coding attempts remain in a separate immutable archive. Current source passes1,990 tests/91files, lint, strict types and both builds; unchanged-web budget validation includes82 app browser,2 fixture browser and128 planning cases. Native production-entry503 and100large-history controls,1,000 broker reservations and45 public workflow controls are separately retained.
