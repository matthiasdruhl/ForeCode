// Common public affordances for BOTH arms. No private feedback or solution.
import { readFileSync, writeFileSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeSource } from "./team-source-write.mjs";
export const orientation = `Public workflow v2 (identical in both arms):
The complete task envelope is already in this prompt. Its task is nested inside the prompt string in /run/forecode-task.json.
Run node /run/team-workflow.mjs task to print the parsed public task and adapter contract once.
Node, bash, rg, and the readonly /toolchain/node_modules exist; Python and a shell apply_patch executable do not.
Construct the required src/server/team-benchmark.ts interface early, then implement behavior. No solution stub is supplied.
For reliable atomic writes use node /run/team-workflow.mjs write <<'FORECODE_JSON'
${JSON.stringify({ path: "src/example.ts", expectedSha256: null, content: 'export const example = "text";\n' })}
FORECODE_JSON
Use null only for a new file; for replacement use its current SHA256. Send complete file content as JSON. Encode control bytes in JSON; never embed raw NUL in a shell command. Literal source backslashes must be JSON escaped. A rejected write leaves the previous file intact.
Every safe write returns a digest and a cheap adapter/cookie check. Run node /run/team-public-checks.mjs --quick for cheap public feedback, or node /run/team-public-checks.mjs for compilation, build and session checks in disposable writable scratch.
Do not invoke tsc/build directly in the readonly workspace. Shell exits automatically check at the repair checkpoint (12 admitted provider requests or 240 seconds remaining), while requests remain; subsequent source changes are rechecked. Request counts are provider requests, not shell commands. Keep calls for repairs within the existing ceiling; it is never extended.
Final source archival, public readiness, native exit, and protected correctness are separate. Failed checks block readiness. Public PASS cannot establish protected correctness.`;
export function progress() {
  try {
    return JSON.parse(readFileSync("/tmp/forecode-progress.json", "utf8"));
  } catch {
    return { admittedRequests: 0, maxRequests: 0, deadline: 0 };
  }
}
function sourceDigest(root = "/workspace/src") {
  const hash = createHash("sha256");
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = `${dir}/${name}`;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("SOURCE_ALIAS");
      hash.update(file);
      if (stat.isDirectory()) visit(file);
      else hash.update(readFileSync(file));
    }
  }
  visit(root);
  return hash.digest("hex");
}
export function check(quick = false) {
  const p = progress();
  const remaining = Math.max(0, p.deadline * 1000 - Date.now());
  console.log(
    `PUBLIC_ALLOWANCE requestsRemaining=${Math.max(0, p.maxRequests - p.admittedRequests)} millisecondsRemaining=${remaining}`,
  );
  if (remaining < 1000) {
    console.log("PUBLIC_READINESS NOT_CHECKED deadline");
    return 124;
  }
  const result = spawnSync(
    "/usr/local/bin/node",
    ["/run/team-public-checks.mjs", ...(quick ? ["--quick"] : [])],
    {
      stdio: "inherit",
      timeout: Math.min(180_000, remaining),
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        FORECODE_DEADLINE: String(p.deadline),
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  return result.error || result.signal ? 124 : (result.status ?? 124);
}
if (process.argv[1]?.endsWith("/team-workflow.mjs")) {
  try {
    const command = process.argv[2];
    if (command === "task") {
      const task = JSON.parse(readFileSync("/run/forecode-task.json", "utf8"));
      console.log(JSON.stringify(JSON.parse(task.prompt), null, 2));
    } else if (command === "write") {
      // Bounded read including JSON overhead; no partial/append mode.
      const chunks = [];
      let size = 0;
      for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 8_000_000) throw new Error("SOURCE_WRITE_TOO_LARGE");
        chunks.push(chunk);
      }
      if (Date.now() >= progress().deadline * 1000)
        throw new Error("SOURCE_WRITE_DEADLINE");
      console.log(
        "SOURCE_WRITE " +
          JSON.stringify(writeSource(Buffer.concat(chunks).toString("utf8"))),
      );
      // A failed quick check does not undo or mislabel a successfully saved file.
      process.exitCode = check(true);
    } else if (command === "checkpoint") {
      const p = progress();
      if (
        p.admittedRequests >= Math.min(12, Math.max(1, p.maxRequests - 3)) ||
        p.deadline * 1000 - Date.now() <= 240_000
      ) {
        const digest = sourceDigest();
        let cached;
        try {
          cached = JSON.parse(
            readFileSync("/tmp/forecode-checkpoint.json", "utf8"),
          );
        } catch {
          /* absent */
        }
        if (cached?.digest === digest)
          console.log(
            `PUBLIC_CHECKPOINT cached=${cached.status === 0 ? "READY" : "BLOCKED"} requestsRemaining=${Math.max(0, p.maxRequests - p.admittedRequests)}`,
          );
        else {
          const status = check(false);
          writeFileSync(
            "/tmp/forecode-checkpoint.json",
            JSON.stringify({ digest, status }),
          );
          process.exitCode = status;
        }
      }
    } else if (command === "quick") process.exitCode = check(true);
    else if (command === "check") process.exitCode = check(false);
    else throw new Error("PUBLIC_WORKFLOW_COMMAND_REQUIRED");
  } catch {
    console.error(
      "PUBLIC_WORKFLOW_FAILED (invalid input, conflict, path, bound or deadline); previous source is preserved on rejected writes.",
    );
    process.exitCode = 1;
  }
}
export function updateProgress(input, admittedRequests) {
  writeFileSync(
    "/tmp/forecode-progress.json",
    JSON.stringify({
      admittedRequests,
      maxRequests: input.maxRequests,
      deadline: input.deadline,
    }),
    { mode: 0o600 },
  );
}
