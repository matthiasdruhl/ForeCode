# ForeCode v6.4 frontend implementation

November 1, 2026. Agent C / frontend workstream.

## Source and eligibility

- Implementation base: `03f5deb` on `origin/main`, including PR #51 merge `2fdbc3bb53660aa414c7c7fb0ce9719e6589aaea` and PR #49's backend hardening.
- Isolated worktree: `ForeCode-Frontend-v6-4`; branch `codex/frontend-v6-4-integration`.
- Approved visual reference: [planning PR #20](https://github.com/matthiasdruhl/AgentHarness-Planning/pull/20), immutable commit `d3665dc232aa3bcddf40304e65e590524de1fa7c` on `codex/forecode-v6-trace-refinement-20261101`.
- Frozen contract parity reference remains `695e68a40b5f5009c9b06b83a1181e18cd6d0223`, as required by the existing parity suite. The newer visual reference does not replace frozen contracts.
- All implementation, presentation adapters, tests and this report were authored afresh in the event repository. No planning HTML, CSS, JavaScript, fixtures, schemas or history was transplanted into this entry.
- Planning documents were read externally: v6 design system, reference refinement, prototype and browser smoke; v6 handoff; v5 impact specification; impact/demonstrability refinement; organizer rules; security, evaluation, contract freeze and Meta Scientist guidance.
- The shared `docs/IMPLEMENTATION-LOG.md` was intentionally left untouched per workstream instructions. No backend agent-owned implementation was changed.

## Implemented experience

The existing `/` route now offers the continuous Case → Architecture Lab → Tournament → Time Machine → Evidence Laboratory → Decision Report story. A single native chapter link is active. Hash deep links work, including legacy `#workspace` and `#foresight`. URL query state carries arm, responsibility, bounded source selection, phase, study and evidence question. Back/Forward restores presentation context. Evidence inspection remembers the exact initiating control, including through browser history.

The landing introduces actual reviewed booking behavior, the proposed team-permissions requirement, balanced A/Keep and B/Prepare choices, a restrained conceptual trace and the primary “Explore the booking case” action. Selecting an approach opens the Lab without dispatching model requests or experiments. The original intent editor is also retained below the introduction, preserving existing entry behavior.

The original intent, revision, revocation, export, provider status, exact-payload consent, proposal, hypothesis, challenge, local template, deterministic worksheet and research-handoff flows remain mounted across chapter navigation. Actual confirmation updates the shared requirement label; editing/revocation invalidates dependent focus and research. Leaving/reloading the page retains the existing browser-memory session semantics.

### Visual foundation

The v6 semantic palette is implemented with reusable tokens. The shared chrome uses Night, Workbench, Rule and Action; the report uses its separate warm paper, ink and rule tokens. Desktop content is bounded at 1408px, the landing at 1320px and the memo at 1024px. Navigation has a 68px brand header and a separate chapter rail, allowing complete chapter names and existing catalog access.

IBM Plex Sans, IBM Plex Mono and Instrument Serif italic are loaded through `next/font/google`. Google Fonts supplies the licensed fonts; Next builds self-hosted font assets. No font binaries are committed. Plex and Instrument Serif use the SIL Open Font License; accessible system/Georgia fallbacks are declared. Browser tests assert that the running application actually resolves the Plex family, avoiding a silent serif fallback.

### Change Trace and source honesty

`ChangeTrace` is a presentation-only React component with one amber requirement diamond, a shared trunk, aligned A/B lanes and four responsibilities per lane. Native buttons provide pointer, Enter and Space activation. Proposed relationships are dashed; one node is selected; the explanation sits directly below the graph. Scrolling is internal and keyboard focusable on narrow screens, with a visible scroll instruction.

The trace is always explicitly **conceptual**, including when a real publication exists. The separate Architecture Atlas remains the **bounded reviewed source** view. Its actual module selection, arm and source phase share the presentation context. The Time Machine shows **approved observed file comparisons** separately when present and otherwise gives an intentional **unavailable** state. A changed-file list never becomes a dependency topology.

`TraceFocus` contains arm, responsibility, optional bounded source ID, phase and context identity. The identity includes graph commit, intent revision, study/conditions/protocol/preparation identities, and per-arm source/run/receipt identities. Obsolete history selections cannot revive after an intent revision. URL source IDs are restricted to the existing reviewed booking graph.

### Tournament

The reading order follows the final v6.4 audit closure: truthful study status → visible Change Trace → three fairness prerequisites → balanced alternatives → independent correctness and separate preparation/downstream/total measurements → full publication details and next inspection.

Unknown measurements stay Unknown. Real zero values remain zero; small recorded costs retain significant digits. Both verified means a correctness tie. Comparability is separate from per-arm correctness and the advisory report recommendation. Study F's A/B comparison does not establish Meta's incremental benefit. The existing publication loader, its failure behavior and the complete recorded-study renderer remain intact.

### Time Machine and Evidence Laboratory

Before shows A's original source binding; Prepared shows the selected arm's initial binding; After shows that arm's final binding. These are identities, not full snapshot bodies. A preparation file comparison is shown only for B/Prepared; it is never relabeled as a final diff. Receipt/run labels remain attached to the matching source arm.

Evidence questions cover comparability, required checks/receipts, source/preparation and hypothesis limitations. Available study details use exact approved study, task, protocol, conditions, run, tree, receipt and check identities. Absent targets explain the missing evidence. No browser grader, execution route, authority flag or credential was added.

### Decision Report

The memo consumes only `loadApprovedDecisionReports()` output and matches the selected study/conditions identity. Its copy adapter never invokes `assessDecisionReport`, calculates a verdict or supplies a tie-break criterion in the browser. The existing server composer remains the authority for the recommendation.

The report includes small study-state text, a dominant neutral headline, one-sentence basis, a semantic description list for scope/tested/unknown facts, two or three server-derived reasons, actual phase-separated effort when available, limitations, a next action and evidence controls. The controls have 44px minimum touch targets and restore exact keyboard focus on return. A-only and B-only reasons about differing checks go directly to checks; comparability reasons go to fairness; tie accounting goes to source/effort.

No-run, A-only, B-only, both verified, both rejected and invalid/incomparable evidence are tested using authorized synthetic fixtures. Missing or invalid evidence abstains. Both-pass keeps the deterministic correctness-tie rules. There is no production outcome selector, fake confidence, fake savings or celebratory winner state.

Print CSS removes navigation, workbench chrome and inspection/print buttons, preserves provenance/facts/limitations, and avoids splitting numbered reasons where practical. The printed report uses white paper with the report ink color.

## Validation

Final source commit under test: `2334d9abf7628dd508f99379d46501b0f62d3fa8`. Subsequent documentation/screenshot commits do not change application or test source.

| Command / check                                                           | Result                                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Node runtime                                                              | `v24.16.0`                                                                                                           |
| `npm ci --ignore-scripts`                                                 | Exit 0; locked dependencies installed                                                                                |
| `npm run check`                                                           | Exit 0; lint, strict typechecks, 1,372 tests across 64 files, both production builds                                 |
| `FORECODE_E2E_PORT=3310 FORECODE_E2E_DISABLED_PORT=3312 npm run test:e2e` | Exit 0; 72 browser cases passed                                                                                      |
| `FORECODE_FIXTURE_E2E_PORT=3311 npm run test:fixture-e2e`                 | Exit 0; 2 booking browser cases passed                                                                               |
| `PLAN_REFERENCE_ROOT=../AgentHarness-Planning npm run test:plan`          | Exit 0; 128 frozen-reference parity cases passed                                                                     |
| Focused frontend/component tests                                          | Exit 0; 6 frontend tests passed (including six report outcome cases and source binding assertions)                   |
| Changed-file Prettier check                                               | Exit 0                                                                                                               |
| `git diff --check`                                                        | Exit 0                                                                                                               |
| Provider-disabled production screenshot/console inspection                | Exit 0; 18 chapter/viewport combinations; zero console errors, page errors, unexpected requests or document overflow |

Browser coverage includes 1440×900, 768px tablet and 390×844 mobile; keyboard/Space/Enter; reduced motion; all direct chapter links; Back/Forward; exact evidence-return focus; intent revision invalidation; bounded-source focus across phases; missing study/source states; six synthetic report outcomes; no page-level horizontal overflow; and print-media layout. Original consent, stale response, provider gating, intent lifecycle, read-only verification/certificate and booking tests remain enabled.

Initial environment-only attempts are retained honestly: restricted `npm ci` could not resolve the registry; offline legacy-peer installation omitted Vite; normal locked installation with network access succeeded. Restricted runtime tests could not bind local sockets; the unchanged suite passed with local execution permissions. Default browser ports were already used by other worktrees. Optional test-port variables now isolate this worktree while preserving default ports and all assertions. No existing server was killed or reused.

The first browser pass found stale initial history context and hidden legacy catalog links; both were fixed. Screenshot inspection found unresolved font variables and low-contrast memo description values; both were corrected and rechecked. The final screenshots are of the running event-built application, not planning prototype images.

## Screenshots

The `docs/frontend-v6/screenshots/` directory contains production no-run screens and print-media capture. Case images show the first viewport; Tournament, Time Machine and report images show complete pages. The capture used a separate production server on port 3354 with Meta calls and spending disabled. The accompanying visual QA JSON records viewport widths, console/page errors and unexpected network requests. Screenshots show UI rendering only; they establish no experiment, model access or correctness result.

## Intentional differences from the planning specimen

1. There are no fictional outcome controls or fictional booking records. The landing describes the actual reviewed booking fixture. Its independently served interactive application and browser tests remain separate; no duplicate booking app or fabricated future failure was added.
2. Existing consent, intent and source-inspection workflows are retained rather than replaced by the prototype's fictional transcripts. The Case includes the original editor below the introduction; the primary action opens the focused Lab.
3. A separate chapter rail supports complete names and retained `/experiments` and `/certificates` routes. It scrolls visibly on mobile. This adds navigation height relative to the compact prototype header.
4. The memo uses rule-separated key/value facts and one reading column, rather than the specimen's mixed multi-column facts/sidebar. All three semantic facts and the 63–65-character reading-width intent are retained where viewport size permits.
5. The trace remains conceptual. Authentic source paths belong to the bounded Atlas or approved file comparison; no planned B module is drawn as committed source. No optional motion choreography was added.
6. Full publication chronology and granular legacy measurements are available in a native disclosure after the concise measurement rail, reducing competing chrome while retaining all data.

## Current limits and backend integration

UI implementation completeness is separate from experimental verification. The production default remains **NOT RUN / insufficient evidence** when no approved matched publication is available. No real agent run, protected grading, paid inference, new registration, certificate authority or evidence approval was performed by this workstream.

- **Agent A:** the current public tournament DTO does not include authenticated prospective Meta registration/lineage. The hypothesis evidence explanation explicitly states that limit. A later additive, separately reviewed public presentation adapter can display admitted registration and hypothesis identities after the backend merges. No dependency on Agent A's unmerged branch exists.
- **Agent B:** protected architectural observations are not manufactured from the static graph. The rail reads only existing published metrics. New authenticated measurement fields, including dependency observations, need a separately reviewed additive DTO/presentation adapter after backend merge.
- Full original/prepared/final source bodies, final changed-file diffs and complete historical dependency topologies are not supplied by the current DTO. The UI displays only permitted hashes and preparation file identities, or unavailable states.
- A predeclared authenticated effort criterion is not present in the current publication format. Complete telemetry alone cannot turn both-pass correctness into a KEEP/REFACTOR preference.
- Chromium desktop/mobile and print media are covered. Safari/WebKit, a physical printer and manual assistive-technology testing were not performed.

Next step: review this frontend PR against `main`, reconcile later additive authenticated publication fields with Agents A/B, then perform the integration checkpoint. Do not merge or manufacture a study merely to change the UI's no-run conclusion.
