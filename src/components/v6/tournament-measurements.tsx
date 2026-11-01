import type { PublicProspectiveEvidence } from "@/lib/experiment/prospective-publication";
import type { PublicTournament } from "@/lib/experiment/tournament-publication";
export function MeasurementRail({
  study,
  prospective,
}: {
  study?: PublicTournament;
  prospective?: PublicProspectiveEvidence;
}) {
  const singular: Record<string, string> = {
    tokens: "token",
    iterations: "iteration",
    files: "file",
    edges: "edge",
    cases: "case",
  };
  const value = (number: number | null | undefined, unit: string) =>
    number == null
      ? "Unknown"
      : `${number.toLocaleString("en-US", { maximumSignificantDigits: 12 })} ${number === 1 ? (singular[unit] ?? unit) : unit}`;
  const arms = (["A", "B"] as const).map((variant) =>
    study?.arms.find((arm) => arm.variant === variant),
  );
  const metrics = prospective?.metrics;
  const metricArms = (["A", "B"] as const).map((variant) =>
    metrics?.arms.find((arm) => arm.variant === variant),
  );
  return (
    <div
      className="measurement-rail"
      role="region"
      aria-label="Preparation and downstream measurements"
      tabIndex={0}
    >
      <table>
        <caption>
          Required checks and recorded effort · absence remains Unknown
        </caption>
        <thead>
          <tr>
            <th scope="col">Observation</th>
            <th scope="col">A / Keep</th>
            <th scope="col">B / Prepare</th>
          </tr>
        </thead>
        <tbody>
          {[
            [
              "Independent correctness",
              ...arms.map((arm) => arm?.verdict ?? "INSUFFICIENT_EVIDENCE"),
            ],
            [
              "Preparation",
              ...arms.map((arm) => value(arm?.preparation.elapsedMs, "ms")),
            ],
            [
              "Downstream",
              ...arms.map((arm) => value(arm?.downstream.elapsedMs, "ms")),
            ],
            [
              "Preparation-inclusive total",
              ...arms.map((arm) => value(arm?.total.elapsedMs, "ms")),
            ],
            [
              "Actual preparation-inclusive cost",
              ...arms.map((arm) => value(arm?.total.costUsd, "USD")),
            ],
            [
              "Preparation tokens",
              ...arms.map((arm) => value(arm?.preparation.tokens, "tokens")),
            ],
            [
              "Downstream tokens",
              ...arms.map((arm) => value(arm?.downstream.tokens, "tokens")),
            ],
            [
              "Preparation-inclusive tokens",
              ...arms.map((arm) => value(arm?.total.tokens, "tokens")),
            ],
            [
              "Observed downstream input / output",
              ...arms.map(
                (arm) =>
                  `${value(arm?.inputTokens, "tokens")} / ${value(arm?.outputTokens, "tokens")}`,
              ),
            ],
            [
              "Preparation iterations",
              ...arms.map((arm) =>
                value(arm?.preparation.iterations, "iterations"),
              ),
            ],
            [
              "Downstream iterations",
              ...arms.map((arm) =>
                value(arm?.downstream.iterations, "iterations"),
              ),
            ],
            [
              "Preparation-inclusive iterations",
              ...arms.map((arm) => value(arm?.total.iterations, "iterations")),
            ],
            [
              "Final source differences",
              ...arms.map((arm) => value(arm?.changedFileCount, "files")),
            ],
            [
              "Source differences including preparation",
              ...arms.map((arm) => value(arm?.totalChangedFileCount, "files")),
            ],
            [
              "Reserved allocation · not a charge",
              ...arms.map((arm) => value(arm?.reservedMicroUsd, "micro-USD")),
            ],
            [
              "Forbidden edges · baseline",
              ...metricArms.map((arm) =>
                value(arm?.baselineForbiddenEdges, "edges"),
              ),
            ],
            [
              "Forbidden edges · final",
              ...metricArms.map((arm) =>
                value(arm?.finalForbiddenEdges, "edges"),
              ),
            ],
            [
              "Selected rejection sites · baseline",
              ...metricArms.map((arm) => (arm ? "Not applicable" : "Unknown")),
            ],
            [
              "Selected forbidden rejection sites · final failures",
              ...metricArms.map((arm) =>
                value(arm?.finalAuthorizationFailures, "cases"),
              ),
            ],
            [
              "Study comparability",
              study?.comparability ?? "Unknown",
              study?.comparability ?? "Unknown",
            ],
          ].map(([label, a, b]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {metrics && (
        <details className="metric-scope">
          <summary>Exact measurement scope</summary>
          <p>
            Count distinct resolved forbidden static dependency pairs, retaining
            Unknown when coverage is incomplete.
          </p>
          <ul>
            {metrics.boundaryRules.map((rule) => (
              <li key={rule.id}>
                <code>
                  {rule.from} → {rule.to}
                </code>
              </li>
            ))}
          </ul>
          <p>
            Only {metrics.authorizationCaseIds.length} selected forbidden
            rejection cases:{" "}
            {metrics.authorizationCaseIds.map((id, index) => (
              <span key={id}>
                {index ? ", " : ""}
                <code>{id}</code>
              </span>
            ))}
            . No broader permission-matrix or HTTP coverage is inferred from
            this count.
          </p>
        </details>
      )}
      {metrics ? (
        <p className="metric-scope">
          B strictly fewer final forbidden edges than A:{" "}
          <strong>{metrics.predictionAssessment.replaceAll("_", " ")}</strong>.
          Recorded v3 observation, retained {metrics.recordedAt}; eligible
          observed pairs: {metrics.independentSamples}. Equal counts contradict
          the prediction. The four selected rejection-site observations are a
          subset of protected checks; they do not replace the full eight-check
          receipt or the Decision Report. Selected-site preservation:{" "}
          {metrics.authorizationPreserved === null
            ? "Unknown"
            : metrics.authorizationPreserved
              ? "preserved"
              : "not preserved"}
          .
        </p>
      ) : (
        <p className="metric-scope">
          No signed historical v3 measurements are available. Counts remain
          Unknown.
        </p>
      )}
    </div>
  );
}
