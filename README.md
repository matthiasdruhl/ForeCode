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

These checks validate the foundation, input boundaries and browser behavior. They do not establish feature completeness, sandbox isolation or model effectiveness. CI uses no inference credentials.

## Current limits

- Live Meta transport, architecture proposals, hypotheses and challenges are pending. Environment configuration is server-only and calls default to disabled. No inference or paid network calls are implemented in this build.
- Contract coverage is limited to the foundation's intent, provider and error types. Full frozen contract parity, cross-record experiment validation and receipt custody remain open.
- The web process has no experiment execution or evaluator endpoint. Sandbox setup is being handled separately; no experiment results or verification certificates exist yet.
- No claims of architecture improvement, Meta incremental benefit or verified acceptance are made.

See [build provenance](docs/BUILD-PROVENANCE.md) and the [implementation log](docs/IMPLEMENTATION-LOG.md). Publication, approved-contributor declarations, final track selection and licensing sign-off remain owner release gates.
