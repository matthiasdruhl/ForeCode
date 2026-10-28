// UNTRUSTED side of the bridge. Mounted read-only into a resource-limited,
// network-none worker. Contains no oracle, result authority, socket or secrets.
import { cp, symlink, mkdir, chmod, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
await cp("/source", "/work/task", { recursive: true });
await mkdir("/work/task", { recursive: true });
// The root-owned /work tmpfs mount must never be chmodded by UID65534.
// Its new task directory is worker-owned; source stays immutable.
async function writable(root) {
  await chmod(root, 0o700);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = `${root}/${entry.name}`;
    if (entry.isDirectory()) await writable(name);
    else await chmod(name, 0o600);
  }
}
await writable("/work/task");
await symlink("/toolchain/node_modules", "/work/task/node_modules");
process.chdir("/work/task");
const mode = process.argv[2];
if (mode === "isolation") {
  await import("/bridge/probe.mjs");
  process.exit(0);
}
if (mode === "build" || mode === "typecheck") {
  const commands =
    mode === "build"
      ? [["/toolchain/node_modules/next/dist/bin/next", "build", "--webpack"]]
      : [
          ["/toolchain/node_modules/next/dist/bin/next", "typegen"],
          [
            "/toolchain/node_modules/typescript/bin/tsc",
            "--noEmit",
            "-p",
            "/work/task/tsconfig.json",
          ],
        ];
  for (const args of commands) {
    const p = spawnSync("/usr/local/bin/node", args, {
      cwd: "/work/task",
      timeout: 90_000,
      maxBuffer: 1_048_576,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
      },
    });
    if (p.error || p.signal || p.status !== 0)
      process.exit(
        p.status && p.status > 0 && p.status <= 255 ? p.status : 124,
      );
  }
  process.exit(0);
}
const { createBookingService } =
  await import("/work/task/src/server/booking-service.ts");
const { createBookingHttp } = await import("/work/task/src/server/http.ts");
const team = mode === "rpc-team";
if (mode !== "rpc" && !team) throw new Error("Unsupported worker mode.");
const { createBehaviorDispatcher, rpcLimit } =
  await import("/bridge/team-rpc.mjs");
const createTeamBenchmark = team
  ? (await import("/work/task/src/server/team-benchmark.ts"))
      .createTeamBenchmark
  : undefined;
const dispatch = createBehaviorDispatcher({
  createBookingService,
  createBookingHttp,
  createTeamBenchmark,
  team,
});
createServer(async (req, res) => {
  const chunks = [];
  let used = 0;
  for await (const chunk of req) {
    used += chunk.length;
    if (used > rpcLimit) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  }
  let input;
  try {
    input = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    res.end(JSON.stringify({ error: { code: "BRIDGE_ERROR" } }));
    return;
  }
  res.end(await dispatch(input));
}).listen(4318, "127.0.0.1");
