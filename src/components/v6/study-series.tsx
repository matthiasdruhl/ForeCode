"use client";
import {
  projectStudySeries,
  type StudyCatalog,
} from "@/lib/presentation/study-series";
import { metricNames } from "@/lib/experiment/metrics";

const observed = (value: number | null) =>
  value === null
    ? "Unknown"
    : Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : String(value);
const metricLabels = {
  elapsedMs: "Elapsed (ms)",
  tokens: "Tokens",
  costUsd: "Reported cost (USD)",
  iterations: "Iterations",
  filesTouched: "Files touched",
};
export function StudySeries({
  catalog,
  selectedStudyId,
  onSelectStudy,
}: {
  catalog: StudyCatalog;
  selectedStudyId?: string;
  onSelectStudy: (studyId: string) => void;
}) {
  const series = projectStudySeries(catalog);
  return (
    <section className="study-series" aria-labelledby="study-series-heading">
      <header>
        <p className="v6-kicker">APPROVED PUBLICATION HISTORY</p>
        <h2 id="study-series-heading">Studies, kept in context.</h2>
      </header>
      <p>
        {series.entries.length} approved loaded{" "}
        {series.entries.length === 1 ? "study" : "studies"} ·{" "}
        {series.unavailableCount ?? "Unknown"} unavailable publications.
      </p>
      <p>
        Cross-study compatibility is unavailable: authenticated portable
        conditions and runner revision are not published. Every entry is
        UNCLASSIFIED. Equal visible identities do not establish compatibility.
      </p>
      <p>
        Counts cover approved publications only. Two arms belong to one study;
        they are not independent samples. Task IDs do not establish independent
        task-family counts.
      </p>
      {series.catalogInvalid ? (
        <p role="status">
          Study history unavailable: the catalog could not be displayed safely.
        </p>
      ) : series.entries.length === 0 ? (
        <p>
          {series.state === "empty"
            ? "No approved studies are loaded. No success rate can be inferred."
            : "Approved study publications are unavailable. No outcomes can be inferred."}
        </p>
      ) : (
        <>
          {series.entries.length === 1 && (
            <p>
              One study (N=1) cannot establish repeated evidence or
              generalization.
            </p>
          )}
          <ol className="study-series-list">
            {series.entries.map(({ study, compatibility }) => (
              <li key={study.studyId}>
                <div className="study-series-row">
                  <div>
                    <span className="v6-kicker">{compatibility}</span>
                    <h3>{study.title}</h3>
                    <code>{study.studyId}</code>
                    <p>
                      Task: <code>{study.taskId}</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={selectedStudyId === study.studyId}
                    onClick={() => onSelectStudy(study.studyId)}
                    aria-label={`Inspect study ${study.studyId}`}
                  >
                    {selectedStudyId === study.studyId
                      ? "Selected study"
                      : "Inspect study"}{" "}
                    ↗
                  </button>
                </div>
                <p>
                  Within-study comparison: {study.comparability} · Correctness:{" "}
                  {study.correctness}
                </p>
                <p>
                  {study.attempts.length} execution attempts ·{" "}
                  {study.preparationAttempts.length} preparation attempts
                </p>
                <ul className="study-series-arms">
                  {study.arms.map((arm) => (
                    <li key={arm.variant}>
                      {arm.variant} process: {arm.status} · Baseline verdict:{" "}
                      {arm.baselineVerdict} · Future-task verdict: {arm.verdict}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>Inspect identities, effort & all attempts</summary>
                  <dl className="study-series-identities">
                    {[
                      ["Study", study.studyId],
                      ["Task", study.taskId],
                      ["Task definition", study.taskDefinitionSha256],
                      ["Study definition", study.definitionSha256],
                      ["Protocol original", study.protocolOriginalSha256],
                      ["Prepared original", study.preparedOriginalSha256],
                      ["Model", study.model],
                      ["Arm order", study.order],
                      ...(
                        [
                          "baselineEvaluatorSha256",
                          "baselineSuiteSha256",
                          "baselinePolicySha256",
                          "futureEvaluatorSha256",
                          "futureSuiteSha256",
                          "futurePolicySha256",
                        ] as const
                      ).map((key) => [key, study[key]]),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          <code>{value}</code>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {study.arms.map((arm) => (
                    <section
                      key={arm.variant}
                      aria-label={`${study.studyId} arm ${arm.variant} accounting`}
                    >
                      <h4>{arm.variant} / Recorded effort</h4>
                      <p>
                        Reserved allocation (micro USD):{" "}
                        {observed(arm.reservedMicroUsd)}. An allocation is not
                        an actual charge.
                      </p>
                      <div
                        className="study-series-scroll"
                        role="region"
                        tabIndex={0}
                        aria-label={`${study.studyId} arm ${arm.variant} effort table`}
                      >
                        <table>
                          <caption>
                            Recorded values only; missing totals remain Unknown.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Measurement</th>
                              <th scope="col">Preparation</th>
                              <th scope="col">Downstream</th>
                              <th scope="col">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metricNames.map((metric) => (
                              <tr key={metric}>
                                <th scope="row">{metricLabels[metric]}</th>
                                {(
                                  [
                                    "preparation",
                                    "downstream",
                                    "total",
                                  ] as const
                                ).map((phase) => (
                                  <td key={phase}>
                                    {observed(arm[phase][metric])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <dl className="study-series-identities">
                        {(
                          [
                            "initialCommit",
                            "initialTreeSha256",
                            "finalTreeSha256",
                            "runId",
                            "baselineReceiptId",
                            "receiptId",
                          ] as const
                        ).map((key) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>
                              <code>{arm[key] ?? "Unavailable"}</code>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                  <h4>Execution attempts</h4>
                  <ul>
                    {study.attempts.map((attempt) => (
                      <li key={attempt.id}>
                        <code>{attempt.id}</code> · {attempt.variant} ·{" "}
                        {attempt.status} · {attempt.startedAt} →{" "}
                        {attempt.endedAt}
                      </li>
                    ))}
                  </ul>
                  <h4>Preparation attempts</h4>
                  <ul>
                    {study.preparationAttempts.map((attempt) => (
                      <li key={attempt.id}>
                        <code>{attempt.id}</code> · {attempt.status} ·{" "}
                        {attempt.startedAt} → {attempt.finishedAt}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Blockers: {study.blockers.join(", ") || "None published"}.
                    Deviations:{" "}
                    {study.deviations.join(", ") || "None published"}.
                  </p>
                  <ul>
                    {study.limitations.map((limit) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
