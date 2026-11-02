# First new prospective tournament: operator runbook

**November 1 operational update:** see the [local release and closed Study09 handoff](E2E-LOCAL-RELEASE-HANDOFF-20261101.md) for actual execution, conserved accounting, cleanup and the owner's local-only release choice. The readiness audit below is historical and cannot override consumed attempts or current originals.

**Current disposition: BLOCKED.** This procedure is preparation for a later separately authorized operation. Agent D performed only the safe checks recorded in [readiness](TOURNAMENT-NEXT-STUDY-READINESS.md). Source basis: `03f5deb2521facb58c26fd3fcf4bc6199bd8b210`. The integrated implementation and final canonical mapping are recorded in [integration report](INTEGRATION-52-55-REPORT.md). The source basis above describes Agent D’s historical audit, not admission of the integration. Reinspect reviewed implementation before use; [integration gates](TOURNAMENT-NEXT-STUDY-INTEGRATION-GATES.md) specify the necessary A/B acceptance work.

## 1. Establish scope before accessing originals

The repository owner must assign an authorized local operator, study custodian/reviewer, runtime/evaluator owner and disclosure/deployment owner. Record each actual mandate and the limitations of shared-host AI review. A separate AI agent does not establish organizational independence. Developer/PR permission does not authorize inference, private-original access, protected installation, guest lifecycle changes, approval signing, or result disclosure.

Keep the private operation record outside Git and all experimental worker roots. Record actual grant references there; public docs should contain only approved non-sensitive IDs/digests. No private key belongs in ForeCode, a prompt, a test fixture or a command argument. Do not copy historical approvals, failed final candidates or private diagnostic repairs into a new preparation.

## 2. Source and dependency preflight

Use an isolated clean checkout of the reviewed merged commit and Node 24. Check exact outputs, not just command success:

```sh
git fetch origin main
git rev-parse HEAD origin/main
git status --porcelain=v1
git diff --check
node --version
npm --version
shasum -a 256 package-lock.json fixtures/booking-v1/package-lock.json
```

Install locked dependencies with `npm ci --ignore-scripts --no-audit --no-fund` in that checkout if necessary; do not update locks or run installation hooks. Recompute `freezeBooking()` using the source-only command in the readiness log. It reads repository files, not guest packages, and returns `none`/`NOT_RUN`. Preserve both Git SHA and implementation closure digest; they have different meanings. Archive the exact original reader for each run. Documentation-only changes do not necessarily change evaluator closure, but merged A/B changes can.

Do not import or execute either experimental candidate on the host. All host tests must use reviewed repository source and finite synthetic fixtures. Check tests before running them after implementation changes. No protected runtime controls follow automatically from `npm test` or `npm run check` success.

## 3. Safe status commands

Inspect each command's implementation again if source changed. With the assessed source, these three are safe without private-original access or provider calls:

```sh
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --status
node --conditions=react-server --import tsx scripts/experiments/tournament/team-cli.ts --status
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --publication-status
```

At the audited commit, all exit 2 intentionally: static `DISABLED` gates and an empty publication catalog. Team status does not load private registration, inspect guests or prove a specific registration disabled. Publication status can read protected originals after future provisioning; its safe-to-run scope must then be reassessed. Available publication exits 0 only with no unavailable entries; invalid/unavailable publication exits 1. Never change gates to obtain exit 0.

`sbx version` and, where already permitted, `sbx ls --json` are metadata checks. The latter failed in this audit before listing guests. Ask the runtime owner to resolve that under its own scope; do not log in, reset, start or enter a guest to make a status check succeed.

## 4. Initial independent commitment: before architecture generation/selection

The custodian first reviews and actually holds a candidate-neutral commitment. Prepare the following real inputs; do not fill unknowns with synthetic data:

| Input / canonical source                               | Required content and approval                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StudyDefinitionSchema` / `ProtocolSchema`, `study.ts` | New `protocol.studyId`, exact `task`, `futureOracle`, `conditions`, `executionConditions`, `trialPolicy`, `studyKind`, intent revision/scenario, original fixture and two unused run UUIDs. No fictitious prepared B.                                                                                                                             |
| Full task and common inputs                            | Exact frozen `booking-team-permissions-v1`, common request/assumptions/acceptance IDs, downstream prompt, adapter instructions and visible roadmap. Bind bytes, not only a descriptive label. Both arms later receive the same complete inputs.                                                                                                   |
| Conditions / `ArmConditionsSchema`, `plan.ts`          | Same original commit/tree/lock, task, roadmap, prompt, agent config, tool/runtime/network/credential digests, seed and budget after omitting only `variant`.                                                                                                                                                                                      |
| Execution / `ExecutionConditionsSchema`                | Same coding agent/model and CPU/memory/PID/disk/output resources for A/B. Freeze exact provider/model configuration and native tool surface. A provider seed is currently unsupported; the team profile requires null.                                                                                                                            |
| Runtime / restrictions                                 | Separate agent/grader/worker images and native/node/supervisor/broker/grader executable hashes; only `src/` writable, worker network none, credentials trusted-broker-only; exact requests/output/seconds/tokens/money and independent native guard.                                                                                              |
| Evaluator/suite/policy                                 | Exact baseline and future oracle descriptors, required checks, approved task definition, protected collector/parser/toolchain and authorization case inventory. Public IDs do not reveal or authenticate private assertions.                                                                                                                      |
| Supplementary metric semantics                         | Candidate-neutral forbidden direct static pairs/rule IDs; full source/CSS inventory rules, external packages, alias semantics, authorization case IDs, snapshot window and strict B-fewer-final-edges prediction. Use [prospective protocol](PROSPECTIVE-TOURNAMENT-PROTOCOL.md); hold semantics before a new architecture is generated/selected. |
| Original custody / `CustodyConfig`                     | Existing trusted public-key pin, exact original-file byte allowlist, canonical private root disjoint from repositories and all actual worker roots, current revocation digest; independently authorized custodian, not a key supplied by a draft.                                                                                                 |

Use the canonical existing subjects: `protocolSubject(definition)` is the digest of the entire validated definition, while `jsonDigest(definition.protocol)` is the protocol-only digest used by `futureProtocolCommitment(draft)` and the preparation record. They are not interchangeable. The actual held protocol record has kind `protocol`, subject `protocolSubject(definition)` and null predecessor. Its `heldAt` must genuinely precede selection, and its interval must cover the intended freeze.

The bound metric protocol needs the newly issued UUID, which does not exist at this first commitment. The implemented `ScientistCommitmentSchema` holds candidate-neutral rules under `scientist-commitment`, predecessor full-definition protocol envelope. `ScientistBindingSchema` later binds those rules to issued UUID/context and the other seven measurement identities under `scientist-registration`, predecessor initial commitment envelope. `MetricProtocolSchema` validates the composed protocol. Do not fabricate a UUID, mutate the initial original, or put metrics into the fixed `comparisonMetrics` tuple. Synthetic integration verifies this mapping; genuine authority remains absent.

## 5. Fresh reasoning and prospective binding within the live window

Only after exact-payload and bounded provider-spending consent, issue a **new** genuine proposal/hypothesis/challenge under the approved context. The model must actually choose the registered counting rule and falsification criterion; if it predicts something else, abstain rather than rewriting its output. A visible adversarial challenge requires separate review and remains distinct from independently protected authorization cases.

Live research currently supports one local trusted operator, one loopback-bound process and these declarations from [the backend handoff](META-BACKEND-OPERATOR-HANDOFF.md):

```text
FORECODE_ORIGIN=http://127.0.0.1:3189
FORECODE_RESEARCH_MODE=local-single-operator
FORECODE_RESEARCH_PROCESSES=1
```

They describe the supported perimeter; they confer no authentication, spending or payload consent. Preserve the actual process and accepted generation; no proxy/tunnel/shared untrusted host use, process replacement, newer accepted same-context hypothesis, intent edit or replica workaround.

Before any preparation, the custodian must actually authenticate the append-only registration binding exact issued `hypothesisId`, `hypothesisSha256`, `issuedAt`, context, study and initial-protocol original, plus approved metric and matched-condition mapping. `registeredAt` must follow issuance and precede every preparation/downstream start. Agent A's merged production interface must provide current original/revocation/consumption checks; no currently available CLI in this audited source issues a Scientist registration. Do not substitute a JSON file or use an invented command.

**Time gate:** the hypothesis lifetime is 30 minutes and process-local. Registration `expiresAt` cannot exceed issuance + TTL, and the later evidence link cannot extend registration expiry. The parent proposal's earlier 30-minute expiry also removes its issued hypotheses through service `prune()`; measure the remaining parent window, not a fresh 30 minutes from the last response. Current interpretation validates registration and issued state again, including after inference. Prearrange the reviewer, initial commitment, installation readiness and spending decisions before issuing the hypothesis. A timed no-inference rehearsal must show binding can finish in time; if optional interpretation is planned, it must also cover preparation, baselines, admissions, up to 20 minutes of sequential downstream work, original authentication, disclosure and interpretation with margin. Merely registering quickly does not demonstrate that full window.

If the process or binding expires, stop dependent work and record it; no replay of the historical November 1 UUID, TTL extension, backdated issuance or new UUID attached to earlier preparation. If full interpretation cannot fit, it stays unavailable. Any durable-issuance design requires a separately reviewed owner-expanded workstream. Whether an already valid registration can authorize a later run must follow Agent A's actual approved consumption/freshness contract; do not infer durable authority from this runbook.

After authenticating the initial commitment and issued binding, call the existing private same-process `service.register(registrationId,hypothesisId)` once. This is an operator API, not an HTTP enrollment endpoint. For subsequent measurement reads use `() => service.resolveRegistered(registrationId,hypothesisId)` as `MetricObservationReaderConfig.resolveRegistration`, and use the returned initial `commitmentId`. Each read rechecks the live issuance, current context, full custody/revocation chain and original expiry; a new process or retired hypothesis cannot resurrect enrollment. The earlier parent proposal expiry can shorten the 30-minute window.

The registered metric pair’s `metricCommitmentSha256` is the initial Scientist commitment envelope SHA, **not** the composed metric content hash. The metric reader verifies the exact registered `metricProtocol` and its lineage digest against the same authenticated prepared study. `loadPrivateTournamentMetrics` accepts the fresh resolver in its source-owned configuration. No production resolver or collector is installed by this code.

## 6. Authorized preparation and starting sources

After valid binding, obtain a separate `preparation` original for each permitted attempt. Existing subject:

```text
jsonDigest({preparationSha256: preparationSubject(definition, proposal, instructions), attemptId})
```

Its predecessor is the original protocol envelope byte hash, not the protocol-only digest. The authorization must cover the attempt interval. Review the registered candidate against actual proposed preparation instructions. This task supplies no preparation executor or permission to use a coding agent.

Keep A at the authenticated original. Prepare B only within approved source scope; no team feature implementation, locked-dependency change, protected feedback or failed-candidate repair may silently become preparation. Have the reviewer examine the actual source diff and conformance to the registered candidate. Disclose prior design/task/pilot knowledge; this is a visible preregistered case study, not blind selection.

Retain `PreparationEvidenceSchema` in `preparation.json`: selection time, proposal/instructions, selected attempt, every failed/interrupted/completed attempt and its unique authorization, sorted original/prepared manifests and `PreparationRecordSchema`. The record binds original/prepared commit/tree/lock, task/protocol, prompt/review/execution digests, interval and metrics. Actual changed B must exist. Hashes referring to review/execution records alone do not establish genuine approval.

`inspectPreparationSources` recomputes actual manifests without executing them. Confirm canonical manifest paths, unchanged original/lock, changed paths restricted to `src/`, and exact A/B starting trees. Actual protected baseline checks require separately authorized grader access. Both exact starting trees must pass the unchanged original five checks; the controller reauthenticates both baselines before downstream dispatch. Never manufacture a baseline from a public `READY` marker or compiler exit.

Complete `draft.json` with the actual preparation record digest and metrics. Unknown preparation time/tokens/cost remain null. Non-null preparation metrics require authenticated telemetry. The `prepared` original binds `preparedSubject(definition,draft,evidence)`, predecessor protocol envelope hash, after all preparation and before final pair freeze. Actual chronology is essential; no future timestamp assertion alone proves it.

## 7. Private command grammar: separately scoped access required

These are the existing fixed **no-inference** commands, but they may read private study/original data; they were NOT RUN in this audit. Replace placeholders only inside the approved private operator environment:

```text
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --definition <CANONICAL_PRIVATE_STUDY_ROOT>
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --protocol <CANONICAL_PRIVATE_STUDY_ROOT>
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --readiness <CANONICAL_PRIVATE_STUDY_ROOT>
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --record-protocol <CANONICAL_PRIVATE_STUDY_ROOT>
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --record-prepared <CANONICAL_PRIVATE_STUDY_ROOT>
```

Valid preparation inspections exit 2, even when authenticated; invalid/unavailable input exits 1 with a safe error. Definition/protocol inspect proposals. Readiness uses `configuredStudies`, which is empty in Git; it is distinct from the registered team's private `study` composition. Do not bypass an unconfigured inspection by copying private composition into public source. The record commands write exclusive synced 0400 original indexes; they do not sign or grant approval. Partial/existing indexes remain reserved for review, never overwritten by rerunning.

`team-cli.ts --bundle <ABSOLUTE_NEW_PRIVATE_DIRECTORY>` packages source and writes files; it is neither status nor installation/admission. It was NOT RUN and is not a substitute for a reviewed runtime-owner installation procedure. There is no `--execute` on `cli.ts`.

## 8. Current installed/runtime/spending admission

The runtime owner must separately authorize and perform actual current-source installation and no-inference controls. Do not start/stop/reset/replace guests or change egress, credentials, measurement installation or limits under this documentation assignment.

Privately record exact host/sandbox CLI identity; separate agent/grader instances and boot observations; native binaries/config/dependencies/images; protected package and collector identity; `TeamInventorySchema` and enforcement observation; installed policy; source/composition digest and revocation state. Verify no host home/SSH/keychain/Docker-socket exposure, grader package inaccessible to coding workers, worker network none and no credentials, grader deny-all, broker only fixed approved Meta Responses route, no redirects and no unapproved provider/model fallback. A non-generating provider catalog call also requires its own scope; it was not performed here.

Confirm actual one-CPU/768MiB/128-PID worker profile and declared output/disk limits, two-CPU/4096MiB/512-task VM profile and actual backing-device capacity control, bound wall time, requests/iterations, conservative tokens, spending and output/request. Account availability and tariffs must be current independently approved observations. Existing support ceilings are not recommended budgets or consent. Native 1M guard and conservative broker reservations are distinct; neither is an invoice or a per-command cap.

Verify public/worker termination, descendant kill, cancellation, read-only sealed transfer, actual restart absence, cleanup archive retention and owned lease handling for installed bytes. Verify protected metric collection on prepared and final snapshots, complete frozen rule/case coverage, exact tree/run identity and authenticated supplementary originals. A synthetic collector test cannot close installed admission.

The custodian must hold four distinct originals: `runtimeOriginalIds.A.paired`, `A.installed`, `B.paired`, `B.installed`. Paired subjects use `pairedRuntimeSubject(study, implementationSha256, variant)`, predecessor prepared-original hash. Installed subjects use `supervisedTeamRuntimeSubject` over paired authorization, inventory, enforcement, provider and composition, with the matching paired-original predecessor. Verify actual constructor requirements in `team-sbx.ts`; labels and an `enabled` field cannot supply the in-process admitted capability.

`runRegisteredTeamTournament` loads only the code-owned selected location, checks enabled state, loads authenticated prepared study and constructs the admitted transport. The paired controller permanently reserves the study/UUIDs, owns the common lease, rechecks both sources/current implementation/study, obtains two protected baselines and checks both paired admissions before either arm. The installed lifecycle rechecks inventory, registration byte identity, isolation, policy, originals and ownership at transitions. Exact current admissions must exist before launch; never patch a check or reuse old case-13 originals.

## 9. DO NOT RUN UNTIL SEPARATELY AUTHORIZED

This is the existing private execution grammar. **NOT EXECUTED by Agent D.** A later owner-approved operator may issue it only for the exact newly admitted ID, scope, source and budget:

```text
node --conditions=react-server --import tsx scripts/experiments/tournament/team-cli.ts --execute <REGISTERED_STUDY_ID>
```

Dispatch once. No automatic retries, fallback model, arm reordering, revised policy, extra round or silent budget increase. Attempt count is one per arm; retain nonzero, rejected, interrupted and incomplete outcomes. Opposing results stay withheld until both finish. The controller prints only mechanical outcome summaries, exits 2 on returned outcomes, and reports `comparison: NOT_ASSESSED`, `independentExecutionCustody: REQUIRED`, `publication: DISABLED`. That exit code cannot certify correctness or comparison. Thrown invalid/unavailable operations exit 1 with a fixed safe error.

Use SIGINT/SIGTERM to request the controller's abort path; do not kill random workers or delete locks manually. Deadline/cancellation must reach owned termination and cleanup. Normal finalization requires termination/restart absence before export, sealed source authentication, protected grading and cleanup. Failed normally terminated agent exits remain failures even if checks pass. Interrupted attempts do not advance to normal protected grading.

## 10. Cancellation, uncertainty and recovery

If cleanup, instance identity, lease ownership, termination, source seal or protected-store publication is uncertain, stop the pair. No second arm or reentry is authorized merely because a process exited. Retain journals and all source/failure/diagnostic records; no automatic retry. Cleanup failure may intentionally retain the lease. Never remove a lock or permanent UUID reservation to reopen a run.

Have the runtime owner inspect the exact owned attempt and retained journals under separate recovery scope. Confirm quiescence/worker and scratch absence, current instances/boots, preserved recovery archives and complete historical file integrity before any owner-authorized lease disposition. A recovery snapshot is inert forensic custody, not a normally finalized candidate or a replacement graded result. Preserve failures from the recovery itself. No generic repair/reset command is appropriate for all failures, so none is supplied here.

## 11. Post-run private authentication

Before any claim or publication, the separately authorized reporting operator/custodian must:

1. Retain `paired-<studyId>/study-original.json`, ordered stage journals, A/B attempt/candidate files and outcome, permanent UUID reservations, complete preparation history, runtime originals and every failure. Account for missing/partial files explicitly. Software cannot detect concealed attempts; the custodian must actually establish completeness.
2. Authenticate actual initial and final manifests, source commits/locks, shared task/conditions, admitted implementation and baseline run references. `RuntimeObservationSchema.origin` must genuinely be `actual_supervised_agent`; relabeling synthetic bytes is invalid. Confirm termination, restart absence, export without guest execution, worker/scratch cleanup and owned lease release.
3. Freshly load original protected baseline/future bundles and exact check bytes through `createProtectedEvaluationStore`. Match `runId`, `evaluatedTreeSha256`, `fixtureSha256`, `evaluatorSha256`, `testSuiteSha256`, `requiredPolicySha256`, exact `requiredCheckIds`, receipt/check artifact identities and actual verdict. Parsed receipts, native success and public readiness cannot pass this trust boundary.
4. Authenticate each execution original chained to that arm's admission, and complete-history original over `historySubject(study, orderedAuthenticatedArms)` chained to prepared original. Check authorization intervals at the correct actual run starts; fresh original/revocation validation is still required for later reading. Do not renew an expired admission to rerun or change a historical reader's pins.
5. Authenticate supplementary metrics under Agent B's accepted collector/custody mapping: four complete prepared/final inventories, exact arm/run/tree/protocol bindings, static rule coverage and protected authorization case observations. Missing, invalid, ambiguous, unsupported or incomplete data remains unknown. Equal final counts contradict the strict fewer-edges prediction; fewer edges with failed authorization do not justify adoption.
6. Load optional authenticated telemetry; reconcile input/output/total tokens and interval; distinguish conservative reservations from provider-observed usage and actual invoiced charges. Missing telemetry and prep/conversation costs remain null. Include all preparation/failed-attempt costs and use actual path union or unknown for total files touched; never add per-phase file counts or infer usage from budgets.
7. Build the measured private report through `loadPrivateTournamentReport`. Changed task/model/source/runtime/order, overlap, extra attempts, material deviations, missing original baseline, missing finalization or unauthenticated receipts block valid comparison or leave it inconclusive. Preserve a rejected/noncompleted arm and missing measurements; do not select a best checkpoint.

Existing private report grammar, only with separately authorized exact-original access and reviewed configured report composition:

```text
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --report <CANONICAL_PRIVATE_STUDY_ROOT>
```

It exits 2 for a valid inspection, including an unconfigured/disabled report; invalid/unavailable input exits 1. Never redirect its private output into public Git, a web route or a model prompt.

## 12. Disclosure, publication and optional interpretation

Follow [publication handoff](TOURNAMENT-PUBLICATION-HANDOFF.md). `prepareTournamentPublication` constructs a proposal from an in-process authenticated report and approved metadata/source-path subset. It grants no disclosure. The custodian must hold the exact disclosure original over `disclosureSubject(artifact)`, predecessor prepared-original hash, with current revocations and validity. Any changed report/projection/source subset requires new approval.

Only then may an authorized deployment owner provide `ApprovedTournamentConfig`: fixed publication/authority roots, complete workspace inventory, trusted public-key/revocation/original pins, exact study/projection digest, A/B baseline/future evaluation allowlists and read-only access. Do not store private configuration in these docs. Public serving freshly checks disclosure/publication and protected receipts on every read; private runtime/history/telemetry are committed through the approved artifact, not reopened on every public request.

Agent C must consume that fresh loader, keeping the deterministic `assessDecisionReport` result unchanged. The catalog provenance is `FRESH_APPROVED_TOURNAMENT_LOADER`; the pure analysis remains `UNAUTHENTICATED_ANALYSIS`. Missing, tampered, stale or revoked evidence disappears/abstains; it must never become a locally calculated substitute result.

Separately approve disclosure of the allowlisted summary to Meta and any paid interpretation request. Require Agent A's fresh registration/link authentication and a still-live same-process hypothesis, pre/post inference checks, and Agent B's reviewed mapping before sending any new metric counts. Current v2 summary cannot accept those counts. Optional Meta interpretation remains advisory and cannot change the deterministic decision, authorize a run or override missing evidence.

One A/B pair is N=1. Both passing means a correctness tie. Static edges measure only the predeclared direct dependencies, not general coupling or correctness. A/B does not isolate Meta's incremental value; an equally informed non-Meta control C would be needed. If gates remain open at freeze, preserve these limits and use the explicit unrun-study fallback.

## Mandatory stop conditions

Stop before the dependent action for **any** missing registration/original; expired/revoked/reassigned or wrong-context approval; late initial commitment; unsupported UUID lifecycle; changed source/lock/task/conditions/runtime/collector/evaluator/suite/policy; absent/failed original baseline; unsafe host mount/credential/socket/network exposure; missing exact account/provider/payload/spend authority; insufficient request/token/money/time/resources; missing protected metric collector/case coverage; changed guest instance or unverified boot controls; unavailable termination/cleanup/lease guarantees; failed freshness reload; incomplete attempts; or absent disclosure/provider-summary permission.

Record the exact failed gate, source/study scope and responsible owner. Do not convert unknown to pass, extend TTL, increase limits, suppress an attempt, reuse consumed approvals or weaken a validator. Recovery and a new study version require their own authority.
