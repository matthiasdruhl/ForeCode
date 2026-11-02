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
import { writeSource, sourceFileInput } from "./team-source-write.mjs";
export const orientation = `Public workflow v7 (identical in both arms):
The complete task envelope is already in this prompt. Its task is nested inside the prompt string in /run/forecode-task.json.
Run node /run/team-workflow.mjs task to print the parsed public task and adapter contract once.
Node, bash, rg, and the readonly /toolchain/node_modules exist; Python and a shell apply_patch executable do not.
The readonly /workspace has no node_modules. Bare ESM dependency imports there fail even with NODE_PATH; this is not a missing installation. Use the public checks below for application imports: they copy source into writable scratch and link the installed dependencies. For a dependency-only probe, run Node from /toolchain. Do not spend requests retrying workspace imports or installing dependencies.
Start with one bounded inspection pass: list the source files and read the relevant domain, service, storage and HTTP interfaces together. Reuse what you have read; reopen a file only to resolve a specific implementation question, a checker error or its changed digest. Do not spend successive requests reprinting the task or unchanged source while postponing the first write.
Construct the required src/server/team-benchmark.ts exported factory and domain/http interface within the first four provider requests, then implement behavior incrementally. Keep a working interface; do not delete it to start a partial rewrite. No solution stub is supplied.
After that initial inspection, make the next executable step a small complete source write. Keep each response focused on the next implementation or validation step; do not attempt to plan and emit the entire solution in one response. Split work into complete, coherent file revisions, use the returned digest and public feedback, and continue until the full task is implemented. Early interface success is a checkpoint, not permission to omit behavior or finish without full checks.
For source edits use atomic whole-file writes. Prefer staging literal TypeScript using cat > /tmp/proposal.ts <<'FORECODE_SOURCE', followed by the complete file and FORECODE_SOURCE on its own line. Then run node /run/team-workflow.mjs write-file src/server/team-benchmark.ts /tmp/proposal.ts null. Replace null with the current returned SHA256 when updating an existing source file. Staging under /tmp or /work does not edit saved source. Do not redirect, remove or partially append files under /workspace/src. No shell apply_patch executable exists.
The alternate JSON interface is node /run/team-workflow.mjs write <<'FORECODE_JSON'
${JSON.stringify({ path: "src/example.ts", expectedSha256: null, content: 'export const example = "text";\n' })}
FORECODE_JSON
Use null only for a new file; for replacement use its current SHA256. Send complete file content as JSON. Encode control bytes in JSON; never embed raw NUL in a shell command. Literal source backslashes must be JSON escaped. A rejected write leaves the previous file intact.
On rejection, read the public error, correct the complete file and resubmit using the unchanged previous digest (null if the file still does not exist). SOURCE_WRITE marks a committed file even if the subsequent quick check fails; use that returned digest for repair. A successful interface check establishes only the factory/method shape, not completed task behavior.
Use static imports. Dynamic import(), require, eval, Function and process.getBuiltinModule are forbidden by the public source policy, including dynamic imports of local files. Forbidden host modules and imports outside the source tree are also rejected.
Every safe write returns a digest and cheap source-boundary and adapter/cookie checks. Quick/interface passes do not establish team behavior. Run node /run/team-public-checks.mjs --quick for cheap public feedback, or node /run/team-public-checks.mjs for compilation, build, session and public task behavior checks in disposable writable scratch. Full checks include baseline title validation with no rejected-create ID/state mutation, team permissions, conflicts/cancellation, identity isolation and revocation. They are public examples, not complete protected coverage.
Do not invoke tsc/build directly in the readonly workspace. At the next completed shell command after four admitted provider requests, an early interface milestone runs. Full checks begin at a completed shell command after the repair checkpoint (12 admitted provider requests or 240 seconds remaining); unchanged source reuses cached results. Request counts are provider requests, not shell commands. Reserve the final three requests for repairs, validation and submission. The broker repeats phase-specific wrap-up guidance directly in those model requests even if no shell checkpoint runs. The last admitted request has tools disabled for your final response, inside the existing ceiling; it is never extended. A final response must disclose unfinished work and does not establish readiness or correctness.
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
  // Python's time.time() deadline can contain fractional milliseconds. Node's
  // subprocess timeout requires an integer; round down without extending it.
  const remaining = Math.max(0, Math.floor(p.deadline * 1000 - Date.now()));
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
    } else if (command === "write" || command === "write-file") {
      // Bounded read including JSON overhead; no partial/append mode.
      const chunks = [];
      let size = 0;
      let raw;
      if (command === "write-file") {
        if (process.argv.length !== 6) throw new Error("SOURCE_WRITE_FILE");
        raw = sourceFileInput(...process.argv.slice(3));
      } else {
        for await (const chunk of process.stdin) {
          size += chunk.length;
          if (size > 8_000_000) throw new Error("SOURCE_WRITE_TOO_LARGE");
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString("utf8");
      }
      if (Date.now() >= progress().deadline * 1000)
        throw new Error("SOURCE_WRITE_DEADLINE");
      console.log(
        "SOURCE_WRITE " +
          JSON.stringify(
            writeSource(raw, "/workspace/src", (value) => {
              if (value.path !== "src/server/team-benchmark.ts") return;
              const staging = mkdtempSync("/work/proposed-adapter-");
              try {
                writeFileSync(`${staging}/adapter.ts`, value.content, {
                  flag: "wx",
                  mode: 0o600,
                });
                const remaining = Math.floor(
                  progress().deadline * 1000 - Date.now(),
                );
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
            }),
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
          const remaining = Math.floor(p.deadline * 1000 - Date.now());
          const result =
            remaining > 0
              ? spawnSync(
                  "/usr/local/bin/node",
                  ["/run/team-public-checks.mjs", "--interface-only"],
                  {
                    stdio: "inherit",
                    timeout: Math.min(20000, remaining),
                    env: {
                      PATH: "/usr/local/bin:/usr/bin:/bin",
                      FORECODE_DEADLINE: String(p.deadline),
                      NEXT_TELEMETRY_DISABLED: "1",
                    },
                  },
                )
              : null;
          const status =
            !result || result.error || result.signal
              ? 124
              : (result.status ?? 124);
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
    // Fixed public remediation only: never echo arbitrary exception messages,
    // JSON/source fragments, host paths or storage details here.
    const feedback = {
      SOURCE_WRITE_JSON:
        "Malformed JSON. Encode the complete file as one JSON object; escape source quotes and backslashes.",
      INVALID_SOURCE_WRITE:
        "Expected exactly path, expectedSha256 and content, with a permitted src/ path and bounded complete file.",
      SOURCE_WRITE_CONFLICT:
        "Digest conflict. Read the current source and SHA256, then resubmit the complete file with that digest; null is only for a new file.",
      SOURCE_WRITE_INTERFACE:
        "Adapter rejected. Fix the public checker error above and resubmit a complete createTeamBenchmark export with domain/http methods, using the unchanged previous digest.",
      SOURCE_WRITE_TOO_LARGE:
        "JSON input exceeds the bounded writer allowance. Reduce the submission size.",
      SOURCE_WRITE_FILE:
        "Use write-file src/path.ts /tmp/proposal.ts null-or-current-sha256. Stage a regular UTF-8 file under /tmp or /work; symlinks, hardlinks and files over 2MiB are rejected.",
      SOURCE_WRITE_DEADLINE:
        "The existing coding deadline has expired. No additional write is allowed.",
    };
    if (Object.hasOwn(feedback, error?.message))
      console.error(
        `PUBLIC_WORKFLOW_REJECTION ${error.message}: ${feedback[error.message]}`,
      );
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
