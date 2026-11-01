# Live Meta Scientist validation — November 1, 2026

**GENUINE LIVE META OUTPUT; display this saved sequence as recorded.** All three
requests reached the real Meta API through ForeCode's existing production
endpoints. Proposal, hypothesis and challenge each returned provider HTTP 200 and
application HTTP 200. No template, synthetic response, retry or backend fix was
used. This establishes an observed reasoning flow, not architectural improvement.

Application source for every call:
`8749d243c7f17bb641d47f24807e7da8cc540334`.
[PR #47](https://github.com/matthiasdruhl/ForeCode/pull/47) was confirmed merged at
`2026-11-01T04:01:57Z`, with corrected head
`3420536915c3fc6afb982f236bfc04d729c7a1e9`. Both PR checks and the
[merge-commit Foundation workflow](https://github.com/matthiasdruhl/ForeCode/actions/runs/41271468295)
passed, including the standalone export check. GitHub reported no branch
protection or active rulesets; no additional required workflow was inferred.
The dedicated worktree/branch began at this merged commit, not the old PR head.

## Recording and provenance

The bounded, reviewed [manifest](recordings/live-meta-scientist-20261101/manifest.json)
indexes exact requests, accepted responses and sanitized observations. Calls ran
from **04:07:16.212Z to 04:08:07.930Z** on November 1, 2026, using
`muse-spark-1.3-contributor`, prompt `booking-scientist-1`, and only
`https://api.meta.ai/v1/chat/completions`.

| Stage       | Accepted output                                                               | Original model text and observation                                                          | Transport-issued response identity                                      |
| ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Propose     | [response](recordings/live-meta-scientist-20261101/propose-response.json)     | [observation](recordings/live-meta-scientist-20261101/propose-provider-observation.json)     | `meta-db0c1dac4895c963fd838db36503cc79894c8ce116acf90f35553c2141e70cbd` |
| Hypothesize | [response](recordings/live-meta-scientist-20261101/hypothesize-response.json) | [observation](recordings/live-meta-scientist-20261101/hypothesize-provider-observation.json) | `meta-dad56ac07fd9049791bd4309ef7f49ce622d2caea61588c070706e03cb6c1b1d` |
| Challenge   | [response](recordings/live-meta-scientist-20261101/challenge-response.json)   | [observation](recordings/live-meta-scientist-20261101/challenge-provider-observation.json)   | `meta-475b733c7ae46f2ff44fd8d3fdbab71833fd41d5071a1fa7585f21bb335ff0f5` |

Each observation preserves `originalAssistantContent` unchanged. Other observation
metadata is an explicitly derived sanitized projection. Accepted responses are
formatted JSON containing the original fields plus existing server enrichment:
candidate provenance, nested providers and a server-generated hypothesis UUID.
The model's original hypothesis ID remains in its original text; its issued UUID
is **`f26d3ed9-fb00-46d6-839d-362ed211f199`**. The challenge references that exact
issued UUID and `candidate-B-team-permissions`.

The production transport establishes public response identities by hashing
canonical JSON provider-ID strings. The temporary observation guard hashed raw
ID strings instead. These two conventions produce different hashes; observations
name them separately, and do not claim equality. Raw provider IDs were not
retained. The public identity is preserved unchanged from each accepted
transport-issued response. No extra provider request was spent to change the
observation format. This is an operator-observed HTTPS recording, not a
provider-signed transcript or an independently authenticated experiment record.

The reviewed graph is `booking-reviewed-20261027`, baseline
`a564da2fe36a5de3ea95f777c1f5a60fd80ad6f0`. Confirmed intent
`intent-live-meta-team-20261101`, revision **1**, contains the owner's exact future
requirement:

> Add team-level booking permissions and cancellation behavior without breaking existing owner-only authorization and overlapping-booking safety.

The two generated scenarios are `scenario-team-cancel-01` and
`scenario-overlap-safety-02`. Both are `meta_generated`, unfrozen and without
acceptance IDs. Frozen `scenario.v1` has no revision field; the manifest records
that fact and hashes the exact snapshots instead of inventing revisions.

## Reasoning assessment and judge walkthrough

The following prose is an **operator-derived assessment**, not verbatim model
output. Use the linked original responses when presenting what Meta said.

1. Show the confirmed requirement and reviewed graph. The input is a synthetic
   booking architecture; it contains no production/customer data or evaluator
   artifacts.
2. Show A preserving owner authorization and store overlap rejection with an
   empty plan and zero preparation estimate. B adds a permission interface in
   `src/server/booking-service.ts` and a cancellation-rule boundary in
   `src/domain/booking.ts`. It forbids an HTTP-to-store import. All paths exist in
   the reviewed graph. Its five modeled effort points are an estimate.
3. Show the issued hypothesis: isolating permission/cancellation policy could
   reduce future `boundary_violations`. Its direction is `lower`, comparison is
   B versus A, and equal or higher violations on the bound scenarios falsify it.
   It states assumptions, a complexity counterargument and limitations.
4. Show the challenge: an overly broad team permission interface could allow a
   non-owner to cancel a private booking, even while overlap rejection still
   works. Its acceptance outline requires denying that cancellation, preserving
   owner cancellation and overlap safety, and avoiding direct HTTP/store imports.
   This materially tests a weakness in B's policy boundary. It stays `proposed`
   and `model_generated_not_heldout`.
5. Explain the limitations below. Keep independently recorded experiment evidence
   separate and show it only under its own disclosure approval and labels.

**Usefulness: moderate; demonstration readiness: WITH LIMITATIONS.** B is a
meaningful architectural alternative with a plausible separation mechanism, but
it leaves membership representation and owner-versus-team policy details
underspecified. The hypothesis is falsifiable rather than a generic
maintainability claim. However, the allowed `boundary_violations` metric does not
define an actual counting/checking rule or observation window. Existing A already
has HTTP/service/store separation, so an equal zero-violation outcome is plausible
and would falsify the predicted advantage. The challenge partly tests
authorization behavior rather than the exact declared metric; that mismatch must
remain visible. Neither schemas nor a good counterexample resolve these issues.
Before a prospective experiment, independently predeclare the observable counting
rule, matched conditions and task/check policy without altering this saved output.

This is compelling as a candid demonstration of **propose → predict → challenge**,
especially the private-booking authorization bypass. It is insufficient to claim
that B wins, that Meta improves architecture, or that the hypothesis guided a
historical study. No experiment, grader execution, certificate or case-13
interpretation occurred. `interpret-evidence` was never invoked. PR #47's genuine
prospective lineage and distinct evidence-disclosure gates remain unsatisfied by
this recording; no retrospective linkage was created.

## Preflight, authorization and spending

- The owner authorized this exact synthetic context/requirement and a bounded
  six-attempt, $10 session, including downstream requests constructed from actual
  accepted outputs. This current assignment supersedes the old one-proposal
  smoke's narrower authorization; no repeated per-call owner approval was needed.
- The existing approved local secret file was mode `0600`. Credentials were
  loaded only into the owned server process with Node's environment-file option;
  no key was printed, copied, committed or passed to tests. Model and base URL
  matched the existing allowlists. An authenticated, non-billable model-catalog
  GET returned HTTP 200 for the exact Contributor model. The owner separately
  confirmed active credits/billing in this session. The current billing dashboard
  was not independently inspected; read-only Chrome inspection was unavailable.
- [Current Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits), checked
  November 1, lists Contributor input/output at $0.10/$0.20 per million tokens.
  [Model documentation](https://dev.meta.ai/docs/models) lists a 1,048,576-token
  context. Reserving that entire context as uncached input plus 4,096 output
  tokens per request gives **$0.6340608 for six attempts**, below the $10 ceiling.
  This is deliberately larger than the actual 49,152-byte input allowance needs.
  No tools or supplemental paid service were requested. Contributor content can
  be used for training; only the owner-approved synthetic context was disclosed.
- [Meta's billing help](https://dev.meta.ai/help/billing/spend-limit-alert) says
  provider spend limits are alerts, not dollar hard caps. No provider billing,
  payment, funding or alert setting was changed. The session used the existing
  spending gate plus a stricter six-attempt process limit and an additional
  operator reservation/dispatch guard. These establish a rate-card bound, not an
  invoiced dollar guarantee.
- The actual production Next server used `FORECODE_ORIGIN=http://127.0.0.1:3189`,
  explicit call/spending flags and `META_APPROVED_CALL_LIMIT=6`. No existing
  payload-digest restriction was configured. The additional guard pinned each
  reviewed provider payload's canonical SHA-256 before dispatch and retained an
  assignment-wide ledger outside Git. It rejected other external fetch endpoints,
  different payloads/models, repeated dispatch and excess attempts. It never
  synthesized a response. Its safety controls were exercised separately with an
  explicitly synthetic, network-free response before live use.
- Existing limits remained unchanged: one concurrent call; 10-second spacing;
  four attempts per endpoint/hour; repository 12-call process ceiling narrowed to
  six; 30-second timeout; 49,152 input/65,536 response bytes; 4,096 output tokens
  including reasoning. Actual starts were over 10 seconds apart. Redirects were
  rejected. The transport's fixed endpoint prevents model-selected destinations.
- The exact graph contains reviewed paths and bounded unknowns only, not source
  dumps, private diagnostics, holdouts or protected grader data. No model tools,
  filesystem, shell, protected artifacts or evaluator access were supplied.
  Proposal/hypothesis bindings and the corrected asynchronous stale-context check
  were present and passed their network-free regressions before inference.

| Stage       | Input tokens | Output tokens | Included reasoning | Total tokens | Rate-card estimate USD |
| ----------- | -----------: | ------------: | -----------------: | -----------: | ---------------------: |
| Propose     |        1,801 |           879 |                199 |        2,680 |              0.0003559 |
| Hypothesize |        2,100 |           490 |                152 |        2,590 |              0.0003080 |
| Challenge   |        2,401 |           436 |                 69 |        2,837 |              0.0003273 |
| Total       |    **6,302** |     **1,805** |            **420** |    **8,107** |          **0.0009912** |

There were **3 inference attempts, 3 successes, 0 failures and 0 retries**. Cached
input was zero. Counts came from actual provider usage accepted by the existing
transport. Actual invoiced charges, credit debit and account-specific adjustments
remain **unknown**, not zero. No further call was needed or made.

## Reproduction and checks

Offline verification requires no key, network, paid inference or running server:

```sh
node --import tsx scripts/meta/verify-live-recording.ts \
  docs/recordings/live-meta-scientist-20261101
```

The verifier checks frozen schemas, reviewed input, exact cross-stage handoffs,
payload/context/file hashes, unique and matching recorded provenance, and unchanged
model text after the documented server enrichment. It cannot independently prove
the historical HTTPS exchange, authorize new calls or restore expired in-memory
bindings. The manifest is an operational record, not a signature trust root.
Edited JSON with recomputed hashes is not authenticated by this command.

For a new live demonstration, first recheck current account/model/pricing and
spending/payload authorization. Start an owned local production server using
approved secret storage and the existing gates, with at most six assignment
attempts across restarts. Review and consent to a fresh proposal request. Build
the hypothesis request from that session's exact accepted candidates/scenarios,
same graph, confirmed intent snapshots and goal; build challenge from the exact
issued hypothesis and original context (without the goal field). Validate and
review each accepted output before proceeding. Never inject this recording as
current server-issued lineage. Do not automate retries or add live calls to CI.

Observed on Node `v24.16.0`, all commands exited zero:

| Check                                                            | Result                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm ci`                                                         | Installed locked dependencies                                               |
| Focused `foresight.test.ts` and `meta-interpretation.test.ts`    | 141 passed, no provider network                                             |
| `npm run check` with calls/spending disabled                     | Lint, both type checks, 1,236 tests/59 files, both production builds        |
| `npm run test:e2e`                                               | 62 passed; existing external-fetch denial preload and synthetic credentials |
| `npm run test:fixture-e2e`                                       | 2 passed                                                                    |
| `PLAN_REFERENCE_ROOT=../AgentHarness-Planning npm run test:plan` | 128 passed against the available pinned Git object                          |
| Offline recording verifier                                       | Passed; altered handoff/model-text/file controls rejected                   |
| Changed-file Prettier and `git diff --check`                     | Passed                                                                      |

The owned live server was stopped by SIGTERM after the third response; listener
inspection found no remaining port-3189 listener. Spending flags existed only in
that process. No temporary credential copy or persistent enable flag exists.
The original secret storage was untouched. Ordinary tests remain network-free
with respect to Meta. No application, frozen contract, protected artifact loader,
tournament, grader or publication configuration was changed.

Next ticket: preserve this candid recorded demo; operationalize the hypothesis's
metric and obtain separate prospective experiment/evidence permissions before
making any measured-benefit or interpretation claim.
