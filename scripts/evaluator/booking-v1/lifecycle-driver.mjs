// Protected signal target: launches only fixed harmless programs in limited workers.
import { command } from "./runtime.mjs";
import { workerArguments } from "./worker-policy.mjs";
import {
  recoverOwned,
  registerController,
  unregisterController,
  validRun,
} from "./lifecycle.mjs";
import {
  lifecycleCases,
  lifecycleModes,
  processSummary,
} from "./lifecycle-protocol.mjs";
const [suiteId, runId, image, caseId] = process.argv.slice(2);
validRun(suiteId);
validRun(runId);
if (!lifecycleCases.includes(caseId))
  throw new Error("Unknown fixed lifecycle case");
const mode = lifecycleModes[caseId];
const root = `/tmp/booking-lifecycle-${suiteId}`;
const args = workerArguments({
  name: `forecode-booking-${runId}`,
  runId,
  image,
  source: `${root}/source`,
  bridge: `${root}/bridge`,
  script: "lifecycle-worker.mjs",
  mode,
});
const cancellation = new AbortController();
let receivedSignal = null;
const onInt = () => {
  receivedSignal = "SIGINT";
  cancellation.abort();
};
const onTerm = () => {
  // The deadline case deliberately requires TERM-to-KILL escalation. It cannot
  // race its own cleanup against recovery after the parent kills this driver.
  if (caseId === "timeout") return;
  receivedSignal = "SIGTERM";
  cancellation.abort();
};
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
await registerController(runId, "lifecycle-driver");
let result;
try {
  const p = await command("docker", args, {
    milliseconds: 8000,
    maxBytes: 4096,
    signal: cancellation.signal,
  });
  result = {
    schemaVersion: "booking-lifecycle-driver.v1",
    runId,
    receivedSignal,
    worker: processSummary(p),
  };
} finally {
  // Do not terminate this controller from its own cleanup path.
  await recoverOwned(runId, { skipController: true });
  await unregisterController(runId);
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
}
process.stdout.write(JSON.stringify(result));
