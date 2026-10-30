// Explicit harmless team maintenance control. No model or assertion oracle.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { connect } from "node:net";

assert.equal(process.getuid(), 1000);
assert.match(readFileSync("/proc/self/status", "utf8"), /^CapEff:\s+0+$/m);
for (const file of [
  "/opt/forecode-booking/future/oracle.mjs",
  "/opt/forecode-booking/future/manifest.json",
  "/root/.ssh/id_rsa",
  "/home/agent/.codex/auth.json",
  "/var/run/docker.sock",
  "/run/secrets/FORECODE_META_API_KEY",
])
  assert.throws(() => readFileSync(file));
for (const file of [
  "/workspace/package.json",
  "/run/forecode-task.json",
  "/opt/forecode-agent/state.json",
  "/etc/forecode-inert-control",
])
  assert.throws(() => writeFileSync(file, "inert forbidden write"));
appendFileSync("/workspace/src/main.ts", "\n// permitted inert source write\n");
await new Promise((resolve, reject) => {
  const socket = connect({ host: "1.1.1.1", port: 443 });
  socket.setTimeout(1000);
  socket.on("connect", () => {
    socket.destroy();
    reject(new Error("Unexpected worker egress"));
  });
  socket.on("error", () => resolve());
  socket.on("timeout", () => {
    socket.destroy();
    reject(new Error("Worker route denial was not observed"));
  });
});
process.stdout.write(
  "INERT_TEAM_FILE_CREDENTIAL_SOCKET_AND_NETWORK_DENIALS_PASSED\n",
);
