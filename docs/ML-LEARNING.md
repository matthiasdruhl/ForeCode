# Independent learning sidecar

ML-Q0 implements an offline research engine. There is no production evidence catalog or trained production policy. Nothing is connected to the hosted app. Synthetic tests establish mathematics and validation behavior only, not architectural improvement, real training or operational isolation.

Pure context, action, proposal, feature, reward, dataset and evaluation schemas are under src/lib/learning. Operator-local intake, rewards, snapshots, LinUCB, persistence, retrieval and ablation analysis are under scripts/learning. All were newly authored during the event. Existing frozen contracts and protected execution code are unchanged. See ML-Q0-AUDIT.md for the starting state.

## Observation intake

The proposed approved-learning-projection.v1 is a narrow adapter contract for the core owner's future sanitized export. Its complete digest must be independently approved as a disclosure record, linked to the original protocol in the EXISTING custody store. Context/decision/outcome chronology, complete attempt history, equal original source/task/information/agent/oracle/budgets, authorization, rights, sanitization and actual aggregate USD telemetry require independent review. A timestamp, hash, issuer string or model opinion alone provides none of this authority.

admitObservation freshly requests protocol/disclosure originals through loadRecord and baseline/future results through loadEvaluation. Supply actual createStudyCustodyStore and createProtectedEvaluationStore loaders from trusted operator composition, never an untrusted configuration or cached object supplier. It requires process-local authenticated objects, exact receipt digests/identities, equal oracle/fixture, verified present-day functionality, bound attempt IDs and ordered chronology. It emits no verification verdicts. Serialized copies fail admission. No signing function, production allowlist, protected experiment, provider call or hidden assertion reader is supplied.

The adapter does NOT replace the main team's forthcoming authenticated paired-report exporter. Its independently reviewed projection must establish facts beyond individual checks, including original/prepared/final source binding, no cross-arm leakage, current intent approval, complete failed preparation history and trustworthy telemetry. Main currently cannot provision that export. Do not manufacture disclosure approval to bypass this dependency.

The approval covers origin AUTHENTIC or SYNTHETIC. Reward/training/retrieval default to AUTHENTIC and reject synthetic data. Synthetic tests explicitly select SYNTHETIC and use test-owned keys and fabricated protected records through the real loaders. A custodian knowingly signing a false origin is outside cryptographic detection; independent operator composition remains essential. Rights revocation requires fresh admission and rebuilt snapshots/policies, not trusting old in-memory capabilities.

## Features and rewards

architecture-features.v1 has 21 coordinates: intercept; eight bounded facts each paired with missingness (files, observed module count, mean fan-out, boundary, estimated scope, coverage, uncertainty, budget); and four requirement indicators. Scales are fixed in features.ts. Saturation is explicit; graph counts describe the supplied partial graph, not a complete repository census. A partial graph imposes at least 0.5 uncertainty. No source text, names, paths, outcome, receipt or post-change diff enters the vector. The source/intent/context hashes retain lineage separately. Independently reviewed context freeze establishes actual pre-decision availability.

KEEP, BOUNDARY and ADAPTER are the closed reviewed v1 strategy set. ABSTAIN is a decision, never a trainable action. An extension requires a new action version, reviewed semantics/eligibility, new tests and compatible feature/policy/reward migration with independent evaluation. Never accept free-form model actions or silently load existing weights for a new strategy. KEEP is a sound current architecture, not a weak control.

correctness-conditional-cost.v1 emits separate channels. Authenticated pass/failure is 1/0 only for a genuinely comparable complete study. Invalid, blocked, unverified, cancelled, missing-check or repeated-attempt observations remain visible without rewards. v1 deliberately excludes retries pending an independently reviewed retry objective. Both genuine failures produce two negative labels and no successful winner. Correctness ties remain ties.

Actual aggregate preparation plus downstream USD is optional. Missing either phase remains null; reported estimates and unknown currency/measurement bases cannot substitute. Conditional efficiency is 1 - total/max(all arm totals), ONLY when all observed arms pass and all comparable costs are known. If every cost is zero, all efficiencies are 1. Equal costs cannot favor additional abstraction. Inference/research costs are reported separately. No cost score can compensate a failed correctness gate.

## Policy, snapshots and rollback

disjoint-linucb-two-channel.v1 maintains regularized A and b per strategy/channel. Each eligible (x,r) applies A += xxᵀ, b += rx; theta solves A theta = b using Cholesky. Correctness and cost never share weights or a scalar tradeoff. The seed is preserved for deterministic replay; v1 uses no stochastic exploration and claims no randomized propensity or counterfactual off-policy estimate.

Snapshots retain all observation references, including ineligible and negative cases. createSnapshot requires admitted process-local objects; JSON manifests alone grant no training authority. Split by BOTH repository family and task template: either overlapping identity forbids cross-split allocation. Repeated booking seeds count as one family. Policy history checks this across incremental snapshots and rejects reused receipts/studies. Only train rows update weights; validation/test rows remain protected.

Every update returns a deeply frozen new policy with parent, version, exact dataset hash, trainer SHA, config, seed, sample/support counts and update history. No real rewards means NOT_TRAINED. Any trainable version stays SHADOW; this implementation has no promotion authority. Synthetic policies are isolated from default recommendation. LinUCB scores are uncalibrated estimates, not success probabilities.

Dataset freeze must follow both outcomes and independent projection approval. Policies record the latest consumed dataset freeze. Advice/retrieval reject contexts frozen before their learning evidence was available; the independently held evaluation protocol must postdate training. Persistence replays every matrix/vector from update history and validates append-only ancestry, preventing weight/history disagreement and loss of previous failures. LinUCB upper bounds rank candidate estimates; lower bounds enforce correctness and distinguish conditional cost before recommending.

Inference requires adequate independent repository AND task support for every offered action, bounded missingness, known requirement, nearby contexts, and a correctness lower-confidence threshold. Cost is considered only among actions satisfying that gate. Overlapping or absent cost evidence retains KEEP when it passes; otherwise abstain. Unsupported/OOD inputs abstain. Thresholds are research settings, not validated risk guarantees. The fixed roadmap-aware comparator chooses KEEP for an existing adequate boundary, a scoped BOUNDARY/ADAPTER for relevant changes with budget, or ABSTAIN.

openLearningRegistry accepts an existing private operator-owned 0700 directory outside the repository. Save initial policy before its descendants. savePolicy/saveSnapshot use content-addressed exclusive files; load verifies schemas/digests. loadSnapshot also requires freshly admitted observations. rollback requires an ancestor and writes an append-only rollback event, returning the prior immutable artifact without deleting history. Checksums detect corruption; they are not evaluator authority or release signatures. Retrieval uses train-only comparable observations, preserves positive/negative evidence citations, family counts and missingness, and abstains on sparse matches. There is no database or service.

## Evaluation

evaluateAblation validates an independently held protocol and matched observations: A untuned/fixed, B QLoRA/fixed, C untuned/learned, D QLoRA/learned. It binds the same base/tokenizer revisions, exact adapter, selector, pre-decision context, conditions digest and independent held-out families. A Spark-vs-Glimmer comparison cannot isolate QLoRA. Every condition requires separate original outcomes/receipts. Missing conditions stay in the report. Failures, abstention/coverage, cost, avoidable refactor, regressions, latency and independent counts remain explicit; absent values stay null.

This small harness reports descriptive cases only. Calibration/Brier and statistical intervals stay null until predeclared probability semantics and sufficient independent groups exist. Precommit practical effect/no-worse-correctness gates and family-clustered uncertainty before collecting enough data. A separate equally informed non-Meta baseline is required for Meta-specific attribution. Also account for model training, policy fitting, all experiment attempts and inference/serving overhead before any net-value claim. No paired coding-agent study is run by this package.

## Synthetic mathematical check

For the test context, xᵀx = 2.547478515625 and lambda=1. One synthetic KEEP correctness reward of 1 changes A[0,0] from 1 to 2, b[0] from 0 to 1 and theta[0] from 0 to 0.28189036116651955. A synthetic BOUNDARY failure updates its design matrix and sample count while b remains zero. These are real numerical parameter updates on fictional data, not independently measured architectural outcomes.

## Integration handoff

Core owner: finish/authenticate the paired-report export and review the proposed projection/approval semantics, including source/task/attempt chronology and telemetry. ML owner: admit actual evidence, freeze rights-cleared independent family splits and evaluate fixed/retrieval/LinUCB on unseen families. No real eligible learning evidence was found during this audit. Keep the production path NOT_TRAINED, the research path SHADOW and the frontend independent. November 1 integration is conditional; November 2 freeze takes precedence. QLoRA SFT and later GRPO are separate work.
