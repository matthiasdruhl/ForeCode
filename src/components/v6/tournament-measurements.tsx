import type { PublicTournament } from "@/lib/experiment/tournament-publication";
export function MeasurementRail({ study }: { study?: PublicTournament }) {
  const value = (number: number | null | undefined, unit: string) =>
    number == null ? "Unknown" : `${number.toLocaleString("en-US")} ${unit}`;
  const arms = (["A", "B"] as const).map((variant) =>
    study?.arms.find((arm) => arm.variant === variant),
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
    </div>
  );
}
