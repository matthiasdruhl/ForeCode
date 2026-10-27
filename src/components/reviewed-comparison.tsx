"use client";

import { useState } from "react";
import type { DecisionV1 } from "@/lib/contracts/architecture";
import {
  actionWeights,
  type ResearchContext,
} from "@/lib/contracts/validation";
import {
  createWorksheet,
  type PairReview,
  type Worksheet,
} from "@/lib/decision/worksheet";
import {
  compareReviewed,
  rankDecision,
  recommendationReason,
} from "@/lib/decision/regret";

export function ReviewedComparison({ context }: { context: ResearchContext }) {
  const [sheet, setSheet] = useState(() => createWorksheet(context));
  const [decision, setDecision] = useState<DecisionV1 | null>(null);
  const [error, setError] = useState("");
  function update(next: Worksheet) {
    setSheet(next);
    setDecision(null);
    setError("");
  }
  function updateScope(next: Worksheet) {
    const empty = createWorksheet(context);
    update({ ...next, pairs: empty.pairs, unknowns: empty.unknowns });
  }
  function updatePair(index: number, next: PairReview) {
    update({
      ...sheet,
      pairs: sheet.pairs.map((pair, i) => (i === index ? next : pair)),
    });
  }
  return (
    <section
      className="reviewed-comparison"
      aria-labelledby="comparison-heading"
    >
      <span className="eyebrow accent">Local worksheet / fixed rubric</span>
      <h3 id="comparison-heading">Review cost assumptions, then compare.</h3>
      <p>
        Developer-reviewed assumptions under modeled_effort_points_v1. These are
        not observed future effort or an independently verified recommendation.
        No worksheet is sent to Meta. Cost review is separate from intent
        confirmation and provider consent.
      </p>
      <p>
        Downstream = 2 × unique changed paths + route changes + 2 × unresolved
        relevant dependencies. Total = upfront + downstream. Regret = total −
        the scenario minimum across all candidates. Minimize worst scenario
        regret, then upfront cost, then candidate ID.
      </p>
      <p>
        Upfront action weights: introduce_boundary 3; extract_module,
        move_module and add_interface 2; leave_unchanged 0. Candidate totals are
        checked against every action. The A/B descriptions and plans above apply
        to every scenario below.
      </p>
      <label htmlFor="comparison-scope">Bounded comparison scope</label>
      <textarea
        id="comparison-scope"
        maxLength={500}
        value={sheet.scope}
        onChange={(e) => updateScope({ ...sheet, scope: e.target.value })}
        placeholder="Describe the same included work and exclusions for A and B in every scenario."
      />
      <label htmlFor="comparison-comparability">
        Can every alternative and scenario use this scope?
      </label>
      <select
        id="comparison-comparability"
        value={sheet.comparability}
        onChange={(e) =>
          updateScope({
            ...sheet,
            comparability: e.target.value as Worksheet["comparability"],
          })
        }
      >
        <option value="unreviewed">Unreviewed</option>
        <option value="shared_scope">Yes, same bounded scope</option>
        <option value="incomparable">Incomparable alternatives</option>
      </select>
      <details open className="comparison-unknowns">
        <summary>Review graph unknowns and omissions</summary>
        <p>
          Partial manual graph only. Import reachability cannot establish future
          changed files or runtime route integration. If an omission is
          relevant, including the unrepresentable dynamic detail route, leave it
          unknown: ForeCode must abstain. Exclusions need a rationale and narrow
          the estimate.
        </p>
        {sheet.unknowns.map((entry, i) => (
          <div className="unknown-review" key={entry.unknown}>
            <p id={`unknown-text-${i}`}>{entry.unknown}</p>
            <label htmlFor={`unknown-${i}`}>Coverage review {i + 1}</label>
            <select
              id={`unknown-${i}`}
              aria-describedby={`unknown-text-${i}`}
              value={entry.disposition}
              onChange={(e) =>
                update({
                  ...sheet,
                  unknowns: sheet.unknowns.map((row, index) =>
                    index === i
                      ? {
                          ...row,
                          disposition: e.target.value as typeof row.disposition,
                        }
                      : row,
                  ),
                })
              }
            >
              <option value="unreviewed">Unreviewed / unknown</option>
              <option value="relevant_unknown">
                Relevant unknown — abstain
              </option>
              <option value="out_of_scope">Outside this bounded scope</option>
            </select>
            <label htmlFor={`unknown-rationale-${i}`}>
              Scope rationale {i + 1}
            </label>
            <input
              id={`unknown-rationale-${i}`}
              maxLength={500}
              value={entry.rationale}
              onChange={(e) =>
                update({
                  ...sheet,
                  unknowns: sheet.unknowns.map((row, index) =>
                    index === i ? { ...row, rationale: e.target.value } : row,
                  ),
                })
              }
            />
          </div>
        ))}
      </details>
      <p id="comparison-count-help">
        Counts are integers from 0 to 64. Empty means unknown. Count known
        unresolved dependencies here; if their relevant impact cannot be
        reviewed, state that unknown and ForeCode will abstain.
      </p>
      {context.scenarios.map((scenario) => (
        <div className="comparison-scenario" key={scenario.id}>
          <h4>{scenario.id}</h4>
          <p>{scenario.request}</p>
          <div className="candidate-grid">
            {context.candidates.map((candidate) => {
              const index = sheet.pairs.findIndex(
                (pair) =>
                  pair.candidateId === candidate.id &&
                  pair.scenarioId === scenario.id,
              );
              const pair = sheet.pairs[index]!;
              const prefix = `basis-${index}`;
              return (
                <fieldset key={candidate.id} className="pair-review">
                  <legend>
                    {candidate.id} / {scenario.id}
                  </legend>
                  <h4>{candidate.label}</h4>
                  <p>
                    Upfront:{" "}
                    {candidate.changePlan
                      .map((entry) => actionWeights[entry.action])
                      .join(" + ") || "0"}{" "}
                    = {candidate.estimatedUpfrontCost} points ·
                    reviewed_estimate
                  </p>
                  <details>
                    <summary>
                      Affected existing paths (
                      {pair.basis.projectedChangedModules?.length ?? 0}{" "}
                      selected)
                    </summary>
                    {context.graph.modules.map((module) => (
                      <label className="check-label" key={module.id}>
                        <input
                          type="checkbox"
                          checked={
                            pair.basis.projectedChangedModules?.includes(
                              module.path,
                            ) ?? false
                          }
                          onChange={(e) =>
                            updatePair(index, {
                              ...pair,
                              reviewed: false,
                              basis: {
                                ...pair.basis,
                                projectedChangedModules: e.target.checked
                                  ? [
                                      ...(pair.basis.projectedChangedModules ??
                                        []),
                                      module.path,
                                    ]
                                  : (
                                      pair.basis.projectedChangedModules ?? []
                                    ).filter((path) => path !== module.path),
                              },
                            })
                          }
                        />
                        <span>{module.path}</span>
                      </label>
                    ))}
                  </details>
                  {(
                    [
                      ["projectedRouteChanges", "Route changes"],
                      [
                        "unresolvedRelevantDependencies",
                        "Unresolved relevant dependencies",
                      ],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field}>
                      <label htmlFor={`${prefix}-${field}`}>{label}</label>
                      <input
                        id={`${prefix}-${field}`}
                        type="number"
                        aria-describedby="comparison-count-help"
                        aria-invalid={
                          pair.basis[field] !== null &&
                          (!Number.isInteger(pair.basis[field]) ||
                            pair.basis[field]! < 0 ||
                            pair.basis[field]! > 64)
                        }
                        min={0}
                        max={64}
                        step={1}
                        placeholder="Unset — enter 0 if known zero"
                        value={pair.basis[field] ?? ""}
                        onChange={(e) =>
                          updatePair(index, {
                            ...pair,
                            reviewed: false,
                            basis: {
                              ...pair.basis,
                              [field]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                  <label htmlFor={`${prefix}-rationale`}>
                    Reviewer rationale
                  </label>
                  <textarea
                    id={`${prefix}-rationale`}
                    maxLength={1000}
                    value={pair.rationale}
                    onChange={(e) =>
                      updatePair(index, {
                        ...pair,
                        reviewed: false,
                        rationale: e.target.value,
                      })
                    }
                  />
                  <label htmlFor={`${prefix}-unknown`}>
                    Relevant unknown or unreviewable basis (if any)
                  </label>
                  <input
                    id={`${prefix}-unknown`}
                    maxLength={500}
                    value={pair.relevantUnknown}
                    onChange={(e) =>
                      updatePair(index, {
                        ...pair,
                        reviewed: false,
                        relevantUnknown: e.target.value,
                      })
                    }
                  />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={pair.reviewed}
                      onChange={(e) =>
                        updatePair(index, {
                          ...pair,
                          reviewed: e.target.checked,
                          basis: {
                            ...pair.basis,
                            projectedChangedModules: e.target.checked
                              ? (pair.basis.projectedChangedModules ?? [])
                              : pair.basis.projectedChangedModules,
                          },
                        })
                      }
                    />
                    <span>
                      I reviewed these paths (none selected explicitly means
                      zero), counts and rationale for this pair.
                    </span>
                  </label>
                </fieldset>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="button-primary"
        onClick={() => {
          try {
            setDecision(compareReviewed(context, sheet));
            setError("");
          } catch (cause) {
            setDecision(null);
            setError(
              cause instanceof Error
                ? `Invalid comparison input: ${cause.message}`
                : "Invalid comparison input.",
            );
          }
        }}
      >
        Compare locally
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!decision && !error && (
        <p role="status">
          No current decision. Review assumptions and compare; edits invalidate
          the result.
        </p>
      )}
      {decision && (
        <div
          className="comparison-result"
          aria-label="Comparison result"
          role="status"
        >
          <h4>
            {decision.recommendationId
              ? `Modeled recommendation: ${decision.recommendationId}`
              : "ForeCode abstains"}
          </h4>
          {decision.perScenario.length > 0 && (
            <>
              <p>{recommendationReason(decision)}</p>
              <div
                className="comparison-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Complete score matrix"
              >
                <table>
                  <caption>All costs in modeled_effort_points_v1</caption>
                  <thead>
                    <tr>
                      {[
                        "Scenario",
                        "Candidate",
                        "Upfront",
                        "Downstream calculation",
                        "Total",
                        "Regret",
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {decision.perScenario.map((score) => (
                      <tr key={`${score.candidateId}:${score.scenarioId}`}>
                        <th scope="row">{score.scenarioId}</th>
                        <td>{score.candidateId}</td>
                        <td>{score.upfrontCost}</td>
                        <td>
                          2 × {score.basis.projectedChangedModules.length} +{" "}
                          {score.basis.projectedRouteChanges} + 2 ×{" "}
                          {score.basis.unresolvedRelevantDependencies} ={" "}
                          {score.downstreamCost}
                        </td>
                        <td>
                          {score.upfrontCost} + {score.downstreamCost} ={" "}
                          {score.totalCost}
                        </td>
                        <td>
                          {score.totalCost} −{" "}
                          {Math.min(
                            ...decision.perScenario
                              .filter(
                                (other) =>
                                  other.scenarioId === score.scenarioId,
                              )
                              .map((other) => other.totalCost),
                          )}{" "}
                          = {score.regret}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul>
                {rankDecision(decision).map((entry) => (
                  <li key={entry.id}>
                    {entry.id}: worst regret {entry.worst}; upfront{" "}
                    {entry.upfront} points
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul>
            {decision.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
          <details>
            <summary>Inspect complete DecisionV1</summary>
            <pre>{JSON.stringify(decision, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
