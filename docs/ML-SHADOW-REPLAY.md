# Offline RL policy replay and shadow decisions

This slice connects the approved evidence intake to actual numerical policy updates, immutable storage and future advisory drafts. It is operator-local research, independent of Colab, model training, the web app and tournament execution. Status remains **NOT_TRAINED** without eligible authentic training observations; trainable research artifacts remain **SHADOW**. No release or architecture-improvement claim is produced.

## Follow-up audit

Started October 30 in the existing isolated `/private/tmp/forecode-meta-rl-20261030` worktree, on a new `codex/ml-shadow-training-replay` branch based on evidence-intake commit `7451a4e`. Fetched main remains `54e72b2`; the two CI checks for [intake PR #28](https://github.com/matthiasdruhl/ForeCode/pull/28) passed. The QLoRA notebook remains on its independent branch/PR #29. No branches were merged or copied, and no other checkout or planning document was edited.

Existing LinUCB, snapshots and registry updates are implemented and synthetically tested. Intake has actual custody/evaluator adapters, independently anchored admission history and exact source pins. Its production source catalog is still unprovisioned. This workstream has no admitted authentic paired result to consume. This statement concerns the ML catalog; it does not infer the contents of private core-team artifacts. The missing implementation was one reproducible workflow joining fresh intake, complete history, policy updates, storage and advisory comparison. That workflow is now implemented and tested with explicitly synthetic originals. Authentic operation and independent evaluation remain unvalidated.

## Replay a complete anchored prefix

`ShadowPlanSchema` in `scripts/learning/shadow-contracts.ts` defines the new local version `learning-shadow-plan.local.v1`. It pins an opaque job ID, origin, plan freeze, independently retained ledger head, trainer fingerprint, seed/config and ordered dataset batches. These are additive local interfaces, not changes to any of the 49 frozen contracts. Operator allowlisting is not an independent evaluation preregistration or a signing service.

`replayShadowPlan` in `scripts/learning/shadow.ts`:

1. Checks the exact ledger anchor, code identity, origin and chronology. Every unique admission must appear exactly once across the batches. Replays, failed source loads and blocks remain visible in the report's complete audit sequence; they cannot add training rows.
2. Freshly loads every admitted original through `createApprovedEvidenceSource`, including failed/ineligible outcomes. Rechecks process-local source authority, packet/observation/evidence pins, reward summaries, assessment time and current approvals/revocations. A saved policy, ledger record or report cannot replace fresh admission. Missing or revoked evidence blocks the whole job; it is never silently dropped.
3. Uses the existing snapshot validator across the complete history, then per batch. Repository OR task overlap cannot cross train/validation/test, even across batches with no usable reward. Duplicate studies and receipts fail. Dataset batches must postdate their original admission audits and precede the plan freeze.
4. Rebuilds from zero using the existing constrained two-channel LinUCB. Each train-eligible batch creates an immutable child policy using the actual `A += xxᵀ`, `b += rx` updates. Validation/test and ineligible rows remain in snapshots/reports without updating weights. A batch with no eligible training reward creates no artificial policy version. All batches are retained.
5. Rechecks the ledger head and trainer source before saving the exact plan, snapshots, initial policy, descendants and content-addressed report. Reloads each saved policy through the existing mathematical replay validator. Repeating the same plan/clock/source yields the same artifacts; nothing is counted twice. Existing rollback preserves both descendants and audit events.

The source fingerprint captures Node version, the dependency-lock bytes and the fixed inventory of learning contract/feature/intake/reward/training/replay/storage sources. The inventory is included in the report. It reads only those reviewed repository files, without discovering source or grader paths. This is a reproducibility checksum, not an independent signature, installed-dependency integrity proof or runtime-isolation attestation. Replay determinism is claimed for the same pinned implementation/configuration, not arbitrary Node/toolchain versions.

`openLearningRegistry` now saves/loads plans, reports and decision drafts with the same exclusive content-addressed writes and schema/digest checks as policies. Historical JSON is descriptive, not fresh evidence authority. `isFreshShadowReplay` recognizes only this process's completed replay objects; serialized copies do not gain that capability. Original approvals can later expire/revoke: run a new replay before subsequent advice. No mutable current-policy pointer or promotion action is added. An I/O failure can leave valid ancestors; recovery never deletes, overwrites or automatically repairs historical files.

Replay is bounded at 1,000 unique observations, 1,000 batches and the ledger's existing 10,000 records. This small implementation deliberately replays the full admitted prefix instead of trusting opaque incremental weights. Larger corpora/checkpoint optimizations need separate reviewed work.

## Draft a future comparison

`draftShadowDecision` in `scripts/learning/shadow-decision.ts` accepts a fresh replay, future context and optional already-captured Meta proposal. It requires the same assessment/recording time, a context after all replay batches, and no known outcome for the exact source/intent pair. The Meta proposal must pass the existing provenance/input checks and preserve the complete eligible set. This function never calls Meta.

The immutable draft records fixed-policy advice, learned advice or abstention, policy/context/proposal/candidate hashes and comparable **train-only** positive/negative evidence citations. Memory support is aggregated across batches using distinct repository/task families. Held-out and reward-ineligible cases cannot become retrieved support. Missing features and uncalibrated evidence remain explicit; memory cases do not constitute a separate learned selector or a measured success probability. Sparse learned support can abstain even when two-family case memory is available.

The draft is explicitly `DRAFT_ONLY`, `UNOBSERVED`, with `independentCommitment=REQUIRED`. It is not a trusted timestamp or proof that selection preceded an outcome. The core operator must bind the exact selected strategy/selector/proposal/context into the existing independently held decision commitment before any future approved tournament. Independently matched held-out outcomes and the existing ablation protocol remain necessary for evaluation. No retrospective counterfactual reward, randomized propensity, uplift estimate, calibration or generalization claim is calculated here. A separate equally informed non-Meta control is still required for Meta attribution.

## Local command and provisioning boundary

```sh
node --conditions=react-server --import tsx scripts/learning/shadow-cli.ts --help
node --conditions=react-server --import tsx scripts/learning/shadow-cli.ts --status
node --conditions=react-server --import tsx scripts/learning/shadow-cli.ts --replay approved-job-id
```

Help exits 0. Default status and replay exit 2: approved source/ledger/registry/job composition is **not configured**. The default status reports `NOT_TRAINED`. There is no environment-variable, path, JSON, source-origin, signing-key, model-training, execution, spending or promotion option. The existing evidence-intake CLI is unchanged and still cannot train. The new CLI performs only local numerical policy fitting for exact-pinned operator-reviewed job IDs.

After core-owner review, trusted composition must supply the original custody/evaluator source, externally anchored ledger, private registry and exact plan hashes. Storage must remain outside the repository and disjoint from candidate workspaces, protected artifacts and source originals. No production catalog, signer, spend approval or authority is provisioned by this PR. No API route, grader import, agent/provider invocation, package/dependency change, experiment execution or Colab operation is introduced.

## Evidence and next gate

Synthetic tests exercise actual original custody/evaluator/source loaders and the real mathematical learner/registry. They prove complete history retention, real numerical updates, deterministic replay, reload/rollback, held-out isolation, source revocation/tampering rejection, trainer/anchor/chronology mismatches, safe CLI denial and draft provenance constraints. They are not evidence of real-world improvement. No authentic policy training or independently measured outcome has been added.

Observed verification, October 30:

| Command                                                                                                                     | Exit  | Result                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `npx vitest run tests/unit/learning-shadow.test.ts tests/unit/learning-boundary.test.ts tests/unit/learning-policy.test.ts` | 0     | 39 tests, including 31 new replay/decision tests                              |
| `npm run check`                                                                                                             | 0     | Lint, both strict typechecks, 955 tests / 56 files and both production builds |
| `PLAN_REFERENCE_ROOT=<read-only planning checkout> npm run test:plan`                                                       | 0     | 128 contract-parity checks                                                    |
| Changed-path Prettier and `git diff --check`                                                                                | 0     | Formatting/whitespace passed                                                  |
| New CLI `--help` / default `--status`                                                                                       | 0 / 2 | Help; expected unconfigured / NOT_TRAINED status                              |

A separate offline demonstration through the same synthetic custody/source/replay/storage stack exited 0. Saved KEEP intercepts were `0 → 0.28189036116651955 → 0.32814013121759883`; BOUNDARY intercepts were `0 → 0 → 0.16407006560879941`. Its first BOUNDARY failure still updated the design matrix and sample history; the next synthetic success updated its reward vector. This verifies mathematical execution, not real training or architectural improvement. All demonstration-owned temporary artifacts were removed. No app source changed, so browser E2E was not repeated locally; existing CI runs it.

Next: core owner reviews the approved export and exact job composition, provisions the authentic originals and independent ledger anchor, and performs the first authentic admission/replay without promotion. Precommit the next independent-family comparison and its strategy decision before collecting outcomes. Maintain the November 2 core freeze; the learner remains optional. QLoRA SFT and eventual model-weight RL/GRPO are separate tracks; neither is launched by this workflow.
