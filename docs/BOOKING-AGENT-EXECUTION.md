# Booking agent execution handoff

October 28, 2026: **BLOCKED**. No coding-agent task, provider inference, sandbox inspection, runtime configuration change or post-agent grading was performed by this implementation. The existing concrete sbx adapter remains hard-disabled, even with `enabled:true`. Offline infrastructure acceptance is separate historical evidence.

## Safe preparation

```sh
npm run experiment:booking -- --help
npm run experiment:booking -- --config /absolute/private/config.json --prepare-commitment
```

Use an existing private operator configuration and a canonical, operator-owned mode0700 protected root outside ForeCode and the planning repository. This command reads the reviewed baseline and trusted implementation, writes a new UUID directory and exclusively creates a mode0400 `commitment-proposal.json`. It invokes Git only to identify HEAD; it never calls sbx, runs fixture code, acquires a sandbox lease or sends a provider request. Preparation refuses overlapping repository roots and checks source freshness again before publication. HEAD identifies repository history; exact source/evaluator digests also bind uncommitted bytes.

The private proposal binds the unchanged `booking-ownership-refactor-v1` prompt/hash, A smoke arm, fixture manifest and dependency-file hashes, agent model/binary/configuration, declared budgets, expected sandbox images, evaluator tooling/suite/policy/checks, trusted implementation and proposed review digest. Exact guest workspace, actual inventory, external authority, revocation observation and independently held commitment are **null**, because none was established. Guest-shell tools and post-export writable-path checks are described accurately; they do not establish guest command mediation. The proposal is not a task for the team-permissions tournament and cannot admit that different scope.

A digest detects changed bytes relative to a separately trusted commitment. This output supplies neither independent authorization nor proof of runtime enforcement. The author cannot turn it into authority by changing its status or writing another JSON approval. It must stay private and outside the agent workspace and web catalogs.

## Attempt retention and final source transfer

`--execute` creates the proposal before admission and records the blocked attempt without invoking sbx. Scratch-removal or lease-release failure cannot escape before the disposition is written: it clears receipt links, marks BLOCKED and requires owner recovery. A shared-lease conflict also leaves a durable blocked `run.json`, with no attempt to clean up another controller's sandbox or release its lease. Missing/invalid private output custody still fails before a record can safely be written. The existing frozen `ExperimentRunV1` schema is unchanged; private diagnostics include proposal digest, stage and cleanup confirmation. Unobserved token/cost/iteration metrics remain null, and no blocked attempt receives source, receipt or verification identity.

The generic controller no longer does cleanup/stop followed by two guest exports. Its single trusted-adapter `finalizeAgent` boundary must terminate the entire agent process boundary, establish detached-child absence across restart, seal the source and transfer it **without executing the untrusted guest again**. It verifies run binding, termination/restart/export observations and candidate-envelope digest before source freezing or grading. The concrete sbx adapter deliberately has no finalization implementation: inventing a host stop/export sequence would reintroduce the original vulnerability. Synthetic adapters exercise only this controller interface; boolean observations are not independently authenticated runtime attestations.

After a future admitted finalization, the existing flow freezes inert candidate bytes, rejects changes outside `src/`, checks the exact protected grader identities, validates required check relationships, confirms cleanup/freshness and uses the existing protected publisher/loader. Agent exit zero does not establish correctness. Failed process exits can retain independently checked source, while interrupted attempts never proceed to grading. No public endpoint, second evaluator, evidence loader, registry or frozen contract was added.

## Required independent gates

The owner/operator must complete all of these for the exact final trusted implementation, rather than reuse an expired review of earlier code:

1. Independently review the actual guest-sudo agent boundary: sanitized standalone workspace, host-filesystem denial, no credentials/SSH/socket/host integrations, no grader/controller/oracle access, restricted provider destinations, network-off grading, tested VM disk/PID/CPU/memory limits and installation/custody identity.
2. Review and negatively test a concrete supervised finalization/transfer implementation against timeout, cancellation, detached children, killed controllers, restart resurrection, post-seal mutation and incomplete cleanup. A stopped VM is not proof of process death; guest `exec` can restart it.
3. Supply valid provider access plus a pre-existing spending decision with externally enforced limits for the pinned eligible model. Agent configuration/token tracking, an enabled flag and a positive budget field do not establish a billing hard cap.
4. Hold the exact pre-run task/arm/source/tools/model/budgets/runtime/evaluator commitment independently; bind the decision and actual runtime observations, check current non-revoked admission immediately before launch, and retain denials. No self-issued review or signer string qualifies.
5. Coordinate with the sandbox owner and all controllers on the existing shared canonical lease root; independently recover any retained lease only after establishing guest absence.
6. Approve and observe one bounded smoke task, preserve its exact final source, independently authenticate its protected evaluation, and confirm termination/cleanup. Registration/disclosure and public release require their separate authority.

Read-only inspection of the existing private readiness metadata still found `ready_for_real_booking_experiments:false` and `provider_billing_hard_cap_verified:false`, last updated October 26 at 20:17:38 UTC. Historical fixed offline acceptance proves neither missing capability. No private key or credential was read, no original evidence was transferred, and no runtime admission was created.

## Verification scope

The focused synthetic suite covers binding changes, altered proposal bytes, disabled/enabled concrete refusal without sandbox calls, durable blocked/conflicting attempts, exact candidate/receipt identities, invalid/missing checks, interruption, unconfirmed termination, restart resurrection, guest-executed export, incomplete cleanup and protected-artifact tampering. Harmless host-child lifecycle tests are host process-control observations only. They do not prove guest isolation or provider limits.

The final integration report records exact commands, results and source commit. These changes alter the trusted implementation digest; earlier runtime admissions cannot admit this source. Required next owner work is a separately reviewed supervised agent boundary and current exact-runtime/provider admission, not another paid-run flag.
