import type { PublicTournament } from "@/lib/experiment/tournament-publication";
const observed = (value: number | null, unit = "") =>
  value === null ? "Unknown" : `${value.toLocaleString("en-US")}${unit}`;
const money = (value: number | null) =>
  value === null ? "Unknown" : `$${value.toFixed(4)}`;
const conclusions = {
  INCONCLUSIVE: "The evidence does not support a comparison yet.",
  BOTH_VERIFIED:
    "Both architectures passed the required future-task checks. Compare their recorded effort with preparation included.",
  A_ONLY_VERIFIED:
    "Only A passed the required future-task checks in this case study.",
  B_ONLY_VERIFIED:
    "Only prepared B passed the required future-task checks in this case study.",
  BOTH_REJECTED: "Neither architecture passed all required future-task checks.",
};
export function TournamentStudy({ study }: { study: PublicTournament }) {
  const a = study.arms.find((x) => x.variant === "A")!,
    b = study.arms.find((x) => x.variant === "B")!;
  const rows: [string, (arm: PublicTournament["arms"][number]) => string][] = [
    ["Baseline correctness", (arm) => arm.baselineVerdict],
    ["Future-task correctness", (arm) => arm.verdict],
    ["Agent completion", (arm) => arm.status],
    ["Preparation time", (arm) => observed(arm.preparation.elapsedMs, " ms")],
    ["Downstream time", (arm) => observed(arm.downstream.elapsedMs, " ms")],
    [
      "Preparation-inclusive time",
      (arm) => observed(arm.total.elapsedMs, " ms"),
    ],
    [
      "Input / output tokens",
      (arm) => `${observed(arm.inputTokens)} / ${observed(arm.outputTokens)}`,
    ],
    ["Downstream actual cost", (arm) => money(arm.downstream.costUsd)],
    ["Preparation actual cost", (arm) => money(arm.preparation.costUsd)],
    ["Preparation-inclusive actual cost", (arm) => money(arm.total.costUsd)],
    ["Recorded iterations", (arm) => observed(arm.downstream.iterations)],
    [
      "Changed files / across both phases",
      (arm) =>
        `${observed(arm.changedFileCount)} / ${observed(arm.totalChangedFileCount)}`,
    ],
    [
      "Reserved allocation (not a charge)",
      (arm) =>
        arm.reservedMicroUsd === null
          ? "Unknown"
          : `${arm.reservedMicroUsd.toLocaleString("en-US")} microUSD`,
    ],
  ];
  return (
    <article
      className="study-record"
      aria-labelledby={`study-${study.studyId}`}
    >
      <header className="recording-heading">
        <div>
          <span className="eyebrow accent">
            Recorded case study / {study.studyId}
          </span>
          <h3 id={`study-${study.studyId}`}>{study.title}</h3>
        </div>
        <span className="text-badge">{study.comparability}</span>
      </header>
      <ol className="study-walkthrough">
        <li>
          <span className="study-step">01</span>
          <div>
            <h4>Before preparation / Architecture A</h4>
            <p>The original booking system is the unchanged comparison arm.</p>
            <p className="recording-hash">
              Commit {a.initialCommit}
              <br />
              Source tree {a.initialTreeSha256}
            </p>
          </div>
        </li>
        <li>
          <span className="study-step">02</span>
          <div>
            <h4>Future problem and reviewed proposal</h4>
            <p>{study.futureProblem}</p>
            <p>{study.reviewedProposal}</p>
            <p>
              <strong>Falsifiable hypothesis:</strong> {study.hypothesis}
            </p>
          </div>
        </li>
        <li>
          <span className="study-step">03</span>
          <div>
            <h4>After preparation / Architecture B</h4>
            <p className="recording-hash">
              Commit {b.initialCommit}
              <br />
              Prepared source tree {b.initialTreeSha256}
            </p>
            <p>
              Recorded preparation: {observed(b.preparation.elapsedMs, " ms")} ·{" "}
              {money(b.preparation.costUsd)}
            </p>
            {study.sourceComparison === null ? (
              <p className="study-unavailable">
                Source comparison unavailable. No reviewed source diff is
                approved for display.
              </p>
            ) : (
              <details>
                <summary>Inspect actual reviewed source changes</summary>
                <ul className="study-source-list">
                  {study.sourceComparison.map((file) => (
                    <li key={file.path}>
                      <strong>{file.path}</strong>
                      <span className="recording-hash">
                        Before: {file.beforeSha256 ?? "File absent"}
                        <br />
                        After: {file.afterSha256 ?? "File removed"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>
                  These are pinned file identities from the prepared source; the
                  architecture proposal remains a separate claim.
                </p>
              </details>
            )}
          </div>
        </li>
        <li>
          <span className="study-step">04</span>
          <div>
            <h4>One future coding challenge, two architectures</h4>
            <p>
              Both arms receive the identical complete team-permissions task,
              adapter, prompt, model, tools and limits. Trial order:{" "}
              {study.order === "A_then_B" ? "A → B" : "B → A"}.
            </p>
            <p className="mono">
              Task: {study.taskId} · Coding model: {study.model}
            </p>
          </div>
        </li>
        <li>
          <span className="study-step">05</span>
          <div>
            <h4>What was measured</h4>
            <div
              className="comparison-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`Results for ${study.studyId}`}
            >
              <table>
                <caption>
                  Preparation and downstream work · unknown values stay unknown
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Observation</th>
                    <th scope="col">A / Original</th>
                    <th scope="col">B / Prepared</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{value(a)}</td>
                      <td>{value(b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Time totals add recorded effort across phases. Reservations do not
              become measured charges. A faster downstream phase alone does not
              establish that preparation paid off.
            </p>
          </div>
        </li>
        <li>
          <span className="study-step">06</span>
          <div>
            <h4>Scoped conclusion</h4>
            <p>
              <strong>{study.correctness}</strong> ·{" "}
              {conclusions[study.correctness]}
            </p>
            {[...study.blockers, ...study.deviations].length > 0 && (
              <ul>
                {[...study.blockers, ...study.deviations].map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
      </ol>
      <details className="study-evidence">
        <summary>
          Evidence Laboratory / checks, commitments and chronology
        </summary>
        <div
          className="comparison-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`Required checks for ${study.studyId}`}
        >
          <table>
            <caption>
              All eight protected checks are required for each arm
            </caption>
            <thead>
              <tr>
                <th scope="col">Required check</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {a.checks.map((check) => (
                <tr key={check.id}>
                  <th scope="row">{check.id}</th>
                  <td>{check.status}</td>
                  <td>
                    {b.checks.find((x) => x.id === check.id)?.status ??
                      "not_run"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="recording-facts">
          {study.arms.map((arm) => (
            <div key={arm.variant}>
              <dt>Arm {arm.variant} / run and receipt</dt>
              <dd>
                {arm.runId ?? "Unavailable"}
                <br />
                {arm.receiptId ?? "No authenticated receipt"}
                <br />
                {arm.startedAt ?? "Unknown start"} →{" "}
                {arm.endedAt ?? "Unknown end"}
              </dd>
            </div>
          ))}
        </dl>
        <h4>All recorded downstream attempts</h4>
        <ul>
          {study.attempts.map((attempt) => (
            <li key={attempt.id}>
              {attempt.variant} / {attempt.id} · {attempt.status} ·{" "}
              {attempt.startedAt} → {attempt.endedAt}
            </li>
          ))}
        </ul>
        <h4>Preparation attempts, including failures</h4>
        <ul>
          {study.preparationAttempts.map((attempt) => (
            <li key={attempt.id}>
              {attempt.id} · {attempt.status} · {attempt.startedAt} →{" "}
              {attempt.finishedAt}
            </li>
          ))}
        </ul>
        <dl className="study-identities">
          {[
            ["Protocol original", study.protocolOriginalSha256],
            ["Prepared-study original", study.preparedOriginalSha256],
            ["Frozen conditions", study.definitionSha256],
            ["Complete future task", study.taskDefinitionSha256],
            ["Baseline evaluator", study.baselineEvaluatorSha256],
            ["Baseline suite", study.baselineSuiteSha256],
            ["Baseline policy", study.baselinePolicySha256],
            ["Future evaluator", study.futureEvaluatorSha256],
            ["Future suite", study.futureSuiteSha256],
            ["Future policy", study.futurePolicySha256],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="recording-hash">{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          The original private report and this exact projection required
          separate disclosure approval. Source receipts and approval are
          authenticated again when this page is served.
        </p>
      </details>
      <details className="study-evidence">
        <summary>Provenance and limitations</summary>
        <ul>
          {study.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
