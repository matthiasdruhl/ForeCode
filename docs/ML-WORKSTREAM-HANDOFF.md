# ML workstream delivery — October 30

Branch: codex/meta-rl-learning-workstream. Worktree: /private/tmp/forecode-meta-rl-20261030 (outside all tracked parent repositories). Base: fetched main 54e72b2. Implementation: 23d8f7c; chronology/history hardening: c5e8c48; QLoRA preparation is the subsequent commit in this PR. No branch was merged. Planning and other agents' checkouts were not modified.

**Implemented:** closed versioned KEEP/BOUNDARY/ADAPTER and ABSTAIN decision contracts; deterministic 21-dimensional pre-decision features with unknowns; separate Spark/Glimmer proposal provenance; intake requiring existing authenticated evaluator/custody objects and independent projection approval; separate correctness/conditional preparation-inclusive USD rewards; real constrained disjoint LinUCB updates; immutable datasets, family splits, policy ancestry, persistence/reload/replay and rollback; train-only evidence retrieval; roadmap-aware fixed control; matched 2×2 analysis. Everything stays operator-local and advisory.

**Synthetic tests:** 57 new tests cover real numerical updates, actual protected-store/custody trust boundaries, tampering, self-declared verification, chronology, missing costs, failures/ties, negative history, independent-family counts, held-out leakage across versions, OOD/sparse abstention, persistence, rollback, model provenance and capability boundaries. The synthetic KEEP intercept changes 0 → 0.28189036116651955 after one fictional correctness reward with lambda 1. This proves implementation behavior only.

**Real training and outcomes:** zero eligible paired observations were available to this workstream at the audited main commit. No production policy/adapter is trained; no independent architecture-improvement measurement exists. Empty production status is NOT_TRAINED, updated research artifacts are SHADOW, and synthetic policies cannot supply default production advice. No paid request, GPU, checkpoint download, dataset upload, coding-agent experiment, hosted endpoint or deployment was created.

## Changed paths

- src/lib/learning/contracts.ts, features.ts, meta-boundary.ts — fresh sidecar contracts/features/proposal validation.
- scripts/learning/intake.ts, reward.ts, dataset.ts — authenticated adapter, reward assessment and immutable manifests.
- scripts/learning/policy.ts, registry.ts, memory.ts — trainable parameters, local storage, rollback and comparable cases.
- scripts/learning/evaluation.ts — same-base Glimmer 2×2 condition checks and descriptive metrics.
- scripts/learning/qlora.ts — inert pinned preparation metadata, text demonstration validation and cost arithmetic.
- tests/support/learning.ts and tests/unit/learning-{features,evidence,policy,evaluation,boundary,qlora}.test.ts — synthetic fixtures and regressions.
- docs/ML-Q0-AUDIT.md, ML-LEARNING.md, ML-Q1-PREPARATION.md, this handoff; docs/IMPLEMENTATION-LOG.md records observed commands.

Existing frozen schemas, package manifests/locks, fixture, protected evaluator, experiment runner and frontend are unchanged.

## Observed verification

| Command                                                            | Exit | Result                                                                                                     |
| ------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| npm ci --ignore-scripts --offline                                  | 0    | Locked dependencies, no lock changes                                                                       |
| npm run check                                                      | 0    | Lint, app/fixture TypeScript, 881 tests / 51 files, both builds; repeated successfully after worktree move |
| npx tsc --noEmit                                                   | 0    | Final preparation metadata typecheck                                                                       |
| npx prettier --check on changed learning/tests/docs paths          | 0    | Formatting                                                                                                 |
| Focused six learning suites                                        | 0    | 57 pass                                                                                                    |
| npm run test:e2e                                                   | 0    | 54 pass, provider networking blocked by existing test preload                                              |
| npm run test:fixture-e2e                                           | 0    | 2 pass                                                                                                     |
| PLAN_REFERENCE_ROOT=<external planning checkout> npm run test:plan | 0    | 128 frozen-contract parity tests; planning reference read-only                                             |

Initial recoverable setup failures are recorded in IMPLEMENTATION-LOG: legacy peer install omitted Vite; a concurrent typecheck saw temporarily absent reinstall files; first parity invocation lacked its required reference environment variable. Normal locked offline installation and clean reruns passed. No test/evaluation condition was weakened.

## Dependencies and next actions

1. Core tournament owner reviews an append-only sanitized projection/export and independently held approval against the existing measured-report work. Individual receipts alone do not prove comparability, original/prepared/final source binding, chronology, current consent, complete history or telemetry. ML intake has no production catalog or approval issuer. The active tournament branches were inspected only; no code was copied or merged.
2. Admit authentic paired results only after that integration review. Collect distinct repository/task families, freeze rights-cleared train/validation/test partitions and precommit fixed/retrieval/LinUCB comparisons. Repeated booking seeds remain one family. Do not run experiments without core coordination.
3. ML-Q1: published Glimmer revision a4e59da52a7bc87ae7251dd5545c0dd437c44b68 and Axolotl 0.19.0 are referenced in the inert draft. Checkpoint access and processor compatibility were not tested. Dataset rights, transitive wheel lock/image, tokenizer/chat-template hashes, actual GPU memory, dated provider quote and absolute budget remain unresolved. Budget defaults USD 0 / zero GPU hours. Next authorized compute step would be preprocessing plus two optimizer steps, checkpoint save and fresh adapter reload, followed by same-base held-out SFT evaluation.
4. ML-Q2: use independently held protocols and four matched conditions on the same original Glimmer checkpoint. Include failed/missing observations, coverage, model and preparation costs, regressions and independent group counts. Brier/intervals stay absent until probability semantics/sample size justify them. A distinct equally informed non-Meta control is required for Meta incremental claims. No observed 2×2 study exists.

Recommended next task: review and implement the core-approved sanitized evidence exporter, then perform the first authentic admission/replay without training promotion. Keep P0 independent; November 1 integration requires actual evidence and owner review, November 2 freeze wins. Full Glimmer GRPO is separate, unimplemented and outside this delivery.
