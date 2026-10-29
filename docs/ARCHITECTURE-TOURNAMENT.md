# Local architecture tournament preparation

**October 29, 2026 — study execution BLOCKED.** The implementation can validate a private proposed study, link authenticated check results to exact prepared/final source, retain attempts and account for preparation. No real A/B architecture experiment has occurred. No winner, measured productivity benefit, holdout claim or Meta incremental advantage is established. Public tournament recordings remain NOT_PROVISIONED.

The existing supervised agent adapter requires independent operational admission; its separate fixed booking ownership-refactor smoke task is not a team-permissions experiment. The existing booking evaluator establishes present-day behavior only. The [public team task and future-oracle preparation](BOOKING-FUTURE-EVALUATION.md) now define proposed semantics, exact task/policy commitments and private preparation-record linkage. The [fixed future guest bridge](BOOKING-TEAM-BRIDGE.md) is implemented and synthetically tested. Exact task/private-oracle offline acceptance is complete under the separate owner-authorized AI review in PR #19. Fresh study installation/runtime admission and independent study preregistration remain blocked. These prerequisites cannot be supplied by this implementation's own plan, hashes, synthetic tests or report.

## Boundaries and available implementation

`src/lib/experiment/metrics.ts` is pure accounting. Missing measurements propagate to unknown (`null`), including missing B preparation. Preparation and downstream quantities are separate; totals add elapsed effort, tokens, actual currency cost and iterations only when both phases are known. The total files-touched count remains unknown because adding counts would double-count shared files. B's modeled effort points never become actual cost. Additive elapsed effort is not concurrent study makespan. Bounded overflow remains unknown instead of silently capping a measurement.

`src/lib/experiment/report.ts` exports `unprovisionedTournament()` for the existing read-only UI. It supplies code-owned blockers, A/B arms with unknown metrics, no run IDs and an inconclusive outcome. It reads no host files, imports no runner and registers no evidence. Each call returns fresh data.

`scripts/experiments/tournament/plan.ts` validates a private `tournament-plan.local.v1` preparation record. This supplementary local record embeds an unchanged `PairManifestV1` and `ScenarioV1`; none of the 49 frozen definitions or public APIs is extended. It requires:

- Exactly A/B with status quo A preserving the original pre-preparation commit/tree.
- A confirmed frozen scenario and matching intent ID/revision reference. Current intent freshness/revocation still needs independent operator enforcement; a reference alone cannot authenticate that state.
- A task digest derived from exact task ID, request, assumptions and acceptance IDs. The commitment changes when instructions change.
- Identical original source, lockfile, visible roadmap hash, task hash, downstream prompt, agent/config, tools, runtime, credential/network policies, seed and budgets.
- Separate identical-across-arms baseline and future oracle identities and required-check policies.
- One predeclared attempt per arm, sequential order, preservation of failures and withholding opposing results until both finish. Declaring these rules does not establish they were enforced.

The full plan digest includes preparation metrics, source pins and trial policy. It is a reproducible content commitment, **not** independently held preregistration or authorization. No independent pre-selection/preparation chronology can currently be established. A `frozenAt` timestamp in JSON does not prove it preceded architecture generation or selection.

`scripts/experiments/tournament/report.ts` reuses the existing `createProtectedEvaluationStore` authenticity boundary. `buildTournamentReport({plan, attempts, baselines, evaluations})` accepts baseline objects keyed by A/B and downstream objects keyed by run ID. Only actual in-process `TrustedEvaluation` objects can supply scoped check verdicts. Serialized copies, issuer labels and self-hashes fail that boundary. Evaluator custody/freshness must be reloaded immediately before assembly; preserving an old in-process object is not a later freshness check.

The report checks baseline prepared-tree/policy identities and completion before downstream starts; downstream run/arm/commit, exact final source, evaluator/suite/policy and required-check relationships; freeze timing; planned attempts/order; and seeds. Present-day rejection or condition substitution is NOT_COMPARABLE. Missing evidence remains insufficient. Extra attempts, failed, denied, cancelled and timed-out records are retained. A failed process can retain an authenticated REJECTED check result; normal agent completion never supplies acceptance by itself.

This is a **private assessment**, not an authenticated experiment ledger or public data loader. It cannot prove operator authorization, current intent approval, isolation, cleanup, cross-arm secrecy, independent preregistration or telemetry custody. Run telemetry is explicitly unvalidated. It excludes arbitrary task text, limitation strings, check artifact paths and protected diagnostics, but even these identity/metric projections require a separate disclosure review before publication. There is no new registration, upload, certificate or browser execution pathway.

Reports always return `execution: DISABLED` and `correctness: INCONCLUSIVE`. Matching structural/evidence inputs remain BLOCKED; deviations are NOT_COMPARABLE. Even passing synthetic authentic-loader checks do not unlock this gate. A future reviewed study adapter must establish genuine runtime/source/task custody and preregistration before comparative correctness can be issued. Then both verified arms mean a correctness tie, both rejected arms mean no verified winner, and one verified arm can have the scoped correctness advantage. Secondary metrics remain descriptive and preparation-inclusive; no composite score is defined. The equally informed non-Meta C control is necessary for a Meta incremental-benefit claim.

## No-inference local commands

From the ForeCode repository, using Node 24:

```bash
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --help
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --status
```

`--help` exits 0. `--status` prints fixed gate names and exits 2 to signal BLOCKED. Neither acquires a runtime lease, executes sbx, performs inference, runs the grader, writes an approval or provisions recordings. `--execute` and unrecognized switches are rejected.

To validate an independently prepared **private draft**:

```bash
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --plan /absolute/private/plan.json
```

The path is an actual canonical operator-owned mode-0700 directory containing a bounded non-symlink regular JSON file. Use the real private path; no private plan or synthetic example is checked into this repository. A valid plan prints a private blocked assessment and exits 2. Invalid/unavailable input exits 1 with a fixed safe message. It creates no artifact and cannot execute the plan. Never redirect a private report into public Git without separate disclosure review.

## Observed synthetic validation

On October 28, 2026, focused new tournament tests exercise exact task/intent binding; unequal source, roadmap, locks, task, tools, runtime, prompts, policy, budgets and seeds; unreviewed/model-proposed tasks; missing, failed and forged evidence; source/check-byte tampering via fresh protected reload; cross-arm/commit substitution; rejected baselines; post-outcome freeze; undeclared retries/cancellation retention; preparation accounting; safe CLI denial; private text exclusion; and the empty public state. These are synthetic unit regressions, not isolation tests or a genuine tournament. The integration log records exact observed commands, counts, source commit and exit codes.

## Study custody follow-up — October 29

The [operator workflow](TOURNAMENT-OPERATOR.md) adds a preselection definition that requires no B source, independently pinned signed-original custody, chronological preparation authority and final commitment, source-only diffs, complete preparation history and authenticated non-null telemetry. The old report remains a proposal-only assessment; its static blockers are not a current inventory of PR #19 acceptance. New operator readiness freshly loads exact external originals. The production authority catalog is empty, no B was fabricated, and execution remains disabled.

## Authenticated reporting and read-only walkthrough

The later private original-intake path can authenticate exact execution/history/telemetry originals and derive scoped correctness with preparation overhead. Its report/disclosure catalogs remain empty; the proposal-only functions above keep their original conservative behavior. The [operator handoff](TOURNAMENT-OPERATOR.md) documents both boundaries and the blocked live team transport precisely. `/experiments` now reloads only code-owned, independently disclosure-approved projections and protected receipts through the existing bounded store. No real tournament recording is configured. The six-step empty walkthrough never supplies synthetic success, B source or a winner.
