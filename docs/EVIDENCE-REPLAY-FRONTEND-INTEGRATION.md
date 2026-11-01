# Agent C: Tournament Replay integration

This is a pure server-side projection of existing public data. Agent C owns all visual and interactive implementation. This branch imports no React/browser/state code and adds no routes. It depends only on merged main source `03f5deb2521facb58c26fd3fcf4bc6199bd8b210`, not Agents A–D's branches.

## Public API

Import functions and types from `@/lib/replay`:

- `buildTournamentReplay(study: PublicTournament): TournamentReplay`
- `projectTournamentReplayCatalog(catalog: ReplayCatalogInput): TournamentReplayCatalog`
- `matchesReplayEvidence(study, reference): boolean` (optional identity diagnostic, not authentication)
- `replayStages`, `ReplayEvent`, `ReplayAvailability`, `ReplayEvidenceReference`, `ReplayChronology`, `ReplayTiming`, and the remaining readonly DTO types.

DTOs are detached and recursively frozen. `schemaVersion` is `tournament-replay.v1`. The pure assembler always reports `UNAUTHENTICATED_PROJECTION`: approved origin is the trusted server caller's responsibility. Never use browser JSON or a request-supplied provenance flag as approved production input.

## Exact trusted composition example

This documentation example belongs in Agent C's existing server composition, not in a browser or a new replay endpoint. Both approved loading functions already exist on main and use the same source-owned publication reader. Their authentication repeats on every read.

```ts
import {
  buildTournamentReplay,
  projectTournamentReplayCatalog,
} from "@/lib/replay";
import {
  loadApprovedTournamentRecordings,
  loadApprovedDecisionReports,
} from "@/server/artifacts/recording-catalog";

// The existing trusted loader is the sole source of an approved study.
const catalog = await loadApprovedTournamentRecordings();
const replayCatalog = projectTournamentReplayCatalog(catalog);

// Empty/unavailable: render replayCatalog.stages, no invented events or lanes.
// Available: replayCatalog.replays contains read-only data for each loaded study.
const study = catalog.state === "available" ? catalog.studies[0] : undefined;
if (study) {
  const replay = buildTournamentReplay(study); // Or reuse replayCatalog.replays[0].
  const reports = await loadApprovedDecisionReports();
  const report =
    reports.state === "available"
      ? reports.reports.find(
          (entry) =>
            entry.analysis.identity?.studyId === replay.studyId &&
            entry.analysis.evidenceReferences?.projectionSha256 ===
              replay.projectionSha256,
        )
      : undefined;
  // Send replay and the matching existing report DTO via the current server
  // boundary. If report is undefined, show decision evidence unavailable.
  // Do not calculate KEEP/REFACTOR from replay metrics or evaluator verdicts.
}
```

The two reads are independently fresh, not an atomic transaction. Exact digest matching rejects a changed study between reads; absent/revoked evidence is not repaired by a stale cached report. Preserve unavailable counts, handle `ReplayInputError` with an unavailable presentation, and do not reuse a prior study after a failed fresh load. Replay has no loader or revocation cache of its own. Authentication freshness is established at read time; continuing freshness requires another trusted read, never an inference from stored DTOs.

## Five-stage view and filters

`stages` contains ordered stage/event-ID membership, and `events` contains the complete event list. Groups are hypothesis, preparation, coding, verification, decision. `data.kind` is the discriminant; labels/descriptions are fixed explanatory text. Do not interpret event array order as elapsed time.

Use `variant === "A"` or `"B"` for lane filtering, but retain the shared `variant === null` events. They include hypothesis, **unassigned preparation attempts**, source comparison and decision context. Do not silently place every preparation attempt in B. Architecture context events distinguish A original and B prepared alternative without inventing an A preparation run. Arm outcomes summarize the same coding attempts; count only `coding_attempt` data when showing attempt counts.

`arms` retains exact original/public run, source, receipt, check and metric fields. Preparation/downstream/total stay separate. Null means Unknown; zero means zero. Reserved micro-USD is a ceiling, not measured charge. Do not sum phase file-touch counts or use metrics as a winner score.

There is no compact summary API. A condensed view must keep all failure/cancellation/timeout/blocker/deviation/limitation details inspectable, with the full event history still available. `missing` points to the affected event/arm when known.

## Timing and playback

- `basis: projection_observation` means an observation recorded in the supplied public projection, conditional on the loader's established lineage.
- `basis: approved_metadata_context` means explanatory metadata, not a separately observed runtime action.
- `basis: unavailable_stage` means missing/invalid evidence.
- `timing` preserves raw `startedAt`/`endedAt` and states `recorded_interval`, `partial_interval`, `unknown`, or `inconsistent`.
- `chronology.tracks` lists comparable boundaries **within one interval only**. Equal boundaries remain start then end. Inconsistent intervals have no playable observations; inspect their raw timestamps and issues instead.
- `commonClock: not_established` prohibits inferring concurrency or actual cross-attempt order. `declaredOrder` is metadata only. No global temporal position exists for untimed stages.

The current contract does not establish a fully replayable execution trace. Prefer a static/selectable five-stage Change Trace and Tournament view. A user may select a genuinely recorded step; no autoplay, interpolated progress, simulated running agents, fabricated streaming messages, synthetic source edits, timestamps or inferred durations. Do not place untimed checks/receipt/decision nodes at invented clock positions. Failures remain visible even when a later attempt completed.

## Availability rendering

| Value                                         | Suggested meaning                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `observed_in_projection`                      | Recorded observation (only describe it as approved when loaded through the trusted server reader). |
| `metadata_only`                               | Published context, not an execution event.                                                         |
| `not_run`                                     | Explicit published unrun state.                                                                    |
| `failed`, `blocked`, `cancelled`, `timed_out` | Preserve the exact attempt/arm state. These do not replace evaluator verdicts.                     |
| `unknown`                                     | Detail not evidenced; check `data.status` and missing markers.                                     |
| `publication_unavailable`                     | Approved publication cannot currently be loaded.                                                   |

With no receipt, check `not_run` values are placeholders: replay availability is `unknown`, not independently confirmed unrun checks. An invalid check remains invalid, never a green success. Both verified means a correctness tie; both rejected and incomparable studies preserve their original classifications. Replay has no recommendation field; render the separately loaded matching report when available.

For `empty`, show five static explanation stages with “No approved public study / not provisioned,” not a claim that private experiments never ran. For `unavailable`, explain that publication could not be loaded. In both cases there are zero replay events; do not substitute synthetic fixtures.

## Evidence inspection and navigation

References use structured selectors rather than URLs. They contain only current study/arm/run/receipt/tree/check identities and optional approved comparison path/hashes. `selector.kind` tells an inspector which public collection to inspect. Baseline receipt references intentionally have no run ID: baseline evaluator run identity is absent from the public projection. Prior attempts never inherit the final run's receipt/tree.

Resolve evidence navigation in Agent C's existing route/anchor map. Only generate a link if an extant Evidence Laboratory or Decision Report destination matches the study and exact published identities. Do not invent a raw receipt download URL, private artifact location or certificate. An absent destination stays an inspectable ID without a link. The replay library neither defines nor changes routes.

A source comparison is an arm-unassigned path/hash list, not a complete Before/Prepared/After graph or reconstructable diff. Show exact tree digests and approved file hashes. Do not claim edit propagation, module edges or missing snapshot content. A proposed architecture is not proof of an authenticated prepared tree.

## Synthetic example, never production fallback

A synthetic test-only excerpt has this structure:

```ts
{
  schemaVersion: "tournament-replay.v1",
  provenance: "UNAUTHENTICATED_PROJECTION",
  recordingAvailability: "supplied_projection",
  studyId: "synthetic-replay-study",
  correctness: "BOTH_VERIFIED", // Test metadata, not an experiment outcome.
  chronology: { commonClock: "not_established", globalOrder: "conceptual_stages_only", tracks: [] },
  decisionReference: { state: "not_supplied", studyId: "synthetic-replay-study", projectionSha256: "<test projection digest>" },
  // Other typed identity, event, arm, missingness and limitation fields omitted.
}
```

Keep the existing v6.4 Change Trace vocabulary and accessibility system. No new execution controls, browser grading, model calls, report recomputation or design framework is needed. Future registration metadata (A) and measurements (B) need separate reviewed integration; operational readiness remains D's responsibility. Replay implementation does not admit an experiment or provision public evidence.
