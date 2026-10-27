# Forecode

Architecture research guided by future requirements, Meta-generated hypotheses and independent verification.

The architectural concept and planning existed before the Meta AI Developer Hackathon. This standalone implementation was started October 26, 2026, after the noon Eastern kickoff. Source, tests, app assets and documentation in this repository are newly authored during the event. The external design reference is pinned in [SPEC-LOCK](docs/SPEC-LOCK.md); no planning implementation or history is vendored.

## Run locally

Use Node 24 and npm.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:3000. The current build lets you confirm, revise, revoke and export future requirements, then review a pinned booking graph and separately consent to Meta proposals, one falsifiable hypothesis and one proposed counterexample. Requirements and research live in browser memory and disappear on reload; export requirements before leaving. Example buttons only populate the editor and require explicit confirmation. Each model stage has its own exact-payload review and sharing action; editing or revoking a requirement discards dependent research. [Foresight configuration, boundaries and first-smoke handoff](docs/FORESIGHT.md).

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

- The Meta transport and three Foresight endpoints are implemented and tested with synthetic responses. One separately approved live `propose` call now returned a valid A/B response through the production app and configured Meta model. Live hypothesis/challenge calls remain **NOT_RUN**; architecture and Meta effectiveness remain unmeasured. Calls default to disabled and need separate spending approval; existing credentials or flags are not permission. Contributor mode content-use terms are shown before sharing. Set the exact deployment `FORECODE_ORIGIN`; see `.env.example` and the Foresight guide.
- All 49 frozen definitions now have fresh validators, with published structural and semantic conformance checks. Relationships, fixed scoring arithmetic, canonical digests and stale/forged receipt handling are tested. This validates interfaces and development behavior; it does not authenticate a real experiment.
- The web process has no experiment execution or evaluator endpoint. The protected loader remains read-only. Workstream A previously completed owner-reviewed fixed offline Next 16.4.3 Webpack infrastructure acceptance; those historical observations remain separate and are neither hosted here nor evidence of an architecture A/B experiment. This feature does not execute a coding agent, modify its runtime, interpret grader evidence or issue a product certificate.
- Model proposals make no claims of architecture improvement, Meta incremental benefit or independent experiment verification.

See [build provenance](docs/BUILD-PROVENANCE.md) and the [implementation log](docs/IMPLEMENTATION-LOG.md). Publication, approved-contributor declarations, final track selection and licensing sign-off remain owner release gates.
