// TEST ONLY. Harmless fixed controls; never a coding agent or provider client.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const mode = process.argv[2];
if (["booking-pass", "booking-reject"].includes(mode)) {
  const file = "/workspace/src/server/booking-service.ts";
  const original = readFileSync(file, "utf8");
  if (mode === "booking-reject") {
    const guard = "if (!row || row.ownerId !== viewerId)";
    if (!original.includes(guard)) process.exit(11);
    writeFileSync(file, original.replaceAll(guard, "if (!row)"));
  } else
    writeFileSync(file, original + "\n// HARMLESS DISPOSABLE GRADER CONTROL\n");
  process.exit(0);
}
appendFileSync("/workspace/src/main.ts", "\n// harmless disposable control\n");
if (mode === "fail") process.exit(7);
if (mode === "flood") {
  setInterval(() => process.stdout.write("x".repeat(8192)), 1);
} else if (["detached", "root-detached"].includes(mode)) {
  const child = spawn(
    process.execPath,
    [
      "-e",
      'const fs=require("fs");setInterval(()=>fs.writeFileSync("/workspace/src/heartbeat.ts",String(Date.now())),25);',
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  setTimeout(() => process.exit(0), 800);
} else if (["hang", "signals"].includes(mode)) {
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  setInterval(
    () => writeFileSync("/workspace/src/heartbeat.ts", String(Date.now())),
    25,
  );
} else if (mode === "boundary") {
  let denied = 0;
  for (const file of [
    "/workspace/package.json",
    "/opt/forecode-agent/state.json",
    "/var/run/docker.sock",
    "/run/forecode-task.json",
  ])
    try {
      writeFileSync(file, "inert forbidden write");
    } catch {
      denied++;
    }
  if (denied !== 4) process.exit(9);
} else process.exit(0);
