# Local booking runner

The concrete single-arm adapter now implements an independently gated supervised worker, sealed final-source transfer and existing protected grading. See [the current agent execution runbook](BOOKING-AGENT-EXECUTION.md) for installation, exact commitment/review bindings, provider restrictions, invocation and recovery. No actual coding-agent task or paid inference was performed. Production evidence catalogs remain empty.

PR #14's earlier hard-disabled adapter was replaced in this follow-up. The original stop→guest-exec/export vulnerability is addressed by keeping the outer sbx guest trusted and removing a confined untrusted worker before export. No command executes in that removed worker afterward. A private enable switch, hash, successful unit test or infrastructure verdict still grants no runtime/spending authority.

## Local commands

```sh
npm run experiment:booking -- --help
npm run experiment:booking -- --config scripts/experiments/isolation/operator.supervised.example.json
npm run experiment:booking -- --config <PRIVATE_CONFIG> --prepare-commitment
npm run acceptance:booking -- --help
npm run bundle:booking -- --output <NEW_PRIVATE_BUNDLE>
npm run toolchain:booking -- --help
```

Help/default validation does not call sbx/provider APIs. Proposal preparation writes a new private UUID/original with source/configuration/task/model/budget/evaluator commitments; it does not acquire a runtime lease or grant authority. Explicit runtime inspection is an owner maintenance operation: it acquires the shared lease, starts trusted inventory and synchronous resource setup, then stops the guests. Resource setup may tighten VM PID/thread ceilings and reads actual enforcement back. Do not confuse it with passive metadata inspection.

Real `--execute --commitment <ORIGINAL_PRIVATE_PROPOSAL>` requires the original proposal, current independently reviewed execution/revocation binding, exact installed inventory and enforced provider envelope. Defaults stay disabled; older reviews cannot admit this changed implementation. No task/model/command override, paid retry or runtime installation is part of the CLI. The [offline acceptance command](BOOKING-OFFLINE-ACCEPTANCE.md) remains a separate no-inference scope and cannot supply agent/provider authority.

## Preserved contracts and custody

The task remains `booking-ownership-refactor-v1`: extract viewer/ownership helpers, preserve booking behavior and change only `src/`. The model remains `gpt-5.6-sol`. All49 frozen application definitions, planning pin, baseline fixture bytes and five protected check IDs remain unchanged. No evaluation API, web execution endpoint, new artifact loader, tournament/Meta feature or production catalog entry was added.

Only the sanitized standalone fixture enters the untrusted worker. Its root is read-only, with `src/` writable; the trusted task, agent bootstrap/configuration and gateway mount are read-only. The agent sees no ForeCode/controller/evaluator/private output/credential/SSH/Docker socket. Network-none restricts it to the separately exposed bounded provider broker. Host tests execute reviewed baseline only; controlled modified fixtures run solely inside disposable nested workers.

The existing preparation, capture and freeze helpers reject aliases, traversal, hardlinks, duplicate/noncanonical encodings, excess bytes and changes to configuration/dependencies/tests. Grading consumes the actual sealed candidate and checks exact tree/run/evaluator/suite/policy relationships. Fresh authenticated required failure means REJECTED, all required passes means scoped VERIFIED, otherwise INSUFFICIENT_EVIDENCE. A completed process does not imply acceptance.

Every controller shares the same canonical private mode0700 coordination root with the owner. `.booking-run.lock` binds UUID/PID/start identity and is never stolen or automatically recovered. Exclusive stage observations retain partial progress. Cleanup refusal, lost ownership, changed runtime identity, unsealed source, invalid evidence or uncertain scratch/lease cleanup prevents publication. Only confirmed cleanup releases the lease. See the agent runbook for private originals and owner-only recovery.

The independent protected grader installation and fixed no-inference acceptance retain their existing [installed verification](BOOKING-INSTALLED-VERIFICATION.md) and [toolchain](BOOKING-TOOLCHAIN.md) guidance. Historical fixed A-family acceptance is infrastructure evidence, not a coding-agent experiment, architecture pair, hidden holdout, Meta contribution or sandbox containment proof. A private review is not a frozen isolation attestation; this runner preserves null attestation and unclaimed measured origin until a genuine original record exists.

## Validation and next operator action

This follow-up exercised real harmless process supervision and unchanged protected grading in a fresh mountless, deny-all-network two-vCPU shell sandbox. It also checked real restart/removed-worker absence and sealed bytes. The user's existing `forecode-experiments`/`forecode-grader` guests remained stopped and unchanged. Local synthetic/finite-transport tests complement those observations; no actual provider or Codex smoke was run.

The next operator action is independent review of this committed source and installation window, followed by fresh exact installed inventory, containment/resource/provider observations and task/spending admission. Historical review expiry is never extended or self-issued. Registration, complete-run public disclosure, deployment, architecture fairness and Meta causal benefit remain separate work.
