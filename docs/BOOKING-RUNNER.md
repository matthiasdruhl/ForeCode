# Local booking runner operator handoff

Status: implemented integration, **real execution disabled by default**. No real coding-agent trial or real offline booking grade was run in this slice. The controller/publication/loader regressions use explicitly labeled synthetic development adapters; they are not containment evidence, measured experiments or certificates. The application remains command-free.

The fixed task is `booking-ownership-refactor-v1`: extract viewer/ownership authorization helpers while preserving current booking service/HTTP behavior. Only `src/` changes are permitted. The independent oracles are the existing **public baseline** domain and HTTP checks. Passing them does not establish refactor quality, unseen-feature correctness, architecture advantage, fairness or Meta benefit. No hidden future holdout exists.

## Existing environment and pending admission

The actual operator report was located at `../.forecode-sandbox-ops/README.md` with `readiness.json`, `verify.py`, `run.py` and `grader.py`. Those private operator files were inspected as infrastructure context; their code, key, receipts and raw diagnostics are not incorporated or published. No sandbox/configuration/global SSH/network setting was changed. `codex-1` was preserved.

Read-only host inspection observed sbx **0.50.0**, dedicated `forecode-experiments` and `forecode-grader`, both stopped, mountless, 2 CPUs/4 GB, image digest `sha256:8b4cd0a46c8b600bc6b6a64af23c03d4c2807fbfc61f47568092a93fb9dc88b0`. This corroborates inventory, not denial proof. Installed help was inspected for sbx exec/cp/inspect/stop/policy/settings/MCP, local Codex exec, and Docker run/exec. Guest Codex help/version/configuration must still be reviewed against the actual pinned guest binary.

The report's PASS observations are not sufficient for this adapter. It explicitly says `ready_for_real_booking_experiments=false` and `provider_billing_hard_cap_verified=false`. Its grader only accepts `solution.mjs`, not this booking app. Required missing evidence is:

1. Installation and negative testing of **this** booking worker, controller and RPC bridge in the offline grader, with exact image/toolchain/controller hashes. Show correct source passing, an ownership mutant failing, wrong/final source selection, and an attempted forged output/oracle/report write unable to grant success. The recipe below has not been built, installed or run.
2. Actual stop/restart/export semantics for this sbx adapter: prove detached agent processes and nested candidate containers cannot resume, alter either final export or survive timeout/cancellation into the next trial. Two equal exports alone do not prove quiescence. Include output limits and cleanup failure controls. Confirm finite guest disk/process limits as well as the observed VM CPU/memory limits.
3. A reviewed, fresh binding of negative host read/write, credential/SSH/socket, host-integration, restricted inference egress, grader network, resource and evaluator-custody observations to the **current VM IDs, images, effective policies, configuration, tool binaries and this implementation**. The existing readiness file has no such complete binding. Review patched image/trust-store provenance. Docker's MCP alias remains reachable in the operator report: an empty host catalog plus disabled guest integrations must be continuously preserved operationally.
4. Explicit authorization for this exact task and `gpt-5.6-sol`, finite token/time/spend limits, and independently observed provider/account hard spending enforcement. Experimental Codex token tracking and a local timer are not billing hard caps. The example's $0.25 is a placeholder, not authorization.

Until all four are complete, leave `enabled=false`, make no paid calls, and use the development tests below. Nothing here authorizes changing the sandbox owner's configuration.

## Reproduce the no-paid-call path

From ForeCode:

```sh
npm run experiment:booking -- --help
npm run experiment:booking -- --config scripts/experiments/isolation/operator.example.json
npx vitest run tests/unit/booking-runner.test.ts
npm run snapshot:booking --silent
npm run check
PLAN_REFERENCE_ROOT=/Users/matthiasdruhl/Projects/Meta-Hackathon/AgentHarness-Planning npm run test:plan
npm run test:e2e
npm run test:fixture-e2e
```

The example validates and prints `NOT_RUN`; it performs no sandbox command. All-zero hashes and example absolute paths are deliberate non-operational placeholders. No synthetic adapter is exposed by the CLI. Tests exercise reviewed baseline modules and harmless fixed host child programs only; candidate files remain inert data on the host.

## Operator configuration and review

The freshly authored local schemas are `scripts/experiments/isolation/config.ts`, separate from the unchanged frozen v1 application contracts. Unknown fields/commands/providers are rejected. Copy the disabled example into an operator-owned private location outside the fixture/application, fill real pins, and keep it mode 0600. Create separate **new**, operator-owned, mode 0700 protected and scratch roots outside ForeCode and outside each other. Resolve canonical paths first (macOS `/var`/`/tmp` aliases need their `/private/...` paths). Do not reuse or mount a broader project tree.

Configuration pins exactly two existing dedicated sandbox names, the sbx executable, image digests, Codex configuration/binary, grader Node/lockfile/dependency-tree hashes, immutable worker image, one model, time/output/token/spend bounds and the reviewed evidence file digest. It accepts no shell text, caller prompt, arbitrary repository or extra agent flags. Neither the model nor a web client can set it.

`booking-isolation-review.v1` requires `reviewedAt`, `expiresAt` (maximum 24-hour window), `configurationSha256`, `inventorySha256`, `implementationSha256`, exact `authorizedTask`, `authorizedModel`, `maxSpendUsd`, and exactly one evidence item per `obligations` entry in the schema. Each item names a private bounded regular evidence file, its SHA-256 and a reviewer description of actual observed commands/exits/denials. A `{passed:true}` record is rejected. Evidence files and the review must be operator-controlled, outside all guest-readable locations; never populate the review just to bypass a gate.

Compute `configurationSha256` with exported `configurationDigest(config)` (it excludes the review path/hash and enable switch to avoid self-reference); `implementationSha256` is the current `snapshot:booking` evaluator hash. That hash now includes the controller, isolation policy, bridge, toolchain recipe/lock and existing receipt/loader/verdict code. Required check IDs and frozen application schemas remain unchanged. The suite hash commits the two public oracles. Actual run/receipt `evaluatorSha256` is the canonical digest of `runtimePins` in `run.json`: implementation hash, worker image, grader Node/lockfile/dependency-tree hashes. This makes a tooling change invalidate evaluation identity as well as runtime admission. Those pins and the configuration/review digests are also committed in each observed check artifact. Any implementation change requires a new review.

After the sandbox owner has provisioned and reviewed the trusted runtime, **explicit inspection only** is available:

```sh
npm run experiment:booking -- --config /absolute/private/operator.json --inspect-runtime
```

This is an operator action, not a task run: it may start the two initially stopped, idle dedicated VMs to hash installed files; it stops them afterward, handles SIGINT/SIGTERM, and creates an exclusive `inventory.json` in the protected root (refuses overwriting). It checks IDs, mounts, CPU/memory, auth separation, policies, disabled SSH/browser, empty MCP catalog, agent config/binary and protected grader runtime bytes. It does not run a candidate or infer containment from inventory. Its canonical digest is the review's `inventorySha256`. Repeated inspections need a newly archived/removed inventory chosen by the operator; the runner never overwrites existing evidence.

## Trusted runtime layout — sandbox owner ticket

New source under `scripts/evaluator/booking-v1/toolchain/` supplies a pinned Node base Dockerfile and separately resolved lockfile. It contains trusted Next/TypeScript/tsx and baseline fixture dependencies; no candidate package script or dependency resolution is used during grading. The dependency-resolution command used here was:

```sh
npm install --package-lock-only --ignore-scripts --workspaces=false --prefix scripts/evaluator/booking-v1/toolchain
```

It does not install a sandbox. The owner must review/build the image from **only that tooling directory**, pin its resulting repository digest as `forecode-booking-toolchain@sha256:...`, and load it into the grader without opening grading egress. No candidate enters the image build context. Derive the protected grader's Node and node_modules from that reviewed image/lock; validate actual installed bytes, not just the lockfile. No automatic provisioning command is supplied that changes the existing VMs.

Required grader paths:

- `/opt/forecode-booking/bin/node`: reviewed pinned Node executable.
- `/opt/forecode-booking/node_modules/`: trusted pinned runtime dependencies, including tsx and TypeScript; never writable/reachable by a worker.
- `/opt/forecode-booking/package-lock.json`: trusted toolchain lock.
- `/opt/forecode-booking/controller/`: only `guest.ts`, `oracle-driver.ts`, `oracle.ts`, `http-oracle.ts`, `remote-oracles.ts`, `worker.mjs`, `client.mjs` from this newly authored implementation. Runtime-only imports are local; type imports are erased.

The agent binary is expected at `/usr/local/bin/codex`, with reviewed configuration `/home/agent/.codex/config.toml`. The owner must inspect actual paths/versions and the complete CLI dependency closure; a wrapper hash alone does not prove its transitive binary. If the actual installation differs, stop and review a narrow adapter change rather than inventing flags or falling back to host execution. The review must cover disabled hooks/plugins/apps/browser/MCP/shared skills/host tools and the approved guest tool permissions.

Inside the grader, the controller decodes only the accepted frozen candidate into a fresh source directory and recomputes its tree hash. Separate worker containers receive **only** that source plus the small non-authoritative worker/client bridge; they receive no oracle, controller, receipt key, result files or Docker socket. Each has network none, read-only root/source/bridge, UID 65534, no capabilities/escalation, one CPU, 768 MB/no extra swap, 64 PIDs, bounded descriptors and tmpfs. Build/typecheck use fixed pinned executable paths. Each oracle runs as a separate protected process, talks to candidate behavior via bounded JSON RPC, and supplies an actual observed exit to the protected controller. Required boundary scanning is a trusted static check, not a sandbox proof. The current fixed memory/time caps may reject a valid large build; preserve that outcome and review a new policy rather than silently increasing limits.

## Execution, evidence and recovery

Only after the missing evidence and explicit authorization are reviewed, update the private review/configuration with real digests and `enabled=true`, then the operator may use:

```sh
npm run experiment:booking -- --config /absolute/private/operator.json --execute
```

Do **not** run that command with the current readiness report. A root-scoped exclusive lock prevents simultaneous use by cooperating controllers; coordinate with the sandbox owner and do not run a separate operator tool concurrently. Admission is checked before task transfer and runtime/configuration/evidence drift is checked before later stages. External policy changes must be prohibited while a trial is active; this is not a continuous host governance monitor.

The execution deadline spans admission through publication; every sbx command is also bounded, and cleanup has an independent 30-second cap. SIGINT/SIGTERM abort work; host child process groups receive TERM then KILL. Cleanup stops both dedicated VMs and must succeed before publication. The controller never removes/reinstalls/reconfigures a VM or touches `codex-1`. If a stop fails, manually establish stopped/terminated state and review private observations before retrying. After an uncatchable host crash/power loss, inspect both VMs and the lock; do not delete a lock until ownership and termination are established.

Only the sanitized standalone fixture is transferred. The candidate export is bounded (100 files, 8 MB decoded, 2 MB/file), rejects traversal/duplicates/noncanonical encoding, binds the run UUID, and keeps configuration/dependencies/visible tests byte-pinned. Two final exports must agree. Candidate bytes are frozen into a new private read-only snapshot and rehashed after grading; evaluator source is also rehashed. Never import, install, build or test those files on the host. Read-only file modes supplement protected custody and hash checks; they are not WORM storage against the operator.

Each attempt preserves a validated run record with stage, observed exits/signals/reasons, output digests, exact identities and elapsed/files-changed metrics. Token/cost/iteration metrics remain null. `repoCommit` records the controller checkout's base commit; the evaluator digest covers current implementation bytes and the final candidate is identified independently by its tree hash. A lifecycle `completed` result does **not** mean checks passed. Nonzero agent exits are retained and do not prevent collecting valid independent evidence. Interrupted runs with no stable candidate receive no receipt. Grader output is bounded and kept privately as `grader-observed.txt`, including malformed/failed reports; it is never evidence authority by itself. Raw agent text is not published.

After successful cleanup/freshness/report validation, the trusted controller writes `checks/`, `evaluation.json` and `allowlist-entry.json` exclusively under the run UUID. It assembles the existing receipt contract. Authentication comes from protected custody, a trusted controller-selected byte digest/identity and the server's fixed allowlist. Hashing or an issuer string alone grants nothing. The operator may provision a reviewed allowlist entry into existing trusted server configuration; there is **no public execution, upload or registration endpoint**. The existing loader rechecks exact bundle/evidence bytes, source/evaluator/suite/policy pins and run bindings before normalizing the verdict. Do not register synthetic test artifacts or serve candidate snapshots.

## Next ready ticket

Sandbox owner: review and provision the protected booking toolchain/bridge layout, then perform a **no-inference offline booking bridge acceptance** in the existing grader: baseline, deliberate ownership mutant, wrong/stale final source, forged report attempt, oracle-write denial, network/credential/socket denial, forced timeout/cancellation and stop/restart non-resumption. Return private command/exit evidence bound to both VM IDs/images/policies and the implementation digest. Keep `enabled=false`. Provider hard-cap verification and exact task/model/budget authorization are separate prerequisites before the first paid trial.
