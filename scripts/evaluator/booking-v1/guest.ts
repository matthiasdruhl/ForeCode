// TRUSTED grader microVM controller. Provisioned by the sandbox owner under
// /opt/forecode-booking/controller, never copied to the agent VM or worker.
// No candidate import occurs in this process. Only data crosses the RPC bridge.
import { workerArguments } from "./worker-policy.mjs";
import { command, successful } from "./runtime.mjs";
import {
  cleanupOwned,
  validRun,
  registerController,
  unregisterController,
} from "./lifecycle.mjs";
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
import type { GradeInput } from "../../experiments/runner/protocol";
import type { GradeReport } from "../../experiments/runner/protocol";

const MAX = 1_048_576;
const raw = readFileSync(0);
if (raw.length > 12_000_000) throw new Error("Input bound");
const input = JSON.parse(raw.toString()) as GradeInput;
validRun(input.runId);
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
const deadline = setTimeout(cancel, 580_000);
if (
  !/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/.test(
    input.workerImage,
  )
)
  throw new Error("Pinned worker image required.");
await registerController(input.runId);
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
const docker = (
  args: string[],
  data?: unknown,
  timeout = 5000,
  cleanup = false,
) =>
  command("docker", args, {
    input: data === undefined ? undefined : JSON.stringify(data),
    milliseconds: timeout,
    maxBytes: MAX,
    signal: cleanup ? undefined : cancellation.signal,
  });
const stop = async (name: string) => {
  const result = await docker(["rm", "-f", name], undefined, 5000, true);
  if (successful(result)) containers.delete(name);
  else throw new Error("Worker cleanup failed.");
};
async function launch(mode: "rpc" | "build" | "typecheck" | "isolation") {
  const name = `forecode-booking-${input.runId}-${randomUUID()}`;
  containers.add(name);
  const args = workerArguments({
    name,
    runId: input.runId,
    image: input.workerImage,
    source,
    bridge,
    script: "worker.mjs",
    mode,
    detach: mode === "rpc",
  });
  const result = await docker(args, undefined, mode === "rpc" ? 10000 : 200000);
  return { name, result };
}
async function rpc(name: string, data: unknown): Promise<unknown> {
  const result = await docker(
    ["exec", "-i", name, "/usr/local/bin/node", "/bridge/client.mjs"],
    data,
  );
  if (!successful(result)) throw new Error("Worker RPC failed.");
  const body = JSON.parse(result.stdout);
  if (body.error)
    throw Object.assign(new Error("Candidate error"), {
      code: body.error.code,
    });
  return body.result;
}
function oracleProcess(kind: string, name?: string, data?: unknown) {
  return command(
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
      input: data === undefined ? undefined : JSON.stringify(data),
      milliseconds: 60000,
      maxBytes: 65536,
      signal: cancellation.signal,
    },
  );
}
const checks: GradeReport["checks"] = [];
try {
  let total = 0;
  if (
    !Array.isArray(input.candidate.files) ||
    input.candidate.files.length > 100
  )
    throw new Error("Candidate count bound");
  for (const file of input.candidate.files) {
    if (
      !/^[A-Za-z0-9_.()[\]/-]+$/.test(file.path) ||
      file.path.split("/").some((part) => part === ".." || part === ".") ||
      path.isAbsolute(file.path) ||
      manifest.some((f) => f.path === file.path)
    )
      throw new Error("Invalid candidate path.");
    const bytes = Buffer.from(file.base64, "base64");
    if (
      bytes.toString("base64") !== file.base64 ||
      bytes.length > 2_097_152 ||
      (total += bytes.length) > 8_000_000
    )
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
  for (const name of ["worker.mjs", "client.mjs", "probe.mjs"])
    writeFileSync(
      path.join(bridge, name),
      readFileSync(fileURLToPath(new URL(name, import.meta.url))),
      { flag: "wx", mode: 0o444 },
    );
  for (const mode of ["typecheck", "build"] as const) {
    const { name, result } = await launch(mode);
    const exitCode =
      result.reason !== "completed" || result.signal ? null : result.status;
    checks.push({
      id: mode,
      status: exitCode === null ? "error" : exitCode === 0 ? "pass" : "fail",
      exitCode,
      detail:
        exitCode === null
          ? "Worker interrupted or resource limit reached."
          : `Isolated tool exit; reason=${result.reason}; elapsedMs=${result.elapsedMs}; stdoutSha256=${digest(result.stdout)}; stderrSha256=${digest(result.stderr)}.`,
    });
    await stop(name);
  }
  for (const kind of ["baseline-domain", "http-integration"] as const) {
    const { name, result: startup } = await launch("rpc");
    try {
      if (!successful(startup)) throw new Error("Worker startup failed.");
      let ready = false;
      for (let retry = 0; retry < 10 && !ready; retry++) {
        try {
          ready = (await rpc(name, { op: "ping" })) === true;
        } catch {
          /* bounded startup retry, no inference */
        }
      }
      if (!ready) throw new Error("Worker not ready.");
      const result = await oracleProcess(kind, name);
      const exitCode =
        result.reason !== "completed" || result.signal ? null : result.status;
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
      await stop(name);
    }
  }
  const scanned = await oracleProcess(
    "boundary",
    undefined,
    input.candidate.files,
  );
  const probe = await launch("isolation");
  await stop(probe.name);
  const scanExit =
    scanned.reason !== "completed" || scanned.signal ? null : scanned.status;
  checks.push({
    id: "boundary",
    status:
      scanExit === null || !successful(probe.result)
        ? "error"
        : scanExit === 0
          ? "pass"
          : "fail",
    exitCode: scanExit,
    detail: `Trusted static scan and fixed worker file/socket/network denial probe: ${probe.result.reason}/${probe.result.status}. Finite checks only.`,
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
  await cleanupOwned(input.runId);
  if (cancellation.signal.aborted) throw new Error("Grading cancelled");
  process.stdout.write(JSON.stringify(report));
} finally {
  clearTimeout(deadline);
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
  await cleanupOwned(input.runId);
  rmSync(directory, { recursive: true, force: true });
  await unregisterController(input.runId);
}
