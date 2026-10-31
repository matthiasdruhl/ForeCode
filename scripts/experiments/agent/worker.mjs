// Runs INSIDE the confined worker. This bridge has no credentials or authority.
import { createServer, request } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

let input;
try {
  input = JSON.parse(readFileSync("/run/forecode-task.json", "utf8"));
  if (
    !["gpt-5.6-sol", "muse-spark-1.3", "muse-spark-1.3-contributor"].includes(
      input.model,
    )
  )
    process.exit(125);
  if (
    !Number.isSafeInteger(input.tokenLimit) ||
    input.tokenLimit < 1 ||
    input.tokenLimit >
      (["muse-spark-1.3", "muse-spark-1.3-contributor"].includes(input.model)
        ? 1000000
        : 100000)
  )
    process.exit(125);
  for (const [file, expected] of [
    ["/usr/local/bin/codex", input.codexBinarySha256],
    ["/usr/local/bin/node", input.workerNodeSha256],
    ["/home/agent/.codex/config.toml", input.agentConfigSha256],
  ])
    if (
      createHash("sha256").update(readFileSync(file)).digest("hex") !== expected
    )
      process.exit(125);
} catch {
  process.exit(125);
}
// Opt-in team affordances; smoke tasks and their native environment are unchanged.
const workflow =
  input.teamWorkflow === "public-v2"
    ? await import("/run/team-workflow.mjs")
    : null;
let admittedRequests = 0;
workflow?.updateProgress(input, admittedRequests);
const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/responses") {
    res.writeHead(403).end();
    return;
  }
  const upstream = request(
    {
      socketPath: "/run/forecode-gateway/gateway.sock",
      path: "/v1/responses",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": req.headers["content-length"] ?? "-1",
      },
    },
    (reply) => {
      if (reply.statusCode === 200)
        workflow?.updateProgress(input, ++admittedRequests);
      res.writeHead(reply.statusCode ?? 502, {
        "content-type": reply.headers["content-type"] ?? "application/json",
      });
      reply.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
server.listen(8787, "127.0.0.1", () => {
  const args = [
    "exec",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--skip-git-repo-check",
    "--model",
    input.model,
    "--sandbox",
    // Docker enforces UID1000, network-none, read-only root and src-only writes.
    // Its cap/seccomp policy intentionally prevents a second bwrap namespace.
    // This flag applies only INSIDE that independently supervised worker.
    "danger-full-access",
    "-C",
    "/workspace",
    "-c",
    'model_provider="forecode_budget"',
    "-c",
    'model_providers.forecode_budget.name="Bounded booking provider"',
    "-c",
    'model_providers.forecode_budget.base_url="http://127.0.0.1:8787/v1"',
    "-c",
    'model_providers.forecode_budget.wire_api="responses"',
    "-c",
    "model_providers.forecode_budget.requires_openai_auth=false",
    "-c",
    "model_providers.forecode_budget.supports_websockets=false",
    "-c",
    "model_providers.forecode_budget.request_max_retries=0",
    "-c",
    "model_providers.forecode_budget.stream_max_retries=0",
    "-c",
    'approval_policy="never"',
    "-c",
    // Keep the native guard finite and aligned with the exact reviewed task;
    // never inherit an unrelated operator-home experimental rollout budget.
    `features.rollout_budget={enabled=true,limit_tokens=${input.tokenLimit},reminder_at_remaining_tokens=[],sampling_token_weight=1.0,prefill_token_weight=1.0}`,
    "-c",
    'web_search="disabled"',
    "-c",
    // Above the largest reviewed 1M-token reservation ceiling: no hidden
    // compact/history request outside the finite stateless Responses protocol.
    "model_auto_compact_token_limit=2000000",
    workflow ? input.prompt + "\n\n" + workflow.orientation : input.prompt,
  ];
  if (["muse-spark-1.3", "muse-spark-1.3-contributor"].includes(input.model))
    args.splice(
      args.length - 1,
      0,
      "-c",
      "model_context_window=1048576",
      "-c",
      'model_reasoning_effort="high"',
      "-c",
      'model_reasoning_summary="auto"',
    );
  const child = spawn("/usr/local/bin/codex", args, {
    shell: false,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: "/home/agent",
      CODEX_HOME: "/home/agent/.codex",
      LANG: "C.UTF-8",
      ...(workflow ? { BASH_ENV: "/run/team-shell-hook.sh" } : {}),
    },
  });
  child.on("error", () => {
    process.exitCode = 125;
    server.close();
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 125;
    server.close();
  });
});
