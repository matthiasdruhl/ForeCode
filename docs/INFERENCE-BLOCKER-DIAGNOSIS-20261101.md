# Inference blocker investigation — November 1, 2026

Study06 had a demonstrated local network-policy blocker. Study09's HTTP500 cause remains unknown. There is no evidence establishing a common cause, an invalid credential, insufficient funding, or a regex defect. No new tournament is justified yet. This investigation made zero provider requests and read no credential values.

## Evidence and source identity

The checkout began clean on `main`, commit `94a0a20889ab4b79aab970a9974093111d4fe523`. [PR #72](https://github.com/matthiasdruhl/ForeCode/pull/72) is open, not merged; its handoff is on `origin/codex/local-release-operation-handoff`. Reading that branch did not change the checkout. The release README confirms an archival, inconclusive Study06 report; application health is not inference evidence.

Thirteen relevant retained artifacts were copied byte-for-byte into the private sibling directory [evidence](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/evidence/manifest.json), with source paths, lengths and SHA-256s. Study09's original request, reservation and failure hashes match the closed handoff's pins. Historical artifacts and approvals were not modified. These are retained machine observations and prior operator reports, not independent provider records.

| Study | Reviewed implementation                    | Closure                                                            | Comparison with current source                                                                                                                  |
| ----- | ------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 06    | `355c08cb591ab80621a5a5e278479632d51f59b5` | `84cec62f97f87dc14dfd8a2ba0bf67d41da0a4ac2ee6b57ac648a0914fcac033` | Archived transport, configuration, Python broker and team supervisor match current bytes. Scientist used `booking-scientist-1` / `json_object`. |
| 09    | `94a0a20889ab4b79aab970a9974093111d4fe523` | `3b091ecfd103b37637ff8f918cffcd0ff64d7999d601be1f93c851e4a88b19c1` | All five inspected files match the retained source tar. Scientist uses `booking-scientist-2` / strict `json_schema`.                            |

The intervening changes added schema-constrained Scientist output and post-transport private diagnostics. They did not change either HTTP transport. Earlier accepted JSON-mode Scientist responses cannot validate Study09's newly constrained request, nor either coding request.

## Study06: local egress denial, high confidence

Both first coding requests were admitted and reserved, then failed upstream from the local broker. [Retained coding observations](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/evidence/study06-coding-failures.json) contain:

| Field                     | Arm A                                                              | Arm B                                                              |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Run ID                    | `99739cea-a4bb-47d4-ae51-eafac07cd6f0`                             | `4a5ed8c2-f348-46bd-93fa-84ac916fa696`                             |
| Upstream failure, UTC     | 2026-11-01 19:46:32.424                                            | 2026-11-01 19:49:11.717                                            |
| HTTP status / exception   | 403 / `HTTPError`                                                  | 403 / `HTTPError`                                                  |
| Canonical request SHA-256 | `5a98f39aa8ff60f028d8cc792e4ca64d99b14f6bead777031459f0996fb14d98` | `b517fa03f77bbaedfe3107a146067392b5dc2f591c8f684796776398126edbeb` |
| Reservation               | 97,350 microUSD; one request                                       | 97,350 microUSD; one request                                       |

The [egress observation](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/evidence/study06-egress-observation.json) retains two blocked `api.meta.ai:443` events at 19:46:32.468 and 19:49:11.715 UTC, with reason **Denied by local rule**. A daemon policy check identifies agent-scoped explicit deny rule `7d338dec-d9b3-4989-9b7c-2ec34284e1d5`. The tens-of-milliseconds differences between guest and host timestamps are not exact cross-clock ordering evidence. The matching destination, count and time windows establish a sufficient local blocker. The label `providerFailure` in the broker receipt does not establish that Meta produced the 403; a credential/egress proxy is upstream of that broker.

Execution path: isolated coding CLI → Unix-socket broker → `TeamReservations.reserve_team` → `budget.Reservations.reserve` → `team_provider_request` → required `HTTPS_PROXY` → fixed `https://api.meta.ai/v1/responses`. Model: `muse-spark-1.3-contributor`; API version: `/v1`, no explicit version header. Broker headers are JSON content type and a nonsecret Bearer sentinel, replaced by the trusted credential proxy. Retained binding metadata says its command resolver reads the same host `.env.local` / `META_MODEL_API_KEY` source as Scientist. It does not prove the secret was resolved or transmitted for these blocked requests.

Retained admission metadata establishes five input items, two tools (`exec_command`, `write_stdin`), no instructions string, and `max_output_tokens=32768`. Reviewed source fixes `reasoning={effort:high}`, `store=false`, `service_tier=auto`, strips client cache/stream metadata and unsupported tools, and reserves before sending. Socket timeout is at most 120 seconds and bounded by the run deadline. Redirects are refused. The first error latches the broker; each arm consumed one reservation, with no additional upstream send.

**Missing:** exact downstream JSON bodies/tool schemas, original HTTP bodies, response headers, provider error codes/request IDs, and provider usage/invoice. The host artifacts inspected retain hashes and projections, not request bytes. Consequently no byte-exact Study06 provider reproduction or claim about its structured-output field/stream flag is possible from this evidence. A source-derived payload skeleton would not be the original request. No guest was started to retrieve more data.

The [maintenance receipt](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/evidence/study06-egress-repair.json) records removal of that exact deny and a sole agent TCP allow for `api.meta.ai:443` at 20:18 UTC. Other destinations and grader access remained denied. A subsequent authenticated catalog call succeeded; inference remained untested. This historical infrastructure repair already exists and was not repeated here.

## Study09: remote HTTP500, root cause unknown

At **2026-11-01 22:32:28.750 UTC**, Scientist `propose` received status 500, stage `response`, code `PROVIDER_UNAVAILABLE`. [Original transport journal](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/evidence/study09-transport-failure.json). The call was reserved at 22:32:27.839 UTC. Flow/operator journals are propagation of this one failure, not three requests. No proposal acceptance, hypothesis, registration, B preparation, coding attempt or future evaluation occurred.

The private driver loads `.env.local`, fixes the model/base URL and approval flags, reserves the exact payload, and passes `globalThis.fetch` into `stageScientistOperator`. That invokes `createMetaTransport`, which validates configuration and payload identity, then calls:

```text
POST https://api.meta.ai/v1/chat/completions
Content-Type: application/json
Authorization: Bearer [REDACTED]
API version: v1 in URL; no version header
Timeout: 30000ms; redirect:error; cache:no-store; automatic retries:0
```

The credential source is `META_MODEL_API_KEY` in the inherited environment after Node's `.env.local` load (pre-existing environment values can take precedence). No presence-only check could establish provider permissions. Reaching `response` proves local configuration accepted a nonempty key and fetch returned an HTTP response; it does not prove the right account/key reached Meta. This host fetch does not use the coding broker's explicit `HTTPS_PROXY` path. Historical host proxy/dispatcher environment and remote response headers were not retained, so origin versus gateway cannot be conclusively attributed.

Reconstructed production body: 12,212 bytes; canonical payload hash `0f012a22455ee2f8167af6fee4a75083fede963c7a37d009f614d69d0e38a5e2`. It has developer instructions plus canonical approved context, model `muse-spark-1.3-contributor`, `max_completion_tokens=4096`, `reasoning_effort=minimal`, `stream=false`, `store=false`, `n=1`, and `response_format={type:json_schema,json_schema:{name:forecode_propose_v2,strict:true,schema:…}}`. No tools, temperature, seed or API-version override. The full credential-free body is in private [request.json](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/request.json); full schema is in [schema.json](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/schema.json). These bytes are reconstructed through the unchanged builder and match the original payload identity; they are not a historical network capture.

The proposal schema is 2,976 bytes, canonical SHA-256 `8d4b2478923c1ffb1a7061791bc388fe2afe357e8a24e07e1a3215ceb267ada9`. It has closed objects with all properties required, nested arrays, string bounds/patterns, numeric bounds, enums and constants. Three path patterns use negative lookahead. Current offline schema tests pass. Meta's documented strict subset and size limits do not establish a regex-engine guarantee. **No regex/schema cause is demonstrated.**

The transport's `boundedJson` cancels non-2xx response bodies immediately. Its failure callback retains status and stage only. Header extraction occurs later, after successful envelope validation. An injected HTTP500 containing a synthetic error code and request ID reproduces their loss. This explains the diagnostic blind spot, not why the server returned 500. The new post-transport diagnostics cannot help at this stage.

**Missing:** original body/error type/code/message, all response headers including request/trace ID, responding gateway/server identity, precise network timing, accepted account/project identity, usage and invoice. These cannot be reconstructed from the status or payload hash. The HTTP500 was not locally synthesized by the transport. Its response arrived within roughly one second of reservation, well before the 30-second timeout; a local timeout or content validator is not the observed failure.

## Current official contract and ranked checks

Official documentation checked during this investigation:

- [Authentication](https://dev.meta.ai/docs/authentication) specifies Bearer API keys. [Models](https://dev.meta.ai/docs/models) lists Contributor Spark 1.3 and Responses/Chat Completions support; this is not account-specific entitlement evidence.
- [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions) documents the chosen route, developer/user messages, `max_completion_tokens`, minimal reasoning and `n=1`. [Request schemas](https://dev.meta.ai/docs/api-reference/chat-completions/schemas) provide the field contract.
- [Structured output](https://dev.meta.ai/docs/structured-output) documents `response_format.json_schema`, strict closed/all-required objects and no root unions. No inspected statement establishes the regex dialect. Passing these listed rules is not actual provider acceptance.
- [Error handling](https://dev.meta.ai/docs/error-handling) classifies 500 as server failure and 403 as permissions failure when returned by Meta. The 500 category includes multiple causes; it cannot identify this incident. Provider retry advice does not revive consumed experiment authority.

| Rank / hypothesis                                        | Evidence                                                                                       | Smallest useful check                                                                                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1: Study06 local egress                                  | Matching blocked events and exact daemon deny; high confidence                                 | Already confirmed historically. Fresh read-only policy check before any future coding admission.                                                                                                                               |
| 2: Study09 provider/gateway internal failure             | Actual HTTP500 before local parsing; moderate confidence in remote category, unknown component | Provider lookup for timestamp/account; or one admitted minimal valid Chat Completions request with bounded private error/header capture.                                                                                       |
| 3: Schema-specific backend incompatibility               | Strict format newly enabled; negative lookahead; low confidence                                | If minimal succeeds, add a trivial strict schema, then substitute the exact proposal response format. Only that field changes between prepared probes. A failure here would implicate the schema path, not a particular regex. |
| 4: Exact account/model/capability access                 | Credential was locally configured; 500 is weak evidence of access problems                     | Provider verifies entitlement on the actual key-owning project; minimal inference distinguishes catalog access from generation.                                                                                                |
| 5: Malformed serialization/unsupported generation fields | No mismatch found; production reconstruction matches original identity                         | Completed offline builder/hash and schema checks. Provider acceptance still untested.                                                                                                                                          |
| 6: Local timeout, redirect, parsing or hidden retries    | Recorded response-stage 500, early arrival, no retry loop                                      | Offline simulation confirms one fetch and fixed masking. No evidence supporting these as the 500 cause.                                                                                                                        |

## Minimal reproduction, verification and next action

[diagnose-inference.ts](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode/scripts/meta/diagnose-inference.ts) executes the production builder/configuration/transport with an injected finite HTTP error. It rejects altered payload identities or historical/current builder mismatches. It never loads `.env.local`, reads real credentials or calls real fetch. Its only mode is offline. The output directory must be new and is private; no existing file is overwritten.

From the ForeCode checkout:

```sh
node --conditions=react-server --import tsx scripts/meta/diagnose-inference.ts \
  --request ../ForeCode-Inference-Diagnosis-20261101/evidence/study09-exact-request.json \
  --out /private/tmp/forecode-inference-reproduction-new
```

The retained [summary](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/summary.json) records the successful offline reproduction. Three **unsent** diagnostic bodies keep model, input and generation parameters identical and vary only `response_format`: absent, trivial strict schema, exact proposal strict schema. Proposed conservative reservations are 21,127 / 21,747 / 30,005 microUSD, totaling **72,879 microUSD ($0.072879)** under the historical recipe, not an invoice or a new allocation. Stop on the first failed control; do not automatically issue all three. Even three successes would not prove the original full-context request or coding Responses route works.

There is no usable current diagnostic admission: Study09's released path is a one-shot staged study, its lock and consumed ledger row remain, and its approval binds the original scope and exact payload. The remaining 398,025 Scientist microUSD is budget capacity, not an unused diagnostic scope. This is an execution-control prerequisite, not a request to repeat broad user permission. No new scope, signature, ID, ledger seed or tournament was manufactured.

**Single next diagnostic:** admit and reserve the already prepared minimal Chat Completions body under a diagnostic-only continuation of the existing owner mandate, using the same account/model and a reviewed private transport capture that retains bounded error detail and provider request IDs before cancellation. It must debit the conserved ledger, have no automatic retries, and not reuse Study09's release. Alternatively the account owner can send the [unsent support ticket](/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Inference-Diagnosis-20261101/support-ticket.txt) for provider-side lookup without another inference request. The owner must map the existing key to its Meta project/team in the dashboard; that numerical account identity is absent from retained evidence. Do not rotate credentials or enable billing without a demonstrated need.

No production behavior was changed: no justified inference fix has been established. Added only the offline reproduction, focused tests and this report. Validation: 26 tests passed across diagnostic, structured-output and failure-observation suites; focused ESLint and `tsc --noEmit --incremental false` exited 0. No full app suite/build/browser run was necessary because application code was unchanged. These checks are mocked/offline, not provider acceptance.

Fresh `sbx inspect` attempts for the two fixed roles both exited 1 in the local Docker login service (`cannot determine whether a refresh right now would be safe to guard`, OS status -50). No login, repair or guest start was attempted. The last verified retained closure remains 22:35:01.093 UTC: both roles stopped, zero sessions/mounts, no lease or Study09 runtime registration. Current runtime state cannot be freshly certified here.

A new tournament should wait for successful inference on the exact Scientist capability and coding Responses path, followed by fresh runtime/admission checks with conserved limits. Healthy report UI, CI, catalog access and this offline reproduction do not satisfy those prerequisites.
