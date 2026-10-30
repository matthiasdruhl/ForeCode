// Team-only bridge extension. The original smoke bridge remains unchanged.
// All candidate execution stays in this network-none, credential-free worker.
import { spawnSync } from "node:child_process";
process.once("beforeExit", () => {
  const original = process.exitCode ?? 0;
  const checks = spawnSync(
    "/usr/local/bin/node",
    ["/run/team-public-checks.mjs"],
    {
      stdio: "inherit",
      timeout: 180_000,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  process.exitCode =
    original || (checks.error || checks.signal ? 124 : (checks.status ?? 124));
});
await import("/run/forecode-worker.mjs");
