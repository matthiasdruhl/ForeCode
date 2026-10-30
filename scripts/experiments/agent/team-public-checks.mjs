// PUBLIC preparation checks, available to both coding workers. No protected
// assertions, oracle bridge, diagnostic store, opposing source or credentials.
import { cp, mkdtemp, symlink, rm, chmod, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const work = await mkdtemp("/work/public-check-");
const began = Date.now();
const rows = [];
async function writable(root) {
  await chmod(root, 0o700);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) await writable(file);
    else await chmod(file, 0o600);
  }
}
try {
  await cp("/workspace", work, { recursive: true });
  await writable(work);
  await symlink("/toolchain/node_modules", `${work}/node_modules`);
  for (const [id, args] of [
    ["typegen", ["/toolchain/node_modules/next/dist/bin/next", "typegen"]],
    ["typecheck", ["/toolchain/node_modules/typescript/bin/tsc", "--noEmit"]],
    [
      "build",
      ["/toolchain/node_modules/next/dist/bin/next", "build", "--webpack"],
    ],
    [
      "session-cookie",
      [
        "--conditions=react-server",
        "--import",
        "/toolchain/node_modules/tsx/dist/loader.mjs",
        "/run/team-public-session.mjs",
        work,
      ],
    ],
  ]) {
    const remaining = 170_000 - (Date.now() - began);
    const result =
      remaining > 0
        ? spawnSync("/usr/local/bin/node", args, {
            cwd: work,
            timeout: Math.min(90_000, remaining),
            maxBuffer: 262144,
            env: {
              PATH: "/usr/local/bin:/usr/bin:/bin",
              NEXT_TELEMETRY_DISABLED: "1",
              NODE_ENV: "production",
            },
          })
        : null;
    const passed =
      !!result && !result.error && !result.signal && result.status === 0;
    rows.push({ id, passed });
    process.stdout.write(`PUBLIC_CHECK ${id} ${passed ? "PASS" : "FAIL"}\n`);
    if (!passed && result) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
  }
  process.exitCode = rows.every((r) => r.passed) ? 0 : 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
