# Scoped recorded certificates

Visit `/certificates` from the workspace or recorded verification history. Production is **NOT_PROVISIONED** and defaults to **“No approved recorded certificates available.”** The current developer-reviewed modeled comparison has no linked measured experiment. The original certificate-boundary implementation did not access private historical recordings. A subsequent owner-authorized [onboarding review](RECORDED-EVIDENCE-ONBOARDING.md) reauthenticated four original fixed cases and configured a private local recording preview; certificates remain unavailable because those sources did not emit genuine ExperimentRunV1 records.

This is bounded M8.5.1 assembly/export, necessary M8.4.1 provenance and focused M8.6.1 regression coverage. It does not complete M8.4, M8.5, M8.6 or M8 in full. Provisioning, publication, interpretation, experiments and deployment remain separate work.

## Meaning and integrity

A certificate contains the unchanged frozen `CertificateV1`: IDs of actual source runs, verifications and receipts, an approved historical baseline, explicit generation time, constrained application-authored conclusion and public scope/limitations. It has no added verdict, check, metrics, signature, approval or provenance fields. The surrounding server-rendered view displays each scoped protected-check outcome separately from run completion. A completed run may have REJECTED or INSUFFICIENT_EVIDENCE checks. Required failures retain precedence when another required result is missing; optional passes cannot replace required evidence.

`src/lib/report/certificate.ts` validates exact source/reference sets using `CertificateV1Schema`, `validateCertificateReferences` and its existing relationship validator. It sorts set-like references, intent revisions and limitations without mutating inputs, normalizes the explicit generation time to UTC, and serializes with `canonicalJson`. `artifactSha256` uses `certificateDigest`: SHA-256 of canonical certificate content with **only its own `artifactSha256` field omitted**. Hashing the entire exported file is a different computation. Identical approved inputs and generation time yield identical bytes/digest.

This pure constructor validates and serializes; it cannot authenticate evidence or grant disclosure approval. A self-consistent digest is a byte-integrity identity, not a signature, proof of independent evaluator custody or proof that every referenced check passed. A download is a historical snapshot, not a signed attestation or independently re-verifiable copy of private evidence. Original evidence identities belong to original artifacts; sanitized displayed fields do not recreate those bytes.

## Server boundary

`src/server/artifacts/recording-catalog.ts` remains the sole production composition seam. `loadApprovedCertificates()` currently calls `loadRecordedCertificates({ certificates: [], store: null })`. The empty branch returns before reading store configuration or creating the loader. There is no discovery, upload, arbitrary root/pin input, browser registration, environment configuration framework, runtime testing flag, issuance action or evidence creation.

`src/server/artifacts/recorded-certificates.ts` creates `createProtectedEvaluationStore` on **every** page/API retrieval and reloads exact original bundles and individual evidence bytes against the operator pins. This existing store remains the sole application filesystem exception. No trusted result is cached across requests. Missing, changed, stale or disappeared sources make the affected certificate unavailable, including after an earlier successful page/export. An independently valid certificate can remain available; malformed/duplicate catalog configuration fails closed without exposing diagnostics.

Every evaluation must pass `isTrustedEvaluation` before composition. Plain objects, spread/cloned/serialized trusted objects, hashes, issuer labels, `trusted_evaluator` text, pure certificate success and sanitized recording projections cannot substitute for original authenticated objects. The internal composition helper validates those object identities; serving always uses the loader path to establish fresh custody as well.

Each source needs its genuine, complete frozen `ExperimentRunV1`. A receipt alone cannot produce a certificate, and no empty evidence certificate is manufactured. Relationships must match exactly: run/receipt/verification IDs, evaluated tree, fixture, evaluator and policy, required checks and observed verdict. For this bounded composition, each run's `repoCommit` must equal the separately approved historical `baselineCommit`; its recorded interval must enclose the receipt interval, and generation must follow run/receipt completion. These conservative composition restrictions do not change the frozen definitions. More complex historical baseline/timing relationships need separately reviewed source binding support, not guessed values or relabeled records.

The service deliberately supports **no historical intent/scenario/decision bindings**: `intentRevisions:[]`, `scenarioIds:[]`, `decisionId:null`. It never attaches current browser state, invents a task, pairs A/B labels or creates isolation evidence. A later historical binding feature requires genuine separately approved context and relationship checks. `evidenceOrigin` is explicit; measured certificates require measured genuine runs and cannot use the infrastructure-acceptance category. Authentication alone grants no upgrade. Infrastructure history remains infrastructure history, even if the source run has observed checks.

## Public response and export

The existing frozen read-only `GET /api/demo` returns exactly:

```json
{
  "schemaVersion": "demo.v1",
  "runs": [],
  "certificates": [],
  "mode": "recorded"
}
```

Nonempty arrays contain approved **complete original** run representations and exact frozen certificates. The internal check-detail view is absent from this API. There are no alternate evidence/certificate JSON APIs, POST issuance or server actions. Unsupported methods and query-selected configuration use the existing safe `api-error.v1` envelope. Responses and errors use `Cache-Control:no-store` and `nosniff`; both pages and API are dynamic Node routes with revalidation disabled.

The client export control receives only certificate ID and digest. On each click it retrieves a fresh no-store `/api/demo`, validates `DemoResponseSchema`, requires exactly the displayed ID/digest, and downloads the selected exact canonical `CertificateV1` as `<CERTIFICATE_ID>.json`. It does not reuse displayed success. Missing/changed records or failed retrieval produce an accessible unavailable message and no download. Export makes no inference call, executes no subject and creates no evidence.

Public runs use an explicit allowlist of every frozen field, including an explicit metrics allowlist, with no extra keys accepted. Complete-record disclosure approval is bound by `publicRunSha256 = SHA256(canonicalJson(originalRun))`. **Do not redact, invent or replace a sensitive required field to obtain a publishable run**. If any field is unsafe or the digest approval is absent/stale, leave the report unavailable. A run's null metric remains null and a genuine zero remains zero. Metric/public source approval is separate from protected-check authentication.

The server view uses the existing approved recording projection for every required and observed check, including failures and missing checks. Raw TrustedEvaluation objects, receipts/check bundles, evidencePath, host roots, diagnostics, stdout/stderr, private tests, hidden-case text and credentials never enter HTML, client props, API or download bytes. Conclusions are fixed application text derived from scoped outcome counts; limitations use application text plus separately approved public scope/limitations, never arbitrary private check text. Original run text is publishable only under the complete-record disclosure approval above. All displayed text renders inertly.

## Operator dependency — separate authorization

**Do not perform provisioning as part of this slice.** The next operator needs separate authorization to identify/review genuine original records and prepare a concrete publication review. Approval of local implementation is not approval to access or publish private historical recordings.

After that authorization, use only the code-owned seam and placeholders below; no filesystem search or web configuration is involved:

1. Supply a trusted store configuration with `root:<PROTECTED_ROOT>`, disjoint `agentWorkspaceRoot:<AGENT_ROOT>`, and entries mapping `<EVALUATION_ID>` to `<DIRECTORY_ID>`, exact bundle-byte SHA-256 and the exact source-tree/fixture/evaluator/suite/policy/required-check identity pins. Preserve all existing custody/path/size/tamper safeguards.
2. Supply one `CertificateRegistration` per approved certificate (maximum 20). `approval` has exactly `id`, `title`, `scope`, `baselineCommit`, `generatedAt`, `evidenceOrigin` and `limitations`. Baseline/time must come from approved historical source identity, never current HEAD or export time. Public scope and limitations must be reviewed independently of private artifact prose. There is room for at most 32 approved limitations plus the fixed application limitations.
3. Supply `sources` (1–40 each) with exactly `recording` and `publicRunSha256`. `recording` uses existing `RecordingRegistration` fields: exact `RecordingMetadataSchema` plus the genuine source `run`. Its metadata includes `id`, `evaluationId`, `runId`, `receiptId`, `verificationId`, `title`, `scope`, `category`, complete `checks` approvals, selected `publicIdentities`, `publicMetrics` and public `limitations`. See [recorded verification](RECORDED-VERIFICATION.md). All source IDs within a certificate must be unique; duplicated/missing/extraneous references are rejected. Store load IDs are code-owned, never request supplied.
4. Approve every field of each complete original run, including IDs, variant, status, commits/hashes, isolation ID if actually present, seed, timestamps, metrics, evidence origin, presentation and limitations. Pin its canonical digest as `<PUBLIC_RUN_SHA256>`. A digest records the exact reviewed content; the string itself is not authorization. If the original run does not exist or cannot be fully disclosed, keep the certificate unavailable. The demo response holds at most 40 distinct genuine runs overall.
5. Review the concrete server-rendered page, exact demo response and exact downloaded certificate for disclosure and claim accuracy. Retain rejected/insufficient outcomes. Registration/publication requires its own explicit approval and a code review of the catalog change. Neither local implementation nor a passing synthetic test grants this approval.

Production currently has **no approved source runs, certificate registrations, public disclosure approvals or protected store configuration** for certificates. Those are NOT_PROVISIONED inputs, not unfinished implementation. Do not open private Workstream A output to fill them automatically.

Scoped protected checks do not establish experiment fairness, measured architecture benefit, Meta incremental advantage or root-capable-agent/sandbox containment. Each requires separate appropriate evidence. The current modeled worksheet has no linked measured experiment. Historical fixed no-inference Webpack acceptance was not a matched architecture study or a coding-agent/Meta-benefit experiment. The consumed live propose approval remains consumed; live hypothesis/challenge remain NOT_RUN.

## Focused verification

Fresh synthetic temporary bundles/evidence use the actual protected store in `tests/support/recorded-certificates.ts` and `tests/unit/recorded-certificates.test.ts`. Coverage includes authenticity loss, pure-vs-authenticated construction, outcome precedence, missing runs, full-run approval, identity/timing/baseline/context mismatches, duplicate/missing/extraneous references, tamper/stale pins/disappearance after success, exact shapes/self-hash, null/zero, deterministic ordering, immutability and private sentinels. Existing custody and web-execution guards remain enabled.

`tests/e2e/recorded-certificates.spec.ts` covers navigation, default/provider-disabled operation, keyboard and 1440/768/390 widths, synthetic populated outcomes, and the actual client export control. Component-only synthetic setup and response mocks stay outside production source. Its test bundle uses the esbuild already installed through the existing tsx toolchain; no dependency or launcher change was needed. Synthetic credentials and external-fetch denial remain unchanged. Synthetic success is never real protected historical evidence. Exact commands and observed outcomes are in IMPLEMENTATION-LOG.

## Owner-authorized source review follow-up

The [historical onboarding report](RECORDED-EVIDENCE-ONBOARDING.md) now records actual read-only authentication and a populated private production preview. The four fixed cases retain VERIFIED/VERIFIED/REJECTED/REJECTED, with run completion/metrics unknown. No original ExperimentRunV1 was emitted in that reviewed source set, so no certificate or run was fabricated and `/api/demo` stays empty. The public/default catalog, frozen contracts and existing loader are unchanged. Source inspection permission is no longer the blocker for this reviewed set; genuine run records are the concrete missing certificate dependency.

## Prospective fixed-acceptance producer

The [new offline producer](BOOKING-OFFLINE-ACCEPTANCE.md#prospective-source-run-capture--october-27) can supply exact original `experiment-run.json` records from future fixed no-inference attempts. Source context is declared before grading; each receipt uses its own grading interval and each run encloses that receipt. All four cases are A-family, `agent:none`, `evidenceOrigin:none`, recorded, with null isolation/seed and unobserved metrics. Completed runs may retain rejected or insufficient checks. A failed/unlinked record cannot replace the genuine linked source required here.

Synthetic tests now exercise producer → canonical protected original → actual authenticated evaluation store → `loadRecordedCertificates` → exact frozen demo/canonical certificate export, including rejected and insufficient results. The existing certificate service, complete-run disclosure approval, source relationships, freshness reload, public contracts and empty production catalog remain unchanged. Operators must review/pin the exact original run bytes and separately approve every complete public field before using the code-owned composition seam. There is no new application filesystem reader or automatic registration. The four historical sources still have no runs/certificates; actual future execution and new provisioning remain NOT_RUN/NOT_PROVISIONED.

## Developer-local prospective review

The [offline evidence review tool](OFFLINE-EVIDENCE-REVIEW.md) replaces manual assembly of newly captured fixed source inputs for private review. Default inspection never invokes certificate composition or invents approval. Explicit supplied disclosure must bind every complete original run and approved metadata; the unchanged consumer then reloads protected evidence, validates references/timing and emits only a private exact demo/certificate candidate. Partial/unlinked suites cannot select just successful sources. No catalog registration, public filesystem reader, consumer relaxation or publication is added. Production remains empty/NOT_PROVISIONED; historical missing run records remain missing.

## October 28 UTC — Genuine private certificate candidate

After explicit complete-run/public-metadata approval for private validation, the actual prospective intake loaded the new genuine four-case source set through the unchanged protected store and certificate service. It emitted one canonical private certificate and four exact frozen runs in a private demo candidate. Its conclusion retains2 VERIFIED,2 REJECTED and0 INSUFFICIENT_EVIDENCE. All five metrics remain null; no B arm, intent/scenario/decision, seed, attestation or benefit is invented.

Independent validation checked strict frozen shapes, exact references, unchanged source runs, times, protected authenticity, export bytes and self-digest semantics, then obtained identical bytes on fresh recomposition. The [private intake guide](OFFLINE-EVIDENCE-REVIEW.md#october-28-utc--approved-private-candidate-validation) records this later observation. This changes the prospective private candidate availability only: production remains empty/NOT_PROVISIONED, and the historical preview still has run:null with unavailable historical certificates. No populated product/API/download was served or published by this step.

The owner approval was private-candidate validation, not registration/publication authority. A later concrete code-owned catalog/product-serving review needs its own explicit approval, with raw evidence/configuration/full private reports excluded and all losing/insufficient outcomes retained. No runtime operation or old-source review renewal is needed merely to inspect these originals.

## October 28 — Concrete private product review

The [recorded-product review](RECORDED-PRODUCT-REVIEW.md) now exercises the new genuine four-run/twenty-check source set through actual private production pages, frozen API and browser certificate download. All four completed runs and both expected rejected outcomes remain visible; metrics stay Unknown. A concrete private code-owned catalog patch and review package are ready, with fresh source authentication and independent synthetic tamper/disappearance controls. The main/default catalog remains empty/NOT_PROVISIONED; no public registration, hosting or source transfer was performed. Historical preview records remain unchanged.
