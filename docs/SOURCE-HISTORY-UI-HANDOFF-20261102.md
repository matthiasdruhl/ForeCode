# BL-01-B source history UI handoff — November 2, 2026

Implemented in isolated `codex/backlog-source-ui-20261102`, based exactly on independently validated adapter revision `ab95885a0e697d78f33eca4142df97ab1dfff053`. The existing v6 visual language remains in use. Candidate identity is recorded in the external orchestration implementation report after commit; this document does not certify integration.

## Behavior and boundary

The dynamic page loads the fresh approved source catalog alongside the existing catalogs. Server composition withholds duplicate/withdrawn/unmatched source records and rechecks the exact selected study/projection/prepared-original identity. Report hash/custody authentication remains in the existing adapter. The source catalog does not change decisions, report evidence, prospective metrics or replay events.

Time Machine maps Before to shared original, Prepared/A to retained original with no additional preparation run, Prepared/B to original→B prepared, and After to each selected arm’s own starting→final comparison. Shared original has no fabricated downstream run. Baseline evaluator receipts are labeled separately from final receipts and downstream runs.

Native file and text/diff controls read only the current DTO. Context/arm/phase and bounded inventory identity changes reset selection; current membership reconciliation never retains old body text. Missing comparison partners withhold the diff while leaving an independently available current snapshot inspectable. There is no copied source-body state, fetching, client authority flag or synthetic production input.

All source strings and diff rows are escaped React text. Source HTML, JSX and URLs remain inert, without previews, linkification, downloads, imports or execution. The inspector always labels the disclosed path subset and limitations. It distinguishes absent, present empty, undisclosed, unavailable snapshot, empty body subset, unchanged and computation-too-large states; empty added/removed files retain their change meaning despite zero rows. Diff rows retain server-provided LF/CRLF/no-final-newline markers; exact text panels also report line-ending counts and final-newline status. Full manifests and undisclosed inventory paths do not reach the UI. The arm-unassigned historical path/hash fallback remains explicitly limited when no supplement is available.

## Observed focused checks

Commands ran with sanitized `env -i`, inherited PATH/HOME only, an owned sibling TMPDIR `/private/tmp/forecode-backlog-source-ui-staff-20261102`, telemetry/provider calls/spending disabled, `VITEST_MAX_WORKERS=2` and `CIRCLE_NODE_TOTAL=3`. No dependencies were installed or shared dependencies mutated. Root package/lock and fixture package files matched the preserved baseline before cloning its dependency tree into this checkout.

- `vitest run tests/unit/source-history.test.tsx tests/unit/replay-presentation.test.tsx tests/unit/frontend-v6.test.tsx tests/unit/source-publication.test.ts tests/unit/web-boundary.test.ts --maxWorkers=2`: exit 0, **113 tests / five files**. Retained `focused-handoff.log`.
- `tsc --noEmit`: exit 0. Retained `types-handoff.log`. This is the root strict TypeScript check; no full Next typegen/build claim.
- ESLint over the eight changed TS/TSX application/test files: exit 0. Retained `lint-handoff.log`.
- Test-only Playwright config in the owned sibling directory bundles actual reviewed `ResearchExperience` for `renderToString` and matching `hydrateRoot`, with a test-only native Link shim. Fixture text stays serialized data outside both executable bundles. This is real SSR hydration and stateful React interaction, not a static-markup/createRoot substitute. It blocks every outbound resource and uses no app server. The final focused command `playwright test --config /private/tmp/forecode-backlog-source-ui-staff-20261102/playwright.focused.config.ts --grep synthetic --workers=1` exited 0: **five tests passed in 26.3 seconds** (`browser-accepted.log`). There were zero recoverable hydration errors, page/console errors or unexpected requests; malicious source did not execute.

The first focused suite used an owned TMPDIR inside the checkout and correctly hit the existing custody disjoint-path guard (62 setup failures, 50 passes); no guard was changed. Moving TMPDIR to the sibling directory made all 112 then-current cases pass. Initial sandbox browser startup hit macOS Mach-port denial; the narrow authorized escalated browser run succeeded. Initial harness imports of extensionless Next/link were resolved by bundling reviewed SSR code with the same native Link shim as the client. Early browser authoring failures identified implicit-label exact matching and native macOS select opening behavior; explicit source labels resolve the source selector ambiguity. Native selection is checked through Playwright selectOption, while real Tab/Enter/Space exercises focus and mode changes. macOS headless native-picker ArrowDown/Enter attempts did not commit a changed selection, so native-picker arrow selection is not claimed as verified. Existing regression assertions were not changed. These setup/authoring observations are not validation passes.

Full lint/typegen/all units/both builds, production-default E2E, frozen plan parity, fixture and final combined validation remain assigned to the independent tester. No previous adapter or baseline validation is relabeled as validation of this candidate.

## Visual QA

Visually inspected actual source-inspector screenshots at 390, 768 and 1440 px. Long paths wrap in the heading, hashes remain readable, and long exact source lines scroll within their own region. Native mode controls retain visible focus; no document overflow was observed/asserted at any width. Fullpage source-text and separate long-path inspector screenshots are retained under the owned sibling directory:

- `browser-results/source-history-synthetic-h-d8775-and-bounded-layout-at-390px-desktop/source-390.png` and `source-inspector-390.png`.
- `browser-results/source-history-synthetic-h-3c6ec-and-bounded-layout-at-768px-desktop/source-768.png` and `source-inspector-768.png`.
- `browser-results/source-history-synthetic-h-ab259-nd-bounded-layout-at-1440px-desktop/source-1440.png` and `source-inspector-1440.png`.

These are synthetic UI screenshots, not experiment evidence. The production-default source test is committed for the independent full E2E run; the isolated implementer harness deliberately starts no Next service.

## Readiness and next ticket

Code is implemented for independent exact-SHA testing/review. No approved production source bodies were provisioned; null production composition remains honestly unprovisioned. No exact disclosure/signing/provisioning approval was acquired. Genuine-data product readiness remains blocked separately on approved bytes/private composition and the final tournament repair/compatibility handoff. Synthetic UI verification establishes code behavior only.

No frozen contract, custody reader, adapter, experiment/runtime configuration, provider/evaluation execution, shared integration checkout, protected tournament work, runtime process, credentials or Docker resource changed. No research, experiments, training, deploy/publish/push, main/tournament merge or other-chat messaging occurred. The next ticket is independent tester/reviewer validation of this exact candidate, followed solely by the assigned Git manager’s integration and validation.
