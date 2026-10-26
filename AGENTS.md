# Forecode implementation

This is the fresh event implementation. Work from the external planning snapshot linked in `docs/SPEC-LOCK.md`; author implementation, tests and documentation here afresh. Do not transplant planning files or history.

- Keep strict TypeScript and the Next App Router. Pure data and validation belong in `src/lib`; credential-bearing configuration and transport belong in `src/server` with `server-only`.
- Public web code must never import a local experiment runner, evaluator, arbitrary host filesystem access or command execution API. `tests/unit/web-boundary.test.ts` and ESLint guard this separation. A later trusted read-only artifact loader belongs exclusively in `src/server/artifacts/`; narrow the filesystem regression guard for that module only when custody/freshness tests exist.
- Sandbox configuration is owned by a separate operator/agent. Preserve it. No real experiment runs until independently reviewed isolation evidence is available.
- Model outputs are untrusted proposals. Explicit consent is required before sending the exact approved payload; user confirmation is separate. Configuration is not proof of model access.
- Fresh protected evaluator receipts are required for verification claims. Until that pipeline exists, the UI must say evidence is absent. Never manufacture results or relabel synthetic examples as measured.
- Intent edits/revocations increment revisions and invalidate dependent recommendations. Historical experiment artifacts must remain immutable.
- Keep `.env.local` and credentials out of commits, logs, browser props and screenshots. Error responses use a fixed safe envelope.
- Run `npm run check` and `npm run test:e2e` after an app change. E2E requires the production build and Playwright Chromium. CI must use no provider credentials and make no paid calls.
- Log commands, observed exit codes, limitations and next ticket in `docs/IMPLEMENTATION-LOG.md`. Keep incomplete schema coverage explicitly incomplete.
