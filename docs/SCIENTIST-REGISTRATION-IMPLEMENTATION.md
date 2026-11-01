# Authenticated prospective Scientist registration

Implemented for Agent A on November 1, 2026. PR #51 was already merged (GitHub merge time `2026-11-01T06:22:50Z`). The isolated branch `codex/authenticated-prospective-registration` starts at `2fdbc3bb53660aa414c7c7fb0ce9719e6589aaea`, fetched from `origin/main`. The starting tree includes `prospective-lineage.ts` and PR #49's hypothesis lifecycle corrections.

## Delivered behavior

`createScientistRegistrationReader` authenticates three independently held originals: the existing protocol/study definition, a preselection Scientist commitment, and its append-only issued-hypothesis supplement. It requires the existing pinned Ed25519 authority, exact envelope/document byte pins, subject digests, predecessor identities, current validity and fresh revocation bytes. Every read authenticates the originals again. Successful Zod parsing, a cloned authenticated object, a client UUID, an environment variable or a self-supplied key confers no authority.

The initial commitment precedes the **start** of proposal generation. It binds the accepted initial intents/revisions, reviewed graph, goal, study/task definition, measurement rules/prediction, original source manifest, both predeclared run identities, model, order and full experimental conditions through the held study definition. The later supplement contains the complete accepted candidates/scenarios/context and exact issued hypothesis UUID/content, provider provenance, issuance time, bounded lifetime and immutable measurement lineage. Its `registeredAt` must equal the independently held supplement time. This preserves the original commitment rather than rewriting it after issuance.

`createForesightService().register(registrationId, hypothesisId)` is a private, same-process operator read/admission method. It resolves the currently active issued UUID, checks it again after asynchronous authentication, rejects concurrent/duplicate admission, and revalidates the authenticated content against that exact issuance. There is no HTTP registration route, signing capability, TTL extension, durable issuance reconstruction or historical fallback. Registration completion means independent custody of the supplement; this method reads that completion and does not issue approval.

The reader rejects an expired/retired hypothesis, wrong initial intent revision, mismatched task/protocol/evaluator/suite/policy/model/order/conditions/source, changed context, repeated or reassigned study binding, and any registration held after downstream custody in the complete reviewed source inventory. Inventory completeness is an operator obligation, as with existing byte-pinned custody; the application does not discover or trust extra files. All production reads use the actual server clock. Factory clock injection is for trusted source composition and disposable tests, never a request parameter.

`createScientistEvidenceLinkReader` authenticates a later held `scientist-evidence-link` original under the **same** existing authority as publication disclosure. It pins the registration original, selection time, complete preparation evidence/draft, prepared original, A/B sources, predeclared runs, baseline/final receipts and exact publication projection. It recomputes the existing preparation/prepared subjects from their payloads and authenticates every preparation-attempt authorization. The signed link explicitly scopes disclosure of the existing allowlisted Scientist summary to the two eligible Meta models and records independent review of B against the registered candidate. Those statements require actual custodian approval; the application cannot infer them from source hashes.

The link reader reuses the existing publication and protected evaluation/report readers. The existing deterministic Decision Report algorithm is unchanged. The evidence adapter now requires reader-authenticated in-memory objects from both seams and still validates its original report, receipt, chronology and sanitization checks. Service interpretation still rechecks active issuance and fresh evidence/disclosure after provider latency.

`approved-scientist-lineage.ts` supplies both source-owned production resolvers with `null` configuration. Production remains **NOT_PROVISIONED**. No inference, experiment, protected measurement or genuine registration was executed.

## Compatibility and ownership

The 49 frozen contracts and their normative planning pin are unchanged. `ProspectiveRegistrationSchema` and `EvidenceLinkSchema` retain their wire shapes; the link schema moved to the lineage module and is re-exported from its old location. Only local custody gets three additive kinds: `scientist-commitment`, `scientist-registration`, `scientist-evidence-link`. The shared local envelope schema is extracted into `src/lib/experiment/scientist-custody.ts`; the operator re-exports its existing API and retains its original reader/trust behavior.

All new filesystem reads remain inside `src/server/artifacts/evaluation-store.ts`, the existing reviewed read-only exception. Its publication read primitives are shared; Scientist originals additionally require mode 0400. Reads are bounded, use `O_NOFOLLOW`/`O_NONBLOCK`, check regular-file ownership/single-link custody, reject aliases, and check file identity/timestamps around reads. The existing publication result exposes its authenticated disclosure time for chronology comparison. The publication-reader factory accepts a trusted source clock for tests; returned read methods still accept no client clock/configuration.

No Agent B measurement, evaluator, collector or measurement-documentation file is modified. No frontend, historical recording, protected oracle, execution control, deployment secret or consolidated implementation log is modified. This dedicated report follows the assignment's instruction to leave the shared implementation log for integration.

## Protected-measurement integration

`RegistrationLineageSchema` is the minimal immutable read-only contract. Obtain it from a fresh `AuthenticatedRegistration`, never from parsed public JSON.

| Identity                                         | Exact meaning                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studyId`, `hypothesisId`, `contextSha256`       | Registered study, live process-issued UUID, and digest of complete accepted intents/graph/candidates/visible scenarios/goal.                                                                            |
| `taskSha256`                                     | Existing complete task-definition digest (`study.taskDefinitionSha256`). The older scenario-request digest remains separately bound inside original arm conditions.                                     |
| `matchedConditionsSha256`                        | Canonical digest of the complete conditions object described in the operator handoff.                                                                                                                   |
| `evaluatorSha256`, `suiteSha256`, `policySha256` | Exact future evaluator, test suite and required policy from the authenticated study definition. Baseline counterparts remain in `registration.study`.                                                   |
| `protocolSha256`                                 | Canonical digest of the complete metric protocol: initial `measurementPlan` plus the eight registration identity fields above (study, hypothesis, context, task, conditions, evaluator, suite, policy). |
| `studyProtocolSha256`                            | Digest of the existing operator study definition's `protocol` object. Distinct from the metric-protocol digest and protocol-envelope byte digest.                                                       |
| `sourceTreeSha256`, `sourceManifestSha256`       | Canonical sorted original source-manifest digest.                                                                                                                                                       |
| `variants`                                       | Exactly A/B, registered candidate IDs and distinct predeclared run UUIDs.                                                                                                                               |

Agent B/integration must parse the composed metric protocol with the appropriate supplementary versioned schema, compare its canonical digest and every shared identity, and independently authenticate each protected observation/receipt. The lineage authenticates the approved commitment; it does not calculate metrics, attest collector completeness, upgrade observations, admit a runtime or authorize spending. The later authenticated link's arm identities bind prepared/final trees and receipts. Current v2 interpretation still abstains on unmeasured boundary/regression counts; no metric mapping is enabled here.

The initial `measurementPlan` must exclude issued identity fields. Adding the later UUID/context deterministically forms a new bound metric-protocol digest while retaining the initial original. Existing historical metric JSON containing a UUID cannot become the initial commitment. This interface needs no dependency on Agent B's unmerged branch; tests exercise compatibility with the PR #49 metric schema only.

## Validation record

Validation uses Node `v24.16.0`, the unchanged lockfile, synthetic transport and disposable test-owned signing keys/originals. Provider calls and spending are disabled; browser tests preload the existing network blocker.

Results and the tested source commit are recorded in the final validation update below. An initial offline dependency install failed with `ENOTCACHED`; the authorized locked `npm ci --ignore-scripts` then succeeded. The first sandboxed full check could not bind sockets in existing supervision tests (`PermissionError: Operation not permitted`); the full check was repeated outside that restriction. No failed check was silently omitted.

The new signed-original tests cover signature omission/forgery, changed signer/key, original/document bytes and subjects, revocation/expiry, initial and issued chronology, wrong complete context/identities, source/receipt/projection substitution, disclosure scope, repeated/reassigned binding, late preparation, cross-process isolation, pending replacement, plaintext object forgery, symlinks/hardlinks/permissions, unregistered files and production unavailability. Existing lifecycle tests now use actual disposable signed lineage; actual custody revocation during synthetic inference is rejected before returning an interpretation.

## Remaining authority and limits

Implemented and locally tested does not mean operationally provisioned. Disposable signatures authenticate only test-owned fixtures. No genuine custodian approval, private grader access, private evidence disclosure, paid provider call, runtime admission, preparation, protected measurement, deployment or genuine registered trial was authorized or performed here. The November 1 recording is unchanged historical reasoning evidence and is not attached to this prospective infrastructure.

See `SCIENTIST-REGISTRATION-OPERATOR-HANDOFF.md` for the missing independent originals, private same-process composition requirements and final operational checks. A genuine architecture outcome and operational readiness remain unestablished until those steps are independently authorized and demonstrated.
