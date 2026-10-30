# Approved evidence intake — next ML slice

Branch: codex/ml-approved-evidence-intake, stacked on ML-Q0 commit 0138b53 / PR #27. Worktree remains /private/tmp/forecode-meta-rl-20261030, outside tracked parents. At the October 30 follow-up audit, fetched main was still 54e72b2, the measured-report exporter remained on unmerged tournament branches, and both PR #27 CI checks had passed. No core branch was merged or copied. No eligible authentic paired observation became available to this workstream.

This slice implements a private draft exporter, approved-original artifact source, append-only admission audit and local CLI. It does not configure a production catalog, create an approval, run a tournament, train a policy or grant release authority.

## Draft and approved export are separate stages

draftLearningExport in scripts/learning/export.ts accepts a narrow read-only core adapter and validates original source/roadmap context, pre-selection feature chronology and the reviewed KEEP/A versus BOUNDARY-or-ADAPTER/B mapping. Tests implement the bridge with the actual process-local authenticated PreparedStudy predicate and main's actual buildTournamentReport; the core owner must separately review the production composition. Output contains safe identities, source digests, scoped verdicts and complete preparation/downstream attempt statuses. Private proposal text, instructions, paths, check names/bodies, diagnostics and arbitrary limitations are excluded.

Main's report still emits BLOCKED or NOT_COMPARABLE. The draft preserves that as BLOCKED or INVALID, fixes trainingEligible=false and keeps all resource charges null because main's run telemetry cannot authenticate actual charges. It retains failed, cancelled, unplanned and unmapped C attempts. An unmapped strategy is null, never an invented label. The draft schema cannot express COMPARABLE or training eligibility and is rejected by the approved packet schema.

The future core owner must create a separately reviewed approved-learning-export.local.v1 packet from genuinely authenticated comparable evidence. Its strict fields are sourceReportSha256 and the existing approved-learning-projection.v1. This adapter contract is an implementation boundary, not proof that an approved core exporter exists. Review actual runtime/source/task/intent/attempt custody, fair matched conditions, data rights, complete preparation costs and disclosure before signing. A source-report hash alone authenticates nothing.

## Approved artifact source

createApprovedEvidenceSource in scripts/learning/source.ts receives TRUSTED operator composition:

- A canonical operator-owned 0700 original-export directory, disjoint from the repository and explicitly inventoried workspaces/protected roots.
- An allowlist of exact opaque IDs, single-component filenames, original-byte SHA-256, canonical packet/projection hashes, study/origin pins and four distinct custodian record IDs.
- Existing createStudyCustodyStore and createProtectedEvaluationStore load capabilities. There is no key generation, signing, private-data discovery or model-generated configuration.

Each load freshly reads bounded non-symlink/non-hardlinked original bytes and verifies all pins. It then requires the independently held protocol, a decision commitment held by decision time, the outcome projection approval and the complete packet approval. The decision commitment is constructible before outcomes: it binds exact context/features/action eligibility, decision time, selector, selected strategy and model/consent provenance. A signed retrospective projection cannot substitute for that original. All records use the existing custodian loader's original-byte/key/revocation checks; disclosure-kind records are linked to the exact protocol original.

The source delegates receipt authentication, oracle/fixture consistency, present-day correctness and outcome chronology to existing ML-Q0 intake plus the protected evaluator store. Duplicate/foreign regression labels now fail validation. Successful source results are deeply frozen, branded in-process, bound to their source ID and assessment time, and cannot be manufactured by copying an admitted observation into a new packet.

AUTHENTIC is the default source mode. Synthetic test composition must opt into SYNTHETIC in code; the CLI cannot enable it. Original bytes, signatures, absent approvals, stale source, revoked records, late decisions, invalid schemas and changed check artifacts fail with fixed safe reasons. No private diagnostics escape.

## Admission audit and freshness

openEvidenceLedger in scripts/learning/ledger.ts uses a separate private directory, excluded from originals and workspaces. Entries contain identity references and safe eligibility/failure counts, never source or grader bodies. ADMITTED means the evidence crossed admission; a BLOCKED/INVALID observation still has zero usable rewards and reason REWARD_INELIGIBLE.

Every entry links the previous hash and a monotonically numbered exclusive file. Reopen requires the exact independently retained head (sequence plus hash); no mutable local HEAD is trusted. This detects alteration, unexpected additions and suffix deletion relative to that anchor. Retain each returned head independently before considering an admission durable. Hash chains alone cannot detect truncation if the operator loses the last independent anchor.

The writer validates the full prior chain before appending, uses an exclusive lock and never overwrites entries. A stale writer, pre-existing lock, changed lock identity, backdated audit or unanchored suffix fails closed. Recovery after an interrupted write or stale lock requires operator inspection; there is no automatic deletion, reset, lock stealing or repair. File fsync is used but no filesystem/remote durability or hostile-admin tamper-proof claim is made.

Repeat source loads receive fresh custody/evaluation checks. Repeated observations are recorded as REPLAY with zero new rewards. Rejections/blocks remain append-only; revocation adds a subsequent rejected record while preserving the earlier failed outcome. Serialized audit entries are not admitted observations and cannot train the learner. Future snapshot creation must freshly load approved originals; the ledger is an audit, not an alternative reward authority.

## Local commands

Using Node 24 from this worktree:

| Command suffix after node --conditions=react-server --import tsx scripts/learning/cli.ts | Current exit | Behavior                                                                      |
| ---------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| --help                                                                                   | 0            | Shows bounded supported operations                                            |
| --status                                                                                 | 2            | Reports source/ledger unconfigured, zero entries, training/execution disabled |
| --inspect missing-unit                                                                   | 2            | SOURCE_NOT_CONFIGURED, no artifact read                                       |
| --admit missing-unit                                                                     | 2            | AUDIT_LEDGER_NOT_CONFIGURED, no write                                         |
| --train                                                                                  | 1            | Rejected unsupported capability                                               |

The CLI accepts allowlisted IDs only. It accepts no roots, paths, keys, uploads, origin override, signing, training, provider or execution flags. Trusted operator composition is intentionally unprovisioned. With separately reviewed composition, inspection is read-only and admission appends an audit entry; neither updates policy parameters. Synthetic integration tests inject test-owned composition and remain explicitly labeled.

## Validation and remaining gate

Tests use main's actual authenticated preparation/report interfaces and original protected evaluation/custody loaders with synthetic keys/records. They cover redaction, blocked drafts, full negative attempt retention, opaque path pinning, forgery, signatures, chronology, tampered receipts, expired/revoked records, synthetic isolation, audit replay/corruption/truncation, stale writers/locks, private roots and safe CLI denial. These are implementation checks, not independent operational approval or real training.

The existing capability test remains unchanged. Learning code imports no preparation/report/runner/grader implementation; the read-only core bridge is injected by separately reviewed composition, as with the existing evidence loaders. Hosted source/routes, protected runtime/evaluator, baseline fixture, 49 frozen contracts and dependency locks are unchanged.

Next: core owner reviews the approved projection/decision/packet contract and wires an authenticated measured-report exporter after that interface lands. Then independently provision exact original records, source pins and audit head, and perform one authentic admission/reload. Until those gates pass, the source stays unprovisioned and no real reward or architecture-improvement result is claimed.

Observed checks: npm run check exits 0 with 924 tests/55 files, lint, both TypeScript checks and both builds. The five focused export/source/ledger/CLI/boundary suites pass 45 tests (43 new); app E2E passes 54 tests with provider networking denied; external read-only contract parity passes 128 tests. Formatting and whitespace checks pass. IMPLEMENTATION-LOG.md records setup failures, fixes and exact command outcomes.
