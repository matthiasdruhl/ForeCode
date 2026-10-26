# Implementation log

## Foundation slice — October 26, 2026

Scope: M1.1.1 Next foundation; M1.2.1 module boundary; M1.4.1 credential-free checks; M1.5.1 configuration/errors; initial **partial** M1.3.1 intent/provider/error contracts and explicit intent lifecycle. M0.5 reference/provenance recorded. No completed milestone is inferred from these scopes alone.

Coordination: user reports a separate agent finalizing sandbox configuration. This work did not inspect, modify or launch that sandbox. Real experiment execution remains unavailable.

### Evidence

| ID      | Command / observation                                   | Observed result                                                                       |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| FND-001 | GitHub repository metadata for `matthiasdruhl/ForeCode` | Public; empty repository; not archived                                                |
| FND-002 | `npm install --ignore-scripts`                          | Exit 0; 376 packages installed; npm audit reported 0 vulnerabilities at install time  |
| FND-003 | Initial `npm run check`                                 | Exit 1; Next navigation lint rule required `next/link`; corrected before final checks |

| FND-004 | External planning `npm install --ignore-scripts --package-lock=false && npm test` | Exit 0; 111 structural/semantic/hash fixtures passed. External validator only; no files copied. Temporary dependency directory removed and planning working tree verified clean. Its dependency audit reported one moderate issue; no dependency repair was attempted in the reference repository. |
| FND-005 | Second `npm run check` | Exit 1 after lint/typecheck/50 unit tests passed; CSS import could not be resolved. Removed the unnecessary import and reran the suite. |
| FND-006 | `npm run check` after fixes | Exit 0; lint, strict typecheck, 50 unit tests and production build passed. |
| FND-007 | First `npm run test:e2e` | Exit 1; environment denied loopback bind. Retried with permission to bind loopback only. |
| FND-008 | First permitted E2E run | Exit 1; 2 lifecycle checks passed; 2 validation assertions ambiguously matched Next's route announcer. Narrowed the assertion to the actual input-error element. |
| FND-009 | `npm run test:e2e` after correction | Exit 0; 4 browser checks passed. |
| FND-010 | Responsive `npm run test:e2e` | Exit 0; 6 browser checks passed, including confirm/revise/export/revoke, safe rendering, local privacy and overflow checks at 1440/768/390 pixels. Screenshots under ignored `test-results/` visually reviewed. |
| FND-011 | `npm ci --ignore-scripts` | Exit 0; 368 packages installed, audit reported 0 vulnerabilities. npm emitted peer-range warnings from Next's transitive ESLint plugins with ESLint 10; lint executes successfully. |

| FND-012 | Final `npm run format && npm run check` after clean install | Exit 0; route type generation, strict typecheck, lint, 50 unit tests and production build passed. |
| FND-013 | `git diff --check` | Exit 0. |
| FND-014 | Staged-file exclusions and exact local credential-value scan | Exit 0; 40 files checked; `.env.local`, generated dependencies/builds and screenshots excluded; no matching configured key found. No credential values printed. |

Local production preview: `npm run start -- --port 3005` at http://127.0.0.1:3005. Port 3000 was already occupied; that process was left untouched. This is a local preview, not deployment.

Scope demonstrated by these checks: foundation behavior only. No provider access, eligible Meta response, isolated execution, heldout custody or evaluator attestation is implied. Full M1.3.1 remains incomplete.

### Open gates / next work

1. Complete M1.3.1 by freshly implementing the remaining frozen contract definitions and full structural/cross-record parity. This foundation's validators are not the full catalog.
2. Implement fresh booking-v1 fixture and separately protected evaluator with frozen check policy and receipt freshness/forgery tests (M2/M3). Keep evaluator custody outside the agent-writable task workspace.
3. Receive and review the other agent's sandbox report before any bounded real agent task; the web process must remain separate.
4. Confirm actual Meta API protocol/model access, provider hard budget limits and credits, then implement bounded consented server-only transport and hypothesis/challenge operations (M0.2/M6). Keys in the environment alone are insufficient.
5. Owner confirms approved contributors, selected track/theme and licensing before release. No code push or deployment was performed here.

No measured architecture outcomes, model responses, protected receipts or certificates have been produced by this slice.

## Contracts + booking evaluation slice — October 26, 2026

Base commit: `60dfa8d18f8efb2370d535707264861d22b67a14`. Scope: complete frozen definition coverage and published conformance checks (M1.3); implement baseline A and visible smoke test (M2.1/BK01–BK07); independent baseline domain/HTTP oracles, source preparation and receipt assembly (M2.2/BK08 building blocks); verdict normalization and protected loader/tamper tests (M3.1/M3.7). Physical custody, isolated grading and real runner evidence remain unvalidated. No hidden future holdout was authored.

Planning references consulted: original frozen schema/API registry, contract semantics, canonical implementation/ownership notes, system/security/evaluation plans, booking baseline/architecture/acceptance/build/protocol documents, and the later Muse integration overlay at `f41ea9640e99d9f32548492add44a2a55333d1b8`. The schema pin remains `695e68a40b5f5009c9b06b83a1181e18cd6d0223`. All implementation and app-specific tests were freshly authored; reference data is read only in memory from that exact Git object.

### Observed checks and corrections

| Evidence | Command or check                                                                                              | Actual result                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SL2-001  | Early `npm run typecheck && npm test`                                                                         | Exit 0; existing foundation plus first boundary update passed.                                                                                                                                                      |
| SL2-002  | First lint pass                                                                                               | Exit 1 for Next's reserved `module` variable rule; renamed the local variable. Later lint passes.                                                                                                                   |
| SL2-003  | Initial external conformance attempts                                                                         | Exit 1 first because planning HEAD advanced, then for a missing GraphEdge helper example. Switched to immutable `git show` reads and authored the missing helper sample.                                            |
| SL2-004  | Initial semantic conformance                                                                                  | Exit 1: an overly strict dependency foreign-key assumption and an incorrectly projected test context. Corrected against the frozen examples; later all 128 checks pass.                                             |
| SL2-005  | `npm run check`                                                                                               | Repeated exit 0 as implementation expanded; both app production builds, typechecks and local tests passed. Final count recorded below.                                                                              |
| SL2-006  | `npm run test:e2e`                                                                                            | Exit 0; all six original desktop/mobile/width/privacy/lifecycle checks passed.                                                                                                                                      |
| SL2-007  | First `npm run test:fixture-e2e`                                                                              | Exit 1; valid session startup failed the origin comparison through Next's request adapter. Bound the origin to explicit server-only loopback configuration and added a focused HTTP regression.                     |
| SL2-008  | Corrected `npm run test:fixture-e2e`                                                                          | Exit 0; two desktop/mobile flows passed: anonymous header denial, session, own-only listing, other-owner 404, create, conflict, cancel and freed-slot reuse. Screenshots visually reviewed.                         |
| SL2-009  | First task-export CLI                                                                                         | Exit 1 before execution because the tsx CLI attempted a forbidden IPC listener. Replaced it with Node's `--import tsx` loader; no additional privilege or IPC listener is needed by preparation.                    |
| SL2-010  | `npm run prepare:booking -- --output /private/tmp/forecode-booking-standalone-20261026-slice2`                | Exit 0; 22 files, source hash `e49687620469faad10637bac404b2f9a1c4973a12a55b2740eb7d904da5988d1`; no controller, evaluator, private environment or generated cache copied. Execution status remains NOT_RUN.        |
| SL2-011  | In that new standalone directory: `npm ci --ignore-scripts && npm test && npm run typecheck && npm run build` | Exit 0; standalone visible smoke test passed; typecheck/production build succeeded; audit reported zero vulnerabilities. Only freshly authored reviewed baseline code was exercised, with no agent-modified source. |
| SL2-012  | Post-build source/export manifest comparison                                                                  | Exit 0; original and standalone source hashes remain identical at `e49687620469faad10637bac404b2f9a1c4973a12a55b2740eb7d904da5988d1`.                                                                               |
| SL2-013  | Clean root `npm ci --ignore-scripts`                                                                          | Exit 0; 377 packages installed, 379 audited; zero vulnerabilities reported. Existing Next transitive ESLint peer-range warnings remain; lint runs successfully.                                                     |
| SL2-014  | `npm run snapshot:booking --silent`                                                                           | Exit 0; source/evaluator/suite/policy commitments recorded in `reports/prepared/booking-v1-source-freeze.json`; evidenceOrigin=none and executionStatus=NOT_RUN. No task code is imported or executed.              |

The 13 domain and five HTTP oracle cases run independently of the agent-visible smoke test. An intentionally broken owner check is rejected in a negative-control unit test. Protected-store tests use temporary synthetic artifacts only and cover missing required checks, trusted failure precedence, stale source/suite/policy pins, changed evidence, forged hashes, duplicate/cross-run records, symlinks, root overlap and serialized authenticity loss. These are development tests, not a real protected run or microVM attestation.

Current source commitment: [booking source freeze](../reports/prepared/booking-v1-source-freeze.json). Local fixture preview: http://127.0.0.1:3006. Existing Forecode preview remains http://127.0.0.1:3005. No sandbox configuration, real model inference, agent experiment, public deployment or remote push was performed.

### Final validation

`npm run format && npm run check && PLAN_REFERENCE_ROOT=../AgentHarness-Planning npm run test:plan && git diff --check` exited 0 after the clean workspace install. Final counts: **105 local tests**, **128 external conformance checks**, both production builds/typechecks/lint passing. The six Forecode browser checks and two booking browser checks passed; standalone export installation, visible smoke, typecheck and build passed independently. The booking preview was opened and its actual initial UI verified at port 3006.

CI now includes those two browser suites, external reference-object conformance and a fresh standalone export/install/test/typecheck/build. CI is configured but no remote CI run or push is claimed by this local log.

Before commit, the staged credential-value/generated-file exclusion scan passed for all 67 changed files (exit 0), and `git diff --cached --check` exited 0. Private environment files, dependencies, build outputs and browser artifacts remain ignored.

### Next ready work

1. Review the separate sandbox report, then build the local controller/guest bridge with pinned toolchain/checks, cancellation and offline grading of the exact final candidate. Do not grade the untouched host baseline by mistake.
2. Confirm provider access, credits and hard local/provider limits; implement consented bounded Meta transport, proposal/hypothesis/challenge paths and their contextual validation. Model calls remain disabled here.
3. Add graph extraction with explicit v1 dynamic-route filename limitations, deterministic scoring/orchestration, and trusted sanitized recording display. No source commitment may be presented as measured run evidence.
