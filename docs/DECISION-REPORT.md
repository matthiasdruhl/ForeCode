# Evidence-backed Decision Reports

The supplementary Decision Report engine makes a scoped engineering recommendation from an existing approved tournament publication. It changes none of the 49 frozen contracts, evaluator verdicts, execution permissions or publication rules. It performs no model requests or candidate execution.

`src/lib/report/decision-report.ts` exports `assessDecisionReport(unknown)`, a pure, deterministic, bounded analysis. Its output is deeply frozen and explicitly marked `UNAUTHENTICATED_ANALYSIS`. Parsing and the canonical projection digest establish structure and byte identity, not authentic evidence. Do not present the pure function's output as a production verification or publication approval.

`src/server/artifacts/decision-reports.ts` exports `loadDecisionReports(config, now)`. It calls the existing `loadTournamentRecordings` on every invocation, requiring fresh signed disclosure, current revocations and matching original protected baselines and future receipts. Only that composition can return `EVIDENCE_SUPPORTED`. There is no report upload, new receipt verifier, filesystem access, execution endpoint, cache or client-supplied authority flag. Treat a serialized report as a historical view; reload before making a current authority claim.

`loadApprovedDecisionReports()` in the source-owned recording catalog is the production seam. It currently returns an empty catalog because public tournament records have not been provisioned. Future integration must provision the separately approved original publication and evaluation allowlists through the existing loader. Never provision from request bodies or an arbitrary parsed report.

| Evidence                                                                                                  | Recommendation                                                 |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Comparable, valid starting baselines, completed arms, A verified and B rejected                           | KEEP for this task                                             |
| Same conditions, B verified and A rejected                                                                | REFACTOR for this task, subject to adoption review             |
| Both verified                                                                                             | Correctness tie; INCONCLUSIVE in the current production format |
| Both rejected                                                                                             | INCONCLUSIVE; review the failed check identifiers              |
| Insufficient outcomes, incomplete execution, invalid baselines, blockers, deviations or non-comparability | INCONCLUSIVE                                                   |
| Missing, expired, revoked, altered or mismatched originals                                                | Unavailable catalog; no recommendation                         |

The report retains exact available source, study, model, evaluation, receipt and run identities; eight check statuses; preparation/downstream/total metrics; changed-file counts; and attempt histories. Total metrics use the existing `preparationInclusiveMetrics` semantics. Unknown is never zero, reservations are not charges, and touched-file phase counts are never added. Approved public task text and limitations may be included; candidate paths, protected assertions, native logs and provider payloads are excluded. Hypotheses and the modeled minimax-regret worksheet do not determine recommendations.

The current publication contract has **no authenticated predeclared effort criterion**. Complete telemetry therefore does not break correctness ties. The pure function's optional second argument supports explicitly labeled offline criterion assumptions for deterministic analysis and tests, bound to the supplied protocol digest. It cannot establish preregistration or measurement comparability. The production composer never accepts or supplies this argument. Promoting an effort preference would first require a reviewed way to project a genuinely prospective criterion from existing authenticated protocol custody; a post-result disclosure or boolean assertion is insufficient. This feature does not create that authority or alter any study.

All new tests use synthetic signed records and synthetic keys in disposable test-owned directories. They establish software behavior, not real agent success or an architectural finding. No frontend is changed. Subsequent work is to provision a separately approved real publication and then render the existing server-composed report read-only.
