// Common public affordances for BOTH arms. No private feedback or solution.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeSource } from "./team-source-write.mjs";
export const orientation = `Public workflow v3 (identical in both arms):
The complete task envelope is already in this prompt. Its task is nested inside the prompt string in /run/forecode-task.json.
Run node /run/team-workflow.mjs task to print the parsed public task and adapter contract once.
Node, bash, rg, and the readonly /toolchain/node_modules exist; Python and a shell apply_patch executable do not.
Construct the required src/server/team-benchmark.ts exported factory and domain/http interface within the first four provider requests, then implement behavior incrementally. Keep a working interface; do not delete it to start a partial rewrite. No solution stub is supplied.
For ALL source edits use atomic whole-file writes, not shell redirection, rm, partial appends or shell apply_patch. Use node /run/team-workflow.mjs write <<'FORECODE_JSON'
${JSON.stringify({ path: "src/example.ts", expectedSha256: null, content: 'export const example = "text";\n' })}
FORECODE_JSON
Use null only for a new file; for replacement use its current SHA256. Send complete file content as JSON. Encode control bytes in JSON; never embed raw NUL in a shell command. Literal source backslashes must be JSON escaped. A rejected write leaves the previous file intact.
Every safe write returns a digest and a cheap adapter/cookie check. Run node /run/team-public-checks.mjs --quick for cheap public feedback, or node /run/team-public-checks.mjs for compilation, build and session checks in disposable writable scratch.
Do not invoke tsc/build directly in the readonly workspace. At the next completed shell command after four admitted provider requests, an early interface milestone runs. Full checks begin at a completed shell command after the repair checkpoint (12 admitted provider requests or 240 seconds remaining); unchanged source reuses cached results. Request counts are provider requests, not shell commands. Reserve the final three requests for repairs, validation and submission. The last admitted request has tools disabled for your final response, inside the existing ceiling; it is never extended. A final response must disclose unfinished work and does not establish readiness or correctness.
Final source archival, public readiness, native exit, and protected correctness are separate. Failed checks block readiness. Public PASS cannot establish protected correctness.`;
export function progress() {
  try {
    return JSON.parse(readFileSync("/tmp/forecode-progress.json", "utf8"));
  } catch {
    return { admittedRequests: 0, maxRequests: 0, deadline: 0 };
  }
}
export function reportStop(code) {
  if (
    [
      "request-count",
      "iteration-count",
      "token-capacity",
      "money-capacity",
      "token-and-money-capacity",
      "deadline-or-request-bytes",
    ].includes(code)
  )
    console.log(
      `LOCAL_BROKER_STOP ${code}; native failure is retained; no retry or extra request`,
    );
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
  if (p.maxRequests - p.admittedRequests <= (p.completionReserveRequests ?? 3))
    console.log(
      "PUBLIC_COMPLETION_RESERVE repair, validate, submit; final admitted response has no tools; no extra allowance",
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
          JSON.stringify(
            writeSource(
              Buffer.concat(chunks).toString("utf8"),
              "/workspace/src",
              (value) => {
                if (value.path !== "src/server/team-benchmark.ts") return;
                const staging = mkdtempSync("/work/proposed-adapter-");
                try {
                  writeFileSync(`${staging}/adapter.ts`, value.content, {
                    flag: "wx",
                    mode: 0o600,
                  });
                  const remaining = progress().deadline * 1000 - Date.now();
                  if (remaining < 1) throw new Error("SOURCE_WRITE_DEADLINE");
                  const result = spawnSync(
                    "/usr/local/bin/node",
                    [
                      "/run/team-public-checks.mjs",
                      "--interface-only",
                      "--proposed-adapter",
                      `${staging}/adapter.ts`,
                    ],
                    {
                      timeout: Math.min(20000, remaining),
                      maxBuffer: 65536,
                      env: {
                        PATH: "/usr/local/bin:/usr/bin:/bin",
                        FORECODE_DEADLINE: String(progress().deadline),
                        NEXT_TELEMETRY_DISABLED: "1",
                      },
                    },
                  );
                  const output = result.stdout?.toString() ?? "";
                  if (
                    result.error ||
                    result.signal ||
                    result.status !== 0 ||
                    !output.includes("PUBLIC_READINESS INTERFACE_ONLY")
                  ) {
                    console.log(
                      "SOURCE_WRITE_BLOCKED public adapter interface; previous file preserved",
                    );
                    process.stdout.write(result.stdout ?? "");
                    process.stderr.write(result.stderr ?? "");
                    throw new Error("SOURCE_WRITE_INTERFACE");
                  }
                  if (Date.now() >= progress().deadline * 1000)
                    throw new Error("SOURCE_WRITE_DEADLINE");
                } finally {
                  rmSync(staging, { recursive: true, force: true });
                }
              },
            ),
          ),
      );
      // A failed quick check does not undo or mislabel a successfully saved file.
      process.exitCode = check(true);
    } else if (command === "checkpoint") {
      const p = progress();
      if (p.admittedRequests >= Math.min(4, Math.max(1, p.maxRequests - 3))) {
        const digest = sourceDigest();
        let previous;
        try {
          previous = JSON.parse(
            readFileSync("/tmp/forecode-interface-checkpoint.json", "utf8"),
          );
        } catch {
          /* absent */
        }
        if (previous?.digest !== digest) {
          const result = spawnSync(
            "/usr/local/bin/node",
            ["/run/team-public-checks.mjs", "--interface-only"],
            {
              stdio: "inherit",
              timeout: Math.max(
                1,
                Math.min(20000, p.deadline * 1000 - Date.now()),
              ),
              env: {
                PATH: "/usr/local/bin:/usr/bin:/bin",
                FORECODE_DEADLINE: String(p.deadline),
                NEXT_TELEMETRY_DISABLED: "1",
              },
            },
          );
          const status =
            result.error || result.signal ? 124 : (result.status ?? 124);
          writeFileSync(
            "/tmp/forecode-interface-checkpoint.json",
            JSON.stringify({ digest, status }),
          );
          console.log(
            `PUBLIC_INTERFACE_MILESTONE ${status === 0 ? "PASS" : "BLOCKED"} requestsRemaining=${Math.max(0, p.maxRequests - p.admittedRequests)}`,
          );
        }
      }
      if (
        p.maxRequests - p.admittedRequests <=
        (p.completionReserveRequests ?? 3)
      )
        console.log(
          "PUBLIC_COMPLETION_RESERVE repair, validate, submit; final admitted response has no tools; no extra allowance",
        );
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
  } catch (error) {
    if (error?.sourceCommitted)
      console.error(
        "SOURCE_COMMITTED storage or cleanup failed after replacement; inspect the current file before another write",
      );
    console.error(
      "PUBLIC_WORKFLOW_FAILED; validation rejection preserves the previous source; SOURCE_COMMITTED means replacement occurred before a storage or cleanup failure.",
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
      completionReserveRequests: input.completionReserveRequests,
    }),
    { mode: 0o600 },
  );
}
