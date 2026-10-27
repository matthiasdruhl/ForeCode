// Protected suite. Executes reviewed harmless fixtures only; never candidate code.
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { command, successful } from "./runtime.mjs";
import {
  recoverOwned,
  assertAbsent,
  cleanupOwned,
  registerController,
  signalOwnedDriver,
  unregisterController,
} from "./lifecycle.mjs";
import {
  lifecycleCases,
  validateLifecycleRequest,
  lifecycleRequestDigest,
  processSummary,
  digest,
  sentinel,
} from "./lifecycle-protocol.mjs";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function exerciseLifecycle(
  request,
  signal = AbortSignal.timeout(90_000),
) {
  const input = validateLifecycleRequest(request);
  const root = `/tmp/booking-lifecycle-${input.suiteId}`;
  const rows = [],
    completedIds = [];
  let cleanupComplete = false,
    suiteFailure = null;
  await mkdir(root, { mode: 0o755 });
  await mkdir(`${root}/source`, { mode: 0o755 });
  await mkdir(`${root}/bridge`, { mode: 0o755 });
  await writeFile(`${root}/source/export-marker`, sentinel, {
    mode: 0o444,
    flag: "wx",
  });
  await writeFile(
    `${root}/bridge/lifecycle-worker.mjs`,
    await readFile(new URL("./lifecycle-worker.mjs", import.meta.url)),
    { mode: 0o444, flag: "wx" },
  );
  await registerController(input.suiteId, "lifecycle-suite");
  try {
    for (const id of lifecycleCases) {
      signal.throwIfAborted();
      // No prior worker/controller may silently carry into another case.
      for (const prior of completedIds) await assertAbsent(prior);
      const runId = input.runs[id];
      const before = digest(await readFile(`${root}/source/export-marker`));
      let pid,
        heartbeat = null,
        sentSignal = null,
        cleanupRefused = false;
      let driver = null,
        transport = null,
        failure = null,
        pendingTransport;
      try {
        const promise = command(
          process.execPath,
          [
            fileURLToPath(new URL("./lifecycle-driver.mjs", import.meta.url)),
            input.suiteId,
            runId,
            input.workerImage,
            id,
          ],
          {
            milliseconds: id === "timeout" ? 5000 : 12000,
            maxBytes: 8192,
            signal,
            onSpawn: (value) => {
              pid = value;
            },
          },
        );
        // Attach rejection handling immediately; no background promise escapes.
        pendingTransport = promise.catch(() => ({
          status: null,
          signal: null,
          reason: "spawn_error",
          stdout: "",
          stderr: "Driver transport failed",
          elapsedMs: 0,
        }));
        if (
          [
            "timeout",
            "sigint",
            "sigterm",
            "detached-descendant",
            "cleanup-refusal",
          ].includes(id)
        ) {
          const probe = async () => {
            for (let n = 0; n < 30; n++) {
              signal.throwIfAborted();
              const result = await command(
                "docker",
                [
                  "exec",
                  `forecode-booking-${runId}`,
                  "/usr/local/bin/node",
                  "/bridge/lifecycle-worker.mjs",
                  "inspect",
                ],
                { milliseconds: 500, maxBytes: 1024, signal },
              );
              if (successful(result)) {
                const body = JSON.parse(result.stdout);
                if (
                  Number.isSafeInteger(body.beats) &&
                  body.beats > 0 &&
                  body.denied === body.beats
                )
                  return body;
                throw new Error(
                  "Harmless descendant mutated export or returned invalid heartbeat",
                );
              }
              await pause(50);
            }
            throw new Error("Harmless worker readiness deadline");
          };
          const first = await probe();
          await pause(100);
          const second = await probe();
          if (second.beats <= first.beats)
            throw new Error("Detached worker did not advance");
          heartbeat = [first.beats, second.beats];
          if (id === "cleanup-refusal") {
            try {
              await cleanupOwned(runId, { probeRefusal: true });
            } catch (error) {
              if (error.message !== "FIXED_PROBE_REMOVAL_REFUSED") throw error;
              cleanupRefused = true;
            }
            // Prove the refusal left a running, observable worker before recovery.
            await probe();
            if (!cleanupRefused)
              throw new Error("Cleanup refusal did not occur");
          }
          if (id !== "timeout") {
            sentSignal =
              id === "sigint"
                ? "SIGINT"
                : id === "detached-descendant"
                  ? "SIGKILL"
                  : "SIGTERM";
            if (!pid) throw new Error("Driver PID missing");
            await signalOwnedDriver(runId, pid, sentSignal);
          }
        }
        transport = await pendingTransport;
        if (successful(transport)) {
          driver = JSON.parse(transport.stdout);
          if (
            driver.schemaVersion !== "booking-lifecycle-driver.v1" ||
            driver.runId !== runId
          )
            throw new Error("Driver identity mismatch");
        }
      } catch {
        failure =
          "Fixed lifecycle case failed; private bounded transport observations retained.";
      }
      // This runs independently of the interrupted command's signal/deadline.
      try {
        await recoverOwned(runId);
        await assertAbsent(runId);
      } catch {
        failure = "Lifecycle case termination unconfirmed";
      }
      if (!transport && pendingTransport) transport = await pendingTransport;
      const after = digest(await readFile(`${root}/source/export-marker`));
      rows.push({
        id,
        runId,
        status: failure ? "error" : "observed",
        transport: transport ? processSummary(transport) : null,
        driver,
        heartbeat,
        sentSignal,
        cleanupRefused,
        sourceBeforeSha256: before,
        sourceAfterSha256: after,
        recovered: !failure,
        failure,
      });
      if (failure) break;
      completedIds.push(runId);
    }
  } catch {
    suiteFailure = "Protected lifecycle suite interrupted or failed.";
  } finally {
    try {
      for (const runId of Object.values(input.runs)) {
        await recoverOwned(runId);
        await assertAbsent(runId);
      }
      cleanupComplete = true;
      await unregisterController(input.suiteId);
      await rm(root, { recursive: true });
    } catch {
      cleanupComplete = false;
      suiteFailure =
        "Lifecycle suite cleanup unconfirmed; owner recovery required.";
    }
  }
  return {
    schemaVersion: "booking-lifecycle-observation.v1",
    suiteId: input.suiteId,
    implementationSha256: input.implementationSha256,
    workerImage: input.workerImage,
    requestSha256: lifecycleRequestDigest(input),
    cleanupConfirmed: cleanupComplete,
    failure: suiteFailure,
    cases: rows,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const chunks = [];
    let used = 0;
    for await (const chunk of process.stdin) {
      used += chunk.length;
      if (used > 16384) throw new Error("Lifecycle input bound");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString();
    const result = await exerciseLifecycle(
      JSON.parse(raw),
      AbortSignal.any([cancellation.signal, AbortSignal.timeout(90_000)]),
    );
    process.stdout.write(JSON.stringify(result));
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
