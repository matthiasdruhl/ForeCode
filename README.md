# Forecode

Architecture research guided by future requirements, Meta-generated hypotheses and independent verification.

The architectural concept and planning existed before the Meta AI Developer Hackathon. This standalone implementation was started October 26, 2026, after the noon Eastern kickoff. Source, tests, app assets and documentation in this repository are newly authored during the event. The external design reference is pinned in [SPEC-LOCK](docs/SPEC-LOCK.md); no planning implementation or history is vendored.

## Integrated product

The stable product combines local project import and saved workspaces, the six-chapter research journey, Time Machine source/history inspection, approved-study history and the completed tournament repairs. [Integration record and deferred branches](docs/MAIN-INTEGRATION-20261102.md).

Historical Study26 completed with both arms VERIFIED on all eight protected checks. Its architecture metric tied, so the engineering decision remains INCONCLUSIVE. Those results belong to their original frozen source; this combined build has separate software checks. Public evidence/source catalogs remain unprovisioned, and Evidence Memory is not implemented. ML/QLoRA research stays on separate branches.

## Run locally

Use Node 24 and npm.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:3000. The current build lets you confirm, revise, revoke and export future requirements, then review a pinned booking graph and separately consent to Meta proposals, one falsifiable hypothesis and one proposed counterexample. Research results and sharing approvals stay in browser memory. Use **Saved workspaces** to explicitly retain project source, requirement drafts, notes and navigation on this device; saved requirements require reconfirmation when reopened. Unsaved work disappears on reload. Example buttons only populate the editor and require explicit confirmation. Each model stage has its own exact-payload review and sharing action; editing or revoking a requirement discards dependent research. [Foresight configuration, boundaries and first-smoke handoff](docs/FORESIGHT.md).

For a credential-free walkthrough, confirm **Team permissions**, select **Explore local template**, then read the local hypothesis and counterexample. Every stage is explicitly a developer-authored template; no provider call occurs. The source-backed Atlas keeps observed imports separate from B's planned actions and marks missing preparation/future snapshots unavailable. Review/export the research handoff, then inspect `/experiments` for the blocked tournament, Evidence Laboratory and certificate availability. The default public composition shows no approved experimental evidence; the separately retained historical experiment does not automatically populate it. See [judge walkthrough](docs/P0-JUDGE-WALKTHROUGH.md).

## Explore your project and save work

Open **Local Projects** to select a TypeScript/Next.js folder or individual source files. Review the inclusion preview before reading source, then search modules and inspect their graph, dependencies, source and coverage limitations. Import and analysis stay in the browser; imported code is never executed and no provider request is made. Booking remains an explicitly labeled example with its own research context.

The **Saved workspaces** shelf on every chapter lets you save, reopen, rename and delete local work. Source storage requires an explicit checkbox. Up to ten workspaces fit within a conservative 4 MiB device budget, with 2 MiB per saved record; browser quota may be lower. Source graphs are recomputed on reopen, confirmed booking requirements become drafts, and no consent, authorization, provider output or authenticated evidence is saved. [Import scope, storage format and limitations](docs/LOCAL-PROJECT-WORKSPACES.md).

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

These checks validate both application builds, contract/receipt boundaries, the booking baseline and browser behavior. They do not establish sandbox isolation or model effectiveness. CI uses no inference credentials.

## Booking baseline and evaluator preparation

```sh
npm run dev --workspace @forecode/booking-v1
npm run test:fixture-e2e
npm run snapshot:booking --silent
npm run prepare:booking -- --output /absolute/path/to/a/new-task-directory
```

The booking demo runs at http://127.0.0.1:3006. It uses synthetic Alice sessions, two rooms, owner-only access, atomic overlap rejection and cancellation. Its independent package/lockfile can be exported without Forecode, controller code, private environment files or evaluator sources. [Fixture guide](fixtures/booking-v1/README.md).

`snapshot:booking` commits source/policy identities without executing code. `prepare:booking` creates a new sanitized directory and refuses existing outputs. Neither command runs an agent or a grader. Independent baseline oracle and receipt assembly live outside the task under `scripts/evaluator/booking-v1/`; [custody and handoff](docs/BOOKING-EVALUATION.md).

To compare the fresh validators against the immutable external planning reference:

```sh
PLAN_REFERENCE_ROOT=/absolute/path/to/AgentHarness-Planning npm run test:plan
```

The test reads the pinned Git objects in memory. The external schema, sample records and implementation are never copied into this entry. CI fetches only the reference's Git objects into a separate temporary directory.

## Current limits

- The Meta transport and three Foresight endpoints have synthetic coverage and separately approved historical live use, including all three Scientist stages in Study26. Its passing correctness result and tied architecture metric do not establish architecture improvement or Meta incremental benefit. Calls default to disabled and need separate spending approval; existing credentials or flags are not permission. Contributor mode content-use terms are shown before sharing. Set the exact deployment `FORECODE_ORIGIN`; see `.env.example` and the Foresight guide.
- All 49 frozen definitions now have fresh validators, with published structural and semantic conformance checks. Relationships, fixed scoring arithmetic, canonical digests and stale/forged receipt handling are tested. This validates interfaces and development behavior; it does not authenticate a real experiment.
- The web process has no experiment execution or evaluator endpoint. The protected loader remains read-only. Workstream A previously completed owner-reviewed fixed offline Next 16.4.3 Webpack infrastructure acceptance; those historical observations remain separate and are neither hosted here nor evidence of an architecture A/B experiment. The hosted application does not execute a coding agent or modify its runtime; controlled agent execution belongs to the separate developer-local workflow. Evidence interpretation uses only separately approved sanitized summaries, never private grader source. No production certificate is provisioned; the assembly/export boundary requires separately approved genuine source records.
- Model proposals make no claims of architecture improvement, Meta incremental benefit or independent experiment verification.

See [build provenance](docs/BUILD-PROVENANCE.md) and the [implementation log](docs/IMPLEMENTATION-LOG.md). Publication, approved-contributor declarations, final track selection and licensing sign-off remain owner release gates.

Developer-local [agent commitment preparation](docs/BOOKING-AGENT-EXECUTION.md) and [tournament validation/accounting](docs/ARCHITECTURE-TOURNAMENT.md) preserve source/task bindings and fail-closed readiness. The [team task and permission matrix](benchmarks/booking-team-permissions/README.md), [future-oracle interface and study preparation](docs/BOOKING-FUTURE-EVALUATION.md), and [restricted guest bridge](docs/BOOKING-TEAM-BRIDGE.md) support that controlled workflow. Historical Study26 used separately admitted frozen source and retired runtime authority; its [completion record](docs/TOURNAMENT-FAILURE-FIXES.md#fresh-real-passing-pair-verified) preserves the actual outcome. This combined build has not run a new experiment. Any future execution requires fresh source-bound admission, preregistration and exact spending approval.

Read-only [recorded verification](docs/RECORDED-VERIFICATION.md) is available at `/experiments` from the workspace. Production recordings are NOT_PROVISIONED; the current modeled comparison has no linked measured experiment. The authenticated loading/projection boundary and operator handoff are implemented without publishing private historical output.

Scoped historical certificates: visit `/certificates` to inspect approved recorded evidence references and export the exact frozen CertificateV1 through fresh read-only `/api/demo` retrieval. Production remains **NOT_PROVISIONED** with an honest empty state; the current modeled comparison has no linked measured experiment. See [certificate behavior and the separate operator approval boundary](docs/RECORDED-CERTIFICATES.md).
