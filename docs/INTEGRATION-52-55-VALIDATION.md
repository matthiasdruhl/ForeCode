# Combined validation: PR52–55

Validation date: November 1, 2026. Node `v24.16.0`; npm `11.13.0`; repository lockfiles unchanged. The final delivery identifies the exact integration head SHA and links the GitHub Actions result for that head. This file belongs to that head; it does not attempt to embed its own future commit hash. [Contracts, conflict resolutions, blockers and six readiness milestones](INTEGRATION-52-55-REPORT.md) accompany this report.

## Final local commands

Run from `ForeCode-Integration`. Test-owned fixtures alone create disposable signatures and inert source trees. The synthetic Meta transport handles local responses without network; browser tests preload `no-provider-network.mjs`. No provider, coding agent or protected guest was executed.

| Exact command                                                                                      | Exit    | Observed outcome                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --version`                                                                                   | 0       | v24.16.0                                                                                                                                                               |
| `npm ci --ignore-scripts --no-audit --no-fund --cache /private/tmp/forecode-integration-npm-cache` | 0       | 377 locked packages; no lifecycle hooks, no lockfile changes; existing ESLint peer warnings retained                                                                   |
| `META_CALLS_ENABLED=false META_SPENDING_APPROVED=false NEXT_TELEMETRY_DISABLED=1 npm run check`    | pending | Final lint, strict application/fixture typechecks, unit tests and both production builds                                                                               |
| `npm run test:e2e`                                                                                 | 0       | 74 Chromium application cases; desktop/mobile, six decision outcomes, keyboard/history/focus, responsive, reduced-motion, print, absent evidence and public boundaries |
| `npm run test:fixture-e2e`                                                                         | 0       | 2 standalone booking browser cases                                                                                                                                     |
| `PLAN_REFERENCE_ROOT=../AgentHarness-Planning npm run test:plan`                                   | 0       | 128 cases; actual checkout contains normative `695e68a40b5f5009c9b06b83a1181e18cd6d0223`; parity uses pinned `git show`, not current checkout HEAD                     |
| Focused command below                                                                              | pending | Registration, measurements, evidence interpretation, source/installed custody, publication/provisioning, frontend and cross-workstream boundary                        |
| `git diff --check`                                                                                 | 0       | No whitespace errors                                                                                                                                                   |
| `npx prettier --check` followed by the exact changed TS/TSX paths                                  | 0       | Shared helper, registration/service, measurement/operator, five fixture helpers, protected regressions and cross-workstream integration test                           |

Focused command:

```sh
META_CALLS_ENABLED=false META_SPENDING_APPROVED=false npx vitest run \
  tests/unit/scientist-registration.test.ts \
  tests/unit/protected-metrics.test.ts \
  tests/unit/metric-snapshot.test.ts \
  tests/unit/boundary-metrics.test.ts \
  tests/unit/prospective-metrics.test.ts \
  tests/unit/meta-interpretation.test.ts \
  tests/unit/installed-custody.test.ts \
  tests/unit/tournament-study.test.ts \
  tests/unit/tournament-measured.test.ts \
  tests/unit/tournament-publication.test.ts \
  tests/unit/tournament-provisioning.test.ts \
  tests/unit/frontend-v6.test.tsx \
  tests/unit/scientist-metrics-integration.test.tsx \
  tests/unit/web-boundary.test.ts
```

The dedicated merged-interface suite has 14 cases. The protected suite adds two authentic expiry regressions covering commitment and baseline originals valid at their event but expired at assessment. The combined negative matrix additionally checks mismatched definitions/task/models/budgets/prompts, replaced/retired/cross-process hypotheses, duplicate enrollment/run UUIDs, source/receipt substitution, incomplete inventories/cases, unsupported imports, current original/revocation validity, missing preparation/history, unsuccessful lifecycles and null usage/costs. Equal nonzero counts and zero/zero both contradict the predeclared strict fewer-count prediction. Supplementary support never changes the independent correctness tie or deterministic Decision Report.

## No-inference status (final combined implementation)

| Exact command                                                                                            | Exit              | Observed output                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --status`             | 2, expected block | `execution: DISABLED`; preregistration/chronology/runtime/future-oracle and installed-composition blockers                     |
| `node --conditions=react-server --import tsx scripts/experiments/tournament/team-cli.ts --status`        | 2, expected block | `execution: DISABLED`; `TEAM_PRODUCTION_COMPOSITION_NOT_CONFIGURED`, `TEAM_INSTALLATION_INVENTORY_AND_INERT_CONTROLS_REQUIRED` |
| `node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --publication-status` | 2, expected block | `state: empty`, `availableCount: 0`, `unavailableCount: 0`, `failures: []`                                                     |

`approvedScientistLineage` still constructs both readers with null configuration; environment variables do not provision them. No private original/catalog/guest was inspected to improve these statuses.

## Intermediate observations and repairs

- Initial sandboxed `git fetch origin` exited 128 because DNS was unavailable. Authorized network fetch exited 0. The connected GitHub service supplied current PR metadata, file lists and existing checks. Sandbox `gh auth status` exited 1; no credentials were printed, changed or replaced.
- Initial `npm ci --ignore-scripts --no-audit --no-fund --offline` exited 1 (`ENOTCACHED`). Standard locked installation with the task cache exited 0. No dependency version, lockfile or security ceiling changed.
- Focused registration/protected suites after reconciliation: exit 0, 128 tests. Initial dedicated cross-workstream suite: exit 0, 14 cases. An intermediate focused selection: exit 0, 423 tests / 12 matching files; the final command above explicitly adds actual installed-custody and tournament-study files.
- First combined `npm run check`: exit 0, 1,537 tests / 68 files, lint/typechecks/both builds. The final repeat includes the two new expiry regression cases; production source was unchanged between these runs.
- Local socket/browser checks used the authorized local-process execution context. No assertions were skipped or weakened. Existing warnings about color settings/peer versions were not failures.

## GitHub verification and scope

The individual PR heads each had successful Foundation checks, listed in the conflict report. They are provenance only. After pushing the integration branch, inspect Foundation checks for the **exact final head**, including the unchanged CI steps for check, pinned planning parity, both browser suites and standalone export. The delivery response records the final SHA, CI URL and actual conclusion. A running/failed workflow must not be described as success.

Changes preserve frozen v1 contracts, task/grader assertions, five/eight-check policies, deterministic report semantics, lockfiles, protected infrastructure, provider/spending ceilings and all historical recording bytes. Synthetic end-to-end success closes software integration only. Protected admission, genuine execution, new public disclosure and authentic-result frontend demonstration remain blocked as classified in the conflict report.
