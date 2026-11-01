"use client";
import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";
import {
  decisionMemo,
  type EvidenceQuestion,
} from "@/lib/presentation/decision-memo";
export function DecisionMemo({
  catalog,
  studyId,
  definitionSha256,
  inspect,
}: {
  catalog: DecisionReportCatalog;
  studyId?: string;
  definitionSha256?: string;
  inspect: (question: EvidenceQuestion, trigger: string) => void;
}) {
  const report = catalog.reports.find(
    (item) =>
      item.analysis.identity?.studyId === studyId &&
      (!definitionSha256 ||
        item.analysis.identity?.definitionSha256 === definitionSha256),
  );
  const memo = decisionMemo(report, catalog.state);
  return (
    <article className="decision-paper" aria-labelledby="memo-headline">
      <header className="memo-masthead">
        <strong>forecode.</strong>
        <span>
          ENGINEERING DECISION MEMO
          <br />
          {report?.analysis.identity?.studyId ??
            "BOOKING CASE / EVIDENCE PENDING"}
        </span>
      </header>
      <div className="memo-intro">
        <p className="memo-state">{memo.state}</p>
        <h1 id="memo-headline">{memo.headline}</h1>
        <p className="memo-lead">{memo.basis}</p>
      </div>
      <dl className="memo-facts">
        {[
          ["Decision scope", memo.scope],
          ["What was tested", memo.tested],
          ["What remains unknown", memo.unknown],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className="memo-reasons" aria-label="Evidence reasons">
        {memo.reasons.map((reason, index) => {
          const target = memo.targets[index] ?? "checks";
          const id = `memo-reason-${index + 1}`;
          return (
            <section className="memo-reason" key={id}>
              <span className="memo-number">0{index + 1}</span>
              <div>
                <p>{reason}</p>
                <button
                  id={id}
                  className="memo-inspect"
                  onClick={() => inspect(target, id)}
                >
                  Inspect{" "}
                  {target === "checks"
                    ? "required checks"
                    : target === "source"
                      ? "source & effort"
                      : target === "fairness"
                        ? "comparability"
                        : "hypothesis limits"}
                  <span aria-hidden="true"> ↗</span>
                </button>
              </div>
            </section>
          );
        })}
      </section>
      {report?.analysis.observations && (
        <section className="memo-effort">
          <h2>Effort, with preparation included.</h2>
          <dl>
            {report.analysis.observations.arms.map((arm) => (
              <div key={arm.variant}>
                <dt>{arm.variant} / Preparation → Downstream → Total</dt>
                <dd>
                  {[
                    arm.preparation.elapsedMs,
                    arm.downstream.elapsedMs,
                    arm.total.elapsedMs,
                  ]
                    .map((value) =>
                      value === null
                        ? "Unknown"
                        : `${value.toLocaleString("en-US")} ms`,
                    )
                    .join(" → ")}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Required-check correctness and effort are separate observations. A
            correctness tie does not establish an efficiency preference.
          </p>
        </section>
      )}
      <section className="memo-next">
        <span className="memo-kicker">WHAT TO DO NEXT</span>
        <h2>Make the next decision testable.</h2>
        <p>{memo.next}</p>
      </section>
      <section className="memo-limits">
        <h2>Scope & limitations</h2>
        <ul>
          {memo.limitations.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        {report && (
          <p>
            Provenance: fresh approved tournament loader · {report.support}.
            Projection:{" "}
            <code>{report.analysis.evidenceReferences?.projectionSha256}</code>
          </p>
        )}
        {catalog.unavailableCount > 0 && (
          <p>
            {catalog.unavailableCount} report(s) could not be authenticated and
            are excluded.
          </p>
        )}
      </section>
      <footer className="memo-footer">
        <span>Human review remains the decision.</span>
        <button onClick={() => window.print()}>Print decision memo ↗</button>
      </footer>
    </article>
  );
}
