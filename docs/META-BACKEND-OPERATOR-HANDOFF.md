# Meta Scientist backend readiness and operator handoff

As of November 1, 2026, this implementation supports offline consistency checking, deterministic prospective metric calculation, bounded local reasoning and fail-closed interpretation preparation. **The full genuine authenticated Scientist → new Architecture Tournament → interpretation → deterministic Decision Report workflow is not operational.** Synthetic integration tests cannot close the missing prospective custody and deployment gates.

## Stage audit

| Stage                                             | Implementation / actual execution                                                                                                                                                                                                   | Remaining authorization and blocker                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed future requirement                      | Frozen full team-permissions task, validators, protected-grader interface and prior scoped acceptance documented.                                                                                                                   | Fresh exact task/protocol approval for this trial. Old private task/oracle approvals are not new runtime authority.                                                                                                                                                 |
| Meta A/B proposal → issued hypothesis → challenge | Production flow executed genuinely November 1 on `8749d24`, retained immutably in PR48. New lifecycle generations and local deployment restriction have synthetic regression coverage.                                              | New inference requires exact payload consent, provider configuration and scoped spending. Historical UUID expired; never restore it.                                                                                                                                |
| Measurable prospective prediction                 | New strict metric protocol, static parser and deterministic calculator implemented and tested offline.                                                                                                                              | No real preregistration, installed protected measurement instrumentation or metric-custody extension. Review common rules and zero/zero risk before selection.                                                                                                      |
| Prepared A/B and independent experiment           | Existing registered local runner, source/baseline/runtime/history/telemetry custody and network-off protected grader exist. Log records genuine historical private pairs and scoped AI review; this task did not reopen them.       | Fresh scope, independently held protocol before selection/preparation, exact current source-bound installed/runtime/spending originals, separate execution authority. No new trial executed. AI/shared-host review is not independent organizational/blind custody. |
| Publication / Decision Report                     | Existing fresh protected publication/receipt loader and deterministic report integration tested with synthetic signed fixtures. Production composition is `createTournamentPublicationReader(null)`; safe inspection reports empty. | Exact genuine report access, disclosure review, current originals/revocations, private source composition, read-only mounts and deployment approval. Historical private results remain private.                                                                     |
| Authenticated evidence interpretation             | Strict v2 contracts, bounded provider transport, safe allowlisted evidence and pre/post-inference freshness checks. New prospective registration/context/study validation strengthens the injectable server seam.                   | **No existing authoritative Scientist prospective registration resolver.** Both default resolvers return null. No keys, mutable enrollment API, client digests or historical metadata can supply it. Production remains fail-closed.                                |
| Final engineering recommendation                  | Unchanged deterministic report preserves correctness ties, unknown costs and INCONCLUSIVE; model output is advisory.                                                                                                                | Requires actual authenticated available evidence. New edge counts remain unsupported by current interpretation v2 and force abstention until reviewed additive custody/mapping exists.                                                                              |

## Enforced operating model

Live research HTTP supports exactly one trusted local operator in one process. Launch with the repository's standard loopback-bound `npm run dev` or `npm run start` and explicit declarations:

```sh
FORECODE_ORIGIN=http://127.0.0.1:3189
FORECODE_RESEARCH_MODE=local-single-operator
FORECODE_RESEARCH_PROCESSES=1
```

These declarations do **not** enable spending, approve a payload, provision evidence, authenticate a person or create a session. Missing declarations, other counts/modes, non-loopback/HTTPS origins, non-loopback request URL or listener-port mismatch and known hosted runtime indicators are rejected before live service dispatch with the safe 503 envelope. Operating declarations are checked again after inference. Next may supply forwarding headers itself; headers are never treated as caller authentication.

Keep the listener bound to loopback and do not expose it through a proxy, tunnel, shared workstation account or remote service. The app cannot discover a concealed proxy or verify how many OS processes an operator launched. The operating declarations must reflect the actual deployment. Within the supported perimeter every caller is the same trusted operator; there is **no authenticated multiuser boundary**. Client intent IDs, cookies and arbitrary session headers cannot establish one. Shared-host untrusted users are unsupported.

State and quotas are process-local, lost on restart and not shared across replicas. The 30-minute lifetime is unchanged. Separate service instances reject each other's UUIDs; launching more processes is not a supported way to obtain more spending allowance. Approved-payload and call limits, provider-side controls and manual monitoring remain required. Hosted read-only historical presentation can remain available; these restrictions apply to live research POSTs. A production multiuser service or durable issuance needs a separately reviewed authenticated session/store design; no Redis/database is introduced here.

A new accepted hypothesis retires previous challenge/interpretation IDs for the same accepted context. Pending work retains its exact server acceptance generation; accepting a newer overlapping proposal or replacing a hypothesis invalidates stale pending responses. Failed replacements do not revoke valid accepted state. Reproposing old content cannot revive old UUIDs or extend a hypothesis lifetime.

## Future authenticated lineage interface

`ProspectiveRegistrationSchema` is a safe **data contract**, not a trust root. The test-only supplied resolver must return an independently authenticated, currently authorized/unrevoked immutable original. It binds an opaque registration ID, exact issued UUID/content/issuance time, full approved intents/graph/candidates/scenarios/goal, study/task definition and protocol original, baseline/future evaluator/suite/policy, model and order. Registration must be after issuance, before every preparation/downstream start, and expire within the original hypothesis lifetime.

The later separate evidence link pins that registration, exact completed publication projection and disclosure approval time; it cannot extend registration expiry. Fresh publication loading authenticates both baseline/final source/run/receipt/check identities through the existing protected stores. Registration-study fields must match the authenticated projection; prepared B must have independently reviewed conformance to the registered candidate. The current pure validators cannot establish that conformance or historical chronology. A future authorized resolver must also establish the metric commitment, matching agent/budget conditions, current intent authorization, study consumption/no reassignment and separate exact provider disclosure rights through the existing custody system.

Both `resolveLink` and `resolveRegistration` default to null, even if a genuine public tournament is later provisioned. There is no environment switch, public upload, synthetic enrollment, signer fallback or alternate authentication path. `resolveRegistration` returning parsed client JSON is forbidden. Test-owned synthetic originals exercise validation only. An old server-issued UUID does not create prospective study custody.

## Commands and acceptance criteria

The following commands use Node24 and locked dependencies, no provider credentials and no paid inference:

```sh
node --import tsx scripts/meta/verify-live-recording.ts docs/recordings/live-meta-scientist-20261101
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --publication-status
node --conditions=react-server --import tsx scripts/experiments/tournament/team-cli.ts --status
```

Recording verification must exit0 with offline consistency only; it does not authenticate historical HTTPS, actual source execution, catalog calls, concealed failed attempts, tariff authenticity, cleanup, private credential handling or invoices. The reviewed source pin is an explicit expectation of this historical verifier, not observed source metadata from a provider signature. Original response-byte hashes use compact `Response.json` reconstruction; provider IDs' raw-string and canonical-string hashes remain distinct and cannot be converted without missing raw IDs.

Publication status currently exits2 with empty counts. Team status currently exits2 with `execution:DISABLED`. Neither admits a runtime, accesses hidden assertions, discloses private outcomes or spends money. Do not treat these expected gate exits as a failed experiment or override them to obtain a success display.

Only after separate fresh approvals and reviewed **private** registration, an authorized operator can run the existing command grammar below. Placeholders describe required private inputs; they are not current granted authority:

```sh
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --definition /absolute/approved-private-study-root
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --readiness /absolute/approved-private-study-root
node --conditions=react-server --import tsx scripts/experiments/tournament/team-cli.ts --execute REGISTERED_STUDY_ID
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --report /absolute/approved-private-study-root
```

Definition/readiness/report are no-inference but require separately authorized private-original access. Inspect actual gate results privately. The registered team command is a paid/controlled execution gate, **not run by this task**. Its exit2 mechanical outcome does not establish VERIFIED or comparability. Require both exact starting baselines, all declared attempts/terminal sources, fresh independent protected checks, complete history, honest telemetry unknowns and owned cleanup before report review. Changed implementation bytes require new admissions, never adjusted historical receipts.

For public serving, follow `TOURNAMENT-PUBLICATION-HANDOFF.md` exactly: designated reviewer/custodian approves the complete report projection and disclosure interval, deployment operator supplies the sole private source-owned registration and fixed read-only custody mounts, and the fresh inspection/report catalogs must load without failures. Do not paste private paths, protected tests, keys, raw records or comparative results into Git. Separate provider disclosure approval for the allowlisted Scientist summary remains necessary even after public disclosure.

Full acceptance requires a **new prospective** registered context/study, matched genuine A/B sources/conditions, authentic fresh receipts/publication, an authoritative current lineage resolver, successful separately approved live interpretation, and an unchanged deterministic report regenerated from the same authenticated evidence. Until every gate actually executes, report the workflow as blocked. No mock, local timestamp, hash or passing CI supplies authorization or experimental success.
