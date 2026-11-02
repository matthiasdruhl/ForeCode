# Isolated branch integration — November 1, 2026

This is an integration preparation record, not tournament completion, experiment validation, publication approval or a merge to main. The active chat **Fix ForeCode A/B tournament** (`01a19a7b-8995-74f3-86e9-9bce786cd29b`) retains ownership of its source, runtime, paid calls and evidence. No message was sent to that chat.

## Checkout and source identities

- Integration: `codex/isolated-feature-integration-20261101`, `/private/tmp/forecode-integration-20261101`.
- Freshly fetched base: `origin/main = 94a0a20889ab4b79aab970a9974093111d4fe523`; local `main` had the same SHA. Original branches were not rebased or rewritten.
- Combined application/test source under validation: `b2005e681d29faac901820d34ee4ff769583ce95`. Later documentation commits do not make historical tests validate additional application changes.
- Protected tournament checkout: `/private/tmp/forecode-study13-agent-fixes`, branch `codex/study13-agent-fixes`, observed committed tip `c239bae86d0178a7a3e56edb1b213e3d5357b119` with active uncommitted changes. This is **not a final tournament source**.
- Its older committed handoff identifies `e13a63d51e2f77de04b2c7781e67e5eff307abd5` as an assessed implementation. That record describes a B diagnostic with 7/8 protected checks, an unrun new A diagnostic and no complete comparison; these are historical observations, not current results verified by this integration.

## Included original branches

All five exact original tips are ancestors of integration. Merge commits retain original commit identities.

| Original branch                                  | Original tip                               | Scope                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `codex/signature-time-machine-decision-report`   | `7c594b0594c453816a94e3c9539a3e549d054f22` | Five-stage Time Machine, exact event/study navigation, Decision Report, deterministic synthetic launcher sample; PR #61 |
| `codex/project-workspaces`                       | `bfff76c82de0246e967b51a8bfdf40f39d7009d5` | Local source exploration and draft-only saved workspaces; two local commits, no open PR found                           |
| `codex/ab-evidence-integration-handoff-20261101` | `5c3e36ba14ad2af9bb104d16722eb6a8d3903cdd` | Historical evidence-consumer guidance with newer protocol references; PR #59                                            |
| `codex/local-release-operation-handoff`          | `a504690238b99279243c495cbac756206ad346e1` | Historical Study09 closure/Study06 local archive checkpoint; PR #72                                                     |
| `codex/judge-readiness-audit`                    | `d6ac9fe4c80564a5091bc26cc171a731432bfc02` | Historical audit plus withdrawal, layout, keyboard and print regressions; PR #60                                        |

Signature originals, in order: `0fb8057c6c566372f26ae2b79d560a32697ec202`, `27087c449c25915cf5b4e79c3948be5f8f8eaf6d`, `b1c9348ec912ca45c0ebd4c9b577cecd41c97b33`, `b63ad89a6f167207e0664ebbee2ecf416e6cb6ac`, `7c594b0594c453816a94e3c9539a3e549d054f22`. Workspace originals: `276f64053d16f83c67b361920a37b791d105dd4d`, `bfff76c82de0246e967b51a8bfdf40f39d7009d5`.

Integration order was signature (`ec22fbe`), workspaces (`e0507fb`), durable history and layout fixes (`400300d`), then the historical documentation/audit merge chain. The combined browser regression originated at isolated review commit `a695c30` and was cherry-picked as `b2005e6`.

## Conflicts and behavior preserved

- `research-experience.tsx`: combined study-first URL restoration and full-study identity with project epochs, asynchronous import cancellation, draft reopening and monotonically increasing intent revisions. Project changes clear replay stage/event/question, trace selection and return focus. Stale history entries are canonicalized because one traversal can emit both `popstate` and `hashchange`; a second event must not revive the prior selection.
- Saved workspaces remain local drafts. Reopening does not restore confirmation, sharing permission, authority or evidence. Local source remains inert and separate from booking results. Main's optional prospective evidence still reaches the measurement rail and evidence details.
- `docs/IMPLEMENTATION-LOG.md`: preserved every original section independently instead of choosing one side of append conflicts. Historical validation counts and evidence identities remain unchanged.
- The old A/B guide now identifies its `efc6fc6` source and links versioned metric-baseline and optional archival publication guidance. Release observations and old readiness decisions are explicitly historical, not live status or authorization for the ongoing tournament.
- Judge QA-02/04/07 are ordinary regression assertions. Narrow CSS fixes wrap long memo identifiers and unbroken source paths and remove inactive chapter-number opacity that reduced contrast. Historical scanner JSON, validation JSON and screenshots remain byte-identical to their original branch.
- No production experiment/runtime/evaluator script, server catalog, frozen schema, dependency manifest or lockfile changed. Existing negative, missing, failed and inconclusive result handling is retained.

## Validation and isolation

Final application/test source: **`b2005e681d29faac901820d34ee4ff769583ce95`**. All commands below have observed exit codes; no skipped/expected failures are included as passes. Node `v24.16.0`, npm `11.13.0`.

For final validation, commands used this environment prefix (ordinary shell expansion supplies only PATH/HOME, not provider secrets):

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR=/private/tmp/fc-integration-tmp NEXT_TELEMETRY_DISABLED=1 META_CALLS_ENABLED=false META_SPENDING_APPROVED=false
```

The temporary directory was created specifically for this task and assigned group `staff`, matching the process group expected by synthetic custody tests. Local socket/build/browser permission was granted by the tool reviewer. No runtime installation permission was requested or used.

| Command (after environment prefix)                                                                                          | Exit | Observed result                                                                                                                                           | Log under `/private/tmp/`                     |
| --------------------------------------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `npm run check`                                                                                                             |    0 | 1,990 tests / 88 files, lint, both strict typechecks and both production builds                                                                           | `forecode-integration-check-3.log`            |
| `FORECODE_E2E_PORT=3490 FORECODE_E2E_DISABLED_PORT=3492 npm run test:e2e -- --workers=2`                                    |    0 | 128 passed; no skipped, expected failures or retries; includes combined populated replay/workspace/consent regression and ordinary QA-02/04/07 assertions | `forecode-integration-e2e-1.log`              |
| `FORECODE_FIXTURE_E2E_PORT=3491 npm run test:fixture-e2e`                                                                   |    0 | 2 passed, reviewed baseline                                                                                                                               | `forecode-integration-fixture-e2e.log`        |
| `PLAN_REFERENCE_ROOT=/Users/matthiasdruhl/Projects/Meta-Hackathon/AgentHarness-Planning npm run test:plan`                  |    0 | 128 immutable-pin parity checks                                                                                                                           | `forecode-integration-plan.log`               |
| `npm run prepare:booking -- --output /private/tmp/forecode-integration-booking-export-20261101`                             |    0 | 22 baseline files; export digest below                                                                                                                    | `forecode-integration-export-prepare.log`     |
| `npm --prefix /private/tmp/forecode-integration-booking-export-20261101 ci --ignore-scripts --offline --no-audit --no-fund` |    0 | 62 cached packages, no lifecycle scripts                                                                                                                  | `forecode-integration-export-install.log`     |
| `npm --prefix /private/tmp/forecode-integration-booking-export-20261101 test`                                               |    0 | 1 visible test passed                                                                                                                                     | `forecode-integration-export-test.log`        |
| `npm --prefix /private/tmp/forecode-integration-booking-export-20261101 run typecheck`                                      |    0 | Strict typecheck and route generation                                                                                                                     | `forecode-integration-export-typecheck.log`   |
| `npm --prefix /private/tmp/forecode-integration-booking-export-20261101 run build`                                          |    0 | Standalone production build                                                                                                                               | `forecode-integration-export-build.log`       |
| Changed-path `node_modules/.bin/prettier --check …`; `git diff --check`                                                     |    0 | Formatting/whitespace                                                                                                                                     | `forecode-integration-format.log`; Git output |

For rows with extra variables, place those variables after `env` and before `npm`. Standalone export digest: `e49687620469faad10637bac404b2f9a1c4973a12a55b2740eb7d904da5988d1`. This is a reviewed baseline export, not an agent-generated candidate or experiment.

Earlier attempts remain failures, not passes:

- Restricted `npm ci --ignore-scripts --offline --cache /Users/matthiasdruhl/.npm`: exit 1, missing accessible eslint metadata/cache-log access (`forecode-integration-install.log`). Permissioned `npm ci --ignore-scripts --offline --no-audit --no-fund`: exit 0, 377 packages (`forecode-integration-install-retry.log`); no lock changes.
- Interim `npm run check`, with TMPDIR `/private/tmp` in the restricted sandbox: exit 1, 1,983 passed / 3 failed. Two Unix-socket permission errors and one inherited group-ownership mismatch; build not reached (`forecode-integration-check-1.log`).
- Permissioned interim check still using TMPDIR `/private/tmp`: exit 1, 1,984 passed / 2 failed. Group mismatch and one mocked interpretation-transport wait failed; build not reached (`forecode-integration-check-2.log`). No production/test assertion was weakened to obtain a pass.
- Corrected task-specific TMPDIR focused custody suite: exit 0, all 7 passed (`forecode-integration-custody.log`). The subsequent full final-source run above passed, including the unchanged mocked interpretation test.

Fresh 390px screenshots for Time Machine, local source exploration and the synthetic long-identifier memo were visually inspected; content stayed within the viewport and missingness/identity labels remained readable. Current screenshots live under `test-results/forecode`, separate from historical tracked artifacts. Automated keyboard, reduced-motion, responsive and print assertions passed. Manual VoiceOver, other browser engines, physical devices/printing, public deployment and remaining historical judge sign-off items were not validated. Repairing QA-02/04/07 does not close the historical booking-entry/public-demo or manual-accessibility work.

The test servers exited; a final listener check found nothing on ports 3490, 3491 or 3492. No existing service was stopped or changed.

All commands run in the integration worktree, with its own materialized locked `node_modules`, application/fixture `.next`, `test-results` and ephemeral browser contexts. No credentials were copied. Test commands use an empty inherited environment with only PATH, HOME and a task-specific TMPDIR, plus explicit provider disable flags. Application E2E retains the repository's synthetic keys and external-fetch denial preload; those keys are test strings, not credentials. Reviewed baseline/synthetic test source is the only code executed on the host.

Logs are separate `/private/tmp/forecode-integration-*.log` files. Historical branch screenshots are not new visual validation of this source.

## Deferred, superseded and already merged branches

| Branch                                             | Observed original tip                      | Classification and reason                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex/study13-agent-fixes`                        | `c239bae86d0178a7a3e56edb1b213e3d5357b119` | Pending explicit completion and final source/evidence identities; active edits are excluded                                                 |
| `codex/portable-schema-tournament`                 | `9ee4436dd8ce636b49770a88761dd1f2b128adda` | Committed main+5 snapshot, ancestor of study13; deferred with the final tournament stack to avoid a partially validated runtime combination |
| `codex/tournament-writer-diagnostics`              | `196d270e675e3f3e30aa24f939e28597979dae4a` | Needs selective review of its unique typed-write diagnostics; checkout dirty, inherited completion work superseded                          |
| `codex/tournament-completion-contract-diagnostics` | `ad2694ff7cb499b5953cf3628249ccad7c876899` | Superseded by main's semantic consolidation `b735b733485f33cdf3ec6961b3fe790a083a0174`; do not merge wholesale                              |
| `codex/final-response-contract-observability`      | `7ec3f9ec9b7e3340d1db3e73b02f4c83414069df` | Same consolidation; patch-ID uniqueness does not make this missing functionality                                                            |
| `codex/meta-rl-learning-workstream`                | `0138b53a651b859c3facb169e72524433028e0c7` | Draft PR #27; foundation for research stack, production evidence composition remains unprovisioned                                          |
| `codex/ml-approved-evidence-intake`                | `7451a4e6dd579dd15a74dc1043739065dc927a7e` | Draft PR #28, based on #27; requires reviewed authentic originals, independent anchor and current-main validation                           |
| `codex/ml-shadow-training-replay`                  | `f900e8c70dccd9eb8dee1393fd25f1afb24e4c9a` | Draft PR #30, based on #28; authentic admission/replay and independent evaluation remain pending                                            |
| `codex/colab-glimmer-qlora`                        | `bf33f166466518881ae25447ca73d9fba7a0958e` | Draft PR #29, forks from #27; offline prepared, GPU/environment/assistant-mask and corpus gates remain pending                              |
| `codex/genuine-tournament-publication`             | `8749d243c7f17bb641d47f24807e7da8cc540334` | Already ancestor of main; its local uncommitted log remains untouched                                                                       |

Fresh GitHub inventory found eight open PRs: non-draft #59/#60/#61/#72 and draft #27/#28/#29/#30. The draft dependency graph was verified from PR metadata and local ancestry: #27 → #28 → #30, with #29 independently based on #27. None was updated or published by this task. No original remote branch ref or PR metadata was changed by this task; local integration does not close the open PRs.

Preexisting worktree inventory: primary ForeCode, completion diagnostics, local-release, ML/shadow, A/B handoff, judge QA, workspaces and signature were clean. Study13 and writer diagnostics were dirty. Genuine publication had a modified implementation log. Both detached product-review checkouts at `2ca47a05` had modified recording catalogs and untracked dependency paths. All existing work was preserved. Active worktree dirty counts naturally changed during observation; no claim of a frozen active snapshot is made.

Separate review worktrees are retained, per the no-deletion instruction: `/private/tmp/forecode-integration-docs-20261101` (`codex/integration-historical-docs-20261101`, `8080e922c68fc54874825465a82e8d72e37c2c1c`) and `/private/tmp/forecode-integration-regression-20261101` (`codex/integration-regression-review-20261101`, `a695c30`). Both are committed and clean; their accepted changes are included in integration.

## Final tournament handoff — still pending

1. Obtain explicit completion from the tournament owner and record its final committed SHA, source manifest/fixture/evaluator/suite/policy identities, model/task/study/run/receipt/report identities, exact validation commands and exit codes, retained failure/accounting records and verified cleanup. An idle chat or a new commit alone is insufficient. Do not copy private credentials, signing material or raw undisclosed results into this checkout.
2. Re-fetch refs and inspect the final commit against observed `c239bae`. Review its public-check, evaluator, deadline, writer and failure-retention changes. Resolve provenance of unique writer fixes without reintroducing superseded diagnostics. Preserve the owner's checkout, pinned runtime and historical evidence.
3. Create another isolated worktree from the accepted integration tip; merge the **exact finalized** tournament SHA with `--no-ff --no-commit`. Do not use a moving branch name as a source pin. Review actual conflicts before committing. Read-only three-tree analysis of `b2005e6` versus `c239bae` found only an implementation-log append conflict and no shared changed source/test paths; this prediction does not cover unfinished edits.
4. Preserve all log entries and actual negative/incomplete outcomes. Verify synthetic launcher termination controls alongside the final supervisor/deadline changes; verify authentic published projections still preserve missingness and failed arms. Do not relabel historical evidence as generated by the combined source.
5. Reinstall locked dependencies without credentials in the new checkout and rerun `npm run check`, application/fixture E2E on fresh available ports, pinned plan parity and standalone fixture export checks. Rerun relevant writer, public-check, deadline, source-freeze, incomplete-handoff and report-authentication regressions according to the final diff. Tests or experiments from either parent do **not** validate this later combination.
6. Record the exact combined source and fresh results for review. Any future runtime installation/admission, paid run, result disclosure, push, PR or merge remains separate work; this task stops before publishing or merging to main.
