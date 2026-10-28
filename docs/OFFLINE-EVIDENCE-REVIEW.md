# Prospective offline evidence intake and private disclosure review

`review:booking-evidence` is a developer-local, read-only intake of **one explicitly pinned prospective fixed acceptance attempt**. It replaces manual source/run/metadata assembly before the existing certificate consumer. It does not execute acceptance, read candidate source, inspect a runtime, renew admission, discover historical outputs, register a catalog or publish anything. Production catalogs remain empty and new source runs/certificates **NOT_PROVISIONED**. Genuine future fixed acceptance remains **NOT_RUN** by this implementation.

## Boundaries and implementation plan

This bounded M3/M8 evidence slice has four implementation steps: validate protected original intake and full case accounting; authenticate original evaluations; optionally validate separately supplied complete-run disclosure through the unchanged certificate/export service; publish an exclusive private review report. Producer-backed synthetic tests cover all four steps. Exact observed validation and commits are in IMPLEMENTATION-LOG and BUILD-PROVENANCE. This does not complete M3, M7, M8, an architecture study or Meta attribution.

The source branch depends on prospective capture commits `f7b3091cedb2ef428dbc769a1fbdc08f5fe2686e` and `0b46c44d45af24718ebcb7597da96b33fdf9fe3f`. At intake implementation preflight, PR #9 was actually merged at `ee56419b330919766b41c0f41354af02ef8674e6`, while capture PR #10 was OPEN at 0b46c44 and its two commits were absent from main. `codex/offline-evidence-review` therefore branches from that verified capture head; #10 remains an integration dependency unless separately merged. Earlier OPEN/unmerged log statements about #9 are historical observations and were not rewritten. No PR is merged by this tool. During final validation, PR #10 was independently observed merged at actual merge `a8a00918a2c4071dcc29071b5745b64573cb54a8`; fetched main contains 0b46c44 and has an identical tree to that verified branch base. The capture integration dependency is therefore resolved without a merge/rebase/reset by this task. The local feature branch remains a descendant of the same capture source commits.

The implementation lives only under `scripts/experiments/artifacts/offline-evidence-{schema,review,review-cli}.ts`. New formats are private script formats, not additional frozen public definitions. Filesystem operations reuse the existing custody helpers. The tool does not import the producer, execution/process helpers, sbx/provider adapters or model transport. It has no runtime test mode. Existing source consumers, authentication markers, public shapes, guest manifests and default catalogs are unchanged.

## Usage — future authorized operator work only

Help and default invocation perform no protected reads:

```sh
npm run review:booking-evidence -- --help
npm run review:booking-evidence
```

For a separately authorized future source review, provide explicit private input paths and a new output directory:

```sh
npm run review:booking-evidence -- --config <PRIVATE_OFFLINE_CONFIG> --request <PINNED_SELECTION_REQUEST> --output <NEW_PRIVATE_REVIEW_DIRECTORY>
```

After separate complete-field disclosure review, validate an explicit candidate input into another new directory:

```sh
npm run review:booking-evidence -- --config <PRIVATE_OFFLINE_CONFIG> --request <PINNED_SELECTION_REQUEST> --approval <EXPLICIT_DISCLOSURE_INPUT> --output <ANOTHER_NEW_PRIVATE_REVIEW_DIRECTORY>
```

The command uses the existing Node/tsx/react-server convention. All paths are absolute and canonical; placeholders above are not operational paths. Unknown, duplicate, positional or conflicting options fail before protected reads. There is no execute/scan/root/model/task/command/source-path option. Configuration uses the existing strict OfflineConfig shape for protected/scratch roots and profile/configuration bindings. Reading evidence does **not** require an active execution review, and the tool neither opens `reviewFile` nor tests/renews its expiry. `acceptanceEnabled` grants no authority to this read-only tool.

Input files must have operator ownership, one regular-file link, no group/other permissions, bounded size and canonical private mode0700 parents. Config/request/disclosure files may be mode0600 or0400. Original producer files must remain mode0400. Roots must be canonical, private and disjoint from the task and APP. The output must be a **new**, disjoint directory under a canonical private parent, outside protected/scratch/coordination roots and APP. Existing files/directories, symlinks or aliases are never overwritten.

Exit codes:

| Exit | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0    | Help, or full-suite source validation with no disclosure requested, or validated supplied disclosure with a private candidate |
| 2    | A private report was written, but sources are incomplete/invalid/unsupported or disclosure is unavailable/invalid             |
| 1    | Invalid arguments, unreadable/unpinned acceptance, input custody/schema failure or output failure prevented a complete report |

Console output is fixed statuses and counts only. It contains no filenames, paths, complete runs, metadata, diagnostics or raw exceptions. An absent/failed report is never a success. Review private reason codes and source accounting rather than inferring acceptance from process exit alone.

## Selection request — external pins, not discovered trust

The strict `offline-evidence-selection.v1` request has these exact fields:

| Field              | Meaning                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`    | Literal `offline-evidence-selection.v1`                                                                          |
| `acceptanceId`     | The one original acceptance UUID; determines only `<PROTECTED_ROOT>/<UUID>/acceptance.json`                      |
| `acceptanceSha256` | Independently supplied expected SHA-256 of the **original acceptance bytes**                                     |
| `sourcePlanSha256` | Expected exact original suite `source-context.json` byte digest, or null if unavailable                          |
| `caseContexts`     | At most four `{runId,sha256}` entries pinning exact original per-case context bytes, with no arbitrary filenames |
| `pins`             | Explicit expected source/freshness identities below, or null when unavailable                                    |

`pins` has exactly `repoCommit`, `fixtureSha256`, `implementationSha256`, `evaluatorSha256`, `testSuiteSha256`, `requiredPolicySha256`, `requiredCheckIds` and `agentConfigSha256`. The fixed policy names are `typecheck`, `build`, `baseline-domain`, `http-integration` and `boundary`, unique and complete. `implementationSha256` identifies the original producer implementation, while `evaluatorSha256` identifies its runtime-pin digest; these are distinct identities. Git commit and source-tree digests are distinct too.

Supply these pins as an explicit trusted operator choice from the selected prospective source package. The tool does not calculate a hash from an arbitrary found file and then call it authentic. A hash alone cannot prove the pin came from a trusted operator or that a human granted authority. The acceptance pin binds its finite source references/evaluator entries; entries still undergo strict identity checks and original protected-store loading. Suite/per-case context pins and explicit source freshness pins are additionally required. Null/missing source pins cannot enable a candidate.

The tool reads only fixed UUID-relative acceptance/context/run/evaluation/check filenames. It follows the exact referenced `experiment-run.json` **or** `experiment-run-failed.json`; it never chooses a collision file, `.pending` bytes or an unreferenced alternative. There is no directory scan, glob or candidate source read. Do not pass private historical outputs or the private preview as inputs to this implementation task.

Acceptance and evaluator wrapper bytes retain their original producer serialization and exact byte pins. Run/context originals must have the canonical JSON bytes promised by the producer. Intake does not rewrite originals, normalize their timestamps or substitute canonical wrapper bytes for the pinned originals. It verifies private ownership/modes, no-follow/path/alias/single-link bounds, UTF-8/JSON limits and mutations both during individual reads and across the complete intake.

## Source accounting and evidence authentication

The private review contains:

- The selected acceptance identity/byte pin and exact selection descriptor, plus `sourceSetSha256 = jsonDigest(selection)` for a later disclosure input to bind. This digest is a content binding, not an approval or signature.
- Validated original fixed profile when available, declared-case count, original suite status, fixed reason codes and `sourceState` (`validated`, `incomplete`, `invalid` or `unsupported`). Unsupported/unparsed suite status stays null, never an invented failure/completion.
- Four ordered review slots: baseline, distinct-final, ownership-regression and forged-success. Unsupported source slots can be `not_assessed`; supported never-attempted cases have no invented run. The report cross-checks declared plans, attempted diagnostics, grade observations, references, entries and verdicts rather than choosing successful cases.
- For each attempted case: its exact original frozen run when available, original byte digest, **proposed** complete-run digest, independent check verdict or null, disposition and reason codes. Proposed digests are private review material, not `approvedPublicRunDigest` values or operative registrations.
- `disclosure`, `publication:"NOT_PERFORMED"`, `runtimeAdmission:"NOT_ASSESSED"`, and an optional private candidate.

Dispositions distinguish `never_attempted`, `original_missing`, `failed_publication`, `unlinked_failure`, `authenticated_completion`, `invalid` and `not_assessed`. Diagnostics supply attempted-case accounting only; they cannot replace a missing original, create links or prove completion. A failed-publication original requires the matching publication-failure disposition. Lifecycle-only and historical formats lacking prospective source context are unsupported and never backfilled.

The original no-agent profile is checked against the fixed producer v1 values, configuration/runtime/limit bindings and explicitly supplied original implementation pin. No Git call compares an old source identity to today's checkout. All prospective cases remain A-family, with `evidenceOrigin:none`, recorded presentation, null attestation/seed and all five unobserved metrics null. Injected zero is not accepted as new fixed-producer telemetry; existing public consumers continue preserving genuine zero where actual approved source contracts support it.

Original evaluations are independently reloaded through `createProtectedEvaluationStore`; every evaluation must pass `isTrustedEvaluation`. Run/receipt/verification IDs, source/fixture/evaluator/suite/policy, required checks, case context and time containment must all agree. Plain/cloned/serialized objects cannot substitute for authenticated objects. Check verdict comes only from the store: required failure wins even with another result missing; missing required evidence without a failure is insufficient; every required trusted pass is scoped VERIFIED. The fixed producer cannot substitute optional pass labels for its required policy.

A mechanically completed run may be REJECTED or INSUFFICIENT_EVIDENCE. An unexpected rejected baseline can fail suite expectations while all linked original runs remain valid and reviewable. The tool preserves these cases. Unlinked interrupted/blocked/failed records remain visible but are not certificate-ready. `sourceState:validated` requires the complete four-case linked source set, regardless of whether its check outcomes meet suite expectations.

## Explicit disclosure input and private candidate

Default inspection does **not** construct a CertificateRegistration or call certificate composition. Its full runs and proposed digests stay private.

The optional strict `offline-evidence-disclosure.v1` input has:

- `schemaVersion`: literal `offline-evidence-disclosure.v1`.
- `sourceSetSha256`: exact reviewed selection digest.
- `certificate`: the existing certificate approval fields `id`, `title`, `scope`, `baselineCommit`, `generatedAt`, `evidenceOrigin` (literal `none`) and `limitations`.
- `sources`: exactly four entries, each containing `runId`, exact `sourceRunSha256`, explicitly supplied `publicRunSha256`, and the existing exact `RecordingMetadataSchema` `metadata` fields described in the [recording guide](RECORDED-VERIFICATION.md). Public metadata must match actual IDs, infrastructure category and the complete required/observed check set. Duplicate/omitted sources are refused.

`publicRunSha256` approves the **entire unchanged frozen run**, including its limitations and identifiers. It is never inferred from a matching proposed digest. Schema/digest validation checks the supplied content binding; it cannot establish that a human actually consented to disclosure. The operator must separately review every complete-run/public metadata field, including losing and insufficient outcomes. If a frozen field contains private text, withhold whole-run approval; do not redact it to manufacture a publishable original. The tool is not a secret scanner.

Baseline must equal the original approved source commit. Generation time must be explicitly supplied and follow original suite/run/receipt completion. The tool never uses current HEAD, output time or current browser intent to fill missing history. Historical intent/scenario references remain empty and decisionId null. No A/B arm, task, isolation evidence, measured architecture benefit or Meta advantage is inferred.

When the complete supplied disclosure validates, intake calls the unchanged `loadRecordedCertificates` and canonical export selector. It reloads original sources again around composition. Changed/disappeared runs, contexts, acceptance, bundle or evidence invalidate the candidate, including after prior successful intake. Partial/missing/unlinked suites cannot be reduced to a selected successful certificate subset.

Outputs are private:

| Fixed filename               | Content                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `review.json`                | Canonical complete private review, including original run review data and any candidate |
| `candidate-demo.json`        | Only after validated disclosure: exact unchanged frozen DemoResponse candidate          |
| `candidate-certificate.json` | Only after validated disclosure: exact canonical frozen CertificateV1 export            |

Files are exclusively staged at mode0400, synced, byte/custody checked, linked without overwrite and left with one link in a new mode0700 directory. `review.json` is published last as the completion marker. Failed/interrupted writes may leave private partial candidate or `.pending` diagnostics; without a complete custody-valid final report, they are not a completed review and must never be registered. Repeated outputs fail; use another fresh directory. Private report files themselves are not source evidence or publication authority.

Original receipt/check integrity identities remain original identities. The certificate's self-digest omits only its own digest field; it is not the full exported-file hash, a signature, proof of independently managed trust, or public reconstruction of private evidence. A candidate contains no raw evaluation bundle, check scope, grader stdout/stderr, candidate source, inventory or operator configuration. The private report retains full runs for disclosure review; do not publish that report.

## Separate next operator tasks

Changing scripts/experiments and package.json changes `freezeBooking`'s trusted implementation digest. The existing trusted source manifest already covers these host-only helpers automatically; guest controller manifests, installation layout and evaluator/agent visibility remain unchanged. No guest deployment is needed merely to run this local review helper. An old implementation review cannot admit future execution of changed trusted source.

After code integration/review, a separate operator task must verify the final trusted source/runtime/installation/inventory identities as required and obtain genuine current independent admission before separately authorized future fixed no-inference execution. No old review is renewed, expiry amended, approval self-issued or future runtime pass asserted here. Then explicitly select/pin the genuine new originals and use this tool under separate source-review authority.

A later disclosure/publication task must review all complete runs/public metadata, retain rejected/insufficient outcomes and explicitly approve a concrete code-owned catalog change. Verify actual page/API/download behavior only after that approval. This tool never edits `recording-catalog.ts`, starts the private preview, serves candidate files, uploads or publishes anything.

The four historical recordings still have `run:null`, unknown completion/metrics and unavailable certificates; their private preview and originals are untouched. Current modeled comparison still has no linked measured experiment. Fixed infrastructure checks do not establish experiment fairness, measured architecture benefit, Meta incremental advantage or root-capable-agent/sandbox containment. Agent supervision, termination/export, hard provider budgets, matched experiments and Meta live hypothesis/challenge validation remain separate work; the earlier live propose approval remains consumed.
