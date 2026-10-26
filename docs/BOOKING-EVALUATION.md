# Booking evaluation handoff

The implemented slice provides a standalone baseline, independent baseline oracles, source preparation, strict evidence contracts, receipt assembly and protected read-only loading. It does **not** run an agent or claim verified sandbox isolation. The user reports another agent is configuring that environment; it was not modified by this work.

## Separate custody

1. Export only `fixtures/booking-v1` with `npm run prepare:booking -- --output /new/absolute/directory`. The command refuses existing outputs, evaluator/holdout/controller files, secrets and symlinks. It does not execute the subject.
2. Keep `scripts/evaluator`, all private future holdouts, controller configuration and protected outputs outside that exported tree and outside every guest-visible/agent-readable mount. The public baseline oracle may be reviewed; it is never described as an unseen holdout.
3. Freeze the source, evaluator and policy with `npm run snapshot:booking --silent`. That commitment is preparation evidence only. It is not an evaluator receipt, a sandbox attestation or a model response.
4. After the separate sandbox report passes review, the local controller can start a bounded approved task. Grade its exact immutable final snapshot in a separate network-off evaluator guest. Run all pinned required checks; retain failures and absent results.
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

Next runnable implementation work is the local controller/guest bridge once isolation is independently reviewed, plus consented Meta transport. Muse remains a conditional adapter under the reviewed planning overlay; the original frozen schema remains unchanged.
