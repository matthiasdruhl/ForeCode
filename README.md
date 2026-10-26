# Forecode

Architecture research guided by future requirements, Meta-generated hypotheses and independent verification.

The architectural concept and planning existed before the Meta AI Developer Hackathon. This standalone implementation was started October 26, 2026, after the noon Eastern kickoff. Source, tests, app assets and documentation in this repository are newly authored during the event. The external design reference is pinned in [SPEC-LOCK](docs/SPEC-LOCK.md); no planning implementation or history is vendored.

## Run locally

Use Node 24 and npm.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:3000. The current build lets you confirm, revise, revoke and export future requirements. Requirements live in browser memory and disappear on reload; export them before leaving. Example buttons only populate the editor and require explicit confirmation.

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

- Live Meta transport, architecture proposals, hypotheses and challenges are pending. Environment configuration is server-only and calls default to disabled. No inference or paid network calls are implemented in this build.
- All 49 frozen definitions now have fresh validators, with published structural and semantic conformance checks. Relationships, fixed scoring arithmetic, canonical digests and stale/forged receipt handling are tested. This validates interfaces and development behavior; it does not authenticate a real experiment.
- The web process has no experiment execution or evaluator endpoint. The protected loader is read-only and accepts controller-allowlisted bytes and freshness pins. Real custody, isolated candidate grading and runner integration remain gated on the separately configured sandbox; no real experiment receipt or certificate exists yet.
- No claims of architecture improvement, Meta incremental benefit or verified acceptance are made.

See [build provenance](docs/BUILD-PROVENANCE.md) and the [implementation log](docs/IMPLEMENTATION-LOG.md). Publication, approved-contributor declarations, final track selection and licensing sign-off remain owner release gates.
