import type { PublicTournament } from "../experiment/tournament-publication";
import { jsonDigest } from "../report/digests";
import {
  buildReplayChronology,
  recordedTiming,
  compareRecordedTimes,
} from "./chronology";
import {
  parseReplaySource,
  referenceFor,
  ReplayInputError,
} from "./evidence-links";
import {
  replayStages,
  type DeepReadonly,
  type ReplayAvailability,
  type ReplayCatalogInput,
  type ReplayEvent,
  type TournamentReplay,
  type TournamentReplayCatalog,
} from "./contracts";

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
const limits = [
  "Pure projection only: schema parsing and hashing do not authenticate evidence or authorize publication. Production requires the fresh trusted server publication reader.",
  "Stage order is conceptual. Common-clock evidence, inter-attempt chronology and concurrency are not established by the public projection.",
  "Hypothesis issuance, preparation selection, source comparisons, checks, receipt publication and engineering decisions have no published event timestamps.",
  "Preparation attempts have no arm assignment. Comparison file hashes have no arm or phase assignment and cannot reconstruct source edits or topology.",
  "Unknown telemetry remains unknown. Reservations are not billed spending; phase file-touch counts are not unique total files.",
  "A/B does not establish Meta incremental benefit or general architectural superiority. Correctness is separate from an engineering recommendation.",
];
const statusAvailability = (
  status: PublicTournament["arms"][number]["status"],
): ReplayAvailability =>
  status === "completed" ? "observed_in_projection" : status;

/** Deterministic, read-only presentation. This API intentionally never asserts
 * approved origin; only the existing fresh server reader establishes lineage. */
export function buildTournamentReplay(
  study: PublicTournament,
): TournamentReplay {
  const p = parseReplaySource(study);
  const events: ReplayEvent[] = [];
  const missing: {
    code: string;
    eventId: string | null;
    variant: "A" | "B" | null;
  }[] = [];
  type NewEvent = Omit<ReplayEvent, "id" | "studyId" | "timing"> & {
    timing?: ReplayEvent["timing"];
  };
  function add(key: string, event: NewEvent) {
    const id = `replay:${p.studyId}:${key}`;
    events.push({
      ...event,
      id,
      studyId: p.studyId,
      timing: event.timing ?? recordedTiming(),
    });
    return id;
  }
  const ref = (selector: Parameters<typeof referenceFor>[1]) =>
    referenceFor(p, selector);
  add("hypothesis", {
    stage: "hypothesis",
    variant: null,
    label: "Published research context",
    description:
      "Approved publication context does not establish model issuance time or a provider transcript.",
    availability: "metadata_only",
    basis: "approved_metadata_context",
    evidence: [ref({ kind: "study" })],
    data: {
      kind: "research_context",
      hypothesis: p.hypothesis,
      reviewedProposal: p.reviewedProposal,
    },
  });
  const mismatchedRuns = new Set<string>();
  for (const arm of p.arms) {
    const attempt = p.attempts.find((a) => a.id === arm.runId);
    if (
      attempt &&
      ((arm.startedAt !== null &&
        compareRecordedTimes(arm.startedAt, attempt.startedAt) !== 0) ||
        (arm.endedAt !== null &&
          compareRecordedTimes(arm.endedAt, attempt.endedAt) !== 0))
    )
      mismatchedRuns.add(attempt.id);
  }
  for (const attempt of p.preparationAttempts) {
    add(`preparation-attempt:${attempt.id}`, {
      stage: "preparation",
      variant: null,
      label: "Recorded preparation attempt",
      description:
        "The publication does not assign this preparation attempt to an arm.",
      availability: statusAvailability(attempt.status),
      basis: "projection_observation",
      timing: recordedTiming(attempt.startedAt, attempt.finishedAt),
      evidence: [ref({ kind: "preparation_attempt", attemptId: attempt.id })],
      data: {
        kind: "preparation_attempt",
        attemptId: attempt.id,
        status: attempt.status,
      },
    });
  }
  for (const variant of ["A", "B"] as const) {
    const arm = p.arms.find((a) => a.variant === variant)!;
    add(`architecture:${variant}`, {
      stage: "preparation",
      variant,
      label: variant === "A" ? "A — Keep" : "B — Prepare",
      description:
        "Architecture identity and phase metrics are publication metadata, not an additional preparation execution event.",
      availability: "metadata_only",
      basis: "approved_metadata_context",
      evidence: [ref({ kind: "arm", variant })],
      data: {
        kind: "architecture_preparation",
        role: variant === "A" ? "original" : "prepared_alternative",
      },
    });
    for (const attempt of p.attempts.filter((a) => a.variant === variant)) {
      add(`coding-attempt:${attempt.id}`, {
        stage: "coding",
        variant,
        label: "Recorded coding attempt",
        description:
          "Recorded attempt state; no streaming activity or source edits are available.",
        availability: statusAvailability(attempt.status),
        basis: "projection_observation",
        timing: recordedTiming(
          attempt.startedAt,
          attempt.endedAt,
          mismatchedRuns.has(attempt.id),
        ),
        evidence: [ref({ kind: "attempt", variant, attemptId: attempt.id })],
        data: {
          kind: "coding_attempt",
          attemptId: attempt.id,
          status: attempt.status,
        },
      });
    }
    if (!p.attempts.some((a) => a.variant === variant)) {
      const id = add(`history-absent:${variant}`, {
        stage: "coding",
        variant,
        label: "Attempt history unavailable",
        description: "No individual attempt history is published for this arm.",
        availability: "unknown",
        basis: "unavailable_stage",
        evidence: [ref({ kind: "arm", variant })],
        data: {
          kind: "evidence_unavailable",
          reason: "ATTEMPT_HISTORY_ABSENT",
        },
      });
      missing.push({ code: "ATTEMPT_HISTORY_ABSENT", eventId: id, variant });
    }
    const outcomeId = add(`outcome:${variant}`, {
      stage: "coding",
      variant,
      label: "Published arm state",
      description:
        "Arm summary, not a separate coding attempt or proof of task correctness.",
      availability:
        arm.runId === null && arm.status === "completed"
          ? "unknown"
          : statusAvailability(arm.status),
      basis:
        arm.runId === null
          ? "approved_metadata_context"
          : "projection_observation",
      timing: recordedTiming(
        arm.startedAt,
        arm.endedAt,
        arm.runId !== null && mismatchedRuns.has(arm.runId),
      ),
      evidence: [
        ref({ kind: "arm", variant }),
        ref({ kind: "future", variant }),
      ],
      data: { kind: "arm_outcome", status: arm.status },
    });
    if (arm.finalTreeSha256 === null)
      missing.push({ code: "FINAL_TREE_ABSENT", eventId: outcomeId, variant });
    if (arm.runId !== null && !p.attempts.some((a) => a.id === arm.runId))
      missing.push({
        code: "FINAL_RUN_HISTORY_ABSENT",
        eventId: outcomeId,
        variant,
      });
    for (const phase of ["preparation", "downstream", "total"] as const) {
      if (Object.values(arm[phase]).some((value) => value === null))
        missing.push({
          code: `${phase.toUpperCase()}_METRICS_PARTIAL_OR_UNKNOWN`,
          eventId: null,
          variant,
        });
    }
    for (const phase of ["baseline", "future"] as const) {
      const receipt =
        phase === "baseline" ? arm.baselineReceiptId : arm.receiptId;
      const id = add(`verification:${phase}:${variant}`, {
        stage: "verification",
        variant,
        label: `${phase === "baseline" ? "Baseline" : "Future task"} independent verification`,
        description:
          "Published receipt and evaluator verdict; no receipt or check timestamp is supplied.",
        availability: receipt === null ? "unknown" : "observed_in_projection",
        basis:
          receipt === null ? "unavailable_stage" : "projection_observation",
        evidence: [ref({ kind: phase, variant })],
        data: {
          kind: "independent_verification",
          phase,
          verdict: phase === "baseline" ? arm.baselineVerdict : arm.verdict,
        },
      });
      if (receipt === null)
        missing.push({
          code: `${phase.toUpperCase()}_RECEIPT_ABSENT`,
          eventId: id,
          variant,
        });
    }
    for (const check of arm.checks) {
      add(`check:${variant}:${check.id}`, {
        stage: "verification",
        variant,
        label: check.id,
        description:
          "Published future-task required-check status only; no hidden check body or detailed boundary measurements.",
        // Without a receipt, not_run placeholders establish missing evidence,
        // not an independently observed decision not to run the check.
        availability:
          arm.receiptId === null || check.status === "invalid"
            ? "unknown"
            : check.status === "not_run"
              ? "not_run"
              : "observed_in_projection",
        basis:
          arm.receiptId === null || check.status === "invalid"
            ? "unavailable_stage"
            : "projection_observation",
        evidence: [ref({ kind: "check", variant, checkId: check.id })],
        data: {
          kind: "independent_check",
          checkId: check.id,
          status: check.status,
        },
      });
    }
  }
  const comparisonId = add("source-comparison", {
    stage: "coding",
    variant: null,
    label: "Published source comparison",
    description:
      "File hashes only; no arm mapping, edit sequence or three-stage topology is established.",
    availability:
      p.sourceComparison === null ? "unknown" : "observed_in_projection",
    basis:
      p.sourceComparison === null
        ? "unavailable_stage"
        : "projection_observation",
    evidence: p.sourceComparison?.length
      ? p.sourceComparison.map((_, index) =>
          ref({ kind: "source_comparison", index }),
        )
      : [ref({ kind: "study" })],
    data:
      p.sourceComparison === null
        ? { kind: "evidence_unavailable", reason: "SOURCE_COMPARISON_ABSENT" }
        : { kind: "source_comparison", comparisons: p.sourceComparison },
  });
  if (p.sourceComparison === null)
    missing.push({
      code: "SOURCE_COMPARISON_ABSENT",
      eventId: comparisonId,
      variant: null,
    });
  const decisionId = add("decision", {
    stage: "decision",
    variant: null,
    label: "Published comparison classification",
    description:
      "The separate deterministic Decision Report must be loaded and matched by the trusted server caller. Replay computes no recommendation.",
    availability: "metadata_only",
    basis: "approved_metadata_context",
    evidence: [ref({ kind: "study" })],
    data: {
      kind: "engineering_decision",
      comparability: p.comparability,
      correctness: p.correctness,
      report: "not_supplied",
    },
  });
  missing.push({
    code: "DECISION_REPORT_NOT_SUPPLIED",
    eventId: decisionId,
    variant: null,
  });
  events.sort(
    (a, b) =>
      replayStages.indexOf(a.stage) - replayStages.indexOf(b.stage) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.length > 240
  )
    throw new ReplayInputError();
  for (const event of events) {
    if (event.timing.state === "unknown")
      missing.push({
        code: "EVENT_TIME_UNKNOWN",
        eventId: event.id,
        variant: event.variant,
      });
    for (const issue of event.timing.issues)
      missing.push({ code: issue, eventId: event.id, variant: event.variant });
  }
  const projectionSha256 = jsonDigest(p);
  return freeze({
    schemaVersion: "tournament-replay.v1",
    provenance: "UNAUTHENTICATED_PROJECTION",
    recordingAvailability: "supplied_projection",
    projectionSha256,
    studyId: p.studyId,
    taskId: p.taskId,
    taskDefinitionSha256: p.taskDefinitionSha256,
    definitionSha256: p.definitionSha256,
    protocolOriginalSha256: p.protocolOriginalSha256,
    preparedOriginalSha256: p.preparedOriginalSha256,
    title: p.title,
    futureProblem: p.futureProblem,
    model: p.model,
    declaredOrder: p.order,
    comparability: p.comparability,
    correctness: p.correctness,
    arms: [...p.arms].sort((a, b) => (a.variant < b.variant ? -1 : 1)),
    evaluators: {
      baseline: {
        evaluatorSha256: p.baselineEvaluatorSha256,
        suiteSha256: p.baselineSuiteSha256,
        policySha256: p.baselinePolicySha256,
      },
      future: {
        evaluatorSha256: p.futureEvaluatorSha256,
        suiteSha256: p.futureSuiteSha256,
        policySha256: p.futurePolicySha256,
      },
    },
    stages: replayStages.map((stage) => ({
      stage,
      eventIds: events.filter((e) => e.stage === stage).map((e) => e.id),
    })),
    events,
    chronology: buildReplayChronology(events),
    missing,
    blockers: [...p.blockers],
    deviations: [...p.deviations],
    limitations: [...p.limitations, ...limits],
    decisionReference: {
      state: "not_supplied",
      studyId: p.studyId,
      projectionSha256,
    },
  });
}

/** Convenience for an already loaded catalog, never a second reader or authority. */
export function projectTournamentReplayCatalog(
  catalog: ReplayCatalogInput,
): TournamentReplayCatalog {
  if (
    !["empty", "available", "unavailable"].includes(catalog.state) ||
    !Number.isInteger(catalog.unavailableCount) ||
    catalog.unavailableCount < 0 ||
    catalog.unavailableCount > 20 ||
    catalog.studies.length > 20 ||
    (catalog.state === "available"
      ? catalog.studies.length === 0
      : catalog.studies.length !== 0) ||
    (catalog.state === "empty" && catalog.unavailableCount !== 0) ||
    new Set(catalog.studies.map((p) => p.studyId)).size !==
      catalog.studies.length
  )
    throw new ReplayInputError();
  return freeze({
    state: catalog.state,
    provenance: "UNAUTHENTICATED_PROJECTION",
    replays: catalog.studies.map(buildTournamentReplay),
    unavailableCount: catalog.unavailableCount,
    stages:
      catalog.state === "available"
        ? []
        : replayStages.map((stage) => ({
            stage,
            availability:
              catalog.state === "empty" ? "unknown" : "publication_unavailable",
          })),
  });
}
