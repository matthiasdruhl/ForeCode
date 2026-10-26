# Local booking runner

Real coding-agent execution is **hard-disabled**, including with `enabled=true`. The previous adapter's stop → exec/export sequence could restart a stopped VM without establishing termination of detached processes. The concrete agent invocation and export path have been removed from the sbx adapter until a supervised agent boundary is reviewed and tested. No paid run is authorized by configuration examples or infrastructure PASS records.

The next supported capability is the separate [no-inference acceptance command and owner handoff](BOOKING-OFFLINE-ACCEPTANCE.md). It uses only `forecode-grader`, four fixed candidate data transformations and resource-limited nested workers. It cannot import the paid runner or provider transport. Its review excludes inference/billing authority and keeps `enabled=false`; it requires independent isolation and owner/lease evidence. It does not weaken the full paid-experiment review, which still requires provider hard-budget evidence.

```sh
npm run acceptance:booking -- --help
npm run acceptance:booking -- --config scripts/experiments/isolation/offline.example.json
npm run bundle:booking -- --output /new/absolute/private/runtime-bundle
```

The first two commands only print help or validate configuration; neither invokes sbx. Bundle preparation reads a fixed trusted tooling/controller allowlist, refuses existing output and records hashes without building, installing or executing source. Keep the output outside the application and planning trees. Run `--execute` only after the handoff's owner actions and review are complete.

## Preserved experiment contracts

The fixed future task remains `booking-ownership-refactor-v1`: extract viewer/ownership helpers, preserve booking behavior, change only `src/`. All 49 frozen application contracts, the normative planning pin and required check IDs remain unchanged. Existing synthetic controller tests exercise candidate freezing, publication and loading. They are not real coding-agent, containment or offline runtime evidence.

The operator/review records under `scripts/experiments/isolation/config.ts` are private local integration types, separate from the frozen application contracts. `coordinationRoot` is now required for both local capabilities and explicit runtime inspection. All cooperating controllers and the sandbox owner must use that same canonical mode-0700 root and respect `.booking-run.lock`. A lock includes run identity, PID and start time. Controllers never break a lock automatically; failed cleanup retains it. Do not run the legacy private operator launcher concurrently: it does not automatically participate in this protocol. Owner coordination is a prerequisite, not a capability inferred from a lock file.

`experiment:booking` still validates the disabled example. Its explicit `--inspect-runtime` is an owner operation that can start the two stopped dedicated VMs for trusted inventory and stop them afterward. This inspection requires owner coordination and the shared lease; it makes no containment or inference claim. `--execute` fails closed before any agent/sandbox execution, regardless of the enable switch. Do not use it as a way to obtain an acceptance review.

## Custody and limits

Only the standalone fixture may enter a future agent workspace. Never transfer ForeCode, private operator configuration, evaluator/controller code, protected reports, receipts, keys or secrets there. Offline acceptance transfers candidate bytes directly to the protected grader, whose nested workers see source plus a non-authoritative bridge and fixed denial probe. Candidate variants remain inert host data: no host candidate dependency installation, import, build or execution occurs.

Source capture rejects traversal, symlinks, hardlinks, duplicate/noncanonical encodings, changed configuration/visible tests and excess bytes. Captures and frozen candidates are rehashed. Runtime identity binds implementation, image, Node, dependency lock/tree, limits, suite and policy. The installed controller, ESM package scope, tooling, image identity and native Node loader closure are checked against the reviewed inventory. Hashes and JSON PASS fields alone do not authenticate custody.

Cleanup now terminates a registered trusted guest controller by PID **and Linux process birth identity**, then removes only workers labelled with the current run UUID, rechecks absence, stops/restarts the grader, checks absence again and confirms stopped state. Interruption retains the lease even if cleanup returns successfully. Cleanup failure prevents publication and retains observations for owner recovery. No VM is deleted/reset/reconfigured, no global forwarding/network policy changes, and no unrelated container cleanup occurs.

These mechanisms need actual owner-reviewed runtime testing. They do not establish that an agent with guest sudo can be supervised safely: that separate paid path stays hard-disabled. The present acceptance suite checks public baseline behavior, distinct source selection and forged candidate stdout; it is not an agent trial, Meta contribution, architecture comparison, hidden holdout or completed certificate. Unknown metrics remain null.

## Current runtime gate

The private report at `../.forecode-sandbox-ops/README.md` and `readiness.json` was reinspected. Its last update is October 26 at 20:17:38 UTC; it still says real booking experiments and provider hard caps are unready. Read-only inventory again found sbx 0.50.0 and the two stopped mountless dedicated VMs with 2 CPUs/4 GB. The original `codex-1` was preserved. Installed help explicitly states that stop retains state and exec starts stopped VMs. Neither inventory nor the generic single-function infrastructure grader proves this booking bridge.

No sandbox provisioning, image build/load, `sbx exec`, guest acceptance or inference occurred in this slice. The exact next owner actions and command recipe are in the offline handoff. Credential-free CI runs deterministic development tests only; live acceptance is never a CI requirement.
