// Fixed harmless programs only. No candidate, evaluator, provider or shell input.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
const mode = process.argv[2];
if (mode === "inspect") {
  process.stdout.write(readFileSync("/work/heartbeat.json"));
} else if (mode === "complete") process.stdout.write("fixed-normal-exit\n");
else if (mode === "fail") process.exitCode = 7;
else if (["hang", "flood", "detached", "descendant"].includes(mode)) {
  process.on("SIGTERM", () => {});
  // A fail-safe remains finite even if the outer controller disappears.
  setTimeout(() => process.exit(124), 30_000);
  if (mode === "detached") {
    const child = spawn(
      process.execPath,
      ["/bridge/lifecycle-worker.mjs", "descendant"],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    setInterval(() => {}, 100);
  } else if (mode === "descendant" || mode === "hang") {
    let beats = 0,
      denied = 0;
    const tick = () => {
      try {
        writeFileSync("/source/export-marker", "UNEXPECTED-MUTATION", {
          flag: "a",
        });
      } catch {
        denied++;
      }
      writeFileSync(
        "/work/heartbeat.pending",
        JSON.stringify({ beats: ++beats, denied }),
      );
      renameSync("/work/heartbeat.pending", "/work/heartbeat.json");
    };
    tick();
    setInterval(tick, 40);
  } else setInterval(() => process.stdout.write("x".repeat(4096)), 1);
} else throw new Error("Unknown fixed lifecycle worker mode");
