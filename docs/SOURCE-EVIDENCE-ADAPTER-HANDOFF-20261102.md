# Archival source evidence adapter — November 2, 2026

BL-01-A only, authored in isolated `codex/backlog-source-adapter-20261102` from exact validated baseline `c655dcf1796489c5c6e77282c7c069561eefe1c6`. This is an additive source adapter with synthetic custody tests. No real source disclosure, production provisioning, UI implementation, experiment, evaluation, deployment or release is established.

## Server and presentation contract

`SourcePublicationSchema` defines `tournament-source-evidence-publication.v1`, outside the frozen contracts. Parsing and `projectSourcePublication` do not authenticate evidence. The server-only `loadSourcePublications` authenticates through the existing protected scientist custody reader and reloads the receipt-joined tournament catalog and protected publication on every read. It requires the same independently pinned authority/revocation/workspace inventory, exact registered unique study/disclosure inventory, current signed disclosure kind/study/subject/predecessor, and exact report/projection/prepared identities. No filesystem capability, signer, capture operation or endpoint was added.

The canonical roles are `shared-original`, `B-prepared`, `A-final`, `B-final`. Shared original binds A's initial tree with no downstream run. B prepared binds B's initial tree and exact run identity, including null when B has no downstream run. Finals require their own nonnull downstream run and final tree. A's downstream comparison begins at shared original; B's begins at B prepared. There is no fabricated A preparation activity.

Each role validates its strictly sorted unique full manifest against the existing canonical JSON tree digest algorithm, then verifies every explicitly disclosed complete body against exact UTF-8 SHA-256. Invalid Unicode and unsupported controls fail. Empty text, CRLF, LF and final newline bytes remain exact. Full inventories may include non-source paths needed to reproduce the complete tree hash; they never leave the server. Bodies are limited to literal `src/` TS/TSX/CSS paths, including supported Next dynamic/catch-all route names, excluding conventional config/environment/test/evaluator/grader/package locations.

Bounds: four roles; 100 manifest entries/role; 20 bodies/role; 32 KiB UTF-8/body; 256 KiB total text; 900 KiB serialized parsed supplement; existing original reader still enforces its independent 1 MiB byte ceiling. Unsupported input is unavailable, never truncated.

The public DTO contains base identities, approved scope limitations, snapshot tree/run identities and only explicitly disclosed source paths/bodies. Comparisons internally use complete manifest unions but expose only paths explicitly body-disclosed on at least one side. This prevents otherwise undisclosed inventory paths from leaking through a change list. A present undisclosed side is distinct from an absent side or a present empty file. Equal hashes can be unchanged without inventing bytes. Missing roles produce `snapshot-unavailable`; text gaps produce `text-unavailable`; changed files over 500 lines/side or 250,000 comparison cells produce `too-large` with no truncated rows. Rows retain `LF`, `CRLF`, or `none` endings. Source remains inert string data.

`createTournamentPublicationReader(...).loadSourceEvidence()` and `loadApprovedSourceEvidence()` are the composition seams. The production singleton remains null. Missing config returns an empty catalog without filesystem reads. Invalid source configuration/disclosure returns only unavailable state/counts; it does not alter otherwise valid tournament/report/prospective catalogs. There is no result cache or raw error/path/key/envelope disclosure.

## Validation and environment

Read AGENTS, baseline/worklist/plan/state, package/workspace scripts, npm/Next/Vitest/Playwright/fixture configs, provider-network hook and pinned plan-parity implementation before execution. Actual shared Git hooks contain only samples; no custom hook configuration was found. Node was v24.16.0. Compared root package/lock against the preserved c655 baseline, then used `cp -cR` to materialize task-owned node_modules. No install/lifecycle operation or shared dependency mutation occurred.

Focused commands used this minimal environment prefix:

```sh
env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/private/tmp/forecode-backlog-source-adapter-checks-20261102/home TMPDIR=/private/tmp/forecode-backlog-source-adapter-checks-20261102/tmp NEXT_TELEMETRY_DISABLED=1 META_CALLS_ENABLED=false META_SPENDING_APPROVED=false
```

Final focused unit command: `node node_modules/vitest/vitest.mjs run tests/unit/source-publication.test.ts tests/unit/prospective-publication.test.tsx tests/unit/tournament-provisioning.test.ts tests/unit/tournament-publication.test.ts tests/unit/web-boundary.test.ts --maxWorkers=2` — exit 0; 165 passes in five files, including 61 new source cases. Coverage includes fresh signed disposable custody, next-read tampering/removal/permissions/symlink/hardlink/root/size/expiry/future-held/revocation/key/base failures, signed identity/role/run mismatches, canonical paths/manifests/body hashes, aggregate/serialized bounds, empty/absent/undisclosed text, exact endings, inert HTML and bounded deterministic diffs. Fixtures contain synthetic inert strings only.

Changed-source ESLint with `--max-warnings=0` and `npm run typecheck` (both app and fixture strict typechecks) exited 0. Initial lint found one comma-expression warning; it was corrected before passing validation. Prettier changed-file checks and Git whitespace checks are recorded in the external exact-commit implementation report. Full check, production builds, E2E and pinned plan validation belong to the independent tester; they were not run or claimed here.

## Next work and readiness

Independent tests/review and Git-manager integration must approve this exact candidate before BL-01-B begins. The UI must filter again by selected base study/projection/prepared identities and render strings as escaped text. These adapter tests do not establish browser behavior. Required approved real snapshots/body bytes and exact custodian disclosure remain absent; production stays honestly unprovisioned. Genuine-data completion remains blocked on the separate tournament repair/source handoff and approved private composition.
