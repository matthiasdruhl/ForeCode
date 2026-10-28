# Trusted booking tooling preparation

Current artifact-h has passed its trusted build/audit/export, actual installed native/module verification and owner-reviewed lifecycle/booking acceptance. The [installed verification follow-up](BOOKING-INSTALLED-VERIFICATION.md) and latest IMPLEMENTATION-LOG record exact current pins, all4 verdicts and stopped-state cleanup. Earlier artifact/slice records below remain historical and immutable.

The tooling build prepares only the pinned four-file context and fixed tooling smokes; owner maintenance/admitted acceptance are separate explicit operations. Current offline coverage uses Next16.4.3 Webpack production build. Real agents and inference remain disabled. Future execution still requires exact current inputs and fresh independent/owner review; previous completion cannot bypass admission.

This slice follows M2.3.1/M2.5.1 in the external [pinned planning reference](https://github.com/matthiasdruhl/AgentHarness-Planning/tree/695e68a40b5f5009c9b06b83a1181e18cd6d0223), especially the booking-first runbook, security boundary and canonical contract. Those documents are read-only design references; their code, schemas, fixtures, tests, workflows and history were not copied. The 49 frozen application contracts and required booking checks remain unchanged.

## Developer-local commands

```sh
npm run toolchain:booking -- --help
npm run toolchain:booking -- --output /new/absolute/private/prepared
npm run toolchain:booking -- --output /new/absolute/private/built --build
npm run toolchain:booking -- --verify /absolute/private/completed-artifact
npm run toolchain:booking -- --preflight /absolute/private/completed-artifact
npm run toolchain:booking -- --preflight /absolute/private/completed-artifact --config /absolute/private/offline.json --inventory /absolute/private/inventory.json
```

Default preparation creates a new private output and a source-bound runtime bundle without calling Docker. Existing outputs, directory aliases, and application/planning-tree outputs are refused. The build command accepts no image, source, repository, shell, model, provider, registry or extra build flags. It never installs candidate dependencies on the host. Unknown flags fail parsing. CI uses explicitly synthetic Docker adapters and has no live Docker, sandbox, credential or paid-call requirement.

The build adapter selects the installed Docker CLI from fixed locations and requires the local Docker Desktop Unix endpoint for `desktop-linux`. It hashes the actual Docker and selected Buildx binaries, rechecks them before commands, records their versions and selects the existing local Docker builder explicitly. It changes no default context, builder settings, sandbox configuration, forwarding or network policy.

## What actually executes

Only the four checked files under `runtime/toolchain/` become the build context: Dockerfile, package.json, package-lock.json and the deny-by-default `.dockerignore`. The recipe still uses the reviewed immutable Node base and existing separate dependency lock. `npm ci --ignore-scripts` runs inside that tooling image build. The build may fetch pinned public npm dependencies; the protected grader's network is never opened. Candidate/application source, controllers, evaluator/oracles, private configuration, environment files and protected results never enter the image build context.

A uniquely named, labelled audit container then runs a fixed trusted tooling program under one CPU, 768 MB/no extra swap, 64 PIDs, 256 descriptors, network none, read-only root, no capabilities/escalation, UID 65534 and 32 MB temporary storage. There are no host binds or sockets. The effective CPU/memory/process/network/root/user/capability policy and stopped exit 0 are inspected, not inferred solely from command flags.

The fixed smoke checks:

- Load the `server-only` package with the reviewed `react-server` condition.
- Use the installed TypeScript compiler on a constant in-memory sample.
- Execute a constant reviewed TypeScript enum through the tsx loader, exercising esbuild rather than relying on native type stripping.
- Load the installed esbuild API and Next's actual platform-native SWC binary; run Next's version command.
- Compare installed root dependency versions with the exact package/lock inputs.
- Hash Node, package/lock, the complete installed dependency tree and native Node loader libraries. Dependency rows use the same compact ASCII JSON/path ordering as the existing protected Python inventory.

These are trusted tooling smoke programs, not booking/candidate execution or a benchmark oracle. They contain no model calls or arbitrary source entrypoint. The image archive itself contains only the public tooling/base dependencies; the controller bundle stays separate and operator-controlled. Neither archive nor bundle goes to the agent workspace.

The adapter verifies and removes only its exact run-labelled audit container, confirms absence, then exports the image by its actual immutable image ID. It never prunes Docker, removes an existing image, resets a builder/VM, or cleans up another operator's resources. A tag is a convenience name, never an identity. Actual repository digests are recorded if present; none are invented.

## Artifacts and meaning

The private output contains:

- `request.json`: immutable input scope, source/context/bundle pins, run UUID and configured bounds.
- `runtime/`: 24 allowlisted trusted tooling/controller/helper inputs plus their manifest. Only its four-file `toolchain/` subdirectory is a build context.
- `image.id`, `build-metadata.json`, `toolchain-image.tar`: actual build/export outputs.
- `command-N.json`: bounded observed command exits, signals, elapsed times and captured output; retain failures privately.
- `toolchain.json`: final build/audit/archive/cleanup observations, installed tooling identities, timestamps, unknown provider metrics as null and explicit limitations.

`--verify` rehashes the archive and exact required runtime/context inputs, checks current implementation identity and metadata bindings, and performs no Docker or image execution. `BOUND_BYTES_VALID` / `NONE_INTEGRITY_ONLY` means integrity of these bindings only. A digest, JSON success value, `driver` label or self-authored descriptor alone does not authenticate provenance, grant isolation review, register hosted evidence or issue a booking receipt. Independent owner review of custody, original observations and actual installed runtime is still required.

Build, audit, export and output bounds are fixed and recorded. Audit-container cleanup uses an independent 30-second budget; failed cleanup prevents a successful artifact. A failed/interrupted builder client does **not** prove that the shared BuildKit backend stopped. Such a run remains failed and grants no artifact admission; preserve its unique tag/label, metadata and diagnostics for operator recovery. Builder disk/PID hard caps and backend cancellation are not established by this preparation evidence. No blanket builder cleanup is attempted. The live acceptance VM's enforced disk/PID limits remain a separate missing admission requirement.

## Observed preparation and next owner action

The implementation log records the actual build/audit/export command exits, image and archive identities, Node/lock/dependency/native identities and artifact location. The first complete run exercised Docker/Engine 29.9.1, Buildx 0.38.0, Node 22.23.4 on Linux/arm64, TypeScript 5.9.3, tsx 4.23.15, esbuild 0.28.2 and native Next 16.4.3 SWC. No candidate fixture was executed or transferred. Current artifact identities are in the final `toolchain.json`; earlier source revisions remain historical.

The sandbox owner must now:

1. Agree on the shared lease and exclusive installation window; independently review the current request, source bundle, observed commands, image ID and archive digest. Use the read-only verifier as an integrity check, not as authority.
2. Load only that reviewed archive into the existing protected `forecode-grader`, keeping grader egress denied and preserving all existing environments. Installation/configuration authority has not transferred to this implementation agent.
3. Derive the protected Node, node_modules, package.json and lock from that same loaded image using an owner-created staging container. Provision only the reviewed controller layout. Preserve executable modes on Node and native/tool binary dependencies (Node must remain executable); controller/package text files may be 0644. Do not recursively remove executable bits from node_modules. Do not install candidate dependencies or copy global native libraries to force guest compatibility. Stop for owner review if the existing guest ABI differs.
4. Collect the actual guest Node/lock/module/controller/native/executable inventory using the existing runtime helper. The image's native-library identities describe the tooling image, not automatically the different guest filesystem. Bind the actual VM IDs/images/policy, custody/denial observations and enforced VM disk/process limits in a fresh offline review for the current implementation hash.
5. Only after admission, run probe-only and then full booking acceptance as described in [the owner handoff](BOOKING-OFFLINE-ACCEPTANCE.md). Keep `enabled=false`; the separately gated supervised agent path requires its own current admission (BOOKING-AGENT-EXECUTION.md). Provider hard caps, exact task/model/budget authorization and supervised agent export remain additional gates.

No hosted execution, upload or registration endpoint was added. No live Meta response, coding-agent experiment, architecture comparison, hidden holdout or completed certificate follows from tooling preparation.

## Installation preflight and current owner inputs — October 27

`--preflight` extends the existing tooling command; it is read-only and has no adapter, lease acquisition, guest start/provisioning, caller command or review-writing operation. It reuses the tooling verifier, installed-file comparison and offline review/admission helpers. Optional configuration/inventory must be protected local files; inventory requires configuration. Conflicting modes/unknown flags fail. Invalid proposed image/Node/lock/module bindings or installed inventory produce `INPUTS_INVALID` and exit 1. Missing owner work produces a successful **report**, `OWNER_ACTION_REQUIRED`, never admission. Malformed/unreadable files fail closed.

The verifier now binds exact `request.json` and `build-metadata.json` bytes in the preparation descriptor, requires the Buildx exported digest to match `image.id`, checks fixed request scope/bounds, current fixture/suite/policy/source manifest, package dependencies and architecture, and rechecks every small runtime input after archive hashing. Protected small/large reads reject changed pathname identities; large artifacts also reject hardlinks and incorrect ownership. Old descriptors lack the new private integrity fields and old implementation pins are stale. Regenerate into a **new** directory; do not modify historical evidence. These developer-local preparation types are separate from the 49 frozen application contracts.

A report includes exact reviewed tooling/controller inputs, configured VM disk/PID values separately from `observedVmEnforcement=null`, all eleven required obligations, specific review-failure codes, missing owner actions and an installation sequence. Even supplied inventory/review records with matching hashes remain `RECORD_BOUND_INTEGRITY_ONLY` / `RECORD_VALID_INTEGRITY_ONLY`: `authority=NONE_INTEGRITY_ONLY`, `installedRuntime=null`, installation `UNKNOWN`, lifecycle/booking/inference `NOT_RUN`, real agents `DISABLED`. It cannot authenticate its own issuer, grant independent review or replace live acceptance admission. Guest ABI/native/module smokes and actual enforcement remain owner observations.

Current private, newly built inputs:

- Artifact: `/private/tmp/forecode-toolchain-preflight-20261027-final`; interval `2026-10-27T05:00:40.111Z`–`2026-10-27T05:00:50.321Z`.
- Implementation: `dc4a1b4c4f92b8b3f3913c390ee278f07b736a2f35569f68dc1d07e89860d524`.
- Request bytes: `112d6f8fa6992f72590bac0c615196382d5c18cc1f52bc7cde1f621e4c6cc335`; runtime manifest bytes: `4e62384aaa298bd6167a1d4630117ace6ba6098931e95cd35af85f47c93c70b9`; build metadata bytes: `24b540bd26467cb09d744441a425d0d039ed8cd2a65e40dc82f00cceaad834d5`.
- Image: `sha256:81e96e2375096d963d00feffa5f4f42d44a616f5d99301b1d83539b9f70149fa`, Linux/arm64.
- Archive: `toolchain-image.tar`, 312,671,744 bytes, SHA-256 `bc2a0aa3364dcb935af2ae018a9b8d57d11110d4d97cb71094ad5799faf81bb9`.
- Observed Node 22.23.4: `7e48183361053f039294fbbc3ba586722fe756bf296d6cb8195356d10819cd16`; lock: `ad9d4ffee11e08db78b6d4dad793b29e4448e36c19c43041896ab57d6990dc00`; modules: `59c8002d3a4201f7445aef527b87ab4c5dbce651694bee4138866ad613244d8c`.
- Actual read-only report: `/private/tmp/forecode-installation-preflight-20261027-final.json`, `OWNER_ACTION_REQUIRED`; no private offline configuration/review/inventory was supplied or authored.

The previous `...-release` artifact passed the original verifier before edits. It is retained unchanged, is now historical, and cannot admit this implementation. The intermediate `...-b` successful build is likewise stale after final inventory/path fixes. No old evidence was rewritten.

### Owner-only concrete installation sequence

First independently authorize this exact installation, review source/observations/custody and existing outer containment, and reserve an exclusive maintenance window through the **same canonical coordinationRoot and `.booking-run.lock` protocol** as every controller. Preflight itself never acquires/recovers this lock. Do not run concurrently with the private launcher. On any existing lease or `/opt/forecode-booking`, stop for its owner's review; never recover/overwrite by assumption.

Only after that authority, the owner may use the existing handoff's `sbx cp` / `docker image load` operations with the exact archive/image above. `sbx exec` starts a stopped VM. Use a run-specific staged archive such as `/tmp/forecode-booking-image-be5571dc.tar`, inspect the loaded immutable image and compare Linux/arm64 before extraction. Keep egress denied throughout. In the protected guest, an owner-named container can be created **without starting it**:

```sh
docker create --name forecode-booking-install-be5571dc --network none --entrypoint /bin/true sha256:81e96e2375096d963d00feffa5f4f42d44a616f5d99301b1d83539b9f70149fa
```

Refuse an existing destination before these copies. Create `/opt/forecode-booking/bin` with traversable trusted ownership, then copy only:

| Reviewed input                                                         | Protected guest destination          | Required handling                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Staging container `/usr/local/bin/node`                                | `/opt/forecode-booking/bin/node`     | Preserve 0755/executable modes; verify Node hash above before executing or `ldd`.                |
| Same container `/toolchain/node_modules`                               | `/opt/forecode-booking/node_modules` | Preserve internal symlinks/executable bits, notably esbuild; no recursive chmod or host install. |
| Same container `/toolchain/package.json` and `package-lock.json`       | `/opt/forecode-booking/`             | Keep ESM package scope and exact reviewed bytes, 0644.                                           |
| Artifact `runtime/controller/` (the exact current controller manifest) | `/opt/forecode-booking/controller/`  | Directories 0755, text 0644; verify every installed hash. Never send it to the agent VM.         |

For example, `docker cp forecode-booking-install-be5571dc:/usr/local/bin/node /opt/forecode-booking/bin/node` and corresponding `/toolchain/…` copies extract from the same reviewed image. Copy only `runtime/controller`, not the artifact root/raw diagnostics/private material. After extraction/verification, remove **only** `forecode-booking-install-be5571dc` and the exact run-owned staged archive. Preserve the loaded reviewed image and every unrelated container/environment. Failed cleanup retains the installation lease and diagnostics for owner recovery.

Before returning inventory, observe actual guest `uname -m`, pinned Node `--version`, native-loader compatibility, fixed TypeScript/tsx enum transformation, `react-server` / `server-only`, esbuild and native Next SWC/version smokes. Use only reviewed constant samples equivalent to `toolchain-audit.mjs`; do not execute a candidate or import unverified installed modules. First compare Node/package/lock/module/controller bytes, then run smokes under established outer containment. Image-library hashes do not prove compatibility with the guest's distinct native libraries; stop on mismatch rather than copying global libraries or opening grader networking.

The existing `runtime-files.py grader REVIEWED_NODE_SHA256` is the required inventory helper. It now rejects aliased controller/Node paths, worker-owned or group/world-writable trusted paths, missing read/traverse/execute permissions, hardlinked files and privilege bits. It hashes runtime ownership/modes as `runtime_metadata`, checks Node/native/executable closure, and rejects file/permission/path changes during inventory. The exact `/usr/bin/ldd` that is hashed is the one invoked. Admission requires metadata, trusted-executable/native inventory and one Linux worker image; mode-only drift changes the review-bound inventory. Hash-only inventory without a reviewed Node pin still does not execute Node/ldd and is insufficient for admission.

Return the **complete** inventory shape produced by `offline-sbx.ts`, including stopped VM identity/image/mounts/auth/CPU/memory, effective policy/integrations, actual files/native/executable/mode digests, worker image inspect and configured reviewed limits. Independently retain finite enforced VM disk/PID observations and every required isolation/custody/owner obligation. `jsonDigest(inventory)` binds the full canonical object in the fresh offline review; preflight's inventory-file SHA identifies file bytes only. Do not substitute the private infrastructure single-function grader's receipts.

The precise next action is the owner's review of these inputs and installation window. After installation and fresh independent review, rerun read-only preflight with private configuration/inventory, then the existing admitted lifecycle-only command and full booking command from the offline runbook. Real agent/provider execution requires the separate supervised-agent installation and admission in BOOKING-AGENT-EXECUTION.md.

## Workstream A installed observation — October 27

The historical artifact at this stage was `/private/tmp/forecode-workstream-a-toolchain-20261027-c`, superseding earlier source pins without editing historical artifacts. Implementation SHA-256 `b69a93e3294bf7737b736382034cd30bd945d9c8cd04db30a76198517ba51b45`; image `sha256:c1b610053f8160b54f8da7f84b227aa051f59bf91a785f7361bd95356d0c6036`; archive SHA-256 `66220857c6244b5ac9e6a0f6b3a3ca14ed5677fec49d1a8750e32ce2fbbebc61`. Node/package/lock/modules and all seventeen installed controller files are unchanged from the preceding artifact. The host-side Python inventory now sorts full relative paths to match the image auditor; see the installed-verification follow-up and implementation log.

The owner authorized the empty-destination installation, separate installed verification and exact recovery of a retained maintenance lease. Actual guest smokes and stable installed inventories passed, with confirmed stop. Read-only preflight still reports owner action required: actual VM PID enforcement and independent review are absent. These observed installation results do not admit lifecycle/booking acceptance. Keep both enable switches false until a genuine fresh review is issued.

A root-owned staged image archive must be hashed and loaded as guest root (`sbx exec -u root forecode-grader ...`); do not relax its file permissions to accommodate an ordinary guest account. Preserve failed command records and recover retained leases only under the owner's explicit decision.

## Resource-supervised artifact follow-up — October 27

Current artifact: `/private/tmp/forecode-workstream-a-toolchain-20261027-e`; implementation `b793c0ee439c109ed7c683bd6990253e666ac4d4f8521482a7cbe0499af41ad5`; image `sha256:68ad26d00e1264ebc990b62ec0e1cf13822a74d33c9c2dfceca3a585b3dbbab5`; archive `d9d77b659610cc2dd4b0b0dab59cf12f644626289135c8df077f48f93c8454af` (312,671,744 bytes). The runtime source bundle has 25 files including the new fixed `vm-resources.py` maintenance input; the seventeen installed controller files, Node/package/lock/modules and four-file image context remain byte-identical to artifact-c. No occupied installation was overwritten. Historical artifacts remain unchanged.

Maintenance now synchronously narrows and reads back the kernel/parent/grader task limits and inventories finite backing capacity before installed work; restart recovery must reapply these controls. This root supervisor requires exact owner review and applies to the fixed offline unprivileged-worker scope only. See BOOKING-INSTALLED-VERIFICATION for observed resource and authenticated offline CA remediation details. Installed observations and independent admission remain separate. Keep acceptance disabled until genuine review of the exact new source/configuration/inventory and eleven obligations.

## Worker-owned workspace artifact — October 27

Current preparation is `/private/tmp/forecode-workstream-a-toolchain-20261027-g`: implementation `715e0dac6cd5935d80f2f619fb7088c57e5aa04cee3b4545b450a5aaa92fe0a4`; image `sha256:b075856b557544b09c238bcf699cc8db4f0ee79e9b1eaa47f9fb65cb97b03869`; archive `d87fc648d7b7698d5f9f0dc3e7ef900f2a8530e854e6214ef5071d02ee2a7950` (312,671,744 bytes). Only installed `controller/worker.mjs` changed: previous `4d377a076a44d954338abf8851a644f4d0af2ce62ec735a298fbfba2a156527b`, current `f14fb30e30a09f006d0a5688c8d66d4d124f660143ba3783e400a611c34342c2`. Every other controller/runtime/dependency byte and the four-file context are unchanged. Seventeen controller files remain installed.

The exact known old file was hash-checked and backed up root-only before atomic replacement, preserving root ownership and0444 mode. This was a scoped owner-authorized correction after a real acceptance failure, not an unknown-installation overwrite. Fresh installed observation passed23/23 commands with inventory `c9ba1e5b524b034dfeee1436da56dc5f25631fec3e5a3a41b47ae28cd4847155`; disabled-maintenance configuration digest `09780cb17ac1233acd7f976568f345904f44e957be953d18efd13c6e33a80079`. Historical artifact-e approval does not bind these new identities. Renew actual owner review before acceptance; no future result is implied by the successful tooling smokes.

## Explicit production-builder artifact — October 27

Current preparation is `/private/tmp/forecode-workstream-a-toolchain-20261027-h`: implementation `36be65bda0a54c109010980a62b3f4546901e8891a41d311b391580d61140c29`; image `sha256:a4042945715932f816a7b7b12af3b47f6f148bd23d40bf640a757e2544287277`; archive `4b24ef4cac9323ed6d728a1c56bd9d3cb8eedc520ce7194b354a5c4acf34b024` (312,671,744bytes). Only installed `controller/worker.mjs` differs from artifact-g: its new SHA256 is `b913c3298b5d2728f22a287caf3ea66559b9c2c5ea5124d8e5dbecb79b23183f`, adding the fixed documented `--webpack` build flag. Root0444 custody and every other controller/Node/package/lock/module byte are preserved. The seventeen-file controller manifest and four-file tooling context are unchanged.

The known old worker is hash-checked/backed up root-only before atomic replacement; only owned image/stage resources are cleaned. Actual installed verification and the focused owner amendment must bind these current identities before acceptance. Historical artifacts and G approval remain unchanged; G approval cannot admit H. The production build profile and its observed diagnostic are described in BOOKING-INSTALLED-VERIFICATION.

## Final installed and acceptance identities — October 27

Artifact-h implementation `36be65bda0a54c109010980a62b3f4546901e8891a41d311b391580d61140c29`, image `sha256:a4042945715932f816a7b7b12af3b47f6f148bd23d40bf640a757e2544287277`, archive `4b24ef4cac9323ed6d728a1c56bd9d3cb8eedc520ce7194b354a5c4acf34b024`, canonical inventory `b828823d867e997b2c4d0d95406ccb05d617b914690f844e6b6668da628d0ca2`, configuration `a03e557d7a62f4f63917b3de11b23543b5d2762b4eb112b2baef8f777f7735af`. Owner-approved review digest `998c5901079ead8bcc4254804aa5034c5fa9ea46c045822b63c5c85fe8775e05` was fresh during successful execution. All17 controller files, Node/dependencies/native identities and all23 installed-verification commands passed.

Actual lifecycle-only and full booking acceptance completed, protected receipt reloads matched all4 required verdicts, and guarded restart recovery confirmed all13 run identities absent. The grader ended stopped/zero sessions with no lease. Archive verifier/preflight remain integrity-only tools; these original actual run records establish observed acceptance. Future code/configuration/inventory changes or review expiry require renewed admission.

## Agent image separation — October 28

The supervised agent worker uses its own independently reviewed credential-free Codex/Node image and the fixed `agent/Dockerfile` bundled recipe. The protected booking toolchain image and controller/check policy are unchanged. Never snapshot credentials from an authenticated agent VM into the worker image. Root-owned supervisor/broker helpers remain outside that worker; its only writable source mount is `src/`. New scripts/package command bytes change the trusted implementation digest, so the owner must verify the final bundle and obtain fresh independent admission. No operator installation, model call or genuine agent experiment was performed by this follow-up.
