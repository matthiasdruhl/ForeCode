# Booking evaluation handoff

## Current status — October 28, 2026

The [future team evaluator adapter](BOOKING-FUTURE-EVALUATION.md) extends the existing receipt/store boundary with public task/oracle/policy bindings and synthetic tests. No private oracle or future guest bridge is provisioned. Baseline suites/required checks remain unchanged; adding the public task/validator to the source freeze changes the trusted implementation identity and invalidates earlier admissions. This is preparation only, with owner policy review and operational gates still blocked.

The historical preparation description below predates the owner-reviewed offline acceptance. Fixed no-inference guest acceptance subsequently completed with two VERIFIED and two REJECTED cases; see [installed verification](BOOKING-INSTALLED-VERIFICATION.md). That evidence does not admit a real coding agent or establish an A/B experiment. Real agent invocation remains disabled, and production evidence catalogs remain empty. This assignment adds local pre-run preparation and tournament integrity checks; it does not renew the old runtime admission.

## Historical preparation scope

The foundation provides a standalone baseline, independent public baseline oracles, source preparation, strict evidence contracts, receipt assembly and protected read-only loading. The local controller now has a separate [no-inference acceptance path](BOOKING-OFFLINE-ACCEPTANCE.md); real agent execution is hard-disabled pending supervised termination/export acceptance. See [the operator runbook](BOOKING-RUNNER.md). No real agent or offline booking guest execution has occurred, and verified sandbox isolation is not claimed. The existing operator environment was inspected read-only and preserved.

## Separate custody

1. Export only `fixtures/booking-v1` with `npm run prepare:booking -- --output /new/absolute/directory`. The command refuses existing outputs, evaluator/holdout/controller files, secrets and symlinks. It does not execute the subject.
2. Keep `scripts/evaluator`, all private future holdouts, controller configuration and protected outputs outside that exported tree and outside every guest-visible/agent-readable mount. The public baseline oracle may be reviewed; it is never described as an unseen holdout.
3. Freeze the source, evaluator and policy with `npm run snapshot:booking --silent`. That commitment is preparation evidence only. It is not an evaluator receipt, a sandbox attestation or a model response.
4. After owner authority and the separate offline isolation/runtime review, the local controller can grade only its reviewed fixed acceptance scenarios in the network-off evaluator guest. Future agent execution additionally requires supervised termination/export and the unchanged full paid-experiment review. Grade the exact immutable final snapshot. Run all pinned required checks; retain failures and absent results.
5. Only the trusted controller writes original evaluation bundles and check artifacts to the protected root and configures the allowlist. Public users, agents and model output cannot choose roots, pins or receipt IDs to register.

## Protected loader

`src/server/artifacts/evaluation-store.ts` reads only operator-configured allowlisted records. It refuses overlapping artifact/task roots, traversal, symlinks, non-regular/oversized files, changed bundle bytes, stale source/fixture/evaluator/suite/policy pins, cross-run checks, canonical digest mismatches and changed evidence bytes. It copies/freeze-locks the allowlist at construction and returns immutable authenticated in-process objects. Serialization loses that in-process authenticity marker.

Once custody and freshness pass, any failing required check means `REJECTED`; all required checks passing means `VERIFIED` within the pinned scope; missing/invalid required results mean `INSUFFICIENT_EVIDENCE`. Without authenticated evidence, public preview remains insufficient regardless of reported success. A receipt/hash string or `issuer` label alone never authenticates a result.

The loader's disjoint-path and synthetic tamper tests are **not OS/microVM containment proof**. Real agent read/write denial, protected-oracle custody, restricted model egress, offline grading, limits and cancellation still require the sandbox integration report and an observed run. No real allowlist, private oracle, evaluator output or server credential is provisioned by the tests.

## Before the first real run

- Review the other agent's actual version/image/mount/credential/SSH/network denial evidence. Preserve its configuration.
- Pin the task, final-tree snapshot procedure, guest toolchain, required policy and oracle hashes before observing outcomes. Do not execute uploaded or agent-modified code on the host.
- Supply isolated service/HTTP adapters to the frozen oracles; do not accidentally grade the untouched host baseline instead of the final candidate.
- Record real process exits, artifact digests, missing metrics as null and cancellation. Keep host paths/private diagnostics out of UI/model summaries.
- A/B needs both initial variants passing the same current oracle, matched downstream conditions and B upfront cost. Meta-attribution needs its separate equally informed comparator. None is established by these developer checks.

Next operator work is the trusted installation and no-inference booking bridge acceptance detailed in the handoff. Offline review requires no fabricated provider-budget evidence. Paid execution remains hard-disabled; current isolation, provider hard caps/authorization and supervised agent lifecycle are separate future gates. Consented Meta transport remains separate work. Muse remains a conditional adapter under the reviewed planning overlay; the original frozen schema remains unchanged.
