# A/B repair-loop validation — November 2, 2026

The owner authorized improving compiler feedback, source-write reliability and published-requirement coverage, followed by an isolated diagnostic. These changes are in the active repair checkout, `/private/tmp/forecode-study13-agent-fixes`.

## Compiler feedback

A failing public session check previously prevented type generation and compilation from running. Full checks now evaluate session behavior independently from compilation. A failing HTTPS assertion and a TypeScript error can appear in the same response. TypeScript uses plain file/line diagnostics; failed subprocesses additionally expose a bounded public check ID, exit code, signal and interruption flag. A failed compiler check skips the build, and any failed requirement continues to block full readiness. Boundary violations still stop candidate imports before execution.

## Transactional literal-source writes

The common v7 orientation now recommends staging literal source under `/tmp` or `/work`, then invoking:

```sh
node /run/team-workflow.mjs write-file src/server/team-benchmark.ts /tmp/proposal.ts null
```

For replacement, substitute the current returned SHA256 for `null`. The original JSON writer remains available. Both interfaces use the same whole-file transaction, expected-digest check, proposed-adapter interface check, atomic replacement and post-write public checks. A saved source receipt still distinguishes a committed write followed by failed checks from a rejected proposal.

The new staging reader anchors directory descriptors, rejects symlink parents/leaves and hardlinked/nonregular files, bounds reads to 2MiB, requires strict UTF-8, preserves a BOM and literal source bytes, and rejects files changed while reading. Errors provide fixed remediation without echoing source or arbitrary exception text.

## Expanded public examples

All new assertions derive from the already published task and baseline; private assertions were not inspected. Added examples cover:

- Invalid/duplicate seeds, owner invariants, unknown identities and resource ownership.
- Exact organization roles, sorted catalog/membership shapes, response copies and seed isolation.
- Owner/admin/member revocation permissions, immutable owners, idempotent revocation, cancellation after revocation, preserved conflict occupancy and cancellation fields.
- HTTP catalog routes, wrong-team/personal-record isolation, unsupported-method precedence and mutation authentication/authorization ordering.
- Malformed JSON, strict UTF-8 within an otherwise valid JSON body, content type, 8,192-byte acceptance versus 8,193-byte rejection, forbidden client fields and invalid resources/times.
- Public JSON error shape/code, no-store headers and ignored DELETE bodies.

The explicit `--behavior-only` checker mode supplies fast public examples without a build. It emits `BEHAVIOR_ONLY`, never full `READY`; conflicting modes fail closed. These examples remain finite: they do not establish exhaustive contract coverage, protected correctness or the cause of any historical hidden-test failure.

## Isolated diagnostic

`tests/runtime/run-team-workflow-recovery.py` ran against pinned local image `sha256:221a51713e8c22e5852d8d587d60322c4ff2ac4235437eb268ae95c8d88fafd5` in a fresh UUID-named disposable container. It uses a read-only root, a nonroot user, dropped capabilities, no-new-privileges, no network, bounded CPU/memory/PIDs/tmpfs, a committed 22-file baseline and synthetic control source. No host Docker socket, credentials, private oracle or historical candidate is mounted into that container. The runner removes only its own container and confirms its absence.

The final 44-case diagnostic passed. It reproduced an HTTPS-origin failure and actual `TS2322` compiler error together, repaired through `write-file`, and reached full public readiness. Literal UTF-8/BOM/backslash writes, stale digests, malformed/aliased/oversized staging files, precommit preservation, postcommit failed-check receipts, recovery and fractional/expired deadlines were checked. Seven deliberate defects were rejected: invalid-seed acceptance, wrong catalog roles, shared booking objects, revoked-booking deletion, lossy UTF-8 decoding, oversized body acceptance and incorrect method/auth ordering.

An initial expanded diagnostic exposed a weakness in the copy assertion: its expected object also shared the defective stored row. The assertion now compares against an independent snapshot, and the shared-object defect is rejected. This failed diagnostic is retained alongside the successful rerun. The diagnostic source is a private synthetic control, not a candidate implementation supplied to either tournament arm.

Validation: `npm run check` exited 0 with 1,972 tests across 90 files, lint, strict app/fixture types and both production builds. Browser regression results and durable artifact locations are recorded in `IMPLEMENTATION-LOG.md`. Provider calls were zero. Existing installed runtime helpers, admissions, paid studies and historical A/B outcomes were not changed. A genuine new tournament still needs current reviewed runtime installation, source-bound definitions/reservations and its own actual results; these controls do not establish that A or B now passes 8/8.
