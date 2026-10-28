# Restricted team-permissions grader bridge

October 28, 2026: public bridge source is implemented and synthetically tested. **Private oracle provisioning BLOCKED; protected behavioral validation NOT_RUN; operational admission BLOCKED; paired execution NO.** No private development workspace/custodian or guest-execution window was explicitly authorized. No private suite, compliant implementation, defective permission control, agent or sandbox was executed or installed by this assignment.

## Fixed profile and identities

The unchanged proposal is `booking-team-permissions-v1`, full canonical task digest `fcd6f62dd7ca4c9713c230bd83cc4ede181a9a873c6698d2db2148285ea05883`. Its member-create/member-cancel, owner-only revocation, seed-only creation and API decisions still require independent owner approval. This bridge does not approve or modify that task.

`grade-profile.ts` is standalone trusted host/guest validation. Absent `evaluationProfile` selects the original five checks and baseline report shape:

`typecheck`, `build`, `baseline-domain`, `http-integration`, `boundary`.

The sole additional profile kind is `booking-team-permissions.v1`. It requires those five plus `team-permissions-domain`, `team-permissions-http`, `team-permissions-adversarial`. Unknown profile/check IDs, commands, module paths, extra fields, mismatched exits and duplicate checks are rejected. Missing observations remain missing: publication records not_run and the existing store returns insufficient unless an authentic required failure takes precedence. No candidate verdict field is accepted.

The profile pins task ID/full digest, descriptor digest, original fixture, dependency lock, public baseline evaluator, composite future evaluator, private suite and required policy. Future suite identity is SHA-256 of the exact self-contained `oracle.mjs` bytes. `teamEvaluatorIdentity(publicEvaluatorSha256, suiteSha256)` hashes the canonical string-array value `["booking-team-evaluator.v1", publicEvaluatorSha256, taskDigest, suiteSha256]`. The public evaluator pin already covers the baseline suites, trusted source, policy logic, bridge, dependencies and locks. The existing `futurePolicy` independently commits task and complete baseline identities plus all eight checks; its canonical digest remains the required future policy. None of these hashes authenticates independent review or preregistration.

`prepareTeamGradeInput` reuses `prepareFutureEvaluation`, validates the descriptor/task/request and fresh `freezeBooking` pins, and binds the actual candidate envelope/tree and unchanged dependency lock. It performs data-only hashing, never imports a candidate or starts a process. `validateGradeInput` checks bounded paths/base64, duplicates, exact tree/run and future lock before guest registration, scratch creation or worker commands. `validateTeamGradeObservation` rebinds the resulting report to the original future request. Both existing real-agent smoke and offline-acceptance adapters explicitly refuse a future profile. No tournament or agent CLI was enabled.

## Protected package contract — not provisioned

Only the protected grader's fixed `/opt/forecode-booking/future` installation is recognized. Input JSON cannot select a directory or executable. The root must be root-owned mode0700; parent directories must be root-owned, non-aliased and not group/world writable. Exactly two bounded root-owned read-only regular files are allowed, with no symlinks/hardlinks:

- `manifest.json`: `{schemaVersion:"booking-team-oracle-installation.v1", profile:<exact TeamGradeProfile>}`.
- `oracle.mjs`: newly event-authored, independently reviewed private assertions, a self-contained ESM bundle exporting `async runTeamOracle(checkId, rpc): Promise<void>`.

No confidential implementation, private test input, credential, local operator path or real manifest is committed here. The package must have no unpinned sidecar/local dependency closure; only built-ins and the separately pinned trusted runtime are admitted by the review. Its root and assertions are never mounted into the candidate worker. Loading uses fresh bounded regular-file reads, inode/metadata checks, exact profile/code hashes and final freshness checks. The explicit directory/UID seam in `inspectTeamInstallation` is for synthetic inert-file custody tests; production dispatch always uses the fixed root and UID0.

The guest preflights the package before launching _any_ future-profile checks. Each future driver independently reloads it before invoking the fixed export; the guest rechecks it before emitting the final report. A missing/stale/substituted package prevents evaluation/report acceptance. There is no package installer, self-issued admission, dynamic oracle path or public registration endpoint.

`oracle-driver.ts` recognizes only the original baseline operations, boundary scan and three fixed future IDs. The private export must perform actual assertions, not return candidate claims or fill optional passes. Node AssertionError yields observed failure (exit1). Missing exports, malformed RPC or other bridge/runtime exceptions yield error (exit2), preserving insufficient evidence. The guest maps interruption/timeout to error, and never discloses private assertion text in its observation detail. Private suite completeness and independent review cannot be established by this transport contract.

## Candidate adapter and public behavior RPC

Both A and B need the same thin candidate-side adapter at `src/server/team-benchmark.ts`, exporting:

```ts
createTeamBenchmark({ seed, now, newId }): {
  domain(action, trustedViewer, organizationId?, id?, input?): unknown | Promise<unknown>;
  http(request: Request, trustedViewer: string | null): Response | Promise<Response>;
}
```

The adapter delegates to whichever internal architecture the candidate chooses. This transport integration requirement is public and requires independent common-protocol review before either arm receives it; it does not change the proposed behavior or its task digest. No particular policy abstraction, service class or internal file organization is required. No adapter implementing the future feature was added to booking-v1.

Domain actions return the matching HTTP payload from the task: `organizations` → `{organizations}`, `resources` → `{resources}`, `memberships` → `{memberships}`, `bookings` → `{bookings}`, `create-booking`/`booking`/`cancel-booking` → `{booking}`, `revoke-membership` → `{membership}`. Failures throw an error with the task's code. Viewer identity is supplied out of band; body/header identities remain untrusted. HTTP must cover both existing personal and proposed team endpoints in the same subject. Preserve the existing baseline service/HTTP exports for unchanged regression checks.

Known interface limit for owner review: local Node24 Fetch Request construction refuses TRACE, CONNECT and TRACK. The task's generic “unsupported methods return405” wording does not specify whether these wire-level methods are part of acceptance. This Fetch-based bridge cannot exercise them; it can exercise representable unsupported methods such as PATCH. Do not silently count those three as covered or change the task to exclude them. Resolve the interpretation before freeze; if required, add a separately reviewed wire-HTTP adapter. No approved semantics were changed here.

Only these extra RPC operations exist:

| Operation                | Arguments and returned behavior data                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team-new`               | Optional bounded JSON seed (including deliberately invalid seeds); creates a fresh adapter subject                                                          |
| `team-domain`            | Subject, fixed action, trusted viewer and only that action's org/id/input fields                                                                            |
| `team-http`              | Subject, trusted viewer and bounded URL/method/headers/body; optional canonical bodyBase64 preserves malformed UTF-8 bytes                                  |
| `team-concurrent-create` | Subject and 1–16 viewer/org/input operations; returns their result/error envelopes from concurrent calls                                                    |
| `team-booking-copy`      | Subject/viewer/org/id and replacement title; mutates one returned booking object, then returns before/after behavior data for assertions outside the worker |

Original baseline ping/new-domain/new-http/domain/http remain supported with explicit method and argument allowlists. A baseline worker cannot select a team operation. Subject types cannot be substituted. Each worker permits at most128 subjects and64KiB UTF-8 RPC input/reply, bounded headers/body and48KiB streamed response content. Request data can deliberately be malformed to exercise candidate validation; it cannot introduce commands, factories or module paths. An output containing `verdict: VERIFIED` is merely untrusted nested result data.

The public seed exactly retains Red/Blue memberships, `u-alice/u-bob/u-cara`, dedicated rooms, fixed November1 UTC clock and `team-booking-0001` sequence per fresh subject. Subject creation can supply malformed seed data for private validation controls. The candidate determines when a successful mutation allocates an ID; the transport does not consume booking IDs on its own.

## Execution and evidence boundaries

`worker.mjs` imports candidate baseline modules and the one fixed adapter **only in the unprivileged worker**. The trusted guest/driver never imports candidate modules. The worker mount contains exactly public `worker.mjs`, `client.mjs`, `probe.mjs`, `team-rpc.mjs`; no oracle/installation/profile/receipt code or private package. Assertions stay in the trusted driver; replies are behavior/errors only.

Existing resource and lifecycle controls are retained: network none, UID65534, read-only root/source, capability drop, no-new-privileges, CPU1,768MiB,64PIDs, bounded work/tmp/shm/output, fixed process timeouts and run-scoped cleanup. The total580-second guest deadline and60-second oracle deadlines are unchanged. An eight-check suite may exceed them; that is an incomplete observation, never permission to enlarge limits. SIGINT/SIGTERM cancel the controller; further launches stop and cleanup uses its independent bounded path. Cleanup uncertainty forbids a publishable result. No actual guest containment/resource observation was made here.

The existing publisher now knows the three extra check kinds/scopes and requires an explicit matching profile for future observations. It still assembles the unchanged EvaluatorReceiptV1 and original per-check artifacts. It rejects mismatched run/source/evaluator/suite/policy/fixture/required-check input before writing. Trusted operator code must invoke it only after genuine cleanup and fresh source/installed-package/runtime checks, then freshly reload originals through `createProtectedEvaluationStore`. This PR supplies no new execution orchestrator or authority to skip those obligations. Synthetic publication tests use real test-owned originals and are labeled synthetic; they prove authenticity of those bytes only.

`controllerFiles`, source freeze and the Python runtime inventory include the three new standalone dependencies. Bundles contain no private oracle. These changed implementation/controller/worker bytes invalidate prior runtime admissions. Owner installation, toolchain compatibility, private package custody and operational admission must be independently re-observed; compilation is insufficient.

## Validation and next owner action

Public tests use validators, inert fixture bytes, mocked private/Docker transports, and the existing real protected publisher/store. They cover eight/five dispatch, failures versus incomplete evidence, wrong identities, malformed/unsupported RPC, bounds, denied custody, cancellation/cleanup refusal, and absence of private source from worker mounts. No candidate module is imported on the host. See IMPLEMENTATION-LOG for exact commands/exits and development repairs.

The compliant implementation and defective member cancellation, tenant leakage, revoked access, forged identity, overlapping creates and personal-regression controls remain **unexecuted private acceptance requirements**. The private custodian must implement the complete owner-approved task suite and validate those controls only in the separately approved network-off guest, retaining exact source/check originals and failed outcomes.

Next assignment: **finish independent private oracle provisioning and protected behavioral controls**, after owner review of the unchanged task and common adapter. Then independently admit the changed installed runtime. Real-agent smoke and paired orchestration follow their separate authority/preregistration gates. Existing tournament equality, B preparation costs and two-stage commitments remain unchanged; its CLI stays disabled. Public bridge code completion establishes neither a genuine evaluator outcome nor A/B readiness.
