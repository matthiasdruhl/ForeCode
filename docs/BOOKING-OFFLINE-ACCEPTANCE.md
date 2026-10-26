# No-inference booking acceptance and sandbox-owner handoff

Status: implementation and synthetic development validation only. **Observed booking runtime acceptance: NOT_RUN.** The existing private report does not authorize installing this bridge or establish its current implementation-bound containment/lifecycle behavior. Nothing here takes over sandbox configuration. Preserve `codex-1`, existing environments, network policy, forwarding and private tools/keys/receipts.

## Separate capability and review

`npm run acceptance:booking -- --config /absolute/private/offline.json` validates a strict `booking-offline-operator.v1` record and prints NOT_RUN without invoking sbx. Copy `scripts/experiments/isolation/offline.example.json` privately and leave `enabled=false`. Execution additionally requires `acceptanceEnabled=true` and `--execute`. There are no source-path, shell, prompt, model, provider, upload or arbitrary task parameters. CLI runtime imports are checked structurally for paths to paid/agent transport; production always constructs the fixed sbx-offline adapter. Synthetic adapters are accessible only in development tests.

The separate `booking-offline-isolation-review.v1` schema requires the exact scope `fixed-booking-grader-acceptance-no-inference`, reviewed/expiry timestamps within 24 hours, configuration/implementation/inventory SHA-256, and one independently reviewed bounded observation file for each `offlineObligations` value in `offline-config.ts`. Required observations cover owner authority/exclusive lease, sanitized workspace, actual host read/write denials, credentials/SSH/socket denials, disabled host integrations, offline grading, finite resources, termination/non-resumption, oracle/result custody, this booking worker boundary and patched image/trust store. Missing/stale/changed/mismatched records fail closed **before guest execution**. File digest/owner/mode checks supplement the independently reviewed custody; an issuer or hash alone is not authentication.

The offline schema deliberately has no provider budget, authorized model or agent sandbox fields. Do not invent paid-run evidence for it. The original full review still requires restricted inference egress, provider hard spending enforcement and exact task/model/budget authorization; the real agent adapter is additionally hard-disabled in code.

Use exported `offlineConfigurationDigest(config)` for the review's configuration pin (only acceptance enable and review path/hash are excluded); use `freezeBooking().evaluatorSha256` for implementation. Inventory is the exact canonical JSON returned by the offline adapter's admission probes. The owner must establish it in an exclusively coordinated installation session, using the fixed inventory sequence in `offline-sbx.ts`: host sbx digest/version, stopped VM identity/image/mounts/auth/CPU/memory, effective policy and integrations, `runtime-files.py grader REVIEWED_NODE_SHA256`, and `docker image inspect` of the pinned worker image. Inventory omits volatile state/session counts but checks them. It includes installed file/native loader/executable hashes and reviewed VM limits. Review the observed inventory privately and bind `jsonDigest(inventory)`; do not substitute an infrastructure PASS JSON. This first inventory/review is an owner responsibility; the product command does not bypass review to bootstrap itself.

All controller invocations and private operator tools must coordinate on the same canonical, operator-owned mode-0700 `coordinationRoot`. Both run types and explicit old inventory inspection use its `.booking-run.lock`. Choose separate mode-0700 protected/scratch roots outside ForeCode, the planning tree and each other. A review/evidence file cannot be in scratch. Keep configuration mode 0600. On a retained lock, first establish which operator owns the run and whether guest controllers/workers are terminated; only the owner may archive/recover it. Never infer guest termination from a dead host PID.

## Trusted installation bundle

Preparation is safe without guest admission:

```sh
npm run bundle:booking -- --output /new/absolute/private/booking-runtime-bundle
```

`manifest.json` pins every included byte and the implementation/fixture/public-suite/policy hashes. It contains only ten trusted runtime/controller/bridge/probe files, the tooling Dockerfile/package/lock/deny-by-default `.dockerignore`, and the read-only inventory helper. It contains no application/fixture/candidate source, private config, artifacts or keys. Build/image and installed-runtime fields remain **null / NOT_INSTALLED** until actual owner work supplies evidence. Regenerate into a new directory after any implementation change; do not edit the bundle to make a pin pass.

Owner-only recipe, **not executed by this slice**. Installed CLI help was inspected for sbx exec/cp/stop and Docker build/create/cp/image inspect/save/load; review guest Docker help as well. Choose an exclusive maintenance window and review the exact bundle before any guest mutation.

1. Build from **only** `BUNDLE/toolchain`, with the pinned base/lock and lifecycle scripts disabled:

   ```sh
   docker build --iidfile /absolute/private/booking-image.id -t forecode-booking-toolchain:reviewed /absolute/private/booking-runtime-bundle/toolchain
   docker image inspect forecode-booking-toolchain:reviewed
   docker image save -o /absolute/private/booking-image.tar forecode-booking-toolchain:reviewed
   ```

   Read-only image inspection in this slice identified the reused base as Linux/arm64, `NODE_VERSION=22.23.4`; the ForeCode host application uses Node 24. The fixture has no conflicting Node engine requirement, and runtime pins remain separate from host tooling. Actual bridge compatibility remains untested. Retain command exits, architecture, actual immutable image ID/repository digest, base digest, archive digest, resolved package lock and installed dependency-tree digest privately. A locally built/saved image may have **no repository digest**. Configure its actual `sha256:IMAGE_ID`; the adapter also supports a real `forecode-booking-toolchain@sha256:REPOSITORY_DIGEST`. Never invent a digest/name association or use a tag as an identity. No candidate enters the build context or host dependency resolver.

2. With owner authority and reviewed existing outer containment, copy/load that archive **only into `forecode-grader`**. Example fixed operations (replace only private paths with the reviewed ones):

   ```sh
   sbx cp /absolute/private/booking-image.tar forecode-grader:/tmp/forecode-booking-reviewed-image.tar
   sbx exec forecode-grader docker image load -i /tmp/forecode-booking-reviewed-image.tar
   sbx exec forecode-grader docker image inspect sha256:ACTUAL_IMAGE_ID
   ```

   Keep grader egress denied; do not open it for npm. Derive `/opt/forecode-booking/bin/node`, `node_modules`, `package.json` and `package-lock.json` from this **same loaded image**, using `docker create --network none --entrypoint /bin/true` and `docker cp` from `/usr/local/bin/node` and `/toolchain/…` in an owner-named staging container. Do not start that staging container or run a new dependency install. Refuse an existing `/opt/forecode-booking` target until its owner has reviewed migration; do not overwrite another environment. Remove only the staging container you created.

3. Provision `BUNDLE/controller` under `/opt/forecode-booking/controller`, not into `forecode-experiments` or any candidate workspace. Directories must be traversable (0755) and trusted files readable (0644), owned outside worker UID 65534; no worker-writable tooling. The root **package.json** must be the bundled tooling package: its `type=module` establishes ESM/top-level-await and tsx/TypeScript resolution from the parent node_modules. Hashing a lock alone does not prove installed modules. The Dockerfile normalizes package metadata permissions because the host bundle is read-only.

4. Validate copied Node's native library compatibility **in the guest**, its exact executable/version, tsx loader and TypeScript import, Next native bindings and installed Docker/Python/ldd. `runtime-files.py grader REVIEWED_NODE_SHA256` hashes the actual Node dynamic-loader dependency closure, executables, lock, ESM scope, full dependency tree and each installed controller byte. If copying Node is incompatible with the existing guest libraries, stop and review the narrow tooling recipe with the owner; do not install on the host or change the VM globally as a fallback. Record the complete installed inventory plus image inspect result, not just a wrapper/lock hash. Run the helper with trusted Python in the guest; it emits hashes, not contents. Without the optional independently reviewed Node digest, it performs hash-only inventory and omits native-loader inspection. With that pin it checks Node bytes before invoking ldd. Traversal, bytes, file sizes and inventory duration are bounded.

5. Independently review actual effective deny-all grader policy, no model auth, empty MCP catalog, SSH/browser disabled, mountlessness, patched image provenance and denied host/credential/socket paths using **synthetic sentinels**. Establish finite **enforced VM disk and process limits** in addition to the observed 2 CPUs/4 GB and worker caps. Free disk space is not a disk quota. The example's disk/process numbers are placeholders, not observed enforcement. Configuration changes remain the sandbox owner's responsibility.

6. Review forced failures of this exact bridge before admitting acceptance: worker startup/RPC failure; wrong/stale run/tree; source changing during capture/grading; forged stdout/report/exit/check records; attempted oracle/report writes; protected Node/controller/dependency tampering; timeout, SIGINT, SIGTERM, output flood; detached harmless descendants; nested workers; failed removal/stop; and stop/restart non-resumption. Use only this fixed controller/worker path and harmless processes, never model inference or arbitrary candidate execution on the host. The fixed source transforms and denial probe are public/reviewed. The application tests provide reproducible deterministic guards; they are not substitutes for private command/exit observations under the actual VM policy. Preserve failing evidence and include the implementation and both relevant runtime identities if observing the future agent VM. **The current acceptance CLI does not prove agent-VM detached-process containment.**

7. Return private authority, fresh bound inventory and independently reviewed evidence files; only then create the private offline review/configuration and run:

   ```sh
   npm run acceptance:booking -- --config /absolute/private/offline.json --execute
   ```

## What the admitted command does

It freezes only the reviewed fixture as data and creates four source envelopes: baseline, distinct final (identity marker), deliberately broken ownership guard, and that regression plus candidate-claimed PASS stdout. It asserts that only baseline equals the baseline tree. No variant is imported, installed, built or executed on the host. Each goes to the protected guest with exact run/tree/evaluator/suite/policy identities; the guest independently decodes and hashes source before running tools.

Each tool/oracle uses a new labelled worker with network none, read-only root/source/bridge, unprivileged UID, no capabilities/escalation, one CPU, 768 MB with no extra swap, 64 PIDs, 256 descriptors, 256 MB work/32 MB temp/16 MB shared-memory tmpfs, and no restart policy. Private work copies are writable for Next/TypeScript; the source mount stays read-only. Native tool resolution uses only the pinned image and dependencies; candidate package scripts are not invoked. RPC startup/replies and output/deadlines are bounded. The independent public domain/HTTP assertions remain outside the worker. Candidate stdout and RPC values are not verdict authority.

The boundary check combines the existing static scan with a fixed worker denial probe for evaluator files, source mutation, synthetic credential locations/environment, Docker/SSH sockets, external/metadata/host-service network attempts. These finite worker probes do not establish complete VM/host isolation; the latter is an admission prerequisite. The guest reports only protected observed exits. Baseline and distinct final must load as scoped VERIFIED; the regression and claimed-success variant must load REJECTED. Missing checks stay `not_run` and normalize to INSUFFICIENT_EVIDENCE; they cannot complete acceptance.

A trusted controller records PID plus Linux birth identity. Recovery terminates that exact controller, removes only exact run-labelled nested workers, checks absence, stops/restarts the grader, checks no worker was removed after restart, and confirms stopped state. No run can publish until cleanup and host candidate/implementation freshness checks pass. Interruption or cleanup failure retains the shared lease for owner recovery; the runner never deletes a VM or stops the agent VM. It cannot prove safe future guest-sudo agent supervision, so that path remains unavailable.

Private output: `protectedRoot/ACCEPTANCE_UUID/acceptance.json`; per-scenario `protectedRoot/RUN_UUID/{candidate/,grader-observed.txt,checks/,evaluation.json,allowlist-entry.json}`. Failed attempts retain observations, exit reasons, timing/output hashes and recovery state. Runtime pins include implementation, image, tooling and limits; configuration/review digests are included in each check artifact. The controller exercises existing publication → protected loading → verdict normalization and never registers entries in hosted server configuration. Do not publish candidate snapshots or raw diagnostics. Unknown tokens/cost/iterations are null.

## Remaining gates

The supplied private report does not contain this installation, owner authority/lease agreement, enforced VM disk/process observations, exact current inventory, or booking-specific lifecycle/custody denials. Those are the exact missing inputs. No accepted runtime review was created or fabricated here, and `--execute` was not run. The local bundle is a reproducible installation input, not installed/runtime evidence. Paid provider authorization/hard caps and supervised agent export remain **additional separate gates**, even after offline acceptance succeeds. No scoped check outcome alone establishes an agent trial, Meta benefit, fair architecture comparison, unseen holdout or completed product certificate.
