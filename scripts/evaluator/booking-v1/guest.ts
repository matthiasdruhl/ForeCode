// TRUSTED grader microVM controller. Provisioned by the sandbox owner under
// /opt/forecode-booking/controller, never copied to the agent VM or worker.
// No candidate import occurs in this process. Only data crosses the RPC bridge.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GradeInput } from "../../experiments/runner/sbx";
import type { GradeReport } from "../../experiments/runner/protocol";

const MAX = 1_048_576;
const input = JSON.parse(readFileSync(0, "utf8")) as GradeInput;
if (!/^forecode-booking-toolchain@sha256:[a-f0-9]{64}$/.test(input.workerImage))
  throw new Error("Pinned worker image required.");
const directory = mkdtempSync(path.join(tmpdir(), "booking-grade-"));
const source = path.join(directory, "source"),
  bridge = path.join(directory, "bridge");
mkdirSync(source, { mode: 0o755 });
mkdirSync(bridge, { mode: 0o755 });
// mkdtemp's 0700 parent must be traversable by the unprivileged worker.
import { chmodSync } from "node:fs";
chmodSync(directory, 0o755);
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const manifest: { path: string; sha256: string }[] = [];
const containers = new Set<string>();
const docker = (args: string[], data?: unknown, timeout = 5000) =>
  spawnSync("docker", args, {
    encoding: "utf8",
    input: data === undefined ? undefined : JSON.stringify(data),
    timeout,
    maxBuffer: MAX,
    env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" },
  });
const stop = (name: string) => {
  const result = docker(["rm", "-f", name]);
  if (result.status === 0) containers.delete(name);
  else throw new Error("Worker cleanup failed.");
};
function launch(mode: "rpc" | "build" | "typecheck") {
  const name = `forecode-booking-${randomUUID()}`;
  containers.add(name);
  const args = [
    "run",
    "--name",
    name,
    "--pull",
    "never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--user",
    "65534:65534",
    "--cpus",
    "1",
    "--memory",
    "768m",
    "--memory-swap",
    "768m",
    "--pids-limit",
    "64",
    "--ulimit",
    "nofile=256:256",
    "--log-driver",
    "none",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=32m",
    "--tmpfs",
    "/work:rw,nosuid,size=256m,mode=1777",
    "--mount",
    `type=bind,src=${source},dst=/source,readonly`,
    "--mount",
    `type=bind,src=${bridge},dst=/bridge,readonly`,
    "--env",
    "NEXT_TELEMETRY_DISABLED=1",
    ...(mode === "rpc" ? ["--detach"] : []),
    input.workerImage,
    "/usr/local/bin/node",
    "--conditions=react-server",
    "--import",
    "/toolchain/node_modules/tsx/dist/loader.mjs",
    "/bridge/worker.mjs",
    mode,
  ];
  const result = docker(args, undefined, mode === "rpc" ? 10000 : 200000);
  return { name, result };
}
function rpc(name: string, data: unknown): unknown {
  const result = docker(
    ["exec", "-i", name, "/usr/local/bin/node", "/bridge/client.mjs"],
    data,
  );
  if (result.error || result.signal || result.status !== 0)
    throw new Error("Worker RPC failed.");
  const body = JSON.parse(result.stdout);
  if (body.error)
    throw Object.assign(new Error("Candidate error"), {
      code: body.error.code,
    });
  return body.result;
}
function oracleProcess(kind: string, name?: string, data?: unknown) {
  return spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "/opt/forecode-booking/node_modules/tsx/dist/loader.mjs",
      fileURLToPath(new URL("./oracle-driver.ts", import.meta.url)),
      kind,
      ...(name ? [name] : []),
    ],
    {
      encoding: "utf8",
      input: data === undefined ? undefined : JSON.stringify(data),
      timeout: 60000,
      maxBuffer: 65536,
      env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" },
    },
  );
}
const checks: GradeReport["checks"] = [];
try {
  let total = 0;
  for (const file of input.candidate.files) {
    if (
      !/^[A-Za-z0-9_.()[\]/-]+$/.test(file.path) ||
      file.path.split("/").some((part) => part === ".." || part === ".") ||
      path.isAbsolute(file.path) ||
      manifest.some((f) => f.path === file.path)
    )
      throw new Error("Invalid candidate path.");
    const bytes = Buffer.from(file.base64, "base64");
    if ((total += bytes.length) > 8_000_000)
      throw new Error("Candidate bound.");
    const target = path.join(source, file.path);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
    writeFileSync(target, bytes, { flag: "wx", mode: 0o444 });
    manifest.push({ path: file.path, sha256: digest(bytes) });
  }
  manifest.sort((a, b) => (a.path < b.path ? -1 : 1));
  if (
    digest(JSON.stringify(manifest)) !== input.evaluatedTreeSha256 ||
    input.candidate.runId !== input.runId
  )
    throw new Error("Candidate identity mismatch.");
  for (const name of ["worker.mjs", "client.mjs"])
    writeFileSync(
      path.join(bridge, name),
      readFileSync(fileURLToPath(new URL(name, import.meta.url))),
      { flag: "wx", mode: 0o444 },
    );
  for (const mode of ["typecheck", "build"] as const) {
    const { name, result } = launch(mode);
    const exitCode = result.signal || result.error ? null : result.status;
    checks.push({
      id: mode,
      status: exitCode === null ? "error" : exitCode === 0 ? "pass" : "fail",
      exitCode,
      detail:
        exitCode === null
          ? "Worker interrupted or resource limit reached."
          : "Observed isolated tool process exit; candidate scripts were not invoked.",
    });
    stop(name);
  }
  for (const kind of ["baseline-domain", "http-integration"] as const) {
    const { name, result: startup } = launch("rpc");
    try {
      if (startup.status !== 0 || startup.error)
        throw new Error("Worker startup failed.");
      let ready = false;
      for (let retry = 0; retry < 10 && !ready; retry++) {
        try {
          ready = rpc(name, { op: "ping" }) === true;
        } catch {
          /* bounded startup retry, no inference */
        }
      }
      if (!ready) throw new Error("Worker not ready.");
      const result = oracleProcess(kind, name);
      const exitCode = result.error || result.signal ? null : result.status;
      checks.push({
        id: kind,
        status: exitCode === null ? "error" : exitCode === 0 ? "pass" : "fail",
        exitCode,
        detail:
          exitCode === null
            ? "Oracle process interrupted."
            : result.stdout.slice(0, 2048),
      });
    } catch {
      checks.push({
        id: kind,
        status: "error",
        exitCode: null,
        detail: "Independent oracle bridge failed.",
      });
    } finally {
      stop(name);
    }
  }
  const scanned = oracleProcess("boundary", undefined, input.candidate.files);
  const scanExit = scanned.error || scanned.signal ? null : scanned.status;
  checks.push({
    id: "boundary",
    status: scanExit === null ? "error" : scanExit === 0 ? "pass" : "fail",
    exitCode: scanExit,
    detail: "Trusted static command/import scan; not containment proof.",
  });
  const report: GradeReport = {
    schemaVersion: "booking-grade-observation.v1",
    runId: input.runId,
    evaluatedTreeSha256: input.evaluatedTreeSha256,
    evaluatorSha256: input.evaluatorSha256,
    testSuiteSha256: input.testSuiteSha256,
    requiredPolicySha256: input.requiredPolicySha256,
    checks,
  };
  process.stdout.write(JSON.stringify(report));
} finally {
  for (const name of containers) stop(name);
  rmSync(directory, { recursive: true, force: true });
}
