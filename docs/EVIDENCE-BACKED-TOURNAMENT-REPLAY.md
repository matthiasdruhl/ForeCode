# Evidence-backed Architecture Tournament Replay

Implementation date: November 1, 2026. Starting source: `03f5deb2521facb58c26fd3fcf4bc6199bd8b210` (`origin/main`), including PR #49 and PR #51 (merge `2fdbc3bb53660aa414c7c7fb0ce9719e6589aaea`). Open PRs #52–55 were inspected before implementation; none supplied a dependency. The planning references were read for context only, including the remote v6 design/handoff absent from the local planning checkout.

## Purpose and source of truth

This library presents existing public evidence as five conceptual stages: hypothesis → preparation → coding → independent verification → engineering decision. It is a pure, synchronous read-only projection, with no execution, inference, persistence, publication configuration, signing or new decision algorithm.

**Only the existing trusted server-side publication reader may provide an approved study for public replay presentation.** Use `loadApprovedTournamentRecordings()` from `src/server/artifacts/recording-catalog.ts`, backed by the existing fresh receipt/disclosure reader. Schema parsing, hashing, deterministic IDs and matching references establish structure and identity only. They do not establish approved origin, custody, consent, runtime admission or disclosure authority.

`buildTournamentReplay(study: PublicTournament): TournamentReplay` validates and snapshots a bounded JSON projection, then returns detached, deeply frozen data. Its provenance always remains `UNAUTHENTICATED_PROJECTION`, including after a caller supplies schema-valid synthetic JSON. Production approval is established by the trusted caller's fresh loader lineage, never a flag passed into this library.

`projectTournamentReplayCatalog(catalog)` handles the existing catalog structure without importing server modules or duplicating loading. Empty catalogs yield five static `unknown` stage descriptors and no replay; unavailable catalogs yield five `publication_unavailable` descriptors and no replay. Available catalogs retain their unavailable count and contain actual projected studies. Invalid catalog relationships throw a fixed `ReplayInputError`; callers must fail closed, never retain an older study as fresh.

## Type model and assembly

The versioned `TournamentReplay` contains study/task/definition/protocol/preparation identities, an input projection digest, publication context, A/B arms, baseline/future evaluator identities, five stage groups, events, chronology tracks, missingness markers, blockers, deviations, limitations and an absent decision reference. Public types and functions are exported from `src/lib/replay/index.ts`.

Events use a discriminated `data.kind` union: research context, architecture preparation context, preparation attempt, coding attempt, arm outcome, independent verification, independent check, source comparison, engineering decision classification, or unavailable evidence. Each event includes stable ID, study, optional A/B arm, stage, safe fixed description, availability, basis, timing and evidence selectors. Arm outcomes are summaries of the same runs, **not additional attempts**.

Events are ordered by conceptual stage, then stable event ID. IDs use the exact study and attempt/check/arm identities with distinct category namespaces. Every permitted attempt is retained, including earlier failures, blocked, cancelled and timed-out attempts. No compact summary is provided; stage membership references the complete event set. Array position is not chronology. The declared execution order is retained as metadata only. C attempts are rejected rather than silently hidden or appended to an A/B study.

A's original architecture and B's prepared alternative are metadata contexts, not inferred preparation executions. Public preparation attempts have no variant: their replay events and references remain unassigned. Preparation metrics are copied separately from downstream and total metrics. No costs, tokens, file counts or durations are recomputed; null remains null, zero remains zero, reservation ceilings remain separate from cost, and phase file-touch counts are never added.

## Availability and missingness

| Availability                                  | Meaning, conditional on trusted loading                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `observed_in_projection`                      | The public projection records this observation; replay has not authenticated it independently.         |
| `metadata_only`                               | Published explanatory context/classification, not a separate runtime event.                            |
| `not_run`                                     | An explicit published unrun arm/check state.                                                           |
| `blocked`, `failed`, `cancelled`, `timed_out` | The recorded attempt/arm status, preserved separately from evaluator verdict.                          |
| `unknown`                                     | Missing evidence or an invalid check; does not establish execution or success/failure.                 |
| `publication_unavailable`                     | An approved publication could not be loaded; different from a missing field inside an available study. |

Without a future receipt, public `not_run` check placeholders represent unknown verification evidence. They do not prove that checks were independently observed not running. Invalid checks remain `invalid` in their data and have unknown availability. Missing receipt, tree, history, partial metrics, event times and separate Decision Report are explicitly marked. Missing source comparison is distinct from a published empty comparison list.

Missing final receipts require insufficient-evidence verdicts and `not_run` placeholders. A non-null receipt without its run/tree, duplicate identities, conflicting arm/attempt assignments or contradictory pass/verdict claims are rejected with a fixed, source-free error. Incomplete legitimate records preserve their observed attempts. Replay copies comparability/correctness; it neither reconciles nor recalculates these classifications. Passing both arms is a correctness tie, never a derived winner.

## Chronology and causality

Preparation attempts publish start/finish; coding attempts and arm summaries publish start/end when present. Other stages have null times: hypothesis issuance, preparation selection, comparisons, individual checks, receipt publication and engineering decision. A publication's hypothesis text cannot attach a historical Meta recording to a new study.

The public contract provides no authenticated common-clock basis across attempts. Therefore `chronology.commonClock` is `not_established` and `globalOrder` is `conceptual_stages_only`. Each interval has its own track. The only comparable chronological observations are the boundaries of that same recorded interval; they are ordered start then end, with deterministic start/end handling for equal timestamps. No inter-track sorting, concurrency, makespan, inferred duration or interpolation is issued. UTC fractional seconds are compared without truncating sub-millisecond precision.

An end before its start marks that interval inconsistent. A final arm's timestamps conflicting with its matching attempt invalidate playback for both affected tracks. Raw published timestamps remain available for inspection, while their `observations` arrays become empty and explicit inconsistency markers are added. Other tracks remain usable. No source is silently corrected. Schema-invalid timestamps fail validation.

## Evidence and source integrity

References contain only study ID, a narrow structured selector, optional A/B/run/receipt/tree/check IDs, and optional published file comparison path/hash identity. Selectors resolve directly into this supplied projection: study, arm, attempt, preparation attempt, baseline, future, check, or comparison index. There are no arbitrary URLs, private filesystem locations, raw assertions, grader bodies, provider outputs or credentials.

Baseline references deliberately omit run ID: the published arm's `runId` belongs to the future attempt and the baseline evaluator run ID is not published. Earlier coding attempts receive only their own published attempt/run identity; they never borrow the final attempt's receipt or tree. Final checks reference their exact arm/run/future receipt/final tree. Baseline references use initial trees and baseline receipts. Safe comparison paths must be relative under `src/`, bounded to 512 characters, without empty/dot/traversal segments.

`matchesReplayEvidence(study, reference)` checks a selector and its exact identifiers against that source. It is an optional diagnostic guard, not a repeated per-event authentication pass. A wholly coherent forged study, or receipt swap inside that study, cannot be authenticated or disproved from these public fields alone. The existing protected reader's original receipts and registration pins enforce that boundary. Projection digests likewise identify bytes without granting trust.

`sourceComparison` is an unassigned file/hash list. It does not contain the source bytes, an arm attribution, or a three-stage source topology. No source-edit sequence, diff content, graph or propagation is generated.

## Decision Report integration

Replay does not import or invoke the deterministic report algorithm. `decisionReference.state` is always `not_supplied`; the decision stage copies only the existing comparison/correctness classification. A trusted server caller may separately join a freshly loaded official report using the **same study ID and projection digest**, displaying its existing recommendation without recalculation. If either read is unavailable/revoked/mismatched, leave the report unavailable. See the frontend integration guide for exact code.

## Security, bounds and privacy

No network, filesystem, environment, clock, randomness, agent/model, signing or protected store APIs are used. Existing deterministic schema/digest utilities are reused; their hash implementation uses Node crypto, so assembly belongs on the server. Browser consumers receive the DTO through their existing server boundary. JSON descriptors reject accessors without running getter code. Pre-validation limits are 20,000 nodes, depth 16, 512,000 text/key characters, and 100 entries per array. Existing public schema bounds remain authoritative after that check (100 coding attempts, 100 preparation attempts, 100 comparisons, two arms, eight checks per arm). Output is capped at 240 events per study, with at most 20 studies per catalog.

The assembler projects only the public schema and uses fixed error text. It is **not a redaction authority**: approved free-text title/hypothesis/limitations and approved source paths are retained. Publication approval must already have vetted them for disclosure. Tests are not a mechanism for making unapproved private records public. No production fixtures or input endpoints are introduced.

## Current availability and future dependencies

Production registration at the starting commit is null/unprovisioned. The production-loader regression proves an empty catalog. Implementation completeness does not establish an operationally verified replay. A genuine public replay still requires a completed authentic study, fresh matching protected receipts, explicit disclosure approval and exact source-owned publication configuration by the authorized operators. None of that work is performed or bypassed here.

Agents A–D remain independent: no registration/custody changes (A), protected measurements or contract changes (B), UI/routes/styles/browser tests (C), or operator readiness/runbook changes (D). Future metadata requires a separately reviewed additive integration. Replay is downstream of authentic evidence and is not a runtime-admission prerequisite.

## Synthetic evidence and validation

All replay test input is newly authored disposable **synthetic metadata**, not genuine provider calls, evaluator outcomes, signatures or experiment measurements. No private evidence store is read. Only replay code, replay-specific unit tests and the two replay documents are changed. The task's explicit ownership rule supersedes the general repository request to edit the shared implementation log; commands are recorded here instead.

Dependency installation used the existing unchanged lockfile on Node 24.16.0. Offline installation could not fill missing cache entries; `npm ci --force --ignore-scripts --cache /private/tmp/forecode-replay-npm-cache` succeeded (exit 0) to retain locked peer packages despite the existing ESLint peer-range conflict. The temporary `--legacy-peer-deps` install omitted Vite and was replaced; no dependencies or scripts were changed.

| Command                                                                                                                                                                                                                      | Observed result                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/unit/tournament-replay.test.ts tests/unit/replay-chronology.test.ts tests/unit/replay-evidence-links.test.ts`                                                                                          | exit 0; initially 60 tests, expanded to 67 in final validation                                        |
| Same three suites plus `tests/unit/decision-report.test.ts tests/unit/tournament-publication.test.ts tests/unit/tournament-provisioning.test.ts tests/unit/tournament-measured.test.ts tests/unit/tournament-paired.test.ts` | exit 0; 226 tests across 8 files                                                                      |
| `npm run typecheck`                                                                                                                                                                                                          | exit 0; app and booking fixture TypeScript checks                                                     |
| `npm run check` (final)                                                                                                                                                                                                      | exit 0; lint, both typechecks, 1,433 tests across 66 files, both production builds                    |
| `npm run test:e2e`                                                                                                                                                                                                           | exit 0; 62 production browser cases with existing synthetic credentials and provider-network blocking |
| `npx prettier --check src/lib/replay tests/unit/*replay*.ts docs/EVIDENCE-BACKED-TOURNAMENT-REPLAY.md docs/EVIDENCE-REPLAY-FRONTEND-INTEGRATION.md`                                                                          | exit 0                                                                                                |
| `git diff --check` and `git diff --cached --check`                                                                                                                                                                           | exit 0                                                                                                |

The first sandboxed full check exited 1: 1,424 tests passed, while two pre-existing local socket tests were denied by the sandbox. The authorized rerun with local socket access passed all 1,426 tests then present; the final rerun after the availability edge-case correction and seven added cases passed all 1,433. No failing controls were removed. Full check logs and browser artifacts remain disposable local outputs, not public experimental evidence.

No e2e source, application component, shared dependency, protected evaluator, publication composition, report algorithm, planning file or Agent A–D file was changed. The freshly fetched main remained at the starting SHA before delivery. The final tested commit is pinned in the PR description.
