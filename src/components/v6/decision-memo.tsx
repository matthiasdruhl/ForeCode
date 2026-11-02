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
  projectionSha256,
  inspect,
  requirement = "Team permissions: delegate who can create, reschedule and cancel bookings.",
}: {
  catalog: DecisionReportCatalog;
  studyId?: string;
  definitionSha256?: string;
  projectionSha256?: string;
  inspect: (question: EvidenceQuestion, trigger: string) => void;
  requirement?: string;
}) {
  const report = catalog.reports.find(
    (item) =>
      item.analysis.identity?.studyId === studyId &&
      Boolean(projectionSha256) &&
      item.analysis.evidenceReferences?.projectionSha256 === projectionSha256 &&
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
        <p className="memo-recommendation">
          RECOMMENDATION / {report?.analysis.decision ?? "INCONCLUSIVE"}
        </p>
        <h1 id="memo-headline">{memo.headline}</h1>
        <p className="memo-lead">{memo.basis}</p>
      </div>
      <section
        className="memo-subject"
        aria-label="Future requirement under evaluation"
      >
        <span className="memo-kicker">THE FUTURE REQUIREMENT</span>
        <p>{report?.analysis.question ?? requirement}</p>
      </section>
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
      <section
        className="memo-observations"
        aria-label="Independent correctness observations"
      >
        <h2>Independent correctness</h2>
        <p>
          Per-arm required-check outcomes. These are separate from the
          architectural recommendation.
        </p>
        <div className="memo-arm-pair">
          {(["A", "B"] as const).map((variant) => {
            const arm = report?.analysis.observations?.arms.find(
              (item) => item.variant === variant,
            );
            return (
              <div key={variant}>
                <span>
                  {variant} / {variant === "A" ? "CURRENT" : "PREPARED"}
                </span>
                <strong>{arm?.verdict ?? "Unknown"}</strong>
                <p>
                  {arm?.receiptId ? (
                    <>
                      Receipt: <code>{arm.receiptId}</code>
                    </>
                  ) : (
                    "No matching protected receipt available."
                  )}
                </p>
              </div>
            );
          })}
        </div>
        <button
          id="memo-observations"
          className="memo-inspect"
          onClick={() => inspect("checks", "memo-observations")}
        >
          Inspect checks & receipt bindings <span aria-hidden="true">↗</span>
        </button>
      </section>
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
      <section className="memo-effort">
        <h2>Effort, with preparation included.</h2>
        <div
          className="memo-effort-scroll"
          role="region"
          aria-label="Preparation and downstream elapsed time"
          tabIndex={0}
        >
          <table>
            <caption>
              Recorded elapsed time (ms). Missing measurements remain Unknown.
            </caption>
            <thead>
              <tr>
                <th scope="col">Approach</th>
                <th scope="col">Preparation</th>
                <th scope="col">Downstream</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).map((variant) => {
                const arm = report?.analysis.observations?.arms.find(
                  (item) => item.variant === variant,
                );
                return (
                  <tr key={variant}>
                    <th scope="row">
                      {variant} / {variant === "A" ? "Current" : "Prepared"}
                    </th>
                    {(["preparation", "downstream", "total"] as const).map(
                      (phase) => (
                        <td key={phase}>
                          {arm?.[phase].elapsedMs == null
                            ? "Unknown"
                            : arm[phase].elapsedMs.toLocaleString("en-US")}
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Required-check correctness and effort are separate observations. A
          correctness tie does not establish an efficiency preference.
        </p>
        <button
          id="memo-effort"
          className="memo-inspect"
          onClick={() => inspect("source", "memo-effort")}
        >
          Inspect source & full effort accounting{" "}
          <span aria-hidden="true">↗</span>
        </button>
      </section>
      <section className="memo-next">
        <span className="memo-kicker">WHAT TO DO NEXT</span>
        <h2>Make the next decision testable.</h2>
        <p>{memo.next}</p>
      </section>
      {report?.analysis.identity && (
        <section
          className="memo-identities"
          aria-label="Exact evaluation subject"
        >
          <h2>Exact evaluation subject</h2>
          <dl>
            {[
              ["Study", report.analysis.identity.studyId],
              ["Task", report.analysis.identity.taskId],
              [
                "Task definition",
                report.analysis.identity.taskDefinitionSha256,
              ],
              ["Conditions", report.analysis.identity.definitionSha256],
              ["Protocol", report.analysis.identity.protocolOriginalSha256],
              [
                "Publication",
                report.analysis.evidenceReferences?.projectionSha256,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <code>{value}</code>
                </dd>
              </div>
            ))}
          </dl>
          {report.analysis.observations?.arms.map((arm) => (
            <dl key={arm.variant} aria-label={`${arm.variant} source lineage`}>
              <div>
                <dt>{arm.variant} / Initial tree</dt>
                <dd>
                  <code>{arm.initialTreeSha256 ?? "Unavailable"}</code>
                </dd>
              </div>
              <div>
                <dt>{arm.variant} / Final tree</dt>
                <dd>
                  <code>{arm.finalTreeSha256 ?? "Unavailable"}</code>
                </dd>
              </div>
              <div>
                <dt>{arm.variant} / Run</dt>
                <dd>
                  <code>{arm.runId ?? "Unavailable"}</code>
                </dd>
              </div>
            </dl>
          ))}
        </section>
      )}
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
