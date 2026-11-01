"use client";

import { useState } from "react";
import { useTraceContext } from "./v6/trace-context";
import { bookingGraph } from "@/lib/foresight/booking-context";
import type { ProposeResponse } from "@/lib/foresight/flow";

// Layout only. Every rendered dependency comes from the reviewed source graph.
const positions: Record<string, [number, number]> = {
  collection: [20, 20],
  resources: [270, 20],
  session: [520, 20],
  runtime: [150, 120],
  http: [450, 120],
  service: [150, 220],
  store: [450, 220],
  booking: [150, 320],
  errors: [450, 320],
};

export function ArchitectureAtlas({
  proposal,
}: {
  proposal?: ProposeResponse | null;
}) {
  const shared = useTraceContext();
  const [localArm, setLocalArm] = useState<"A" | "B">("A");
  const arm = shared?.focus.arm ?? localArm;
  const setArm = (next: "A" | "B") => {
    setLocalArm(next);
    shared?.select({ arm: next, sourceId: shared.focus.sourceId });
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<
    "initial" | "prepared" | "future"
  >("initial");
  const snapshot = shared
    ? ({ before: "initial", prepared: "prepared", after: "future" } as const)[
        shared.focus.phase
      ]
    : localSnapshot;
  const setSnapshot = (next: "initial" | "prepared" | "future") => {
    setLocalSnapshot(next);
    shared?.select({
      phase: (
        { initial: "before", prepared: "prepared", future: "after" } as const
      )[next],
      sourceId: shared.focus.sourceId,
    });
  };
  const responsibilitySource = {
    Routes: "collection",
    Ownership: "service",
    Policy: "service",
    Storage: "store",
  } as const;
  const sourceSelection = shared
    ? (shared.focus.sourceId ??
      responsibilitySource[shared.focus.responsibility])
    : (selected ?? "service");
  const selectedModule = bookingGraph.modules.find(
    (item) => item.id === sourceSelection,
  )!;
  const candidate = proposal?.candidates[arm === "A" ? 0 : 1];
  const actions =
    candidate?.changePlan.filter(
      (item) => item.module === selectedModule.path,
    ) ?? [];
  const dependencies = bookingGraph.edges.filter(
    (edge) => edge.from === sourceSelection,
  );
  return (
    <section className="architecture-atlas" aria-labelledby="atlas-heading">
      <div className="register-heading">
        <div>
          <span className="eyebrow accent">Architecture Atlas</span>
          <h3 id="atlas-heading">Inspect the booking boundary.</h3>
        </div>
        <span className="text-badge">Source-backed / partial</span>
      </div>
      <div
        className="atlas-controls"
        role="group"
        aria-label="Architecture alternative"
      >
        <button
          type="button"
          className="button-secondary"
          aria-pressed={arm === "A"}
          onClick={() => setArm("A")}
        >
          A / Status quo
        </button>
        <button
          type="button"
          className="button-secondary"
          aria-pressed={arm === "B"}
          disabled={!proposal}
          onClick={() => setArm("B")}
        >
          B / Proposed preparation
        </button>
      </div>
      <p>
        {arm === "A"
          ? "Existing reviewed modules and static imports. No speculative preparation."
          : "The same existing source graph, annotated with proposed actions. B has no implemented source snapshot."}
      </p>
      <div className="atlas-layout">
        <div
          className="atlas-scroll"
          tabIndex={0}
          role="region"
          aria-label="Booking static import graph; scroll horizontally on small screens"
        >
          <div className="atlas-canvas">
            <svg viewBox="0 0 750 385" aria-hidden="true">
              <defs>
                <marker
                  id="atlas-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {bookingGraph.edges.map((edge) => {
                const [x1, y1] = positions[edge.from]!;
                const [x2, y2] = positions[edge.to]!;
                const sameRow = y1 === y2;
                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={x1 + (sameRow ? 210 : 105)}
                    y1={y1 + (sameRow ? 32 : 62)}
                    x2={x2 + (sameRow ? 0 : 105)}
                    y2={y2 + (sameRow ? 32 : 0)}
                    className={
                      edge.from === sourceSelection
                        ? "atlas-edge selected"
                        : "atlas-edge"
                    }
                    markerEnd="url(#atlas-arrow)"
                  />
                );
              })}
            </svg>
            {bookingGraph.modules.map((item) => {
              const [left, top] = positions[item.id]!;
              const proposed =
                arm === "B" &&
                candidate?.changePlan.some(
                  (action) =>
                    action.module === item.path &&
                    action.action !== "leave_unchanged",
                );
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`atlas-node${proposed ? " proposed" : ""}`}
                  style={{ left, top }}
                  aria-pressed={sourceSelection === item.id}
                  aria-label={`Inspect ${item.path}`}
                  onClick={() => {
                    setSelected(item.id);
                    if (shared)
                      shared.select({
                        sourceId: item.id,
                        responsibility:
                          item.id === "store" || item.id === "booking"
                            ? "Storage"
                            : item.kind === "route" ||
                                item.id === "http" ||
                                item.id === "runtime"
                              ? "Routes"
                              : "Ownership",
                      });
                  }}
                >
                  <strong>{item.id}</strong>
                  <span>{item.path}</span>
                  {proposed && <small>Proposed change</small>}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="atlas-inspector" aria-label="Selected module">
          <span className="eyebrow">
            {arm} / {selectedModule.kind}
          </span>
          <h4>{selectedModule.id}</h4>
          <code>{selectedModule.path}</code>
          <h4>Imports in reviewed source</h4>
          {dependencies.length ? (
            <ul>
              {dependencies.map((edge) => (
                <li key={edge.to}>
                  <code>
                    {
                      bookingGraph.modules.find((item) => item.id === edge.to)!
                        .path
                    }
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p>No imports represented in this partial graph.</p>
          )}
          <h4>
            {arm === "B" ? "Planned actions / proposal only" : "Preparation"}
          </h4>
          {arm === "B" && actions.length ? (
            <ul>
              {actions.map((item, i) => (
                <li key={i}>
                  {item.action}
                  <p>{item.rationale}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {arm === "A"
                ? "Keep the current architecture."
                : "No action proposed for this module."}
            </p>
          )}
        </aside>
      </div>
      <p className="atlas-scroll-hint">
        Static import arrows point to dependencies. Scroll the graph
        horizontally on narrow screens; select any module for a text view.
      </p>
      <div
        className="atlas-controls"
        role="group"
        aria-label="Architecture source history"
      >
        <button
          type="button"
          className="button-secondary"
          aria-pressed={snapshot === "initial"}
          onClick={() => setSnapshot("initial")}
        >
          Initial source
        </button>
        <button
          type="button"
          className="button-secondary"
          aria-pressed={snapshot === "prepared"}
          onClick={() => setSnapshot("prepared")}
        >
          Prepared architecture
        </button>
        <button
          type="button"
          className="button-secondary"
          aria-pressed={snapshot === "future"}
          onClick={() => setSnapshot("future")}
        >
          Post-future-task source
        </button>
      </div>
      <p role="status" className="atlas-snapshot">
        {snapshot === "initial" ? (
          <>
            Graph reviewed against commit <code>{bookingGraph.repoCommit}</code>
            . Nine modules, thirteen static imports, including type imports.
            This view contains graph metadata only.
          </>
        ) : snapshot === "prepared" ? (
          "Prepared source unavailable. Proposed actions are not source changes; no preparation diff is available."
        ) : (
          "Post-future-task source unavailable. No admitted coding-agent source or source diff is registered."
        )}
      </p>
      <p className="research-provenance">
        UI, external packages, tests, configuration and the dynamic detail route
        are omitted. Static imports do not establish runtime behavior. No
        proposed dependency is drawn as an observed edge.
      </p>
    </section>
  );
}
