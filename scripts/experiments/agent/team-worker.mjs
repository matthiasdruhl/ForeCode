// Team-only bridge extension; smoke execution does not opt into this workflow.
// All candidate execution stays in this network-none, credential-free worker.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
process.once("beforeExit", () => {
  const original = process.exitCode ?? 0;
  const checks = spawnSync(
    "/usr/local/bin/node",
    ["/run/team-public-checks.mjs", "--quick"],
    {
      stdio: "inherit",
      timeout: 180_000,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NEXT_TELEMETRY_DISABLED: "1",
        FORECODE_DEADLINE: String(
          JSON.parse(readFileSync("/run/forecode-task.json", "utf8"))
            .deadline ?? 0,
        ),
      },
    },
  );
  console.log(
    `PUBLIC_EXIT_CHECK ${checks.error || checks.signal ? "INTERRUPTED" : checks.status === 0 ? "QUICK_PASS" : "BLOCKED"}`,
  );
  // Native status stays distinct. Trusted finalization checks readiness separately.
  process.exitCode = original;
});
await import("/run/forecode-worker.mjs");
