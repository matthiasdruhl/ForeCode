# Owner verification of the installed booking grader

Owner-authorized installation and actual installed verification are now **OBSERVED**; lifecycle and booking acceptance remain **NOT_RUN**. The current implementation log records successful guest smokes and unresolved VM PID enforcement/independent-review gates. The command collects observations; it does not provide installation authority or independent admission. Read [the tooling layout](BOOKING-TOOLCHAIN.md) and [offline admission requirements](BOOKING-OFFLINE-ACCEPTANCE.md) first. The original planning pin and all 49 application contracts are unchanged.

## Authority before maintenance

A separate sandbox owner must authorize an exclusive maintenance window for the exact current installation and independently establish its existing outer containment. This is not an acceptance review: the owner is collecting observations needed for that later review. Do not fabricate a review or grant authority through a hash, issuer, JSON status or CLI flag. The initial implementation slice had no such authority. The later Workstream A continuation received explicit owner installation/maintenance authorization and executed the command; this is separate from independent acceptance review.

Use the same canonical, operator-owned mode-0700 `coordinationRoot` and `.booking-run.lock` as every existing booking controller/private launcher. The command acquires that lease itself. Finish any separately coordinated installation session and release only its own confirmed-clean lease before running the command; a leftover lease is a stop condition, never permission to recover another operator's work. The dedicated grader must initially be stopped with no sessions. Preserve every existing environment, policy, forwarding and integration setting.

The owner must already have installed the exact reviewed tooling/controller bundle through the existing installation handoff. This helper has no provisioning, copy, image-load, dependency-install or policy-changing operation. It refuses enabled acceptance, different proposed tooling pins, aliases/nonprivate output parents, existing output and existing leases. Keep `enabled=false` and `acceptanceEnabled=false` during maintenance. The strict existing offline configuration supplies proposed identities and configured disk/PID caps; those numbers are **not observed enforcement**.

## Exact command sequence

From ForeCode, first use the current artifact's read-only verifier. Historical artifacts become stale whenever bound implementation source changes; generate a new directory with the existing trusted build when required. Never edit an old descriptor or report to refresh its pin.

```sh
npm run toolchain:booking -- --verify /private/tmp/forecode-workstream-a-toolchain-20261027-c
npm run toolchain:booking -- --preflight /private/tmp/forecode-workstream-a-toolchain-20261027-c
```

Independently review the current request, manifest, host command records, archive/image identity and custody. Only the owner may install them under the existing outer containment. The runtime bundle now contains **17 controller files**, including the fixed `installed-smoke.mjs` and `installed-sample.ts`; copy that exact reviewed controller manifest to `/opt/forecode-booking/controller`. Preserve ESM `package.json`, exact lock/module bytes and Node/native executable modes. The four-file image build context is unchanged. Keep `runtime-files.py` and `installed-smoke.py` as reviewed maintenance inputs outside the agent workspace. No candidate is needed.

Create a private observations parent, prepare the existing private offline configuration with current actual identities/shared coordination root and acceptance disabled, then run **only after separate maintenance authorization**:

```sh
mkdir -m 700 /private/tmp/forecode-owner-observations-20261027
npm run toolchain:booking -- --observe-installed /private/tmp/forecode-workstream-a-toolchain-20261027-c --config /absolute/private/offline.json --output /private/tmp/forecode-owner-observations-20261027/installed-1
```

This explicit operation **can start and stops `forecode-grader`**. It cannot authenticate the person invoking it. It never invokes either acceptance mode, another sandbox, an agent or a provider. Do not run it merely to inspect a stopped VM without that maintenance authority. No new approval/provisioning framework or owner-review writer is introduced.

The fixed operation:

1. Revalidates the current source-bound archive, configuration and sbx executable, then checks stopped VM identity/image/mounts/auth/resources, effective policy and integrations.
2. Collects the existing protected file/mode/native-loader/image inventory and compares installed Node, ESM package/lock/module tree and every controller with reviewed inputs **before executing installed tooling**. `ldd` receives only the hash-checked Node. Guest library hashes remain distinct from image library hashes.
3. Runs only the installed constant ESM/TypeScript sample under pinned Node, the absolute tsx loader and `react-server` condition. It checks dependency resolution in the actual installed package scope, `server-only`, TypeScript transformation of an enum, TypeScript compiler, esbuild, native Next SWC and Next version. Kernel machine, Node version/platform/architecture and actual results are retained. ABI/module failures stop the operation; do not copy global libraries or open grader egress.
4. Recollects the identical inventory, compares canonical digests, and rechecks source/artifact/configuration/lease before publication. The fixed Python launcher bounds guest smoke output to 64 KiB plus one read chunk and execution to 25 seconds, kills its process group, and has no caller command/source input. Host commands have 35-second bounds; the operation has 180 seconds plus an independent 45-second stop budget. These are command bounds, not VM disk/PID enforcement.
5. Stops the dedicated grader and verifies stopped state. Failed/unconfirmed stop retains the lease and forbids `inventory.json`. No reset, restart-to-probe, blanket cleanup, staging deletion or guest filesystem installation occurs. Temporary tsx caching is disabled. On failure preserve diagnostics; a killed host client is not confirmed guest termination.

The private output contains exact bounded `command-N.json` executable/argument/exits/signals/stdout/stderr/elapsed observations, `observation.json`, and **only on complete stable observations plus confirmed stop** the exact `inventory.json`. Failures remain failures, with no inventory publication. Command digests and inventory digest use canonical `jsonDigest`, not hashes of pretty-printed JSON. Unknown tokens/cost/iterations and actual VM enforcement remain null. `OBSERVED` is a collection outcome, not an authenticated review or acceptance claim.

## Consume observations without self-approval

The collector and offline adapter import the **same** `collectOfflineInventory` and `InventorySchema` from `offline-inventory.ts`. No owner transcription or alternative inventory shape is required. Volatile state/session count is checked but omitted; installed identities, VM ID/image, effective policy, integration state and configured limits are included exactly as admission expects. The smoke envelope is checked by `validateInstalledSmoke` against the reviewed tooling architecture/version/dependencies/esbuild/native target before success output is written. The independent reviewer must inspect the original command records and custody, not just the summary status.

To compute review pins without executing a guest or writing a review:

```sh
node --import tsx --input-type=module -e 'import { protectedRead } from "./scripts/experiments/artifacts/files.ts"; import { OfflineConfigSchema } from "./scripts/experiments/isolation/offline-config.ts"; import { offlineConfigurationDigest } from "./scripts/experiments/isolation/offline-gate.ts"; import { InventorySchema } from "./scripts/experiments/isolation/offline-inventory.ts"; import { jsonDigest } from "./src/lib/report/digests.ts"; import { freezeBooking } from "./scripts/evaluator/booking-v1/freeze.ts"; const config = OfflineConfigSchema.parse(JSON.parse(await protectedRead(process.argv[1]))); const inventory = InventorySchema.parse(JSON.parse(await protectedRead(process.argv[2]))); console.log(JSON.stringify({configurationSha256: offlineConfigurationDigest(config), inventorySha256: jsonDigest(inventory), implementationSha256: (await freezeBooking()).evaluatorSha256}));' /absolute/private/offline.json /private/tmp/forecode-owner-observations-20261027/installed-1/inventory.json
```

After independent review, the owner supplies all eleven existing obligation evidence files and a fresh implementation/configuration/inventory-bound offline review. Specifically missing now:

| Missing authority/evidence                                                            | Owner action supplying it                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installation and maintenance authority/exclusive coordination                         | Review exact current bundle/archive and authorize owner installation/maintenance under the common lease.                                                                             |
| Actual installed guest identities and ABI/module behavior                             | Install only with owner authority, then execute the fixed command above; review original private records and inventory.                                                              |
| Current outer containment, denial, integration and oracle/result custody observations | Independently review all eleven existing `offlineObligations`; retain bounded private observations with their hashes.                                                                |
| Finite **enforced** VM disk and process limits                                        | Establish and independently observe actual enforcement; configured numbers, free space and worker limits alone do not suffice.                                                       |
| Fresh acceptance authority                                                            | Bind canonical inventory, configuration and current implementation to the existing review with expiry within 24 hours, then set only `acceptanceEnabled=true`. Keep `enabled=false`. |

Changing acceptance enable/review path/hash does not alter `offlineConfigurationDigest`; changing any bound identity/limit does and requires new review. Use the existing read-only machine checks after the independent review is supplied:

```sh
npm run toolchain:booking -- --preflight /private/tmp/forecode-workstream-a-toolchain-20261027-c --config /absolute/private/offline.json --inventory /private/tmp/forecode-owner-observations-20261027/installed-1/inventory.json
npm run acceptance:booking -- --config /absolute/private/offline.json
```

Even matching preflight records are integrity-only; preflight leaves observed installation/enforcement unknown and acceptance NOT_RUN. Neither default command starts a VM. Once independently admitted, run the existing paths **in order**:

```sh
npm run acceptance:booking -- --config /absolute/private/offline.json --lifecycle-only --execute
npm run acceptance:booking -- --config /absolute/private/offline.json --execute
```

Retain actual commands/exits/identities/resources/cleanup/failures and private artifact locations. Lifecycle-only cannot issue booking verification. Full booking acceptance retains the existing baseline, ownership regression, distinct final selection, denial/lifecycle probes and controller publication → protected loader → verdict normalization; unconfirmed termination prevents publication. Neither was run here. Synthetic tamper/forgery/missing-check/mutation tests remain development evidence, never guest acceptance. Candidate variants remain inert host data and must never be imported, installed, built or executed on the host.

No-inference acceptance is not a coding-agent trial, Meta contribution, architecture comparison, hidden holdout or completed product certificate. Application agent execution remains hard-disabled. No inference or paid application execution is authorized by this workflow.

## Observed installation follow-up — October 27

The first real maintenance run rejected the installed dependency digest before executing smokes. Node, lock and dependency bytes were unchanged: Python's `Path` ordering compares components, while the image auditor sorts full POSIX relative strings. For example, `pkg.js` must precede `pkg/item.js`. The inventory now explicitly sorts its collected rows by the full relative string before compact ASCII JSON hashing; all custody, executable, symlink, byte and deadline checks remain enabled. A regression runs the actual Python inventory on inert synthetic installation files, including nested names, a symlink and Unicode, and compares it with the image auditor. It failed against the previous helper and passes with the correction.

A fresh source-bound artifact was built and loaded. Only the host-side inventory helper changed; controller, Node, package, lock and module bytes were compared and remained identical, so no existing installation was overwritten. The fixed maintenance command then completed all 21 bounded observations with exit 0, matching inventories before/after, actual ESM/TypeScript/tsx/server-only/esbuild/native SWC/Next smokes, and confirmed stopped state. Canonical inventory SHA-256: `e9abe20c10d22ebb77eb9d322c79122e90f2cec29327450c4703e0a29eca4595`. Original failures, recovery and successful records remain private and separate.

The owner explicitly authorized installation/maintenance and recovery of one retained maintenance lease. Its staged-archive permission error was corrected by using guest root; the exact lease was archived only after successful cleanup and confirmed stop. No retained lease was silently reclaimed. Current shared coordination root is operator-controlled and must be used by all launchers; obtain it from the owner, not from historical example paths.

Admission remains blocked: the guest's main process cgroup and parent both report `pids.max=max`. Observed finite block-device capacities and nested worker `PidsLimit=64` do not establish the required VM process bound. Configuration numbers remain proposed limits, not enforcement. The trust-store digest/package version were collected but still require review of patch provenance. No independent review or enabled acceptance configuration was fabricated; no lifecycle or booking acceptance ran.

Preflight is also review-gated: before admission, passing the disabled maintenance configuration and genuine inventory returns `INPUTS_INVALID` / `ACCEPTANCE_DISABLED`, and labels the proposed inventory invalid because `admitOffline` cannot yet bind it. The separate successful installed observation remains valid collection evidence. Artifact-only preflight returns `OWNER_ACTION_REQUIRED`. Do not enable acceptance or invent a review to change either report. Likewise, the archive verifier's fixed `installationStatus=NOT_INSTALLED` describes its preparation record, not a new guest inspection; use the original installed observation for observed installation state.
