# Read-only recorded verification

Open **Recorded verification** in the workspace, or visit `/experiments`. It is usable without confirmed intents, Meta configuration or inference. Production is **NOT_PROVISIONED**: the code-owned catalog is empty and the page says **No approved recorded evidence available**. Completing this boundary does not authorize registration or publication of private historical output.

This is bounded M8.3.1 with the sanitized provenance projection needed from M8.4.1 and focused M8.6.1 coverage. It does not complete those milestones in full or all of M8. The original verification slice added no certificate. The subsequent bounded [scoped certificate slice](RECORDED-CERTIFICATES.md) now adds `/certificates` and the existing frozen read-only `GET /api/demo`; the 49 frozen definitions remain untouched. Meta interpretation, experiment execution, general artifact browsing and scoring API integration remain absent.

## What the page means

The current developer-reviewed worksheet computes modeled effort under explicit assumptions. It has **no linked measured experiment**. Historical protected check results are a separate read-only view. They are never implicitly attached to a current intent, proposal, worksheet or decision. Intent edits do not rewrite historical evidence; returning to the workspace starts its browser-memory session.

A recording can display one set of checks without an A/B partner. Run completion appears separately from check acceptance: `completed` is not acceptance. For an authenticated receipt, any required failure yields **REJECTED**, even if another required result is absent. All required trusted passes yield **VERIFIED**, scoped only to the pinned checks and source tree. Missing, `invalid` or `not_run` required results otherwise yield **INSUFFICIENT_EVIDENCE**. Optional passes cannot replace required results.

Unconfigured, unloadable, stale, forged, changed or disappeared sources supply no trusted verdict. Missing approved check metadata also makes the whole recording unavailable; failures are never selectively hidden. One unavailable recording does not prevent another independently approved recording from displaying. Malformed or duplicate catalog references fail the catalog closed.

Unknown/unpublished metrics display **Unknown**, including absent run records; genuine zero stays zero. The authenticated receipt does not manufacture an ExperimentRunV1. Where a genuine run is separately supplied and approved, its exact receipt/verification relationship is validated using `validateReceiptRelationships`, with recorded presentation required. Run metrics are separately approved source metadata, not measurements independently authenticated by receipt custody. No isolation attestation or task binding is synthesized or displayed.

Infrastructure acceptance is explicitly labeled as such. Protected check verification does not establish a matched architecture experiment, experiment fairness, measured architecture benefit, Meta incremental advantage, or root-capable-agent/sandbox containment. The historical fixed baseline/distinct-final/ownership-regression/forged-success acceptance observations retain their original limited meaning; this implementation neither opens nor registers their private output.

## Loading and public fields

`src/server/artifacts/recording-catalog.ts` is the sole production composition seam. It calls the bounded server-only `loadRecordedVerifications` service with no registrations and no store configuration. Empty catalogs return before store construction or filesystem configuration access. There is no discovery, upload, request-selected path/root/pin, runtime testing switch, environment configuration framework, raw-evidence JSON API or action to execute/register anything. The separate certificate slice uses only the existing frozen `/api/demo` contract.

For a configured catalog, each serving request constructs the existing `createProtectedEvaluationStore` and reloads its exact allowlisted bundle/evidence bytes. `/experiments` uses Node, `force-dynamic` and `revalidate=0`; neither the service nor page memoizes trusted results. Source disappearance or changed bytes after a successful request cannot preserve a trusted verdict on the next served request. Existing store custody, bounded reads, disjoint roots, symlink/path rejection, exact pins, canonical digests, immutability and in-process authentication remain unchanged. This service acquires no filesystem capability of its own.

`projectRecordedVerification` requires `isTrustedEvaluation` **before** projection. Structural JSON, type assertions, spread/cloned/serialized objects, digests, issuer labels and `origin=trusted_evaluator` cannot authenticate a result. Serializing an authenticated object loses its in-process authenticity.

Only these fields enter the internal public view:

- Approved recording title, ID, scope, category and limitations; constant recorded presentation.
- Approved matching run, receipt and verification IDs; validated run completion when a genuine run is supplied; authenticated scoped verdict.
- Every observed/required check's approved ID, public label/description, required/optional designation and authenticated status (or explicit missing). Check evidence SHA-256 only when expressly approved.
- Explicitly approved original source-tree, fixture, evaluator, suite, policy, check-collection and receipt-manifest SHA-256 identities.
- The five existing metric names and separately approved run values, otherwise null.

Raw check `scope` is never copied. Receipt/check text, host roots, `evidencePath`, diagnostics, stdout/stderr, private test bodies, hidden-case descriptions, credentials, full runs, raw bundles and operator configuration do not cross the view boundary. Public check IDs and descriptions themselves require approval; schema parsing cannot determine whether arbitrary operator text is safe to publish. Text renders as inert React text, with native keyboard-operable details and responsive layouts. This verification view has no client component receiving evidence props and no debug JSON or raw artifact response. The separate certificate export control receives only an approved certificate ID/digest; `/api/demo` exposes only fully approved frozen runs/certificates, never this check-detail projection.

Original digests retain their exact values and names. They identify original artifacts, **not the sanitized projection**. This view cannot independently re-verify the original private bytes and must never be represented as a public copy of them.

## Future operator handoff — separate approval required

Do not provision private recordings as part of this ticket. A later authorized operator can prepare a concrete publication review and change only the code-owned catalog composition after receiving that approval:

1. Establish genuine original source records and current custody outside all agent-readable/writable roots. Review the exact evaluated tree, fixture, evaluator, suite, required policy/IDs, bundle-byte pin and individual evidence. Do not invent missing run records, attestations, task bindings or usage. Do not regenerate evidence merely to populate a view.
2. Separately review every field intended for publication. Supply a bounded `RecordingRegistration` with exact `RecordingMetadataSchema` fields: `id`, `evaluationId`, `runId`, `receiptId`, `verificationId`, `title`, `scope`, `category`, `checks`, `publicIdentities`, `publicMetrics` and `limitations`. Use `infrastructure_acceptance` for fixed infrastructure cases. Every required and observed check must have an approved ID, label, description and explicit digest-publication boolean, including failed/missing results. No arbitrary artifact text is a public description.
3. Supply `run: null` if there is no genuine approved ExperimentRunV1. Otherwise provide that exact source record server-side; it must match receipt/run/verification IDs and identities, valid timing, frozen provenance requirements and recorded mode. No new A/B pair, intent association or isolation evidence is inferred. Approve metric publication individually through `publicMetrics`; omit names to keep values unknown.
4. In `loadApprovedRecordings`, pass the reviewed registrations and trusted store configuration directly to `loadRecordedVerifications`. Store configuration has `root: <PROTECTED_ROOT>`, `agentWorkspaceRoot: <DISJOINT_AGENT_ROOT>`, and `entries: Map(<EVALUATION_ID> → {directory: <APPROVED_DIRECTORY_ID>, bundleSha256: <EXACT_BUNDLE_SHA256>, identity: <EXACT_EVALUATION_IDENTITY>})`. These are placeholders, not operational paths or artifacts. Roots/pins stay server-only and outside public request input. Preserve the original protected-store safeguards; no new configuration framework is needed.
5. Before any publication, review the sanitized rendered result and serialized internal projection, including all failures/unknowns, for unintended disclosure and overstated claims. Rerun custody/tamper, projection, boundary and browser checks. Registration and publication need their own explicit approval; local implementation authorization is not that approval.

Remaining dependency: approved public metadata plus genuine source records and trusted store configuration. Availability remains **NOT_PROVISIONED** until that separate operator work is authorized and completed. Matched architecture experiments, measured benefit, Meta attribution, actual certificate provisioning, interpretation, deployment and containment admission remain separate work. The certificate assembly/export boundary is now implemented separately; it requires genuine complete publishable run records and fresh authenticated evidence, beyond this sanitized recording projection.

## Regression coverage

Fresh temporary synthetic artifacts exercise the real protected store and projection in `tests/unit/recorded-verification.test.ts`, using `tests/support/recorded-verification.ts`. Tests cover authenticity forgery, verdict precedence, missing/invalid/unrun required checks, optional checks, mismatches/stale pins, changed bundle/evidence bytes and source disappearance after success, duplicate/invalid metadata, exact public-field allowlisting, secret sentinels, null/zero metrics, stable ordering and non-mutation. Existing custody and web execution-boundary tests remain enabled.

`tests/e2e/recorded-verification.spec.ts` covers workspace navigation, empty/unconfigured history, provider-disabled operation, no alternate evidence API, responsive widths and keyboard use. Synthetic populated states render the actual view component directly into an isolated Playwright document, clearly labeled test-only; they never use the production catalog or a runtime injection seam. Unit rendering separately exercises authenticated service projections. Existing synthetic keys and external-fetch denial remain unchanged. Exact observed validation is recorded in IMPLEMENTATION-LOG, not inferred from historical counts.

## Scoped certificate follow-up

The workspace and this history link to `/certificates`. Both production catalogs stay empty/unconfigured. `GET /api/demo` is now the existing frozen `DemoResponse`, not the internal check-detail view; it returns empty runs/certificates by default. Complete-run disclosure approval and genuine run records are required for any certificate, so a recording with `run:null` can still show scoped checks here but cannot be expanded into a certificate. The certificate service authenticates original store objects and reloads evidence itself; it never treats this sanitized projection as evidence authority. See [the full certificate guide and operator boundary](RECORDED-CERTIFICATES.md).

## Owner-authorized historical onboarding

The [bounded original-source review](RECORDED-EVIDENCE-ONBOARDING.md) freshly authenticated all four fixed Workstream A bundles and twenty required checks. A private local production preview uses the existing code-owned catalog with those recordings and `run:null`; both failures remain visible and all run metrics/completion stay unknown. The public/default catalog remains empty. Original acceptance records did not emit ExperimentRunV1, so the certificate view and frozen `/api/demo` remain empty. No private raw evidence or host configuration was committed, no subject was executed and no inference occurred.

## Prospective run capture

Future fixed offline attempts can retain exact source runs using the [new developer-local producer](BOOKING-OFFLINE-ACCEPTANCE.md#prospective-source-run-capture--october-27). It declares all cases A-family with an explicit no-agent profile, captures case receipt/run intervals, and links only authenticated evidence after cleanup/freshness. Failed, cancelled, timed-out or blocked attempts retain honest unlinked dispositions when source context exists. No public loader, catalog or web execution capability changes. Historical `run:null` records stay unchanged; synthetic producer validation supplies no genuine execution or production registration.
