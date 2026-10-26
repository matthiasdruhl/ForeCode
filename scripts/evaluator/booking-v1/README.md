# Trusted booking evaluator building blocks

This directory stays outside every agent task export. `oracle.ts` defines 13 baseline domain cases; `http-oracle.ts` defines five baseline HTTP cases. Both accept injected subject factories and import no implementation or visible tests from the booking package. Their expectations are public baseline requirements, not secret held-out future requirements.

Current unit tests pass the newly authored, reviewed baseline to those factories. They also deliberately break an owner check and confirm the oracle rejects it. These are developer tests, not a sandbox experiment. Never load agent-modified subjects on the host: a later controller must supply factories **inside the separately verified, network-off grader guest**, using a reviewed bridge and pinned tooling. Server-only modules require the proper server runtime condition there; the local Vitest shim is only a developer-test convenience.

`snapshot.ts` hashes bounded regular-file manifests, excludes root-level Git/dependency/build caches and rejects secrets, symlinks, nested generated directories and oversized traversals. Paths are sorted POSIX-relative strings and each entry stores a content SHA-256; the tree hash is SHA-256 of RFC 8785 canonical JSON of the sorted entries. No absolute paths or mtimes affect identity. The controller must freeze an immutable clean evaluation copy; hashing a mutable directory alone does not freeze it.

`freeze.ts` emits source, evaluator dependencies, suite and required-policy commitments. It neither imports task code nor runs a command. Its `executionStatus=NOT_RUN` and `evidenceOrigin=none` are intentional. The evaluator manifest includes the shared contract/report/verdict/loader code and parent dependency lock so changes to those dependencies change the evaluator identity.

`receipt.ts` assembles a strict receipt and its canonical digests from supplied check records. Assembly alone supplies no authority. Only the trusted controller may bind actually observed check-artifact bytes, publish them outside agent custody and add their exact bundle digest/freshness pins to the protected store's allowlist.

The hosted app has no evaluator, runner, receipt-upload or allowlist-registration endpoint. Do not add one to make this preparation appear live. See the parent `docs/BOOKING-EVALUATION.md` for remaining integration gates.
