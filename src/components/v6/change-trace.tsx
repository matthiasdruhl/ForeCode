"use client";
import { useId } from "react";
import {
  responsibilities,
  type TraceFocus,
} from "@/lib/presentation/trace-focus";

type Props = {
  focus: TraceFocus;
  onSelect: (selection: Partial<Omit<TraceFocus, "contextIdentity">>) => void;
  requirement?: string;
  requirementConfirmed?: boolean;
};
const notes = {
  Routes:
    "Booking requests enter through routes. A proposed permission boundary must preserve existing individual booking behavior.",
  Ownership:
    "Today’s booking case checks a fixed demo viewer and owner-only access. Delegation would require a reviewed ownership rule.",
  Policy:
    "A shared permissions policy is a conceptual preparation option. No implemented policy module is asserted by this schematic.",
  Storage:
    "The current booking store is in memory. A future permission model must preserve booking and overlap rules.",
};
/** Conceptual responsibility diagram. Authenticated file comparisons are shown
 * separately; their existence never turns these connectors into source edges. */
export function ChangeTrace({
  focus,
  onSelect,
  requirement = "Team permissions",
  requirementConfirmed = false,
}: Props) {
  const description = useId();
  return (
    <figure className="change-trace" aria-describedby={description}>
      <div className="trace-caption">
        <span>THE CHANGE TRACE</span>
        <span>CONCEPTUAL · NOT AN EXECUTION</span>
      </div>
      <div
        className="trace-scroll"
        tabIndex={0}
        role="region"
        aria-label="Conceptual A and B responsibility lanes. Scroll horizontally to inspect."
      >
        <div className="trace-canvas">
          <svg
            preserveAspectRatio="none"
            viewBox="0 0 760 290"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="trace-trunk"
              d="M380 50 V84 H32 V227 M32 136 H160 M32 227 H160"
            />
          </svg>
          <div className="trace-requirement">
            <span className="requirement-diamond" aria-hidden="true" />
            <span>
              {requirement}
              <small>
                {requirementConfirmed
                  ? "CONFIRMED BY YOU"
                  : "UPCOMING REQUIREMENT"}
              </small>
            </span>
          </div>
          {(["A", "B"] as const).map((arm) => (
            <div className={`trace-lane lane-${arm}`} key={arm}>
              <button
                className="trace-arm"
                aria-pressed={focus.arm === arm}
                onClick={() => onSelect({ arm, responsibility: "Routes" })}
              >
                {arm}
                <small>{arm === "A" ? "KEEP" : "PREPARE"}</small>
              </button>
              {responsibilities.map((responsibility) => (
                <button
                  key={responsibility}
                  className={`trace-node${arm === "B" ? " proposed" : ""}`}
                  aria-pressed={
                    focus.arm === arm && focus.responsibility === responsibility
                  }
                  aria-label={`Inspect ${arm} · ${responsibility}`}
                  onClick={() => onSelect({ arm, responsibility })}
                >
                  {responsibility}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <figcaption
        id={description}
        className="trace-inspector"
        aria-live="polite"
      >
        <span className="trace-focus-label">
          {focus.arm} / {focus.responsibility}{" "}
          <small>{focus.phase} · conceptual</small>
        </span>
        <p>
          {notes[focus.responsibility]}{" "}
          {focus.arm === "B"
            ? "Dashed relationships are proposed; no edit is observed."
            : "Schematic connections describe responsibilities, not measured dependencies."}
        </p>
      </figcaption>
    </figure>
  );
}
