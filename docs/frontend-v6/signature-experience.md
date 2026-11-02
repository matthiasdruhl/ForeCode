# Signature Time Machine and Decision Report refinement

November 1, 2026. Presentation-only workstream, isolated from active source-bound experiments.

## Source and scope

Implementation base: freshly fetched `origin/main`, `efc6fc6b7bf254be3ac4550e558ec107c7d4984f` (PR #58). Tested application and UI-test commit: `b1c9348ec912ca45c0ebd4c9b577cecd41c97b33`. Branch: `codex/signature-time-machine-decision-report`, checkout `ForeCode-Signature-Experience`. No merge or experiment activation is authorized by this change.

Read-only design reference: AgentHarness-Planning PR #20, commit `d3665dc232aa3bcddf40304e65e590524de1fa7c`, specifically the v6 design system, reference study/refinement and implementation handoff. Implementation references: AGENTS.md, FRONTEND-V6-4-IMPLEMENTATION, EVIDENCE-BACKED-TOURNAMENT-REPLAY, EVIDENCE-REPLAY-FRONTEND-INTEGRATION, DECISION-REPORT and PRs #54, #56, #58. Implementation was authored afresh against the actual v6.4 application. No planning HTML, CSS, JavaScript, assets, fixture or history was transplanted.

Only frontend components, the existing presentation stylesheet, narrow UI tests and delivery documentation/artifacts change. No `src/lib` or `src/server` module, frozen schema, runtime/evaluator, provider transport, source hash, publication authority, trusted loader, decision algorithm, approved result, lockfile or fixture implementation changes. Shared check and browser configurations are unchanged.

## Before and after

The previous Time Machine repeated the conceptual responsibility diagram, then exposed the five-stage replay as a textual disclosure. The refined Time Machine makes the existing replay directly selectable. One future requirement leads into five stage controls and two aligned architecture lanes. Three outlined points and dashed connectors explain the conceptual paths. Arm-specific recorded events occupy a separate ruled evidence area; shared/unassigned events remain outside both lanes. A full-history disclosure retains every projected event, missingness marker, failure, blocker, deviation and limitation.

The visual key distinguishes conceptual paths, bounded reviewed source, recorded comparisons, independent observations and missing evidence. Published explanatory metadata has its own neutral outline. Every mark has text; every diagram path has an ordered textual equivalent. No animation simulates execution. Only focus/selection styling transitions, and reduced-motion removes them.

The memo retains its warm paper and neutral conclusion hierarchy for KEEP, REFACTOR and INCONCLUSIVE. It now brings the exact future question into the document, distinguishes the advisory recommendation from per-arm independent correctness, separates preparation/downstream/total elapsed time in a semantic comparison table, and prints exact task, protocol, conditions, publication and per-arm source/run identities when supplied by the matched server report. Missing receipts and all six missing effort cells remain Unknown. Numbered server-derived reasons, limitations and the server-derived next action remain intact.

The existing Lab and Tournament retain their v6.4 layout. The new selection styling and source-phase explanations refine the same workbench; no general product redesign or new design framework was introduced.

### Exact implementation and test files

| Path                                           | Change                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/app/forecode-v6.css`                      | Replay geometry, provenance vocabulary, memo hierarchy, responsive/reduced-motion/print rules.                                |
| `src/components/v6/research-experience.tsx`    | Existing chapter composition, stage/event URLs, study-first history restoration, context invalidation and exact focus return. |
| `src/components/v6/replay-stage-explorer.tsx`  | New selectable five-stage, two-lane presentation of the existing replay DTO.                                                  |
| `src/components/v6/replay-event-detail.tsx`    | New shared rendering of exact event status, interval, selector and file identities.                                           |
| `src/components/v6/provenance-key.tsx`         | New accessible visual vocabulary.                                                                                             |
| `src/components/v6/replay-history.tsx`         | Retain full event history and expose blockers/deviations through the shared renderer.                                         |
| `src/components/v6/source-phase-inspector.tsx` | Clarify phase meaning, downstream versus baseline run identity and unassigned comparisons.                                    |
| `src/components/v6/decision-memo.tsx`          | Future question, independent outcomes, effort comparison and exact evaluation subject.                                        |
| `tests/unit/signature-experience.test.tsx`     | Stage/event retention, empty states, unassigned attempts, raw intervals and honest missing memo measurements.                 |
| `tests/e2e/signature-experience.spec.ts`       | Production keyboard/history/deep links and isolated populated two-study client journey.                                       |
| `tests/e2e/replay.spec.ts`                     | Synthetic stage views, visible published verification outcomes, failure retention and long-identity overflow.                 |
| `tests/e2e/frontend-v6.spec.ts`                | Phone requirement-width regression and actual A4 print artifact.                                                              |

Delivery-only files: this report, the appended section in `docs/IMPLEMENTATION-LOG.md`, and every exact artifact path listed in `signature/visual-qa.json`.

CI follow-up: `tests/unit/installed-launcher.test.ts` changes only its harmless synthetic output-limit child. Foundation run `41312424508` on Ubuntu observed `reason=output_limit` with natural exit code 0, racing the test's expected SIGKILL exit code -9. The sample now stays alive after flushing its fixed output so the existing launcher's forced termination determines the exit code. All original output-limit, exit-code, command, timeout and bounded-output assertions remain. Launcher/runtime source is unchanged. The focused four-case launcher suite passed locally; the follow-up full-check and GitHub results are recorded with the PR.

## Continuity and provenance

- Arm, reviewed source selection, responsibility, source phase, study, replay stage and evidence question/event survive chapter navigation and browser history. Replay stage is an independent selection from Before/Prepared/After source phase.
- Direct links resolve the requested study before applying its selection context. The context identity includes the full supplied public study and the intent/source revision. Study changes clear stale source, event and stage state; old intent context cannot revive through Back.
- Event inspection uses an exact event ID belonging to the currently selected replay. The Evidence Laboratory displays that event's existing study/attempt/run/tree/receipt/check selectors. Return and browser Back restore the initiating button's keyboard focus. Missing or cross-study event IDs expose an unavailable explanation instead of another study's evidence.
- The production page still obtains its catalogs only through the existing trusted server composition. The memo continues to require exact projection-digest matching. No browser-provided JSON or provenance flag can provision evidence. Runtime imports of the stage constant go directly to the data-only replay contracts, avoiding the projection assembler and hashing modules in client imports.
- Preparation attempts and the published source comparison remain arm-unassigned. A list of file hashes never becomes dependency topology or reconstructed snapshot bodies. Baseline references retain the absence of a baseline run ID; they never borrow the downstream run ID.
- Actual interval boundaries and inconsistent-interval issues remain inspectable without deriving a common clock, concurrency, elapsed durations or global execution order. Required-check outcomes remain distinct from attempt completion and the overall recommendation.
- Empty and unavailable catalogs have five static Unknown stages, no invented events, no zero-filled costs and no report winner. The approved production catalog remains unprovisioned. Screenshots of populated states are explicitly synthetic UI tests, never evidence of an experiment.

## Validation

Commands use Node 24.16.0 and the unchanged locked dependencies. No real credentials were copied into the worktree. Full checks disable provider calls/spending; existing browser servers use their synthetic credentials and provider-network blocker. The populated client fixture intercepts its entire network and rejects unexpected requests.

| Command                                                                                                                           | Observed result                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `META_CALLS_ENABLED=false META_SPENDING_APPROVED=false npm run check`                                                             | Exit 0; lint, both strict typechecks, 1,624 unit tests / 73 files and both production builds. |
| `FORECODE_E2E_PORT=3384 FORECODE_E2E_DISABLED_PORT=3386 npm run test:e2e`                                                         | Exit 0; 86 browser cases, including the populated two-study client and all six memo variants. |
| `npx vitest run tests/unit/signature-experience.test.tsx tests/unit/replay-presentation.test.tsx tests/unit/frontend-v6.test.tsx` | Exit 0; 24 tests / 3 files.                                                                   |
| Changed-file Prettier; `git diff --check`                                                                                         | Exit 0.                                                                                       |

UI coverage includes 1440px desktop, 768px tablet and 390px mobile; internal scrolling without document overflow; long digests, study IDs and file paths; keyboard/Enter/Space; labeled controls and textual equivalents; reduced motion; direct links, Back/Forward and exact return focus; empty/unavailable catalogs; absent/mismatched report evidence; all six synthetic report outcomes; all five replay stages; unassigned preparation failures; raw inconsistent intervals; semantic effort tables and print composition.

The disposable populated browser harness bundles the actual ResearchExperience client, replaces only Next Link with a native anchor, and supplies two explicitly synthetic catalogs locally. It exercises study-aware direct links, exact event inspection, event/question continuity across chapters and study-switch invalidation. It creates no application endpoint or production outcome control. Existing production browser tests still exercise the real Next routing and empty trusted catalog.

Fixture implementation is unchanged. Its strict typecheck, visible unit tests and production build run as part of `npm run check`; separate fixture browser tests are not required for this presentation-only change.

Initial validation failures were confined to new tests: a synthetic study ID exceeded the existing schema bound; the standalone client bundle needed a test-only build environment stub; and an eager programmatic focus raced the chapter's scheduled focus restoration. The fixture ID, isolated harness and test synchronization were corrected without weakening application, evidence or evaluator checks. Visual review also increased mobile effort-table type size and gave it its own focusable scroll region, and moved the publication-status label below the requirement at phone widths. A regression assertion protects the requirement's reading width.

## Screenshots and print

Final artifacts live in `signature/` beside this report. Production screenshots show the genuine no-approved-study state. Files prefixed `synthetic-` show clearly labeled disposable test metadata only. Screenshots document frontend rendering, not experimental outcomes or source-admission evidence.

| View            | Desktop                             | Tablet                            | Phone                             |
| --------------- | ----------------------------------- | --------------------------------- | --------------------------------- |
| Time Machine    | [1440px](signature/time-1440.png)   | [768px](signature/time-768.png)   | [390px](signature/time-390.png)   |
| Decision Report | [1440px](signature/report-1440.png) | [768px](signature/report-768.png) | [390px](signature/report-390.png) |

Synthetic-only views: [preparation attempts, including failure](signature/synthetic-preparation-1440.png), [independent check/verification outcomes](signature/synthetic-verification-390.png). Actual A4 test-PDF renders: [page 1](signature/report-print-page-1.png), [page 2](signature/report-print-page-2.png). Both printed pages were visually inspected. A separate disabled production preview exposed no console errors in Time Machine or Decision Report; their accessibility labels were inspected in the browser accessibility tree. The [artifact manifest](signature/visual-qa.json) pins the tested source and every exact screenshot path.

## Remaining compromises and next step

- No approved public study currently supplies genuine populated replay/report observations. Populated behavior is validated with isolated synthetic fixtures; it makes no claim of a real architecture result.
- Full original/prepared/final source bodies, a reconstructed diff, historical dependency topology, a common event clock and authenticated prospective effort criteria remain unavailable. The UI does not invent them.
- Five static stages remain conceptual order, with explicit selection rather than autoplay. Detailed event histories and source identities stay available through native disclosures.
- Mobile effort comparison scrolls internally to keep technical labels readable. The wider A/B view stacks on phones; all records remain available.
- Chromium desktop/mobile emulation and A4 printing are checked. Manual VoiceOver, Safari/WebKit, physical devices and physical printing were not tested.
- Presentation changes can alter the trusted implementation closure, as PR #58 established. Keep this branch isolated. Do not merge during an active source-bound experiment without explicit experiment-owner approval; later source admission must bind the actual merged closure.

Next ticket: human visual/source review of the PR, followed by experiment-owner coordination before integration. Public evidence provisioning and any genuine run remain separately authorized work.
