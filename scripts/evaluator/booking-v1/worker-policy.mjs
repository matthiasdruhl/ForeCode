// Single reviewed policy for booking workers and harmless lifecycle probes.
import { validRun, runLabel } from "./lifecycle.mjs";
export const workerLimits = Object.freeze({
  cpu: 1,
  memoryBytes: 768 * 1024 ** 2,
  pids: 64,
  descriptors: 256,
  workBytes: 256 * 1024 ** 2,
  tempBytes: 32 * 1024 ** 2,
  shmBytes: 16 * 1024 ** 2,
});
export function workerArguments({
  name,
  runId,
  image,
  source,
  bridge,
  script,
  mode,
  detach = false,
}) {
  validRun(runId);
  if (
    !/^forecode-booking-[a-f0-9-]+$/.test(name) ||
    !/^(?:forecode-booking-toolchain@)?sha256:[a-f0-9]{64}$/.test(image) ||
    !["worker.mjs", "lifecycle-worker.mjs"].includes(script)
  )
    throw new Error("Invalid fixed worker operation");
  if (
    (script === "worker.mjs" &&
      !["rpc", "typecheck", "build", "isolation"].includes(mode)) ||
    (script === "lifecycle-worker.mjs" &&
      !["complete", "fail", "hang", "flood", "detached"].includes(mode))
  )
    throw new Error("Invalid worker mode");
  for (const p of [source, bridge])
    if (
      !/^\/tmp\/booking-(?:grade|lifecycle)-[A-Za-z0-9-]+\/(?:source|bridge)$/.test(
        p,
      )
    )
      throw new Error("Invalid trusted worker mount");
  return [
    "run",
    "--name",
    name,
    "--label",
    `${runLabel}=${runId}`,
    "--restart",
    "no",
    "--init",
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
    "--shm-size",
    "16m",
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
    ...(detach ? ["--detach"] : []),
    "--entrypoint",
    "/usr/local/bin/node",
    image,
    "--conditions=react-server",
    "--import",
    "/toolchain/node_modules/tsx/dist/loader.mjs",
    `/bridge/${script}`,
    mode,
  ];
}
