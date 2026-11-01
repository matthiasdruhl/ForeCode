import type { PublicTournament } from "@/lib/experiment/tournament-publication";
import type { EvidenceQuestion } from "@/lib/presentation/decision-memo";
export function EvidenceDetail({
  study,
  question,
}: {
  study?: PublicTournament;
  question: EvidenceQuestion;
}) {
  if (!study)
    return (
      <div className="evidence-detail">
        <span className="v6-kicker">EVIDENCE MISSING</span>
        <h3>No approved study to inspect.</h3>
        <p>
          {question === "checks"
            ? "Matching per-arm run IDs, fresh protected receipts, source identities, and required-check outcomes are missing."
            : question === "source"
              ? "Authenticated original, prepared, and final source bindings and actual preparation/downstream measurements are missing."
              : question === "fairness"
                ? "An eligible matched protocol, shared task, baseline checks, and frozen downstream conditions are missing."
                : "No study-linked Meta hypothesis or equally informed non-Meta control is available. The live research workflow requires your confirmed intent and explicit consent."}
        </p>
      </div>
    );
  return (
    <div className="evidence-detail">
      <span className="v6-kicker">APPROVED PUBLICATION / {study.studyId}</span>
      {question === "checks" ? (
        study.arms.map((arm) => (
          <section
            className="arm-evidence"
            id={`checks-${study.studyId}-${arm.variant}`}
            key={arm.variant}
          >
            <h3>
              {arm.variant} / {arm.verdict}
            </h3>
            <p>
              Run: {arm.runId ?? "Unavailable"} · Receipt:{" "}
              {arm.receiptId ?? "Unavailable"}
            </p>
            <ul>
              {arm.checks.map((check) => (
                <li key={check.id}>
                  <code>{check.id}</code>
                  <span>{check.status}</span>
                </li>
              ))}
            </ul>
            <p>
              Final tree: <code>{arm.finalTreeSha256 ?? "Unavailable"}</code>
            </p>
          </section>
        ))
      ) : question === "source" ? (
        <>
          <p>
            Preparation and downstream measurements are separate; missing values
            remain Unknown.
          </p>
          {study.arms.map((arm) => (
            <section className="arm-evidence" key={arm.variant}>
              <h3>{arm.variant} / recorded effort</h3>
              <dl>
                {(["preparation", "downstream", "total"] as const).map(
                  (phase) => (
                    <div key={phase}>
                      <dt>{phase}</dt>
                      <dd>
                        {arm[phase].elapsedMs === null
                          ? "Unknown time"
                          : `${arm[phase].elapsedMs} ms`}{" "}
                        ·{" "}
                        {arm[phase].costUsd === null
                          ? "Unknown cost"
                          : `$${arm[phase].costUsd}`}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </section>
          ))}
          <p>
            Approved preparation file comparison:{" "}
            {study.sourceComparison === null
              ? "Unavailable"
              : `${study.sourceComparison.length} file identities; no full dependency topology.`}
          </p>
          <code>Prepared study: {study.preparedOriginalSha256}</code>
        </>
      ) : question === "fairness" ? (
        <>
          <h3>{study.comparability}</h3>
          <dl>
            {[
              ["Task", study.taskId],
              ["Task definition", study.taskDefinitionSha256],
              ["Frozen conditions", study.definitionSha256],
              ["Protocol", study.protocolOriginalSha256],
              ["Baseline evaluator", study.baselineEvaluatorSha256],
              ["Future evaluator", study.futureEvaluatorSha256],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <code>{value}</code>
                </dd>
              </div>
            ))}
          </dl>
          <ul>
            {[...study.blockers, ...study.deviations].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3>Published hypothesis / proposal</h3>
          <p>{study.hypothesis}</p>
          <p>{study.reviewedProposal}</p>
          <p>
            The publication does not carry authenticated prospective Meta
            lineage or an equally informed C arm. No incremental Meta advantage
            is established.
          </p>
        </>
      )}
    </div>
  );
}
