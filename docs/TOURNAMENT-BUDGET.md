# Future A/B coding budgets

The owner requested a very large increase after the real Study24 implementations both passed eight protected checks but their native processes exhausted the original 32M reservation guard. Fresh unsigned study packets now use these matched limits:

| Limit | Per arm |
| --- | --- |
| Coding deadline | 1,800 seconds (30 minutes) |
| Model requests and iterations | 1,000 |
| Conservative cumulative broker token reservations | 1,000,000,000 |
| Separate native rollout token guard | 1,000,000,000 |
| Reasoning/output reservation per response | 65,536 |
| Protocol spending ceiling | USD 1,000 |
| Definite HTTP 503 retries | At most 2 per response |

The broker token allowance is 31.25 times the prior 32M guard; the native allowance is 1,000 times the prior 1M guard. The spending ceiling covers the complete 1B token reservation at the retained conservative 1/1 microUSD tariffs. It is an upper bound, not a prepaid charge or observed invoice. Actual reported usage and unknown invoice charges remain separate. No reservation is refunded or rewritten.

`team-budget.ts` applies these defaults only when building a fresh unsigned definition and recomputes its task commitment. The native guard is explicitly committed as `restrictions.nativeRolloutTokenLimit`. Definitions without that optional field preserve their original `min(tokenLimit, 1M)` native guard. Historical definitions, runtime records, candidate trees and outcomes remain unchanged. Study24 retains its two native failures and two protected 8/8 grades.

Requests count upstream model attempts, not shell commands. The final admitted response is tool-free and remains inside the same allowance. Every definite HTTP503 retry consumes its own durable call/token/money reservation inside the original deadline. Other HTTP errors, timeouts and malformed or partial responses are not retried. The original provider context window, finite request/history limits and 65,536 response cap still apply. A 1,000-call ceiling does not promise that every history can use 1,000 calls within thirty minutes, and additional budget cannot guarantee correct generated code.

The source and Python enforcement, worker bridge, private operation helpers, append-only central reservation helper and installed runtime must all agree before a new paid run. Synthetic broker controls exercise all 1,000 reservations and refusal of call1,001. A separate native CLI control uses large replay history to cross the former 32M guard with the new explicit native guard; its actual result is logged in the implementation log. Synthetic controls make no provider calls and do not establish model-generated correctness.

The fresh real Study26 confirmed these limits in the admitted worker state and completed with A37/B24 requests, both native exit0/public READY/protected8/8. A reserved45,037,708 tokens, beyond the former32M cutoff, before successful completion. Full wrapper/report, actual-result UI and runtime retirement passed. Total reported usage3,142,766tokens across64 provider requests; invoice charges remain unknown. See `TOURNAMENT-FAILURE-FIXES.md` for the retained failures and separate controls.
