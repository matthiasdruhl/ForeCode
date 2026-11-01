"use client";
import { replayStages } from "@/lib/replay/contracts";
import type {
  ReplayEvent,
  ReplayStage,
  TournamentReplay,
  TournamentReplayCatalog,
} from "@/lib/replay";
import type { TraceFocus } from "@/lib/presentation/trace-focus";
import type { EvidenceQuestion } from "@/lib/presentation/decision-memo";
import { ProvenanceKey } from "./provenance-key";
import {
  ReplayEventDetail,
  ReplayEventProvenance,
  replayEventStatus,
} from "./replay-event-detail";

export const stageLabels: Record<ReplayStage, string> = {
  hypothesis: "Hypothesis",
  preparation: "Preparation",
  coding: "Coding",
  verification: "Independent verification",
  decision: "Engineering decision",
};
const stageCopy: Record<
  ReplayStage,
  { question: string; A: string; B: string; paths: [string, string] }
> = {
  hypothesis: {
    question: "What might this requirement demand?",
    A: "Keep the original design as a credible starting point.",
    B: "Review a proposed permissions boundary and the mechanism it is meant to improve.",
    paths: ["Current responsibilities", "Proposed boundary"],
  },
  preparation: {
    question: "What was prepared before the future task?",
    A: "Retain the original architecture. This lane does not imply an extra preparation run.",
    B: "Prepare a reviewed boundary first. Count this upfront work separately from downstream work.",
    paths: ["Original source", "Reviewed preparation"],
  },
  coding: {
    question: "How did each approach respond to the same task?",
    A: "Implement the future requirement from the original architecture.",
    B: "Implement the same requirement from the prepared alternative.",
    paths: ["Original → future task", "Prepared → future task"],
  },
  verification: {
    question: "What did the independent checks establish?",
    A: "Inspect this arm’s protected checks and receipt, separately from its execution state.",
    B: "Apply the same required checks. A completed attempt alone does not establish correctness.",
    paths: ["A required checks", "B required checks"],
  },
  decision: {
    question: "What decision does the evidence support?",
    A: "Keeping the architecture requires the same evidence discipline as changing it.",
    B: "Review a refactor only within the tested scope and with preparation included.",
    paths: ["Keep, if supported", "Refactor, if supported"],
  },
};
const questionFor = (event: ReplayEvent): EvidenceQuestion =>
  event.stage === "verification"
    ? "checks"
    : event.stage === "hypothesis"
      ? "hypothesis"
      : event.stage === "decision"
        ? "fairness"
        : "source";

export function ReplayStageExplorer({
  catalog,
  replay,
  stage,
  focus,
  requirement,
  requirementConfirmed,
  onStage,
  onArm,
  inspect,
}: {
  catalog: TournamentReplayCatalog;
  replay?: TournamentReplay;
  stage: ReplayStage;
  focus: TraceFocus;
  requirement: string;
  requirementConfirmed: boolean;
  onStage: (stage: ReplayStage) => void;
  onArm: (arm: "A" | "B") => void;
  inspect: (
    question: EvidenceQuestion,
    trigger: string,
    eventId?: string,
  ) => void;
}) {
  const events = replay?.events.filter((event) => event.stage === stage) ?? [];
  const shared = events.filter((event) => event.variant === null);
  function eventRow(event: ReplayEvent) {
    const trigger = `inspect-${event.id}`;
    return (
      <li key={event.id} className="replay-event-row">
        <ReplayEventProvenance event={event} />
        <details>
          <summary>
            <strong>{event.label}</strong>
            <span>
              {replayEventStatus(event) && <>{replayEventStatus(event)} · </>}
              {event.availability.replaceAll("_", " ")}
            </span>
          </summary>
          <ReplayEventDetail event={event} />
        </details>
        <button
          id={trigger}
          className="v6-text-link"
          onClick={() => inspect(questionFor(event), trigger, event.id)}
        >
          Inspect this evidence <span aria-hidden="true">↗</span>
        </button>
      </li>
    );
  }
  return (
    <section
      className="replay-explorer"
      aria-label="Five-stage architecture replay"
    >
      <div className="replay-requirement">
        <span className="requirement-diamond" aria-hidden="true" />
        <div>
          <span className="v6-kicker">
            ONE FUTURE REQUIREMENT /{" "}
            {replay
              ? "PUBLISHED TASK"
              : requirementConfirmed
                ? "CONFIRMED BY YOU"
                : "PROPOSED"}
          </span>
          <p>{requirement}</p>
        </div>
        <span className="replay-catalog-state">
          {replay
            ? "Approved publication"
            : catalog.state === "unavailable"
              ? "Publication unavailable"
              : "No approved study"}
        </span>
      </div>
      <nav className="replay-stage-rail" aria-label="Replay stage">
        {replayStages.map((key, index) => (
          <button
            key={key}
            aria-pressed={stage === key}
            onClick={() => onStage(key)}
          >
            <span className="replay-step-number">0{index + 1}</span>
            <span>{stageLabels[key]}</span>
            <small>{replay ? "Inspect publication" : "Unknown"}</small>
          </button>
        ))}
      </nav>
      <div className="replay-stage-heading" aria-live="polite">
        <span className="v6-kicker">{stageLabels[stage]} / SELECTED STAGE</span>
        <h2>{stageCopy[stage].question}</h2>
        <p>
          Stage order is conceptual. No shared clock or global execution order
          is established.
        </p>
      </div>
      <div className="replay-arm-pair">
        {(["A", "B"] as const).map((arm) => {
          const armEvents = events.filter((event) => event.variant === arm);
          return (
            <section
              className="replay-arm"
              data-selected={focus.arm === arm}
              key={arm}
              aria-label={`${arm} architecture response`}
            >
              <button
                className="replay-arm-heading"
                aria-pressed={focus.arm === arm}
                onClick={() => onArm(arm)}
              >
                <span>{arm}</span>
                <strong>
                  {arm === "A"
                    ? "Keep the current architecture"
                    : "Prepare the boundary"}
                </strong>
                <small>{focus.arm === arm ? "Selected" : "Inspect arm"}</small>
              </button>
              <div className="replay-concept">
                <span className="v6-kicker">CONCEPTUAL PATH</span>
                <h3>{stageCopy[stage].paths[arm === "A" ? 0 : 1]}</h3>
                <ol
                  className="replay-concept-path"
                  aria-label={`Conceptual ${arm} change path, not recorded source transitions`}
                >
                  {(arm === "A"
                    ? ["Original source", "Future task", "Adapt current design"]
                    : ["Original source", "Review boundary", "Future task"]
                  ).map((step) => (
                    <li key={step}>
                      <span aria-hidden="true" />
                      {step}
                    </li>
                  ))}
                </ol>
                <p>{stageCopy[stage][arm]}</p>
              </div>
              {armEvents.length > 0 ? (
                <ul className="replay-arm-events">{armEvents.map(eventRow)}</ul>
              ) : (
                <div className="replay-empty">
                  <span
                    className="provenance-mark unknown"
                    aria-hidden="true"
                  />
                  <div>
                    <strong>
                      {replay
                        ? "No arm-specific event in this stage"
                        : "Evidence unavailable"}
                    </strong>
                    <p>
                      {replay
                        ? "Inspect shared context for this stage. No additional arm event is inferred."
                        : "No approved recorded event, source comparison or independent observation is available for this selection."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {shared.length > 0 && (
        <section
          className="replay-shared"
          aria-label="Shared and arm-unassigned evidence"
        >
          <h3>Shared / arm-unassigned</h3>
          <p>These records are not assigned to A or B.</p>
          <ul>{shared.map(eventRow)}</ul>
        </section>
      )}
      <ProvenanceKey />
    </section>
  );
}
