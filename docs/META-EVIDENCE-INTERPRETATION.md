# Meta evidence interpretation backend

Supplementary v2, authored against main `3e9b738ea44c003a667d00ddcef5fbd004f67ac4` (merged PR #45). Backend only. No publication, frozen contract, verifier, experiment runner, frontend or sandbox changes. The current production state is deliberately unavailable: no approved evidence or authenticated hypothesis-to-study lineage is provisioned.

## Audit and trust boundary

The existing Meta service authenticates proposal snapshots by a canonical digest of candidates and a second exact digest over confirmed intent revisions, reviewed graph/source commit, candidates, visible scenarios and approved goal. Hypothesize must reproduce that snapshot. Challenge must reproduce both the proposal context and the exact issued hypothesis array. Proposed scenarios stay visible and unfrozen. Process-local proposal/hypothesis identities expire after 30 minutes; replicas and restarts cannot resolve another process's identities.

The new service assigns each successfully validated hypothesis a server-generated UUID in the existing v1 `id` field. This preserves the frozen schema and existing challenge behavior while preventing a model from reusing an earlier identity. It retains the exact hypothesis, issuance time and approved context digest. Resolution requires both the original proposal's goal-bound digest and the latest accepted intent snapshots to match. A later accepted proposal with changed goal or intent revision invalidates the earlier interpretation context. Expiry is checked before dispatch and after all asynchronous work. This is the existing consented demo authorization model (configured same origin and server spending approval), not a new multi-user authentication system. Browser-only edits/revocations cannot be known to the server until communicated through a subsequent accepted proposal; no production evidence is enabled in the meantime. A future persistent intent/revocation service must invalidate these records too; this PR does not invent one.

`loadApprovedDecisionReports()` is the only default evidence source. Its fresh PR #45 loader authenticates approved publication/disclosure originals and revocation state, pins the projection, and cross-checks baseline/future run IDs, receipts, source trees, evaluator, suite, policy and individual check results against protected originals. `DecisionReportAnalysis.provenance` alone is explicitly _unauthenticated analysis_: calling the pure report function never grants authority. The adapter accepts the server loader's enclosing catalog, not a request-authored report or a bare provenance string.

**Missing binding:** PR #45's authenticated records have study/task/protocol/prepared-source identities but no issued hypothesis UUID, candidate ID, confirmed intent revision/goal context or proof of prospective hypothesis registration. Its public hypothesis/proposal text does not establish any of these. Therefore even a freshly approved tournament is insufficient by itself. Historical runs cannot be backfilled with a new hypothesis.

## Request and response

`POST /api/foresight/interpret-evidence`, same-origin JSON only, no-store:

```json
{
  "schemaVersion": "scientist-interpret-request.v2",
  "hypothesisId": "12dc6959-7579-43b7-8112-5b1e0a36eb22",
  "evidenceSummaryId": "23dc6959-7579-43b7-8112-5b1e0a36eb22",
  "consent": true
}
```

All fields are required. UUIDs are opaque references, not authority. Extra fields, client summaries, receipt/run objects, digests, instructions, provider choices and false/absent consent are rejected. Missing/stale issuance returns frozen safe `INVALID_REFERENCE` (422); absent/incomplete/unbound/revoked evidence returns `UNTRUSTED_EVIDENCE` (422). Provider failures use the existing fixed 503 envelope; rate limits use 429. There is no template or fabricated success fallback.

Success is `scientist-interpret-response.v2` with two separate objects:

- `interpretation`: UUID, exact hypothesis/evidence IDs, `authority=MODEL_INTERPRETATION_ONLY`, server-copied original prediction, scoped assessment, exact observed checks, alternative explanation, controlled next experiment, mandatory limitations and transport-established provider/model/prompt/response provenance.
- `authenticatedVerification`: server-resolved `scientist-evidence-summary.v2` with exact publication projection hash, linkage expiry, study/task, A/B verdicts and checks, phase metrics/units/unknown flags, comparison conditions and `deterministicDecision.author=DETERMINISTIC_REPORT_NOT_MODEL`. This object is copied from the authenticated adapter; the model cannot write it.

`contracts.ts` contains strict bounded runtime schemas; frozen scientist/API v1 files are untouched. The response is supplementary, not a replacement certificate. Reinterpreting later requires fresh resolution again; do not use a saved response as proof of current disclosure or freshness.

## Exact linkage and future provisioning

`createEvidenceAdapter()` defaults to `loadApprovedDecisionReports` and a resolver that always returns null. `runtime.ts` uses this default. No HTTP registration route, environment trust switch, filesystem loader or alternative key/receipt authority exists.

The server-only `resolveLink` dependency is an intentionally unprovisioned operator composition seam, exercised with synthetic records only. Parsing `EvidenceLinkSchema` does **not** authenticate lineage, timestamps or consent. A future resolver must authenticate and freshly resolve operator-approved prospective linkage and its current provider-disclosure permission before returning it; wiring arbitrary JSON here would violate the contract. Public publication permission alone is not permission to send evidence to Meta.

The minimum additional operator-approved linkage must establish:

1. A genuinely issued hypothesis and its entire immutable digest, issuance time, full approved context digest (confirmed intents/revisions, goal, reviewed source graph, exact A/B candidate bodies, visible scenarios), baseline commit and target B identity.
2. An authenticated prospective commitment tying that exact issuance/context/candidate to the study, frozen task and protocol **before any preparation or implementation attempt**. Timestamps alone or matching descriptive text are not proof. Persist the original issuance and commitment under approved custody; never invent or backdate them.
3. Later operator approval tying that commitment to the exact finished publication projection hash (which pins study/task definition, protocol/preparation identities, both initial/final source trees, runs, receipts, checks and measurements), including explicit review that prepared B implements the registered candidate. The final projection hash is pinned only after execution; prospective `registeredAt` and later `publicationApprovedAt` are distinct.
4. A new immutable opaque evidence-summary UUID with separate approval to disclose this allowlisted summary/hypothesis to Meta, current expiry/revocation resolution, and no reassignment to different content.

The adapter compares the issuance and context digests, hypothesis/candidate/baseline, exact study/task and publication hash. It requires registration after issuance and strictly before every recorded preparation/downstream start, publication approval after recorded outcomes, current linkage expiry, one unambiguous freshly approved report, matching A baseline commit, two distinct runs and four distinct complete baseline/future receipts. The report loader remains responsible for original receipt authentication. Missing outcomes fail closed without inference; authenticated rejected outcomes remain legitimate observations. Invalid comparisons with complete receipts can be interpreted only as not established.

No changes to `src/server/artifacts/**` or the publication agent's work are required to merge or test. Once genuine publication is separately approved through the existing catalog, a _separately reviewed_ authenticated lineage resolver is still necessary. Inject it into `createEvidenceAdapter({ resolveLink })` and pass that adapter as the third service dependency in the existing server composition. Keep `loadApprovedDecisionReports()` as the production report source. No hypothetical publication interface is required. The present short-lived in-memory issuance may expire before a real study finishes; that must stay unavailable until separately reviewed durable issuance/current-revocation support exists, not be solved by relaxing TTL.

## Prompt disclosure and interpretation limits

The prompt contains the issued bounded hypothesis and an explicit allowlist: opaque IDs/publication digest; study/task; fixed A/B labels and independent verdicts; the eight public-safe check identifiers/statuses; preparation/downstream/total measurements with units and unknown flags; model/order, completeness, blocker/deviation counts; deterministic decision; fixed scope/uncertainty statements. It contains no raw repository, graph source, protected check source, hidden grader text, operator records, paths, reservations, private diagnostics or arbitrary publication metadata/prompt text. Existing hypothesis text is untrusted data in the user message, never developer instructions.

Publication-specific free-text limitations are intentionally withheld; their count is disclosed and any such omission forces `not_established`, with an instruction to review the approved report separately. This prevents either leaking arbitrary operator prose or silently ignoring its limitations. Unknown cost remains null; missing measurements are not zero; preparation is included only where measured; files-touched counts are never summed. Complete telemetry is not an authenticated predeclared effort criterion.

The model returns a constrained structured analysis, not arbitrary prose. Its assessment is `supported|contradicted|mixed|not_established`; the current validator conservatively accepts only directly mapped directional required-check-success assessments (or abstention). `mixed` is reserved and rejected until authenticated metric-specific mapping exists. Regressions, boundary-violation counts, iterations and elapsed predictions currently require abstention; overall pass/fail does not measure them. Invalid/incomplete conditions and both-rejected outcomes cannot establish an advantage. A both-verified tie cannot support a strict higher/lower prediction. A supported no-regression prediction is scoped to required-check success and never implies superiority.

The model must return all 16 check observations exactly, including failures/unknowns, choose an approved alternative explanation and controlled next experiment, acknowledge uncertainty, set Meta unique value to not established and proposed challenge-as-holdout to false. Structured content, identifiers and provenance are validated. Server-authored bounded explanatory text expands those choices; any arbitrary model verification/superiority/prose field is rejected. It cannot edit the verifier status or deterministic report recommendation. Recommendations for a future experiment are data, never execution authorization.

## Transport and validation

The new stage uses the same process-shared transport, exact Meta endpoint and two-model allowlist, explicit server spending gate, approved-payload digest/call-limit gates, single concurrent call, 10-second spacing, 30-second deadline, 49,152-byte input/65,536-byte output bounds, 4,096 completion-token cap, bounded JSON parsing, redirect rejection, unique observed response identity and cancellation handling. It has the same four-attempts-per-hour endpoint allowance and consumes the **unchanged 12-call process cap** shared with the original three stages; no extra process spend is granted. No retry or browser inference is added. In-flight provider configuration/spending changes invalidate the reply too. No raw prompts, secrets, responses or private code are logged.

Tests use synthetic fetch responses, inert signed originals and test-owned temporary storage. The interpretation test injects a test-local reviewed baseline matching those synthetic originals; the original reviewed graph/provenance flow is independently exercised by the existing foresight suite. No live provider validation, real experiment, paid inference or private evidence access occurred. See IMPLEMENTATION-LOG.md for actual command outcomes and environment limitations.
