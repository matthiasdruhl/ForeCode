# ForeCode tournament handoff

Prepared November 1, 2026, America/New_York (November 2 UTC). Owner requested closing the current work and making this handoff quickly. No new paid run was started during closeout.

## Status

**The tournament is not proven working.** The latest standalone B coding diagnostic completed and produced a valid final response, public READY, and **7/8 protected checks passed**. `team-permissions-domain` failed. A's new diagnostic did not start. The two-arm diagnostic stopped after a host wrapper error while reading B's already-produced grade. No full tournament or authenticated comparative report was produced by this diagnostic.

The original failure and candidate remain unchanged. The grade was recovered offline using the real strict validator, with no provider calls, candidate execution, or grading retry. The recovered report is an observation, not a new authenticated tournament report.

## Source and locations

- Review branch: `codex/study13-agent-fixes`, `/private/tmp/forecode-study13-agent-fixes`.
- Validated implementation commit: `e13a63d51e2f77de04b2c7781e67e5eff307abd5`.
- Trusted source closure: `4052ef697d9533b862816a3003beb384046835e006a01e1ad21d2251ae5b1a09`.
- Operator checkout: `/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode`, clean branch `codex/portable-schema-tournament`, commit `9ee4436dd8ce636b49770a88761dd1f2b128adda`. Not modified during closeout.
- Durable handoff root: `/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Coding-Diagnostics-20261102`.
- Durable evidence: `handoff-evidence/` under that root; 370 files, 2,439,446 bytes; copy manifest SHA256 `2b8f88bfb48ba057d8042bcad3a5bc291b94b6ab8b87ddcf00f96a7d9a4655d4`. Copies verified byte-for-byte; originals unchanged.
- Durable implementation archive: `source-e13a63d.tar`, SHA256 `59e73e90614f50e14ad360332ddcfebd0704f32bb37bcb980d6333d195d9a59a`.
- Original diagnostic workspace: `/private/tmp/forecode-coding-diagnostic-20261102`.
- Study16 preservation: `/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-Study16-Final-Handoff-20261102`; manifest SHA256 `518398889d7bbce4cba721e85e7197fce8d6c2c5d3a65a03f62a588606ea4052`.
- Study13 original: `/Users/matthiasdruhl/Projects/Meta-Hackathon/ForeCode-AB-E2E-20261101/RESULTS.txt`. Do not rewrite/reopen it or any closed study.

The source archive precedes this documentation-only closeout commit. Historical tests below validate e13a63d, not a new B implementation.

## Root causes and evidence

1. **Study13 agent behavior and workflow:** A spent its finite allowance inspecting inputs without a source submission. B attempted submissions rejected correctly for TypeScript syntax or missing required interface/export. Both final responses violated the strict response contract. Read-only dependency probes also used an unsuitable bare ESM resolution context. Writer rejection was correct and remains preserved. Workflow guidance, feedback/commit receipts, recovery instructions and public scratch checks were improved; controlled real native CLI scenarios covered successful writes, rejected writes, recovery and public-check use. These controls do not guarantee generated implementation correctness.
2. **Study14 stale package lineage:** runtime provisioning expected an older predecessor than the installed authenticated package. Source-owned predecessor observation now joins actual protected installation identity before mutation. The failed attempt remains closed.
3. **Study15 final-response path:** fractional remaining milliseconds were unsuitable for Node timeout use. Integer timeout handling and final-response guidance were repaired. Short real API canaries passed both old and new histories; they did not prove long-session reliability or treatment benefit.
4. **Study16 deadline mismatch:** guest setup restarted its allowance, so B's advertised deadline exceeded the host cutoff by 25.592 seconds. Two long responses also consumed substantial runtime. The host's absolute deadline now propagates through the actual start command and is validated/clamped before worker/provider startup. Study16 A passed all eight protected checks; B timed out without a committed team implementation. That historical A success is separate from the unstarted new A diagnostic.
5. **Study16 incomplete-report handling:** counting two attempts did not establish complete execution evidence. The registered operator now retains an explicit incomplete handoff before trying to read missing runtime evidence. No fabricated report, grade or authentication is introduced.
6. **Latest B functional defect:** static inspection of captured `src/server/team-benchmark.ts` found its control-character pattern (line 49, used by title validation at lines 72–78) omits U+0000 and Unicode Cf characters. The public baseline `fixtures/booking-v1/src/domain/booking.ts` rejects both Cc and Cf. The task requires baseline title validation. Predicted result: titles `A\u0000B` and `A\u200BB` are accepted and allocate a booking instead of returning INVALID_INPUT. This is a concrete public-contract discrepancy, but it has **not been executed as a targeted reproduction**, and it is **not established as the specific hidden assertion responsible for the protected failure**. No private oracle was inspected. Public readiness checks did not catch this semantic case; earlier validation concentrated too heavily on submission mechanics.
7. **Latest private diagnostic wrapper bug:** `validateGradeReport(JSON.parse(raw), input, p.profile)` supplied the full GradeInput where a strict five-field GradeIdentity was required. Extra `candidate`, `workerImage`, and `evaluationProfile` keys were correctly rejected after grading. Recovery projected only the required identity fields and validated the retained response. Correct the caller in any future wrapper; do not weaken the validator.

## Latest diagnostic evidence

Scope `forecode-coding-diagnostic-7275a939-fa68-49a2-9b8d-0cf8432abc29`; plan SHA256 `78ad7a08a1224034ae145cbe6bf0425391da76fd2e296625951f84424441ae66`.

B run `23be33f5-87e1-4581-809a-8d3a63fef721`: native completed/exit0, elapsed569389ms, 19 admitted and accepted responses, zero rejected responses, accepted final message, public READY. Grade: typecheck, build, baseline-domain, http-integration, team-permissions-http, team-permissions-adversarial and boundary PASS; team-permissions-domain FAIL/exit1.

Evidence filenames below are relative to the durable `handoff-evidence/` directory:

- `summary.json`: original wrapper failure, cleanupConfirmed=true, leaseReleased=true, automaticRetries=0, tournament=NOT_RUN. SHA256 `98aef6114db6ade7ade0e7b70aadf43e0e4b5e91973f1ac7cc0aaa99542c2e62`.
- `B-terminal.json`, `B-sealed.json`, `B-grade-input.json`: actual native termination, sealed source/public result and grading input. Candidate envelope SHA256 `c67c092ba43fb54ce86b646c0b0f303743c031974e175fd3d56c965a293f233a`; evaluated tree SHA256 `fb764c0743a3c13fa70c5bec4dde7175d9c552418bbd0af642fb7ee47840e67c` (different objects).
- `command-321.json`: actual protected grader response, SHA256 `7a7cb9d5252793b325a4e7d0d4bca86bcc9bcae976688f6cde7ca237f409efdd`.
- `B-recovered-grade-report.json`: strict validated recovered observation, SHA256 `568d477e0df102e631755c466865b84a0dba7b06b59a874bf94e38eee212c119`.
- `B-grade-recovery-read-record.json`: recovery provenance, SHA256 `268c1fcaa244f3611467746459fc93db829153d8c74394fc5619c71a3b3460c4`.
- `B-final-cleanup.json`, `B-final-export.json`: cleanup and conservative accounting metadata.
- `continue-A.mts`: **unfinished, unreviewed, never executed draft**. There is no `continuation-A/` or A start record. Do not launch it as-is: verify the strict identity projection, fix remaining original-root cleanup/export save paths, label single-arm success accurately, typecheck, pin exact source and conduct fresh review/admission. The old scope expires at `2026-11-02T04:51:45.673Z`; never extend it retroactively or reuse consumed identities.

## Sandbox alignment

Separate Sol/high technical review examined actual preflight evidence and source. This is shared-authority AI review, not independent human custody. Read `sandbox-alignment-review.txt` and `runtime-contract-review.txt`.

- Diagnostic coding bound600s, identical for both planned arms, with the same19 requests/iterations,32768 max output tokens,1M native token guard and11M conservative token guard. Historic439s studies remain unchanged.
- Host absolute deadline is passed to the guest and clamped; measured guest epoch lay inside the host's306ms request interval. Setup no longer resets coding time.
- Provider read timeout120s is clamped to remaining coding time; heartbeat watchdog15s, host polling approximately1.5s, control-command timeout35s. Terminal grace20s gives no additional coding allowance. Finalization and protected grading have separate bounded control waits (190s and590s).
- Production strict preparation, response, source and grading schemas remain enforced. Run IDs, nonces, request/source hashes, worker image and protected profile identities are joined. The newly found wrapper issue was a caller/schema mismatch, not permission to relax validation.
- Preflight checked actual agent/grader instances, images, stopped state, empty sessions/mounts, resource limits, disabled integrations, deny-all network with only fixed Meta443 access for agent; worker network none and no credentials. Grader scratch absence and profile-inventory helper hash were added before launch.
- Diagnostic agent files were installed only under a fresh isolated `/opt/forecode-coding-diagnostic-7275a939-fa68-49a2-9b8d-0cf8432abc29` scope. Production Study16 policy stayed disabled, SHA256 `301cde74f2c4349bec3f6ac9639c9a3c91dc4f70e2a827a1f4ebc31d673d0c2c`.
- Final recorded cleanup confirms both sandbox roles stopped and lease released. Closeout host process inspection found no ForeCode diagnostic/controller process; the preexisting sbx daemon and llmman service remain. Coordination lease directory is absent. No new guest operations were needed at closeout.

## Tests and commands

Executed in `/private/tmp/forecode-study13-agent-fixes` at e13a63d. Logs copied to durable `handoff-evidence/validation-logs/`.

| Command | Observed result |
| --- | --- |
| `npm run check` | Exit0; lint, strict typechecks,1938 tests in89 files, both builds passed. `forecode-study16-followup-check-resumed.log`. Earlier interrupted log is not a completion. |
| `PLAN_REFERENCE_ROOT=/Users/matthiasdruhl/Projects/Meta-Hackathon/AgentHarness-Planning npm run test:plan` | Exit0;128 passed. `forecode-study16-followup-plan.log`. |
| `npm run test:e2e` | Exit0;82 passed. `forecode-study16-followup-e2e.log`. |
| `python3 -I -B tests/runtime/team-supervisor-unit.py` | Exit0;12 printed controls passed. New deadline controls failed against old source as expected. Corresponding python/before logs retained. |
| `git diff --check` | Exit0 at implementation validation and documentation closeout. |

Four live guest-control callers were updated for the required deadline but were not rerun live at e13a63d. Earlier real CLI controlled write/rejection/recovery and fractional-timeout scenarios passed25 cases, recorded in IMPLEMENTATION-LOG.md. Repository tests do not change B's protected grade.

Actual latest diagnostic launch used the pinned original `host.mts --run` with plan SHA above, Node `--conditions=react-server --import /private/tmp/forecode-study13-agent-fixes/node_modules/tsx/dist/loader.mjs` and `TSX_TSCONFIG_PATH=/private/tmp/forecode-study13-agent-fixes/tsconfig.json`; terminal exit1 is the preserved post-grade wrapper error. The exact wrapper command construction and per-command results are retained in host.mts/execution.log/command-*.json. Do not replay the consumed one-shot scope.

## Authorization and accounting

Owner explicitly removed monetary spending caps for these diagnostics. Do not ask again based on superseded cap discussions. This did not remove isolation, tool approvals, response/source/evaluator validation, identity custody or finite runtime/request/token guards. The40M microUSD protocol field is nonbinding under11M conservative token guard at fixed1/1 accounting tariffs; it is not a claim about Contributor billing. Historical production policies and reservations were not rewritten.

Pre-diagnostic conservative reservations: Scientist1,022,713microUSD; downstream52,364,666; combined53,387,379. Latest B adds7,748,887, giving downstream60,113,553 and combined61,136,266 in that conservative bookkeeping. All19 latest B usage observations exist. Reservations are **not invoices or verified Meta account charges**. Do not describe these totals as actual spend. The owner reported roughly50c of Meta costs during development; no billing reconciliation was performed in this closeout.

## Next steps and blockers

1. Keep current failed B source/results immutable. Reproduce the public Unicode title discrepancy in an approved isolated guest using a fresh seeded subject and counted ID factory. Invalid create must return INVALID_INPUT, allocate zero IDs and leave no booking; a valid same-slot create should then get `team-booking-0001`. Check HTTP400 parity. Never execute captured candidate code on the host.
2. Audit both implementations against all public task requirements, including baseline validation equivalence, before further inference. Improve public contract checks using only public requirements. Do not use private holdout internals or manually repair B and call it model success.
3. Correct and test the diagnostic host's GradeIdentity projection through the real validator. The original wrapper remains historical evidence; the recovered grade already establishes B's outcome.
4. Complete source review and offline tests for any new public-check/workflow changes. Run required repository/browser checks for applicable changes; preserve exact source identity.
5. Only then consider a fresh independent coding diagnostic for B and the still-unmeasured new A path, with fresh prospective identities/admission if the original scope has expired. No concurrent paid studies. A full tournament is **not technically justified yet**: latest B fails protected grading, the identified public discrepancy lacks an executed targeted repro, and the new A diagnostic is unrun. Future model success cannot be guaranteed.

No merge, publication, PR creation or unrelated branch rebase occurred. Remaining blockers are functional correctness, missing targeted reproduction/coverage, unfinished wrapper continuation and unrun A; they are not a monetary cap rejection. This handoff closes the current work at the owner's request without claiming the tournament is fixed.
