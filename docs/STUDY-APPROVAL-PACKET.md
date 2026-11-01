# Unsigned prospective study approval packet

This local preparation tool creates a new candidate-neutral study draft for owner review. It makes no provider call, signs nothing, grants no permission, changes no runtime registration, and cannot launch a study. A complete unsigned packet is a review deliverable, not an approved or admitted experiment.

The fixed source is the existing registered `forecode-team-20261031-case-14` location. The tool uses `loadRegisteredTeamRuntime` and `readStudyInput(..., "definition")` to read only its non-result definition, then `snapshotTree` to inspect the actual original A source as data and fixed local Git reads to verify the graph-reviewed fixture. It never opens that study's draft, preparation, result, receipt, held-original or private-key files, imports its source, or executes the source. Loading a registered location does not authenticate every assertion in that definition.

A read-only check on November 1 exited zero: 22 original A files produced tree `e49687620469faad10637bac404b2f9a1c4973a12a55b2740eb7d904da5988d1`; both tree and dependency-lock comparisons matched the input definition, and both model fields named Contributor. No packet or experiment was created by that check.

The observed original source manifest must exactly match the input definition's original fixture tree and dependency-lock digest. The CLI also runs bounded, fixed-argument local `git ls-tree` and `git show` reads against the existing reviewed commit `a564da2fe36a5de3ea95f777c1f5a60fd80ad6f0`, hashes all 22 fixture files, and requires the complete canonical manifest to equal the actual original source manifest. The pure builder requires this reviewed Git manifest as a separate input and rejects disagreement.

This new study selects that existing graph-reviewed Git commit for both original conditions and the scenario baseline, while retaining exactly the same fixture bytes and lock. It does not rewrite or relabel any historical study. A direct invocation of the Git-manifest reader exited zero with 22 files and the same `e4968762…` tree digest. This comparison establishes present source-byte identity; it grants no experiment authority and does not authenticate old private Git history. No prepared B tree is read or copied.

## New identities and unchanged task semantics

The unused source-owned study slot is `forecode-team-20261101-prospective-01`, with a separate fixed private registration location and the existing public custodian anchor. No private registration document, enable flag or approval is created. Reserving this selector before source freeze avoids changing trusted code after approval. Each initial invocation allocates two distinct new run UUIDs and new intent/scenario/oracle IDs under that study slot. It preserves the exact frozen public task, its deterministic fixture clock, scenario assumptions, original fixture/lock bytes, common downstream prompt, adapter interface, Contributor model, resource limits, network/credential policies, tools and proposed budget ceilings. The task's November 1 fixture clock is deterministic test input, not an assertion about actual execution time. It copies no held time, selected architecture, hypothesis issuance, preparation attempt, receipt, measured outcome or approval.

The compatible `StudyDefinition` shape contains `scenario.frozen` and `origin: developer_confirmed`; these schema fields do not establish the new owner's confirmation, independent custody, preregistration or permission. The surrounding packet explicitly says `UNSIGNED_DRAFT_NOT_AUTHORIZED`. Owner review of task decisions and all exact draft bytes remains pending.

The common profile requires `muse-spark-1.3-contributor` on both arms. Historical ceiling values are proposed ceilings only. `currentTariff`, `actualUsage`, `currentSpendingApproval`, selected architecture, prepared B, issued hypothesis, approvals and held time all remain null. Historical image/binary/runtime hashes remain labeled `HISTORICAL_INPUT_PINS_NOT_CURRENT_OR_ADMITTED` until current reviewed candidate pins are supplied. Even refreshed pins are not proof of installation or runtime admission.

On November 1, 2026, the coordinating operator separately observed an authenticated fixed-endpoint `GET https://api.meta.ai/v1/models` return HTTP 200 with Standard and Contributor models visible, including configured `MuseSparkContributor`. This observation establishes account model visibility at that time only. It made no inference call and did not establish funding, billing readiness, available credit, a current tariff or spending approval. The packet builder neither repeats that request nor turns it into authority.

## Generate and preserve the draft

After implementation and descriptor freeze, run once from the ForeCode repository on Node 24:

```sh
node --conditions=react-server --import tsx \
  scripts/experiments/tournament/study-approval-packet.ts
```

`--help` is the only supported argument. No request/JSON/environment option selects a source registration, signing key, authority, provider or runtime activation. The tool creates a fresh canonical `/private/tmp/forecode-study-approval-*` directory. It never overwrites a previous packet. It writes and syncs exclusive mode-0400 files, then freezes the private directory to mode 0500:

| File                            | Review purpose                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `definition.json`               | Complete unsigned candidate-neutral study definition with new IDs                                       |
| `task.json`                     | Exact public future task and permission decisions                                                       |
| `original-source-manifest.json` | Relative source names and observed original file hashes, without host root paths                        |
| `common-profile.json`           | Identical proposed Contributor conditions, limits, missing tariff/approval state and runtime-pin status |
| `review-checklist.json`         | Exact definition/protocol/task subjects plus unresolved approvals and evidence                          |
| `manifest.json`                 | Exact canonical file byte lengths and SHA-256 digests; no signature or authority                        |

The command reports only the private output directory, reserved new study ID, definition subject, manifest digest and unsigned state. Keep this packet private. Hashes identify draft bytes; recomputing them cannot approve a study or create custody. Preserve one packet and its IDs for subsequent review. Run the initial command once for this reserved slot. Repeating it creates a competing unsigned draft with different run IDs under the same slot; it is not a retry or a continuation, and it must not inherit any earlier review or approvals. Retain and continue only the exact chosen packet. A future independent study requires its own separately staged source-owned slot before approvals.

`buildRegisteredStudyApprovalPacket()` prepares the same checked packet in memory for trusted local composition without writing it. Invoke this once and retain the returned IDs when composing additional unsigned Scientist review inputs. It includes a concrete unsigned/unconfirmed Scientist review input constructed independently from this exact task and reviewed graph. It does not construct a confirmed intent, consent or held protocol hash; those remain separate owner/custodian actions. No test or recorded context is reused.

`refreshStudyApprovalRuntime(packet, { runtime, controllerImplementationSha256 })` creates an in-memory revision with the same study/run/intent/scenario/task identities, validated new runtime pins and recomputed common runtime/definition subjects. Pass only current independently reviewed candidate inputs. `writeStudyApprovalPacket` can save that revision in a different immutable directory; it does not modify the original. Refreshed status is `REFRESHED_CANDIDATE_PINS_NOT_INSTALLED_OR_ADMITTED`. Old draft hashes no longer identify the revision. Any approval of earlier bytes must be obtained again for changed subjects; no approval is copied.

`refreshStudyApprovalEvaluation(packet, { baselineEvaluatorSha256, baselineSuiteSha256, baselinePolicySha256, futureSuiteSha256 })` revises the same retained packet after runtime refresh. The baseline evaluator must exactly match the refreshed controller candidate; the baseline policy must equal the existing public `bookingPolicy` digest. The helper derives the five baseline checks, future policy, all eight future checks and `teamEvaluatorIdentity` itself; it accepts no replacement policy or arbitrary evaluator identity. Descriptor ID, task and all trial IDs remain unchanged, while definition/protocol/Scientist review subjects are regenerated. Status remains `REFRESHED_CANDIDATE_NOT_INSTALLED_OR_ADMITTED`. Calling runtime refresh again invalidates this evaluation-candidate status until evaluation refresh is repeated. A well-formed suite digest is still only a reviewed candidate input, not proof of the actual installed suite or its provenance. Supply the evaluator owner's exact genuine instrumented-suite candidate hash; if unavailable, retain the pending state rather than copying a historical suite and claiming readiness.

The authorization instrumentation remains an unresolved evaluator-owner dependency: `booking-team-authorization-instrumentation.v1` requires the independently reviewed semantics digest and complete unique case-ID to domain/HTTP/adversarial check-ID mapping. The packet invents neither cases nor a new instrumented oracle suite digest. Once that exact installed descriptor/suite exists, include its reviewed identity in the independent measurement and runtime commitments before admitting a study. Existing GradeInput/Report contracts and deterministic report rules remain unchanged.

## Approval sequence

The checklist deliberately stops before generation. First review the exact task, source, common limits and current runtime/oracle/collector candidate pins. Review the concrete graph, proposed intent wording and goal in `scientist-preselection-review.json` alongside the complete `task.json`. This is an unconfirmed review draft, not a consented Propose request. The initial metric semantics remain pending; no measurement plan is inferred from a selected architecture. The existing custodian must independently hold the exact initial definition and measurement commitment before model generation or architecture selection.

Next review and approve each exact current Meta payload and spending scope through the existing staged operator harness. New same-process issuance and authenticated append-only registration must precede selection and preparation. A historical recording cannot supply this live lineage. Selected B preparation then needs its own exact approval, complete attempt history, reviewed source and actual accounting. Prepared commitments, genuine protected baselines, installation/isolation evidence, full inventories and exact A/B admissions are later requirements. One-shot execution requires its separate explicit approval. Genuine results require authentic report/receipt verification and separate exact disclosure/publication approval.

No stage here supplies a signer, enables a runtime, changes billing, activates publication or dispatches a paid request. A failed source comparison or missing registration exits with a fixed safe error and writes no packet. A write failure cannot produce execution authority; retain any incomplete directory as an incomplete local preparation artifact.

## Software validation

The focused `tests/unit/study-approval-packet.test.ts` uses synthetic inputs and disposable test custody only. Eleven tests cover new trial identities, reserved operator slot separation, unchanged task/common conditions, absent approvals/architecture/times/usage, tree/lock/duplicate/model rejection and differing reviewed-Git-manifest rejection, identity-preserving unsigned runtime/evaluation refresh, stale controller and policy/suite substitution rejection, canonical private read-only files/digests, and changed-packet rejection. The tests do not read the genuine registered study or make network, provider, guest or evaluator calls.

Observed focused test command exited zero: 11 tests / 1 file. The initial synthetic fixture setup changed only one of its two mirrored model fields and failed its existing consistency validator; correcting both mirrors made the focused suite pass. No production validator was relaxed. Aggregate validation is recorded by the coordinating agent after all preparation components freeze.

Changed-file ESLint, `npx tsc --noEmit --pretty false`, the CLI `--help` control and `git diff --check` each exited zero. No genuine packet was generated by this agent; the coordinating operator can generate the retained new identities once after final code freeze.
