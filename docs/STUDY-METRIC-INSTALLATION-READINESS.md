# Protected metric installation and review package

November 1, 2026. This continuation prepares a concrete protected measurement channel and a private instrumentation proposal for review before new Scientist generation or architecture selection. No coding-agent execution, inference, actual protected grading, independent signature, runtime enablement or historical-original rewrite is performed by this workstream.

## Implemented source channel

The optional private package manifest field `authorization` has this exact grammar:

```ts
{
  schemaVersion: "booking-team-authorization-instrumentation.v1",
  semanticsSha256: "<SHA-256 of the independently reviewed case semantics>",
  cases: [
    { caseId: "<frozen unique case ID>", checkId: "team-permissions-domain" }
  ]
}
```

There must be 1–100 unique bounded IDs. Each case maps to one of the existing domain, HTTP or adversarial group IDs. Descriptor identity uses `authorizationInstrumentationDigest`, including the exact semantics digest and case/group mapping. The immutable two-file package remains `manifest.json` plus `oracle.mjs`; no arbitrary package, code, collector path or command is accepted from a request.

`team-installation.ts` authenticates the package before import and after execution. For an instrumented manifest it supplies an additional trusted `observeCase(caseId, assertions)` argument to `runTeamOracle`. The independently reviewed private implementation must await this callback around its actual unchanged assertion case. The collector records an invalid/in-progress checkpoint before invoking assertions, observes a pass only after successful completion, retains an actual `AssertionError` as fail, preserves the original thrown value, and retains other errors as invalid. An interrupted process cannot convert its in-progress observation into a pass. Unknown/repeated cases, unawaited work and post-finalization callbacks reject protocol misuse. Storage failures latch a separate unavailable status and never prevent an original assertion, replace its exact thrown object or change the group verdict. Missing later cases remain `not_run`.

Retention failures attempt an additional incomplete invalidation checkpoint. Because a final file may already exist when fsync/close fails and every subsequent write may also fail, the in-memory unavailable signal additionally travels through a fixed safe child-output marker into the trusted grade report. Dispatch preserves the original report and refuses supplementary export. The authenticated evaluation loader retains only this negative fact from already hash-checked artifact bytes in a private WeakSet; both initial case assembly and the shared reread reject it. Receipt schemas, required-check status and deterministic verdict are unchanged.

Checkpoints are exclusive, synced 0400 files below the fixed root-owned private authorization directory. They contain only grading identity, descriptor digest, group, ordinal, lifecycle flags and case ID/outcome pairs. They contain no assertions, expected/actual values, RPC arguments, source, stack, arbitrary errors or credentials. They are never mounted into candidate workers or copied into receipts, source exports or public responses. The original eight/five required checks and `GradeInputSchema`/`GradeReportSchema` remain unchanged.

The fixed read-only `team-authorization-export.ts` operator command accepts only the existing profile and exact grading identity. It reauthenticates installed package hashes, validates bounded immutable contiguous journals, refuses reopened/missing/interrupted groups and exports the three final checkpoints plus an original journal digest. A legacy manifest without the descriptor returns `{"status":"NOT_INSTALLED"}` and exit 2. Missing/tampered observations return a fixed safe error and exit 1. This interface never invokes an oracle or candidate.

The host-only `collectProtectedAuthorizationOriginal` requires a fresh trusted evaluation, exact independently approved descriptor, registered case inventory and export. It rejects wrong run/tree/evaluator/suite/policy/descriptor identities, group/check disagreement, duplicate/missing/unexpected cases and incomplete/invalid observations. A passing group cannot substantiate a case failure. The returned document uses the existing `ProtectedAuthorizationObservationSchema`; the existing independently held snapshot/pair originals are still required. Neither a sidecar nor a protected receipt alone authenticates case semantics or creates authority.

Both new guest modules are in the exact controller manifest, source bundle and fixed inventory. The preparation-only AST utility is included separately in the team bundle. Changing these bytes invalidates old implementation-bound admission. Installation observations do not admit a real study or install the pending private package.

## Concrete pending private proposal

The authorized guest-only structural observation parsed the historical private module without importing or executing it and emitted only hashes, function names and bounded structural locations/counts. It observed 52 assertion call sites, including six in synchronous helpers and three inside loops. A general assertion-site rewrite would not preserve the relevant semantics, so it was rejected as the proposed approach.

The reviewed public `authorization-proposal.mjs` prepares only standalone, already-awaited calls to the existing named async rejection-assertion helper, inside literal positive group guards and outside loops. It refuses moved argument `await`/`yield` expressions, value-used awaits, ambiguous/helper-shadowed signatures and unsupported syntax. Exact site selection is available without renumbering. Original call fragments and order are preserved; stripping the recorded edits restores the exact original bytes. No assertion text or call arguments leave the guest. Extra promise microtasks and synchronous journal writes remain a timing change requiring review.

The final pending operation is `adeecfc9-a21d-45e6-96e9-bbe921425fe3`. Its private package, exact before/after patch and semantics proposal are retained separately from the historical installation. Earlier drafts remain retained under their own IDs. The final proposal contains **nine unclassified rejection-site candidates**: four domain, five adversarial, zero HTTP. Their IDs are `rejection-site-001` through `rejection-site-009`. The original eight checks still cover all three groups. These candidates may include validation/conflict negatives; helper names and group membership do not establish authorization semantics.

| Prepared artifact             | Exact SHA-256                                                      |
| ----------------------------- | ------------------------------------------------------------------ |
| Unchanged historical oracle   | `3100d52acdf7e627f93acbc74245857e3e79c35cc0b19b5cc710c81927ad094c` |
| Unchanged historical manifest | `5fffd9a20ebe090be15a45fc4674d17e5ffecce6af64adb98e4dca1991637dfd` |
| Pending instrumented oracle   | `d539c788542d94b31a389f622fd892baf2e52be878e7f0870736e6cf889e5e0f` |
| Pending semantics proposal    | `bc19540d119ef721987bfb050e702809dc27538dc816f9808281b1f0369a599d` |
| Pending manifest draft        | `a4f45c5de8233d94ef4554f5adf24f3e9d0c8ba603f57c424d633d8ee619eb78` |
| Private reversible patch      | `3dbd8bb58f83256cbe59c9897119575edbf8c88c623c329489c3bbfa78d76346` |
| Exact guarded proposer        | `67b939b254a213cda55a14a98d0b3edae1145f452bb27d5eb51f973737175fa5` |

Status remains `PENDING_INDEPENDENT_REVIEW`, `semanticsReviewed: false`, `UNCLASSIFIED_REJECTION_SITE_CANDIDATES`, uninstalled and unadmitted. The manifest draft deliberately retains an explicit external status requiring final current public-source/future-descriptor rebinding. It cannot be promoted as a valid prospective admission simply because its JSON parses. No genuine case outcome was observed.

The structural observation and each of three proposal preparations completed six bounded commands with exit 0 under the canonical shared maintenance lease. Each checked the original package hashes before/after, restored the 512-task/finite-device resource envelope before guest work, and finished with the dedicated grader stopped, zero sessions and its owned lease released. None executed assertions or changed the historical package. Original private command records and failure-free summaries are retained separately.

## Metric baseline identity repair

The former prefixed metric baseline ID was rejected by the actual guest's UUID-only gate. New operations use the versioned deterministic mapping implemented by `metricBaselineEvaluationRunId`: domain-separated SHA-256 over the downstream UUID, truncated to 16 bytes with v4/variant bits set. The exact convention is documented in [the metric integration contract](PROTECTED-METRIC-INTEGRATION.md). A regression exercises the actual `validRun` and `GradeIdentitySchema` gates and a fixed known vector. Historical synthetic originals are preserved; no genuine metric study used the unexecutable old mapping.

The separate private v2 measurement protocol addresses a second preexisting limitation: the original fixture has no future team adapter, so an eight-check future authorization baseline cannot establish zero failures. Its prepared baseline uses sealed static observations and the original five regression checks; authorization is explicitly not applicable before the future requirement and remains unknown. The final tree still requires the same eight future checks and the protected per-case channel above. The v1 grammar and historical originals remain unchanged. Final-case assembly has a focused v2 integration regression and still requires all eight receipt checks.

## Actual installed public controls and final read-only observation

The parent froze the 174-file trusted closure at `fc10619c8d8c9f165beb953def8fd066a730fb48bf44305426c8913034955da6`. The authorized public-controller maintenance operation `a96cff74-94c4-4580-8174-c7e2f1006d94` installed the exact current 23-file controller manifest. It changed or added 22 files, preserved exact previous bytes and original modes in a separate root-owned 0400 backup, and installed current files as root-owned 0444 regular single-link files. Nineteen existing files had owner-writable 0644 modes; an earlier strict 0444 precheck failed before mutation, and its bounded failure plus the metadata-only diagnosis remain retained.

Actual guest synthetic controls passed: pass/pass/intentional assertion-fail final export, checkpoint collision refusal, missing/partial export refusal, duplicate and runtime-invalid retention, late callback refusal, and initial/start/end/final post-write storage failure with unchanged original verdict. Worker UIDs 1000 and 65534 were denied reads of both the private synthetic journal and pending private package under no network, readonly, dropped capabilities and no-new-privileges. Owned control workers were absent after cleanup. These are synthetic control results, not protected case outcomes. Provider requests were zero; no private oracle, protected grading or coding agent ran. The exact control driver SHA-256 was `f308a1b660e3106b01c24fc7b3126078c1722ff0a5d5083f498bbdfb2e79e581`.

The same maintenance operation subsequently failed a historical registered policy-pin check. The actual installed policy is `eea3afed7ec947701e0a65c61c7f25405b910529fc3fe3a65d887fd2df654b99`; the historical registered pin is `ee84018470742edf077b6e28a58620ffcad1aa8acbed7acde053d2364523ae09`. The policy was preserved. Both guests were stopped and the lease released; the operation remains a failed admission observation despite its successful public installation and synthetic controls.

The separate final **strictly read-only** observation `b9fe8703-7c71-44e3-ba1f-d77a00b8a460` completed 19 bounded commands with exit 0 at 14:13:58 UTC. It rechecked both dedicated VM/image identities, actual binary/Node/config/supervisor/broker/helpers, immutable agent/grader worker images, installed controller/native closure and absence of workers/scratch. It made no installation or policy changes. The fixed legacy export returned `NOT_INSTALLED` with exit 2, confirming the historical private package does not advertise the new channel. Fresh `StudyDefinition.runtime` candidate pins were recorded as observations, with admission explicitly `NOT_ADMITTED` and historical policy mismatch retained as an admission failure. The current observed supervisor is `95e59f63a569d5f876b542d2a928e42fcd43c5b486ae76e7bad0b2f5d68743f6`; the current grader executable is `a035a4111bb9ae0c1e66b2534f9cd2e4066dcea12c861cac3074ea7dd84c0942`.

Canonical private package metadata aggregate `c817dd5d42d39f15888e8ec1674e8fdb6b526918c4feed57f8d341e9373cd1ce` and all 72 existing diagnostic-entry metadata/hash aggregate `700ddf442e956d79ecd46cf45917b515214b5b8f1f5b416d3e3072bc8a06cf8a` matched before initial installation and after the final observation. These checks used hashes and custody metadata; no raw private outcomes were inspected. Agent and grader inventories were stable during the final read-only observation. Both dedicated guests ended stopped with zero sessions and the canonical owned lease released.

The safe pending descriptor and review-path metadata were exported to private local 0400 files for the owner packet. Descriptor byte SHA-256 is `8719390fba3333c6d56b5a30c8582a82a377d497c807130d1587089e8783b219`; metadata byte SHA-256 is `bee47350b2cdceb65691356db6eca1ebaa584cca42cee77dbf3a6e42e86b13ff`. They contain case/group IDs, semantics/suite/patch hashes and exact private owner-review artifact locations, with no assertion bodies or outcomes. The original pending manifest remains a draft requiring final public-source/future-descriptor rebinding. The final read-only summary SHA-256 is `34cf27689763699dafcb830946cf290696ed6037cc119b4e4ed3f56535308d3a`; the prior install/control summary is `89ba4fc18549d59c8b504b110b6f2c5e30ef2909b72dac69fb8bb55e3c70ac00`. Exact local record paths are retained in the private packet inputs.

Automatic approval review rejected a proposed conversion of the historical policy guard into an observation, because removing it could allow privileged maintenance against an unvalidated policy. That rejected command did not execute. The successful alternative was limited to read-only diagnostics, preserved the admission failure, and performed no further installation or controls.

## Required private review and installation decisions

The owner/evaluator reviewer has a concrete private patch to inspect. Before any new commitment or generation:

1. Review every candidate site's unchanged original call fragment inside the guest. Classify/select the permission-focused subset, assign its precise public-safe semantics and explicitly reject non-authorization negatives. Approve the narrow supplementary scope; it is not complete authorization assertion coverage. The deterministic selection tool can regenerate the exact selected proposal without manually rewriting assertion bodies.
2. Review additional awaited bookkeeping and private journal I/O against the original timing/order constraints. Confirm that the original full five/eight-check behavior is preserved through separately authorized harmless compliant/defective package acceptance. No such protected acceptance is claimed here.
3. Bind selected case IDs and semantics before architecture generation/selection. Recompute the instrumented suite hash, final current public closure, derived future evaluator/descriptor/policy and proposed private manifest. Changing selection or semantics changes the exact approval package; preserve the drafts rather than refreshing their identities.
4. Review the completed public-controller installation and retained harmless controls independently of the private package. Authorize the exact selected, rebound private package installation only after its semantic/timing and compliant/defective acceptance review; the completed maintenance did not promote it or enable a study.
5. Only after private package review/acceptance, obtain fresh installation/isolation observations and four runtime originals; provision the existing independent snapshot-holding callback and current registration. Existing policies, expired approvals and historical preparation are not reusable authorization.

The remaining private semantic selection and package acceptance are specific reviewer decisions, not permission to fabricate approvals or infer case results from grouped outcomes. Source-ready channel tests and uninstalled private patch preparation are distinct from installed operational admission and real study execution.

## Validation records

All development commands disabled inference. The final storage-preservation and reread validation passed **167 tests across five files**, including collector, package custody, oracle-driver transport, protected metrics and the authenticated evaluation store. The earlier proposer/channel integration passed **134 tests across five files**. The broader installed-inventory/snapshot/Scientist integration pass completed **199 tests across nine files** before the last conservative standalone-await regression was added. TypeScript and focused ESLint passed. Storage regressions cover initial/start/end/final failure, pass/exact AssertionError/exact TypeError, before/after-write failure, recovery invalidation and later distinct assertion execution; a valid VERIFIED receipt with authenticated telemetry failure is rejected by both metric assembly and shared reread. An additional 95-test, three-file final pass covers permanent storage loss after final persistence and safe guest marker preservation for passing/failing checks with a synthetic diagnostic sink. `git diff --check` and changed-file formatting passed. The parent workstream owns final full-repository validation and its exact frozen closure.

Separate technical review found two unsafe generic AST cases: moving an awaited argument into a non-async callback, and discarding a value-used helper return. The proposer now refuses both. Regressions validate actual emitted ESM with `node --check` and independently execute a finite authored synthetic helper returning 7 before proving the unsupported transformation is refused. No protected source or experimental candidate is executed on the host. Earlier pending proposals remain private drafts and are not refreshed into new identities.
