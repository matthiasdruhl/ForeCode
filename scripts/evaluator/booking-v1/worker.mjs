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
      ? [["/toolchain/node_modules/next/dist/bin/next", "build"]]
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
const subjects = new Map();
let next = 0;
createServer(async (req, res) => {
  let input = "";
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 65536) {
      req.destroy();
      return;
    }
  }
  try {
    const p = JSON.parse(input);
    let result;
    if (p.op === "ping") result = true;
    else if (p.op === "new-domain" || p.op === "new-http") {
      let id = 0;
      const service = createBookingService({
        ...p.options,
        now: () => new Date("2026-11-01T00:00:00Z"),
        newId: () => `oracle-${++id}`,
      });
      const subject =
        p.op === "new-http"
          ? createBookingHttp(service, () => p.viewer)
          : service;
      result = String(++next);
      subjects.set(result, subject);
    } else {
      const subject = subjects.get(p.subject);
      if (!subject) throw new Error("No subject");
      if (p.op === "domain") result = subject[p.method](...p.args);
      else {
        const args = p.request
          ? [
              new Request(p.request.url, {
                method: p.request.method,
                headers: p.request.headers,
                ...(p.request.body === null ? {} : { body: p.request.body }),
              }),
              ...p.args,
            ]
          : [];
        const response = await subject[p.method](...args);
        result = {
          status: response.status,
          body: await response.text(),
          headers: [...response.headers],
        };
      }
    }
    res.end(JSON.stringify({ result }));
  } catch (e) {
    res.end(
      JSON.stringify({
        error: { code: typeof e?.code === "string" ? e.code : "BRIDGE_ERROR" },
      }),
    );
  }
}).listen(4318, "127.0.0.1");
