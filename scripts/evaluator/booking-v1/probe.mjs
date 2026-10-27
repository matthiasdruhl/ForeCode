// Fixed acceptance probe in the untrusted worker's exact namespaces/limits.
// No candidate verdict or output grants authority; the controller observes exit.
import { readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
const denied = async (operation) => {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error("Worker boundary allowed forbidden operation");
};
for (const file of [
  "/opt/forecode-booking/controller/oracle.ts",
  "/opt/forecode-booking/package-lock.json",
  "/root/.codex/auth.json",
  "/home/agent/.codex/auth.json",
  "/var/run/docker.sock",
  "/run/host-services/ssh-auth.sock",
]) {
  await denied(() => readFile(file));
  await denied(() =>
    writeFile(file, "FORECODE-SYNTHETIC-DENIAL-PROBE", { flag: "a" }),
  );
}
await denied(() => writeFile("/source/src/server/booking-service.ts", "probe"));
if (
  Object.keys(process.env).some((k) =>
    /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SSH_AUTH_SOCK)/.test(k),
  )
)
  throw new Error("Credential environment exposed");
for (const socket of [
  "/var/run/docker.sock",
  "/run/host-services/ssh-auth.sock",
]) {
  await denied(
    () =>
      new Promise((resolve, reject) => {
        const s = connect(socket);
        s.setTimeout(1000);
        s.once("connect", () => {
          s.destroy();
          resolve();
        });
        s.once("error", reject);
        s.once("timeout", () => {
          s.destroy();
          reject(new Error("timeout"));
        });
      }),
  );
}
for (const url of [
  "https://example.com",
  "http://169.254.169.254",
  "http://host.docker.internal",
]) {
  await denied(() => fetch(url, { signal: AbortSignal.timeout(1500) }));
}
process.stdout.write(
  "Fixed worker denial probes completed; no host secret values read or emitted.",
);
