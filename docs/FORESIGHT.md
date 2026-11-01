# Consented booking Foresight

M6.1–M6.4/M6.6 now have a complete local reasoning flow: confirmed intent → reviewed booking context → status quo A / bounded B → one falsifiable hypothesis → one proposed adversarial counterexample. A subsequent bounded M5.6.1/M6.5.1 slice adds the local developer-reviewed modeled comparison described below. Interpretation and experiments remain outside this flow. Separately approved historical certificates are available only through the read-only certificate boundary; the current worksheet has no linked measured experiment. On November 1, 2026, a separately authorized full live Meta sequence succeeded through the production application: [proposal, hypothesis, challenge and checked recording](LIVE-META-SCIENTIST-VALIDATION.md). Show that saved sequence as recorded, with its reasoning limitations. No architecture experiment or Meta-effectiveness result is established. Earlier NOT_RUN statements below describe the historical one-proposal smoke, not the later full-session validation.

## Review and sharing

Confirm a future requirement in the existing editor. In Foresight, choose which confirmed requirements to share, review the goal and partial booking graph, and expand the exact application payload or full provider request body. Confirmation and sharing are distinct actions. The first call sends intents, graph and goal; its proposed visible scenarios are reviewed with A/B before the second call. The challenge gets its own approval of the matching current hypothesis and context. No stage automatically calls the next one. Retries require another explicit approval/action.

Editing an intent immediately discards the current research; confirming a revision, revocation, changing selection/goal or clearing the run also discards results and sharing approval. Unmount cleanup aborts the request; identity checks ignore obsolete completions even if the provider ignores cancellation. There is no retained research history or durable browser storage. Intent JSON export remains available. Model text renders as plain React text, without HTML, Markdown execution, tools or commands.

The graph is newly prepared bounded application data in `src/lib/foresight/booking-context.ts`, reviewed against **ForeCode commit `a564da2fe36a5de3ea95f777c1f5a60fd80ad6f0`**. Its nine real fixture-relative paths and thirteen static imports include type imports. Tests bind those nine files to SHA-256 values prepared from that actual Git object; CI can verify current source without fetching historical app objects. External libraries, UI, tests and config are omitted. The existing dynamic detail route is explicitly omitted because frozen v1 paths cannot represent brackets. The summary describes the fixed-viewer demo, owner-only service, synchronous overlap store and absent team/persistence capabilities. This is not a complete runtime architecture, repository importer or source execution facility. There is no client path/clone parameter.

Only explicitly visible, unfrozen `meta_generated` scenarios enter subsequent provider prompts; none is a heldout or measured result. The deliberate local template described below uses `developer_tentative` scenarios with template candidates and never enters the server-issued provider sequence. The model may propose actions on the reviewed existing paths only. Creating a new file needs a separately reviewed context, rather than inventing a path in this flow.

## Explicit local template mode

`createBookingTemplate` in `src/lib/foresight/templates.ts` supplies fixed, newly authored developer templates for all three reasoning stages. Choosing this local mode makes no network request and is never an automatic provider-error fallback. Each response has `provider=template`, `mode=template`, null model/evidence IDs and an explicit no-inference limitation. It preserves confirmed intent references, exact reviewed graph and bounded action/cost semantics; the server rejects these records as unissued if a client tries to submit them to live hypothesis/challenge routes.

The fixed roadmap comparator retains A's existing ownership checks versus B's proposed authorization decision boundary inside the booking service. Its tentative scenario covers delegation and membership revocation, and its falsifiable prediction concerns regressions under matched future-task conditions. Reviewers must decide whether that fixed scenario and mechanism fit their actual requirement. This mode does not interpret arbitrary text, prove a strong measured comparator, or constitute Meta evidence. In the frozen challenge shape, `visibility=model_generated_not_heldout` is the only non-heldout category; template provenance and the challenge's explicit limitation identify this local developer-authored example. Its acceptance outline remains a proposal and has no evaluator authority.

## Developer-reviewed local comparison

After valid proposals arrive, use **Review cost assumptions, then compare** without sending a hypothesis or challenge request. This is the permitted hand-reviewed boundary/table fallback for M5.6.1 and M6.5.1, with reviewed impact basis from M5.5.1 and focused M5.7.1 controls. It does not complete all of M5 or M6. No graph traversal, AST extractor, general repository analyzer, experimental runner or template-comparator study is added.

1. State one bounded comparison scope for A, B and every visible proposed scenario; explicitly review whether the alternatives are comparable.
2. Review every existing graph unknown. A relevant or unreviewed omission forces abstention. To exclude an omission, supply a scope rationale that applies equally to both candidates and every scenario. In particular, the real dynamic detail route remains omitted and unrepresentable; if its work is relevant, the comparison must abstain. Excluding it only permits a partial-graph estimate of a narrower scope, never a runtime integration claim.
3. For each candidate × scenario, select affected **existing reviewed** paths, enter route-change and unresolved-relevant-dependency counts (integers 0–64), supply reviewer rationale and explicitly check the pair review. Counts start unset. Checking paths with none selected explicitly records an empty list; empty counts remain unknown. Known counts of unresolved dependencies contribute to the rubric, while an unreviewable relevant impact must be stated as unknown.
4. Select **Compare locally**. The browser runs shared pure TypeScript and displays either the entire matrix and minimax-regret result, or no scores and a precise abstention reason. Inspect the complete frozen `DecisionV1` in the result. Every basis has `source=reviewed_estimate`; model text is never promoted to `static_graph` evidence.

The fixed rubric is upfront action weights 3 for `introduce_boundary`, 2 for `extract_module`/`move_module`/`add_interface`, 0 for `leave_unchanged`; A has an empty plan and zero upfront cost. Candidate totals are checked against every action. Downstream = 2 × unique changed paths + route changes + 2 × unresolved relevant dependencies. Total = upfront + downstream; scenario regret = total minus the minimum across **every** eligible candidate. Recommend the smallest worst scenario regret, breaking ties by lower upfront cost, then lexically lowest candidate ID. The interface exposes upfront arithmetic, downstream/total/regret calculations, worst regrets and the tie rule used. A can win; unknown basis or incomparable alternatives produce `perScenario:[]` and `recommendationId:null`. Malformed values, units, references, baselines, duplicate/non-normalized paths and unreviewed plan paths are explicit errors, including when another row is incomplete. No partial matrix or invented zero is permitted.

Worksheet assumptions are browser-memory developer estimates, separate from intent confirmation and provider transmission consent. No worksheet field enters a Meta request; comparison performs no network call or inference and requires no hypothesis/challenge result. The proposed counterexample remains proposed and never joins the scenario set automatically. The engine binds reviews to canonical exact research content, including intent revisions/text, graph, candidate bodies and scenarios. The browser also binds goal and proposal content through component identity. Every worksheet edit invalidates its previous decision. Changing comparison scope/comparability clears pair assumptions and omission reviews; intent edit/revision/revocation, research goal/selection/context changes, clear and session reload discard the whole dependent worksheet and decision. Existing cancellation and stale-provider-response rejection remain intact.

These are modeled effort points under developer-reviewed assumptions. They are not hours, money, probabilities, measured architecture benefit, Meta incremental advantage, protected verification or a product certificate. Import reachability does not establish changed files or runtime integration. The unchanged nine-module/thirteen-import booking graph and its actual reviewed commit remain the only application path boundary. The fresh complete synthetic no-benefit control in the unit tests is not booking evidence: totals A/B = 8/5 and 0/3 give worst regrets 3/3, so A wins on zero upfront cost.

### Deferred evaluation API integration

**`POST /api/foresight/evaluate` is deliberately not implemented.** The unchanged frozen `EvaluateRequest` contains graph, candidates, scenarios and scoringVersion; it has neither projection-basis nor intent fields. It cannot carry this reviewed worksheet unchanged or support `validateDecision` against the actual confirmed-intent context. No fields, alternate endpoint, invented confirmed intents or server-authenticated client assumptions were added. All 49 frozen definitions and the normative planning pin are unchanged.

The next API dependency is a separately reviewed integration/authority design that resolves how exact confirmed intent revisions, projection review and scope are represented and bound without silently changing v1. Until then, this local worksheet is the complete supported comparison workflow. Broader graph/runtime coverage and independently measured experiments are separate dependencies, not consequences of a passing comparison.

## Separate recorded verification view

The workspace now links to the read-only [`/experiments` history view](RECORDED-VERIFICATION.md). The current developer-reviewed modeled comparison has **no linked measured experiment**. History does not consume confirmed intents, invoke Meta or attach old recordings to current proposals. Editing an intent never changes a recording. Production recordings remain **NOT_PROVISIONED**, with an honest no-approved-evidence state; private historical acceptance output has not been opened, registered or published.

The complete server-only composition and explicit public projection use only the existing protected store, require its in-process authenticity marker and reload evidence for every served view. Required-check acceptance is distinct from run completion, unknown metrics stay unknown and infrastructure acceptance is distinct from an architecture experiment. Registration/publication needs separate operator approval. The later [scoped certificate boundary](RECORDED-CERTIFICATES.md) adds read-only historical inspection/export at `/certificates` and the existing frozen `GET /api/demo`, with an empty production catalog. It creates no certificate for this worksheet, attaches no current intent/decision and adds no interpretation, scoring API or inference. Local arithmetic/consent/invalidation behavior remains unchanged.

## Actual provider protocol and configuration

Read-only official documentation was checked on October 27, 2026:

- [Meta Chat completion guide](https://dev.meta.ai/docs/protocols/chat-completions): HTTPS `POST https://api.meta.ai/v1/chat/completions`, messages array, developer role, Bearer authorization, nonstreaming text response, `max_completion_tokens`.
- [Meta protocol schemas](https://dev.meta.ai/docs/api-reference/chat-completions/schemas): response identity/model, finish reasons, usage, JSON output format and reasoning token accounting.
- [Meta model catalog](https://dev.meta.ai/docs/models): explicit `muse-spark-1.3` and `muse-spark-1.3-contributor` IDs and their distinct content-use modes. Catalog documentation does not establish this account's access.

The existing local configured model was `muse-spark-1.3-contributor` at `https://api.meta.ai/v1`; only these non-secret settings were inspected. No credential value was printed or changed. No model/provider was silently substituted. This narrow adapter allowlists that exact base URL and the two explicit Spark 1.3 IDs. Other providers, ports, paths and models fail closed. Contributor mode can allow training on submitted content and responses; the review UI states that consequence. `store:false` does not override Contributor mode's content-use terms.

`META_MODEL_API_KEY`, `META_API_BASE_URL`, `META_MODEL` and `META_CALLS_ENABLED` remain server-only. Calls additionally require `META_SPENDING_APPROVED=true`, which must only be set after genuine human approval, account/model access, credits and appropriate provider-side spending controls. An existing key or enable flag is not approval. `.env.local` is never committed or serialized. The trusted public origin is explicitly configured as `FORECODE_ORIGIN`; it is never derived from Host or forwarded headers. HTTPS is required except explicit HTTP loopback origins for local development.

## API and validation boundaries

| POST path                    | Frozen request → response                                      |
| ---------------------------- | -------------------------------------------------------------- |
| `/api/foresight/propose`     | `ProposeRequest` → `ProposeResponse`                           |
| `/api/foresight/hypothesize` | `ScientistHypothesizeRequest` → `ScientistHypothesizeResponse` |
| `/api/foresight/challenge`   | `ScientistChallengeRequest` → `ScientistChallengeResponse`     |

Success shapes are the original frozen records, with no extra envelope. Routes reuse `readJsonRequest` and `apiErrorResponse`, require same configured origin, JSON, bounded input and literal consent, and return no-store headers on successes and safe errors. Unsupported methods use the same safe error path. Structural violations return 400, oversized input 413, unreviewed/stale/unissued relationships 422, local limits 429 and provider/configuration failures 503. No raw exception, response body or key enters the error envelope.

`validateResearchContext`, `validateHypothesis` and `validateChallenge` remain unchanged and are reused alongside slice-specific checks. A is first, with no changes, constraints or upfront cost. B must have a meaningful allowed action; its cost equals the frozen action-weight sum. All plan/constraint paths resolve to reviewed modules. Points are modeled estimates, never measured savings. IDs, baselines, approved intent/scenario sets and nested provenance must agree. The one hypothesis targets B versus A and states mechanism, observable directional prediction, falsification, assumptions, counterarguments and limitations. The one challenge targets that hypothesis/candidate/baseline, includes an acceptance outline and remains `proposed` / `model_generated_not_heldout`.

The server retains bounded hashes of successfully issued candidate/hypothesis records and their exact approved parent contexts for 30 minutes. Altered metadata, candidates, goals, intent revisions, scenarios or hypothesis bodies cannot be substituted downstream. Restart/expiry requires fresh proposals. This is a single-user demonstration boundary, not authentication or a durable server registry of the user's unsent local edits. The browser enforces current-session invalidation; the server authenticates issuance and snapshot relationships, not arbitrary claims that a remote person clicked consent. No public endpoint retrieves the stored hashes or accepts arbitrary provider responses.

Each observed provider response identity can bind only one invocation in the process. A repeated response ID, including one replayed for another stage, fails closed with the fixed safe error and cannot issue a downstream hypothesis. These bounded process controls do not authenticate a downloaded file or grant execution authority.

### Developer-reviewed research handoff

After the three stages, `createExperimentalHandoff` in `src/lib/foresight/handoff.ts` validates the exact request/response snapshots and a separate literal developer-review acknowledgment. It rechecks every frozen shape, graph/intent boundary, A/B, hypothesis and challenge relationship, plus the exact goal, intent revisions, candidate bodies and visible scenarios inherited by each stage. Its parsed snapshot is independent of subsequent browser edits. Canonical JSON can be downloaded for a separate operator's review.

The local `foresight-experiment-review.v1` record is explicitly `planning_only`, `unverified_model_proposals`, and `NOT_AUTHORIZED`. It is not a new frozen public experiment contract, preregistration, controller admission, spending approval, evaluator policy or certificate. Its challenge remains `proposed` / `model_generated_not_heldout`; the outline cannot authorize checks or become a sealed holdout. Each stage keeps its original live, recorded or template provenance. Relationship validation alone cannot authenticate server issuance or actual provider access. The operator still needs independently approved frozen task/acceptance/fairness policy, exact source and execution envelope, reviewed sandbox admission and protected receipts for the exact final tree.

### Current live admission audit — October 28, 2026

Read-only local configuration inspection reported the configured allowlisted Contributor model and a present credential, with calls disabled and spending approval absent. No credential value was printed, changed or transmitted. The historical single-proposal approval below has been consumed and explicitly excludes downstream calls. No fresh independent exact-payload spending envelope for hypothesis/challenge was available, so no paid request was made. Proposal has the separately recorded genuine observation below; hypothesis, challenge and research handoff validation in this work remain synthetic test evidence. Intent text extraction (M4.3), evidence interpretation and a matched Meta-versus-template effectiveness study remain outside this implementation; manual explicit intent confirmation continues to be the input boundary.

The internal model-content schemas omit provenance. Unexpected fields, including model-authored `provider`, `modelId` or mode identities, are rejected. Only the authenticated configured transport response establishes public live provenance. It verifies the response model, a nonempty observed response ID, a single assistant text choice and natural `stop` termination. Tool calls, refusals, extra output structures, truncation, malformed JSON/UTF-8, excessive bytes, invalid costs/relationships and model mismatches fail closed. No repair call or successful template fallback occurs.

## Fixed local bounds and provenance

| Control                                                     | Current bound                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Application JSON request                                    | 65,536 UTF-8 bytes                                                                                  |
| Entire provider request body, including instructions/schema | 49,152 UTF-8 bytes                                                                                  |
| Entire provider response body                               | 65,536 bytes                                                                                        |
| Completion tokens, including reasoning                      | 4,096                                                                                               |
| Provider deadline                                           | 30 seconds, including response body consumption                                                     |
| Concurrency                                                 | One locally active request per process across all three routes; upstream cancellation is unverified |
| Minimum interval                                            | 10 seconds between attempts                                                                         |
| Per endpoint                                                | Four attempts per rolling hour                                                                      |
| Total                                                       | Twelve attempts for the process lifetime, including failures                                        |
| Retries / repair / tools                                    | Zero automatic retries, no repair or tools                                                          |

`META_APPROVED_PAYLOAD_SHA256`, when set, additionally restricts inference to the exact canonical full provider-body digest. `META_APPROVED_CALL_LIMIT` can lower the process cap (1–12); use **1** for the first smoke. Invalid limits or a different payload fail before dispatch.

The transport records a bounded in-memory observation per structurally valid provider response: configured model, fixed prompt version `booking-scientist-1`, SHA-256 identities of the observed response/request IDs, exact input context and provider payload, and actual available usage. Public `sourceEvidenceId` is `meta-` plus the SHA-256 of the canonical observed response ID; it identifies a model response, not grader evidence. Missing usage/reasoning counts and monetary cost remain unknown/null. Raw prompts, reasoning, provider content, keys and private reports are not logged or written to files. The observation ring is process-local and has no public retrieval endpoint.

These limits are not billing enforcement. Process restarts, replicas, upstream billing and disconnect behavior are outside their guarantees. Cancellation propagates an abort and stops waiting, but cannot prove the provider stopped generation or charging. The demo has no distributed rate limiter, persistent multi-user backend or billing framework. Follow account-side spending controls and stop if no suitable control/approved ceiling exists.

## Synthetic validation and evidence boundaries

Unit/route tests inject synthetic `fetch` responses; ordinary CI uses no real provider credential or paid call. Browser tests intercept endpoint responses with explicitly synthetic **template** provenance and review the complete flow, approvals, cancellation, duplicate clicks, changed/revoked contexts, late responses and inert rendering. A separate disabled-server browser case verifies review remains available while dispatch is disabled. The Playwright launcher installs a test-only external-fetch denial preloader and uses fake server keys; even an accidentally unmocked request cannot reach Meta. That preloader and the synthetic fixtures live outside `src`, are absent from normal start/build imports, and cannot be selected by a public client flag or response-injection endpoint. Route/transport tests separately exercise actual server assembly and lineage checks. Synthetic successes do not establish actual model access or usefulness.

All 49 frozen definitions and the original planning pin remain unchanged. No evaluator/experiment code, protected loader, fixture implementation, dependency/lockfile, sandbox policy or Workstream A runtime changed. The structural web boundary continues to forbid execution and new filesystem pathways. Application coding-agent invocation/export remains hard-disabled. No VM, lease, installation, protected acceptance command or real agent was used for this feature.

Workstream A's historical baseline/distinct-final `VERIFIED` and ownership-regression/forged-success `REJECTED` observations remain the previously completed owner-reviewed fixed Next 16.4.3 Webpack infrastructure results. They were not rerun, registered in the hosted app, relabeled, passed to Meta or treated as architecture/Meta-effectiveness evidence. Current source changes do not erase historical observations; any future runtime admission still requires its own current bindings. Foresight output grants no evaluator-policy, experiment, verification or certificate authority.

<a id="executable-first-smoke-handoff--not_run"></a>

## Executable first-smoke handoff and observed call

Preparation is credential-free and performs no network access:

```sh
node --import tsx scripts/meta/prepare-smoke.ts muse-spark-1.3-contributor > /private/tmp/forecode-meta-propose-smoke-review.json
```

The review file contains a prepared sample requirement, exact application request, full provider body and canonical SHA-256 identity. Its `user_confirmed` representation is **not evidence of a confirmation already obtained**: the human must explicitly confirm that exact prepared requirement, context and goal along with the payload before sending it. The preparation command emits NOT_RUN with an unset ceiling; it performs no inference or approval itself. The already prepared private review artifact now separately records the owner’s exact-payload approval and the $0.01 budget selected under that delegation. The file contains no keys, private grader reports or candidate snapshot and stays outside Git.

Prepared envelope: **one propose call**, configured Contributor model, **8,417 provider-body bytes**, **4,096 maximum output tokens including reasoning**, **30-second timeout**, **zero retries**; payload SHA-256 **`76817368b33715af4759fa68a4df198fc8757755b9b9332561bbdcfd33016ad7`**. Following the owner’s reply approving this exact smoke and delegating routine decisions, the selected smoke budget is **$0.01**. This is a planning ceiling, not guaranteed provider-side enforcement. Hash changes require renewed payload review. The approved first attempt has now been consumed successfully; observed details follow below. These commands are a handoff template, not authorization to repeat the call.

Before executing: obtain explicit human confirmation of the prepared intent/context and exact body hash, a numerical spending ceiling, confirmed model/account access and credits, appropriate provider-side spending controls, and Contributor content-use approval. No completion probing or model-list request has been made to establish access.

Only **after those actual approvals**, start a local application process with the exact payload restriction and one-attempt cap (keys stay in the existing server environment):

```sh
META_CALLS_ENABLED=true META_SPENDING_APPROVED=true \
META_APPROVED_PAYLOAD_SHA256=76817368b33715af4759fa68a4df198fc8757755b9b9332561bbdcfd33016ad7 \
META_APPROVED_CALL_LIMIT=1 FORECODE_ORIGIN=http://127.0.0.1:3000 npm run dev
```

In another terminal, extract the already reviewed application request and submit it once to that local server:

```sh
node --input-type=module -e 'import fs from "node:fs"; const review=JSON.parse(fs.readFileSync("/private/tmp/forecode-meta-propose-smoke-review.json","utf8")); process.stdout.write(JSON.stringify(review.request));' > /private/tmp/forecode-meta-propose-request.json
curl --silent --show-error --max-time 35 --request POST \
  http://127.0.0.1:3000/api/foresight/propose \
  --header 'Origin: http://127.0.0.1:3000' \
  --header 'Content-Type: application/json' \
  --data-binary @/private/tmp/forecode-meta-propose-request.json
```

Do not add curl retries. Inspect the typed response and actual provenance; a provider failure is not permission to retry. Stop the owned server after the observation. This approval does **not** authorize a hypothesis/challenge call. Their exact new bodies depend on the prior observed response and need separate review and approval; do not preauthorize unknown outputs. For the interactive full flow, approve each stage in the browser and use an operator spending envelope that genuinely covers its reviewed exact payload. The prepared CLI smoke and a browser run are separate sessions; do not merge their evidence.

### Initial owner approval follow-up (before live execution)

The owner authorized the exact first-propose smoke above and delegated routine choices. The selected $0.01 budget retains the same body digest, one-attempt cap, 4,096 completion-token cap, 30-second deadline and zero retries. No downstream payload, provider/model switch, funding purchase or publication is inferred.

At the initial approval follow-up, read-only inspection found a signed-in Meta session and the configured model listed in its catalog, but Billing remained at “Loading billing…”; account funding and controls could not yet be established. Catalog visibility is not confirmed model/account access. [Official current pricing](https://dev.meta.ai/docs/pricing-rate-limits) lists Contributor input/output at $0.10/$0.20 per million tokens. Using every one of the 8,417 request-body bytes as an input-token estimate plus the full output cap gives a conservative modeled amount of about $0.00166; this is not a provider token count, bill or spending guarantee. [Meta’s spending-control help](https://dev.meta.ai/help/billing/spend-limit-alert) states that spend limits are alerts, not hard usage caps. No alert, payment method, auto-recharge, funding or key was changed. Live status was **NOT_RUN** at that point; the later approved observation below supersedes that current-status limitation.

### Observed approved first-propose smoke

The owner subsequently confirmed active credits. Billing then loaded and independently showed active free credits; the exact configured Contributor model was selected/available in the signed-in account. No spend alert was configured. No payment, alert, funding, key, provider/model or account setting was changed. The fixed body, one-attempt cap, provider-enforced 4,096 completion-token parameter, 30-second abort deadline, known published rates, funded credits and manual monitoring were judged adequate for this single approved sub-cent request. There is no provider dollar hard cap, and those controls do not guarantee a $0.01 bill or authorize general unattended usage.

The actual production Next app was started on loopback port 3187 with the exact approved body digest and one-attempt cap. A temporary operator-side guard outside the repository additionally rejected any different/repeated outbound request and emitted only bounded sanitized identities/usage; it did not inject a response, log raw content/keys, add a product endpoint or create a filesystem capability in application source. The exact prepared request was submitted once to `/api/foresight/propose`. Meta and the app both returned **HTTP 200**. Independent local `validateFlowOutput` accepted the frozen response: status quo A has an empty plan and zero upfront points; B has two allowed actions totaling five modeled effort points, plus one visible proposed scenario. Those are model proposals and arithmetic, not measured development savings.

| Observation                                   | Actual result                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Model / prompt                                | `muse-spark-1.3-contributor` / `booking-scientist-1`                    |
| Attempts / retries                            | 1 / 0                                                                   |
| Provider response body                        | 3,039 bytes                                                             |
| Input / output / total tokens                 | 1,777 / 863 / 2,640                                                     |
| Reasoning / cached input tokens               | 259 (included in output) / 0                                            |
| Public response identity                      | `meta-cd7163e370554e8707a63ef090dbba4e34fc2b23845c438c2c4a5d16c19ae1db` |
| Request identity (hash)                       | `c0780dc601f2d67809058b4e06ff411c7b95cc1180c20d277467b73319f0d31a`      |
| Exact context identity                        | `7330c63404185036715abf4b5d4c9e369994e7a688e5f4661599ce73e7c7f941`      |
| Published-rate estimate / actual billing cost | $0.0003503 modeled from reported usage / unknown                        |

The public response identity matched the transport observation and was not supplied by model-authored JSON. Private typed response and sanitized observation are outside Git; no raw provider traffic or candidate snapshot was committed. The owned server was stopped by SIGTERM (process exit 143), and a read-only listener check found no remaining listener on 3187. A default-sandbox `ps` inspection was denied; shutdown used the already identified owned listener PID under authorized process control. No VM/lease or Workstream A operation was involved.

The one approved attempt is consumed. Hypothesize/challenge are **NOT_RUN live** and require their own exact-payload approvals. The CLI smoke server is stopped and its parent bindings are ephemeral: a future browser research session must start with a fresh approved proposal, not present these stopped-session results as current or inject them as server-issued records. The complete three-stage browser behavior remains synthetic-test evidence only. No coding agent, experiment, architecture/Meta-effectiveness claim or product certificate occurred.

## Historical source onboarding follow-up

The separately owner-authorized [recording onboarding review](RECORDED-EVIDENCE-ONBOARDING.md) now has actual authenticated fixed infrastructure checks in a private local preview. They do not bind to the current intent/worksheet, and their source set contains no genuine ExperimentRunV1 for certificate export. The current modeled comparison still has no linked measured experiment; no new Meta call or interpretation was added.

## Prospective product review remains separate from Foresight

The [new private recorded-product review](RECORDED-PRODUCT-REVIEW.md) now has genuine complete prospective runs and a byte-validated certificate download. These are fixed A-family infrastructure checks, separate from current intent/worksheet and live Meta output. The modeled comparison still has no linked measured experiment. No inference or interpretation occurred in this product review; live hypothesis/challenge validation and any Meta incremental-benefit study remain separate. The historical preview's absent source runs were not backfilled, and the default public catalog is still empty.
