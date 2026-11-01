# Scientist prospective registration operator handoff

Status: code and disposable-original authentication implemented; genuine production registration and evidence linkage **NOT_PROVISIONED**. No execution or inference authority is granted by this handoff. Keep `approved-scientist-lineage.ts` and the existing approved publication singleton configured with `null` until genuine independent authorization exists.

## Required independent originals

Use the designated existing operator/custodian mechanism, its independently pinned Ed25519 public key and current reviewed revocation state. No signer, private key, enrollment endpoint or alternative authority is supplied by the application. Do not derive an authority/key/pin from browser JSON, an environment variable, a model response or a public repository artifact.

1. Independently approve and hold the existing study definition under custody kind `protocol`. Its subject is `SHA256(JCS(definition))`; its predecessor is null. Retain the complete exact definition payload, task, original source manifest, both original conditions and run identities, evaluator/suite/policy, model/order/budgets, tool/runtime/credential/network conditions and independent metric rules. Existing protocol/task proposal labels do not themselves grant approval.
2. Before **starting** architecture proposal generation, hold `ScientistCommitmentSchema` under `scientist-commitment`, subject `SHA256(JCS(document))`, predecessor equal to the protocol envelope's exact byte SHA-256. It includes the exact initial `requestSchemas.propose` input, selected structural prediction (metric/direction/comparison), prospective study identity, sorted complete original manifest, `studyProtocolSha256`, `matchedConditionsSha256` and candidate-neutral `measurementPlan`. It contains no later hypothesis UUID or accepted candidate context. Independently approve the metric semantics; parsing this record cannot validate a protected collector.
3. Under separate exact-payload consent and provider/spending authority, obtain a fresh accepted proposal and server-issued hypothesis in the **same single trusted local process**. Keep that process alive. Its map records the generation start, exact initial request digest, accepted context and issuance time. The 30-minute TTL starts at actual issuance. Do not reuse/recreate the November 1 historical hypothesis or restart to obtain a new lifetime for it.
4. Have the independent custodian hold `ScientistBindingSchema` under `scientist-registration`, subject `SHA256(JCS(binding))`, predecessor equal to the initial commitment envelope byte hash. This append-only document retains the original commitment hash, complete accepted registration context, exact issued hypothesis, registered study and `RegistrationLineageSchema`. `registeredAt` equals the held supplement's timestamp. Registration completes with this independent holding, before selection/preparation authorization or any preparation/execution. `expiresAt` cannot exceed either issuance+30 minutes or the binding original's expiry. The custodian must reject study reassignment and retain the complete append-only inventory/revocations.
5. In the already staged authorized private same-process composition, freshly read/admit it through `service.register(registrationId, hypothesisId)`. Inputs are IDs only; they carry no authority. Read failure, supersession, expiry, duplicate/concurrent admission or custody changes require abstention. No automatic retry/reissue or hidden process-local signing fallback exists.
6. Only with separate preparation/runtime/spending/collector approvals may another operator proceed. Existing preparation/prepared custody kinds and subject algorithms are unchanged. Preserve original selection and all attempt/source records, including failures and unknown measurements. Registration itself does not authorize that work.
7. After independently authenticated execution/report/publication approval exists, independently review prepared B against its registered candidate. Hold `ScientistEvidenceLinkOriginalSchema` under `scientist-evidence-link`, predecessor equal to the registration envelope byte hash. It contains exact preparation evidence/draft, prepared original hash, run/baseline/final receipt/tree identities, immutable lineage and exact publication projection digest. It must expressly authorize `meta-scientist-allowlisted-summary.v2` disclosure to the two named eligible models. Public publication approval alone is insufficient provider disclosure authority. Retain the genuine independent conformance review rather than asserting it because trees have hashes.
8. Separately provision existing public disclosure and protected evaluation originals through the unchanged publication operator handoff. The link and publication authority PEM/pin must agree. Current provider authorization, exact inference consent and safe local deployment remain separate mandatory gates. Nothing in this task executes these operations.

## Exact digest conventions

Envelope byte hashes and document byte hashes pin the original files as held; never regenerate an envelope to meet a pin. Subjects use the existing canonical JSON (`JCS`) digests. Signing is over the unchanged existing `tournament-custodian-record.local.v1` record's canonical bytes, verified under the existing Ed25519 key. The additive kinds are local custody extensions, outside frozen v1 contracts.

`matchedConditionsSha256` is the canonical digest of this exact object from the authenticated existing study definition `d` and `p = d.protocol`:

```ts
{
  conditions: p.conditions,
  executionConditions: p.executionConditions,
  trialPolicy: p.trialPolicy,
  runtime: d.runtime,
  restrictions: d.restrictions,
  toolAllowlist: d.toolAllowlist,
  downstreamPrompt: d.downstreamPrompt,
  adapterInstructions: d.adapterInstructions,
}
```

Retain exact array order. Both original-condition objects and both execution-condition objects must match after removing `variant`. The metric protocol digest is `SHA256(JCS({...initial.measurementPlan, studyId, hypothesisId, contextSha256, taskSha256, matchedConditionsSha256, evaluatorSha256, suiteSha256, policySha256}))`. The initial plan cannot contain these identity keys, `protocolSha256` or `variants`. Protocol/task/evaluator identity semantics and the Agent B interface are tabulated in the implementation report.

The original manifest must be canonical, strictly sorted and duplicate-free. Its canonical digest is the original tree/manifest identity used by the authenticated study. Later B and final manifests are independently bound through prepared/publication originals and protected receipts. The reviewed Scientist graph is separately pinned by the existing accepted input validator; this reader does not execute source or infer graph completeness.

## Private source composition and filesystem custody

`RegistrationConfig` contains the existing authority PEM/hash, reviewed revocation-file hash, fixed canonical private original root, complete actual worker-root inventory and an exact map of custody originals. Each entry provides `file`, `sha256`, `documentFile`, `documentSha256`. Filenames are flat allowlisted JSON basenames. Each study registration supplies its registration/study/issued-hypothesis IDs and exact protocol/commitment/binding record IDs. Limits: 20 studies and 256 custody originals. File/byte identities cannot be shared between entries.

`EvidenceLinkConfig` takes that same reviewed registration configuration, the existing exact `ApprovedTournamentConfig`, and unique evidence/registration/original/preparation/prepared IDs. Keep the entire relevant existing preparation-attempt authorization inventory in the custody map. Removing an old binding to conceal reassignment is forbidden; retain the full independently reviewed study inventory. Extra files grant no authority and are never discovered or loaded. Changed source configuration requires independent review, not a timestamp or “latest” selector.

A permitted private layout is:

```text
<canonical-private-original-root>/revocations.json
<canonical-private-original-root>/<fixed-record-name>.json
<canonical-private-original-root>/<fixed-document-name>.json
```

The root is owner-held/private (0700 or a more restrictive readable directory), outside the application/planning repositories and all actual worker roots. Scientist envelopes, documents and revocations are regular owner-held single-link files with mode 0400, without symlink aliases. Files are bounded to 1 MiB; oversized or unexpected referenced files fail closed. Mount exact originals read-only; never put them, private paths, grader contents or signing keys into Git, static assets, browser props or public container layers. Existing publication/protected-evaluation directories retain their original separate layout and custody requirements.

The application rereads revocations and every required original for each resolution and repeats custody checks before returning. Changed revocation bytes immediately withhold reads until the independent pin review; even a reviewed new pin cannot admit a listed revoked ID. No approval result cache exists. Directory custody and complete inventory remain explicit operator responsibilities; this loader does not discover remote revocation state or concealed worker roots.

Stage a separately reviewed private one-process operator composition **before proposal generation**. Supply source-owned resolver callbacks to the service/evidence adapter and use the same existing publication reader. After the independent supplement is held and its exact pins reviewed, the private operator continuation can construct the immutable reader and resolve the IDs in that existing process. Only trusted source/operator code may supply these dependencies. Do not add a browser/config-upload endpoint, environment switch, arbitrary file picker, automatic signer or mutable public registry.

The stock Next singleton has no operator enrollment route or hot provisioning mechanism. Editing its null configuration and restarting would lose the issued UUID; that cannot be used to register a historical issuance. A genuine staged same-process operator/custodian handoff within the TTL, private approved mounts and real source pins must still be reviewed and demonstrated. The tests demonstrate that code path with disposable originals; they do not establish that those genuine operational arrangements exist.

The read-only factories are `createScientistRegistrationReader` and `createScientistEvidenceLinkReader`. Returned methods accept only lookup IDs and the service-owned current issuance snapshot. They return branded, recursively immutable objects or null, without raw diagnostics. The evidence adapter requires those authentic objects; schema parsing/cloning cannot recreate their authentication. Factory clocks are trusted test/source dependencies; never accept verification time from a request.

## Integration and operational acceptance

Agent B must compare a fresh authenticated `RegistrationLineageSchema` with the entire versioned protected metric protocol and all protected snapshot/run/receipt identities. Authenticate collector completeness and the approved evaluator/suite/policy separately. Prepared and final identities come from the freshly authenticated evidence link/publication. Do not pass these pure digests as if they were collector receipts, and do not enable boundary-count interpretation through the current publication v1 projection.

Under separately granted private-original access, demonstrate all of the following before describing the workflow as operationally ready:

- Genuine initial holding precedes proposal start; accepted hypothesis and complete supplement belong to the current process and original TTL.
- Original key, documents, envelope bytes, task/source/protocol/conditions and all study bindings authenticate with current revocations; replacement, expiry, tamper, revocation and duplicate admission actually withhold access.
- Registration completes before selection/preparation; source inventory retains every existing record and all attempts. No retroactive/reassigned study or historical issuance appears.
- Independently approved preparation, baselines, protected outcomes, complete histories, publication and provider-summary disclosure load through their existing readers with exact matching identities. Candidate-conformance review is real and independently held.
- Current local deployment, consent, provider budget and any execution admissions have their own separate authority. A failed gate requires abstention rather than a weaker trust path.

The existing read-only publication status command remains useful **only** for its publication scope:

```sh
node --conditions=react-server --import tsx scripts/experiments/tournament/cli.ts --publication-status
```

An empty/unavailable publication catalog does not grant registration or execution. There is deliberately no signing, registration-upload, grader-access or experiment command in this change. Preserve the November 1 recorded bytes as historical reasoning evidence. Real approvals/originals, protected metric admission and same-process operational provisioning remain missing; a genuine registered trial, protected measurement and verified architecture outcome are not claimed.
