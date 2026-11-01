"use client";

import { bookingGraph } from "@/lib/foresight/booking-context";
import type { ProposeResponse } from "@/lib/foresight/flow";

type Arm = "A" | "B";

const tracedIds = ["collection", "runtime", "service", "store"] as const;

// This *subset* is reviewed source, not a generated or complete dependency graph.
// The corresponding direct imports are asserted by tests against bookingGraph.
export const tracedSource = tracedIds.map((id) => {
  const module = bookingGraph.modules.find((item) => item.id === id);
  if (!module) throw new Error(`Reviewed booking module missing: ${id}`);
  return module;
});

export function ChangeTrace({
  proposal,
  arm,
  selected,
  onInspect,
}: {
  proposal?: ProposeResponse | null;
  arm: Arm;
  selected: string;
  onInspect: (arm: Arm, moduleId: string) => void;
}) {
  const activeModule = bookingGraph.modules.find((item) => item.id === selected);
  const selectedActions =
    arm === "B" && activeModule
      ? (proposal?.candidates[1]?.changePlan.filter(
          (action) =>
            action.module === activeModule.path &&
            action.action !== "leave_unchanged",
        ) ?? [])
      : [];

  return (
    <section className="change-trace" aria-labelledby="change-trace-heading">
      <header className="change-trace-heading">
        <div>
          <span className="change-trace-eyebrow">The Change Trace / booking case</span>
          <h4 id="change-trace-heading">One future requirement. Two approaches.</h4>
        </div>
        <span className="change-trace-status">Conceptual comparison · no experiment</span>
      </header>
      <div className="change-trace-layout">
        <div className="change-trace-intent">
          <span className="change-trace-diamond" aria-hidden="true" />
          <span className="change-trace-eyebrow">Example future task</span>
          <strong>Team permissions</strong>
          <small>Illustrative booking case, not an observed source change</small>
        </div>
        <div className="change-trace-lanes">
          {(["A", "B"] as const).map((variant) => {
            const available = variant === "A" || Boolean(proposal);
            return (
              <div className="change-trace-lane" key={variant}>
                <div className="change-trace-lane-label">
                  <strong>{variant} / {variant === "A" ? "Keep current structure" : "Consider proposed preparation"}</strong>
                  <span>
                    {variant === "A"
                      ? "Reviewed source"
                      : available
                        ? "Model proposal · unimplemented"
                        : "Awaiting proposal"}
                  </span>
                </div>
                <div className="change-trace-steps" role="group" aria-label={`Architecture ${variant} reviewed source path`}>
                  {tracedSource.map((module, index) => {
                    const proposed =
                      variant === "B" &&
                      Boolean(
                        proposal?.candidates[1]?.changePlan.some(
                          (change) =>
                            change.module === module.path &&
                            change.action !== "leave_unchanged",
                        ),
                      );
                    const pressed = available && arm === variant && selected === module.id;
                    return (
                      <button
                        key={module.id}
                        type="button"
                        className={`change-trace-step${pressed ? " is-selected" : ""}${proposed ? " is-proposed" : ""}`}
                        aria-pressed={pressed}
                        aria-label={`Inspect ${variant} / ${module.id}: ${module.path}`}
                        disabled={!available}
                        onClick={() => onInspect(variant, module.id)}
                      >
                        <span className="change-trace-index">0{index + 1}</span>
                        <strong>{module.id === "collection" ? "API route" : module.id === "runtime" ? "Runtime" : module.id === "service" ? "Booking service" : "Booking store"}</strong>
                        {proposed && <small>Proposed edit</small>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="change-trace-inspection" aria-live="polite">
        <div>
          <span className="change-trace-eyebrow">Focused source / {arm}</span>
          <strong>{activeModule?.path ?? "No selected reviewed module"}</strong>
          <small>
            {arm === "A"
              ? "Existing module in the reviewed partial static-import graph."
              : selectedActions.length
                ? `${selectedActions.length} proposed action(s) for this existing path; no implementation is asserted.`
                : "No proposed edit to this path. B has no authenticated prepared tree."}
          </small>
        </div>
        <p>
          Four source-backed modules per lane. Lines represent three existing static imports,
          not measured change propagation. Select a node to inspect its full source context below.
        </p>
      </div>
    </section>
  );
}
