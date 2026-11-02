# Stable main consolidation — November 2, 2026

The owner requested consolidation of the stable product into `main`, with ML/QLoRA preserved separately. The refreshed remote baseline is `94a0a20889ab4b79aab970a9974093111d4fe523`. The accepted combined implementation is `b73db5c1c701a4299fce8051abda4c7934dbf877`, tree `22207816df72284dbe92f02843c900ebb517418a`, containing all 45 commits absent from that baseline. Integration preserves their original ancestry; no rebase, squash or history rewrite is needed.

## Included work

| Work                                                                  | Retained tip                    | Result                                                                |
| --------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Signature Time Machine and Decision Report, PR #61                    | `7c594b0`                       | Included through the earlier product integration                      |
| Local project import and saved workspaces                             | `bfff76c`                       | Included with replay/context invalidation and navigation-race fixes   |
| A/B handoff, judge audit and historical release docs, PRs #59/#60/#72 | `5c3e36b`, `d6ac9fe`, `a504690` | Included with historical scope labels and judge regressions           |
| Approved source adapter and Time Machine source display               | `ab95885`, `9ca08ef`            | Included; approved source bodies and disclosure remain required       |
| Unclassified approved-study history and feedback availability         | `e6f8fad`                       | Included; no compatible cohort or functioning Evidence Memory claimed |
| Final tournament repairs and closeout                                 | `333cdd5`                       | Included as the exact second parent of combined `b73db5c`             |

The combined merge preserves every repair-only and product-only file from its respective reviewed parent. Its sole conflict was the append-only implementation log; both complete suffixes remain. Combined log SHA256 before this consolidation's new entry: `13bbf0d4d9210fab441850fc1dcaeae8888fe221dc47f6f693966ff31d98d11a`.

## Validation reused from the exact combined implementation

Independent review passed on exact `b73db5c`. Independent testing and a separate integration validation both passed that same commit, with no subsequent executable source changes in this consolidation. Retained integration logs were rehashed and matched their recorded digests before promotion.

| Check                           | Observed result                                                                       | Retained integration log SHA256                                    |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run check`                 | Exit 0; lint, both strict typechecks, 2,206 tests in 98 files, both production builds | `aa28ec30f1c3580cf0fe93e6a53f9a68d7260b689caf22fc84fb4467b3e4cd38` |
| App E2E                         | Exit 0; 158/158, first run                                                            | `2eb95d50a85debaa487f307007ffa9b9f604ca6da0d4e77f011a7b9a0a4a9439` |
| Fixture E2E                     | Exit 0; 2/2                                                                           | `8069886ba6c8479480270711fb0e61eb4c92607521e06f92681ddab3ee388feb` |
| Pinned external contract parity | Exit 0; 128/128                                                                       | `69ed54b47311f7672747a667d4c14760383d62ecf45f741d502fe490edb1e64b` |

These are earlier same-day checks, not newly executed tests. Their local evidence is retained in the sibling `ForeCode-Backlog-Orchestration/reports/FINAL-REPAIR-{review,test,integration}.md` and `logs/FINAL-REPAIR-integration/`. The implementation-log entry records this consolidation's own commands. GitHub Foundation checks must pass on the consolidation PR before merge, including standalone fixture export/install/test/typecheck/build. Earlier intermittent mobile keyboard-focus failures on parent branches remain in the historical reports; both exact combined runs passed on their first attempt.

## Deliberately preserved separately

| Branch or checkout                                                                                   | Disposition                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex/meta-rl-learning-workstream`, PR #27                                                          | Preserve; experimental research foundation, excluded by owner choice                                                                                                  |
| `codex/ml-approved-evidence-intake`, PR #28                                                          | Preserve; stacked on #27                                                                                                                                              |
| `codex/ml-shadow-training-replay`, PR #30                                                            | Preserve; stacked on #28                                                                                                                                              |
| `codex/colab-glimmer-qlora`, PR #29                                                                  | Preserve; based on #27, offline preparation with outstanding GPU/data gates                                                                                           |
| `codex/final-response-contract-observability` and `codex/tournament-completion-contract-diagnostics` | Preserve historical refs; functionality was consolidated in `b735b73`, already in main ancestry. Do not merge old implementations wholesale                           |
| `codex/tournament-writer-diagnostics`                                                                | Preserve its five uncommitted file edits. Unique typed-write diagnostics still need selective review against current workflow v7; this unfinished work is not adopted |
| `ForeCode-Genuine-Publication`                                                                       | Preserve the uncommitted historical publication log; its committed tip is already in main ancestry                                                                    |
| `AgentHarness-Planning`                                                                              | Separate repository with uncommitted planning work; remains external to the event entry                                                                               |
| Detached/earlier integration and validation worktrees                                                | Retain for audit; local worktree deletion is outside this consolidation                                                                                               |

Source-equivalent review branches may have distinct commits, so commit-count uniqueness alone is not evidence of missing behavior. No uncommitted edit is discarded. No planning files/history, private evidence, candidate source, credentials or runtime installation is copied into the entry.

## Product and evidence limits

Historical Study26 completed both native arms, both public READY and both protected VERIFIED 8/8. The forbidden-import metric tied at zero, contradicting its strictly-lower B prediction; the engineering decision is INCONCLUSIVE. Its original source and evidence identities remain unchanged. Combined software checks do not turn that historical run into an experiment on this integration.

Public publication, source disclosure and current Scientist-lineage catalogs remain unprovisioned. Evidence Memory and consented next-proposal feedback are unimplemented. No experiment, training, provider call, runtime installation, evidence publication or deployment is performed by this consolidation. Future work begins from current `main`; experimental branches require an explicit separate integration and validation decision.
