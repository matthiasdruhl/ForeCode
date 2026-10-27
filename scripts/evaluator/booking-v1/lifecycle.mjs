// Run-scoped recovery, also callable after a killed controller. No VM/global cleanup.
import { command, successful } from "./runtime.mjs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export const runLabel = "forecode.booking.run";
export function validRun(runId) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      runId,
    )
  )
    throw new Error("Invalid run identity");
}
export async function cleanupOwned(runId, { probeRefusal = false } = {}) {
  validRun(runId);
  const list = () =>
    command("docker", ["ps", "-aq", "--filter", `label=${runLabel}=${runId}`]);
  const before = await list();
  if (!successful(before)) throw new Error("Worker inventory failed");
  const ids = before.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length > 16 || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
    throw new Error("Invalid worker inventory");
  for (const id of ids) {
    const inspected = await command("docker", [
      "inspect",
      "--format",
      "{{json .Config.Labels}}",
      id,
    ]);
    if (
      !successful(inspected) ||
      JSON.parse(inspected.stdout)[runLabel] !== runId
    )
      throw new Error("Worker ownership mismatch");
    if (probeRefusal) throw new Error("FIXED_PROBE_REMOVAL_REFUSED");
    if (!successful(await command("docker", ["rm", "-f", id])))
      throw new Error("Worker removal failed");
  }
  const after = await list();
  if (!successful(after) || after.stdout.trim())
    throw new Error("Worker termination unconfirmed");
  return { runId, removed: ids.length, remaining: 0 };
}
const stateRoot = "/tmp/forecode-booking-controllers";
const birth = async (pid) =>
  (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1].split(" ")[19];
export async function registerController(runId, kind = "grade") {
  validRun(runId);
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await writeFile(
    `${stateRoot}/${runId}.json`,
    JSON.stringify({ pid: process.pid, birth: await birth(process.pid), kind }),
    { flag: "wx", mode: 0o600 },
  );
}
export async function unregisterController(runId) {
  await unlink(`${stateRoot}/${runId}.json`);
}
async function terminateController(runId) {
  validRun(runId);
  let state;
  try {
    state = JSON.parse(await readFile(`${stateRoot}/${runId}.json`, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
  if (!Number.isSafeInteger(state.pid) || state.pid <= 1)
    throw new Error("Invalid controller PID");
  const alive = async () => {
    try {
      return (await birth(state.pid)) === state.birth;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  };
  if (await alive()) {
    const args = await readFile(`/proc/${state.pid}/cmdline`, "utf8");
    const scripts = {
      grade: "guest.ts",
      "lifecycle-driver": "lifecycle-driver.mjs",
      "lifecycle-suite": "lifecycle-probes.mjs",
    };
    const script = scripts[state.kind ?? "grade"];
    if (
      !script ||
      !args.split("\0").includes(`/opt/forecode-booking/controller/${script}`)
    )
      throw new Error("Controller identity changed");
    process.kill(state.pid, "SIGTERM");
    for (let n = 0; n < 30 && (await alive()); n++)
      await new Promise((r) => setTimeout(r, 100));
    if (await alive()) process.kill(state.pid, "SIGKILL");
    for (let n = 0; n < 10 && (await alive()); n++)
      await new Promise((r) => setTimeout(r, 100));
    if (await alive()) throw new Error("Controller termination unconfirmed");
  }
  // Remove only our exact stale controller record; no stale-lock auto recovery.
  try {
    await unregisterController(runId);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return true;
}
export async function recoverOwned(runId, { skipController = false } = {}) {
  const controllerRecovered = skipController
    ? false
    : await terminateController(runId);
  return { ...(await cleanupOwned(runId)), controllerRecovered };
}
export async function signalOwnedDriver(runId, expectedPid, signal) {
  validRun(runId);
  if (!["SIGINT", "SIGTERM", "SIGKILL"].includes(signal))
    throw new Error("Invalid fixed driver signal");
  const state = JSON.parse(
    await readFile(`${stateRoot}/${runId}.json`, "utf8"),
  );
  if (
    !Number.isSafeInteger(expectedPid) ||
    expectedPid <= 1 ||
    state.pid !== expectedPid ||
    state.kind !== "lifecycle-driver" ||
    (await birth(expectedPid)) !== state.birth
  )
    throw new Error("Driver process identity changed");
  const args = (await readFile(`/proc/${expectedPid}/cmdline`, "utf8")).split(
    "\0",
  );
  if (!args.includes("/opt/forecode-booking/controller/lifecycle-driver.mjs"))
    throw new Error("Driver executable identity changed");
  process.kill(expectedPid, signal);
}
export async function assertAbsent(runId) {
  validRun(runId);
  const rows = await command("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=${runLabel}=${runId}`,
  ]);
  if (!successful(rows) || rows.stdout.trim())
    throw new Error("Run workers remain");
  // A record means an owned controller may still be live, even with no worker.
  try {
    await readFile(`${stateRoot}/${runId}.json`);
    throw new Error("Run controller remains");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { runId, remaining: 0, controllerAbsent: true };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [operation, runId] = process.argv.slice(2);
  if (operation !== "cleanup") throw new Error("Invalid lifecycle operation");
  process.stdout.write(JSON.stringify(await recoverOwned(runId)));
}
