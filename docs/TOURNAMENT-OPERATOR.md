# Tournament operator handoff

Implementation is preparation tooling, not authorization to run a study. No actual B, original study commitments, paid future-task attempt or publication approval has been supplied. The existing smoke and private grader acceptance keep their original scopes.

## Trust and originals

An independent custodian must hold actual immutable records before their dependent actions. `createStudyCustodyStore` reads only exact, externally allowlisted original files under a canonical operator-owned0700 directory, disjoint from the implementation, planning and every agent workspace. It verifies Ed25519 signatures with an externally pinned public key, original byte hashes and a separately pinned current `revocations.json`. No signer or key generator exists in production code. Signature-like JSON and issuer labels cannot authenticate a record. The key, original allowlist and current revocation pin must be established by an independently reviewed operator composition, never by a study author or draft. Test-owned keys demonstrate integrity controls only, not real approval.

Configure the private local `configuredStudies` composition seam only after that review, with a canonical study root, original-store configuration, protocol/prepared record IDs and the complete list of preparation authorization IDs. The committed catalog is empty. Do not commit real private configuration, keys, originals, paths or payloads. Do not put a private signing key in this application. Revocation changes fail closed until the independently reviewed configuration is refreshed. Consumers freshly reload originals immediately before use; a retained in-process object alone is not a later freshness observation.

## Fixed files and chronology

Use a separate canonical operator-owned0700 study directory outside both repositories and every agent workspace. Commands read only bounded nonaliased `definition.json`, `draft.json`, `preparation.json`; they neither discover artifacts nor accept executable paths.

1. Before B selection, write `definition.json` conforming to `StudyDefinitionSchema`. Its `protocol` is independently constructible without a B snapshot. Bind the complete unchanged team task, exact evaluator/policy/check identities, original commit/tree/lock, intent/scenario, run UUIDs/order, conditions/resources/budgets, Meta model, prompt, tools, runtime images/binaries, restrictions/request/output limits and common adapter instructions. The outer definition digest additionally commits adapter text and executable inputs. Both arms receive the same full task/adapter/prompt, not a digest alone.
2. Inspect the protocol proposal. The custodian holds a `protocol` original whose subject is `protocolSubject(definition)`, predecessor null. `heldAt` must precede selection and be valid at the independently proposed protocol freeze. A timestamp without authenticated custody is insufficient. This code cannot retrospectively prove an undisclosed earlier selection; the custodian must verify that observation.
3. After selection, obtain a separate `preparation` original per attempt. Its subject is `jsonDigest({preparationSha256: preparationSubject(definition, proposal, instructions), attemptId})`, predecessor the original protocol envelope byte hash. Use only separately admitted supervised preparation; no preparation executor or host candidate execution is supplied. If admission is unavailable, stop live preparation here.
4. Retain every failed/interrupted/completed preparation attempt with distinct authority. `preparation.json` contains `PreparationEvidenceSchema`: exact record, reviewed proposal/instructions, selection, complete attempt history and canonical original/prepared manifests. Only source changes under `src/` are accepted; original A and dependency locks remain pinned. A distinct changed B must actually exist. The original record's byte digest uses canonical JSON without a trailing newline. `inspectPreparationSources` recomputes actual source identities without executing either tree.
5. Preparation metrics cover the entire recorded preparation interval and all attempts, including failures. Unknown metrics stay null. Every non-null metric requires a separate authenticated `telemetry` original binding phase, canonical record hash, exact metrics and changed paths. A spending reservation is not an actual charge. File counts/time must also agree with the source diff/interval. Do not infer tokens or cost from budgets or timestamps.
6. Complete `draft.json` using the existing `FutureStudyDraftSchema`. The canonical preparation record hash and metrics bind B. Obtain a `prepared` original with subject `preparedSubject(definition,draft,evidence)` and predecessor protocol original hash, held after all preparation finishes and before final pair freeze. Changing B, preparation, task, runtime, model, budget, retry/order or full draft invalidates its original commitment. This is the second commitment; the first excludes B's future outcomes.
7. Freshly validate readiness. `loadOperatorStudy` reopens independently held records and returns an immutable process-marked prepared study only after all bindings pass. It does not admit a runtime, grade a baseline, claim an experiment occurred or grant publication. External records attest their exact approved subjects; the custodian must verify genuine observations and complete attempt history rather than signing author assertions.

## No-execution commands (Node24)

Prefix each with `node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts`:

```text
--definition <CANONICAL_PRIVATE_STUDY_ROOT>
--protocol <CANONICAL_PRIVATE_STUDY_ROOT>
--record-protocol <CANONICAL_PRIVATE_STUDY_ROOT>
--record-prepared <CANONICAL_PRIVATE_STUDY_ROOT>
--readiness <CANONICAL_PRIVATE_STUDY_ROOT>
```

Definition/protocol inspection prints only identity/digest and PROPOSAL_ONLY. Missing configured custody prints BLOCKED. Authenticated preparation still prints execution DISABLED with exact paired-runtime admission required. Valid commands exit2; invalid/unavailable input exits1 with fixed safe errors. Existing `--plan`, `--future-draft`, `--status` remain disabled. There is no `--execute` switch.

Record commands write an exclusive0400 synced `protocol-original-index.json` or `prepared-original-index.json` pointing to the externally held original; they never issue an approval or overwrite a previous record. Recovery must retain prior files/failed attempts. A crash after an exclusive file is created leaves that index reserved for operator inspection. Use a new independently authorized study version for changed conditions.

Next stage: independently protected A/B baseline checks, exact-run runtime/spending admission and the sequential paired controller. New trusted-source bytes require fresh installation/inventory/admission; PR #19's historical grader acceptance does not authorize this changed controller or any inference.
