// Allow isolated worktrees to test concurrently without sharing another build.
export const webOrigin = `http://127.0.0.1:${process.env.FORECODE_E2E_PORT ?? "3100"}`;
export const disabledOrigin = `http://127.0.0.1:${process.env.FORECODE_E2E_DISABLED_PORT ?? "3102"}`;
export const fixtureOrigin = `http://127.0.0.1:${process.env.FORECODE_FIXTURE_E2E_PORT ?? "3101"}`;
