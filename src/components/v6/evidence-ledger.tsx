import type { PublicProspectiveEvidence } from "@/lib/experiment/prospective-publication";
import type { PublicTournament } from "@/lib/experiment/tournament-publication";
import type { EvidenceQuestion } from "@/lib/presentation/decision-memo";
export function EvidenceDetail({
  study,
  question,
  prospective,
}: {
  study?: PublicTournament;
  question: EvidenceQuestion;
  prospective?: PublicProspectiveEvidence;
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
      ) : prospective ? (
        <>
          <span className="v6-kicker">SIGNED ARCHIVAL EVIDENCE</span>
          <section className="arm-evidence">
            <h4>Review and custody provenance · not blind</h4>
            <p>
              Owner-designated AI reviewed and held records on a shared host and
              context; possible key access is not excluded. Signed custody does
              not establish human, organizational or blind independence.
            </p>
            <p>{prospective.reviewProvenance.priorExposureSummary}</p>
            <p>
              Known prior studies:{" "}
              {prospective.reviewProvenance.priorStudyIds.length
                ? prospective.reviewProvenance.priorStudyIds.map(
                    (id, index) => (
                      <span key={id}>
                        {index ? ", " : ""}
                        <code>{id}</code>
                      </span>
                    ),
                  )
                : "None disclosed"}
              .
            </p>
          </section>
          <section className="arm-evidence">
            <h4>Scope and limitations</h4>
            <ul>
              {prospective.scopeLimitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </section>
          <h3>Recorded Meta hypothesis</h3>
          <p>{prospective.lineage.hypothesisStatement}</p>
          <p>{prospective.lineage.proposalSummary}</p>
          <h4>Model-generated challenge · advisory</h4>
          <p>{prospective.lineage.challengeSummary}</p>
          <p>
            The challenge was visible and was not a held-out evaluator or a
            replacement for the frozen task.
          </p>
          <dl>
            <div>
              <dt>Issued hypothesis</dt>
              <dd>
                <code>{prospective.lineage.hypothesisId}</code>
              </dd>
            </div>
            <div>
              <dt>Selected candidate</dt>
              <dd>{prospective.lineage.selectedCandidateId}</dd>
            </div>
            <div>
              <dt>Registered / selected</dt>
              <dd>
                {prospective.lineage.registeredAt} /{" "}
                {prospective.lineage.selectedAt}
              </dd>
            </div>
          </dl>
          {prospective.lineage.stages.map((stage) => (
            <section className="arm-evidence" key={stage.stage}>
              <h4>
                {stage.stage} / {stage.modelId}
              </h4>
              <p>
                Accepted {stage.acceptedAt} · Meta live response, recorded
                historically.
              </p>
              <dl>
                <div>
                  <dt>Input / output tokens</dt>
                  <dd>
                    {stage.inputTokens ?? "Unknown"} /{" "}
                    {stage.outputTokens ?? "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt>Reserved allocation · not a charge</dt>
                  <dd>
                    {stage.reservedMicroUsd === null
                      ? "Unknown"
                      : `${stage.reservedMicroUsd} micro-USD`}
                  </dd>
                </div>
                <div>
                  <dt>Actual charge</dt>
                  <dd>Unknown</dd>
                </div>
                <div>
                  <dt>Approved request SHA</dt>
                  <dd>
                    <code>{stage.approvedRequestSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Accepted response SHA</dt>
                  <dd>
                    <code>{stage.acceptedResponseSha256}</code>
                  </dd>
                </div>
              </dl>
            </section>
          ))}
          {prospective.metrics && (
            <section className="arm-evidence">
              <h4>Exact v3 measurement scope</h4>
              <ul>
                {prospective.metrics.boundaryRules.map((rule) => (
                  <li key={rule.id}>
                    <code>
                      {rule.from} → {rule.to}
                    </code>
                  </li>
                ))}
              </ul>
              <p>
                Selected forbidden rejection cases (
                {prospective.metrics.authorizationCaseIds.length}):{" "}
                {prospective.metrics.authorizationCaseIds.map((id, index) => (
                  <span key={id}>
                    {index ? ", " : ""}
                    <code>{id}</code>
                  </span>
                ))}
                . These observed sites are a subset of the protected checks and
                do not replace the full eight-check receipt.
              </p>
            </section>
          )}
          <p>
            This disclosure preserves historical lineage; it grants no current
            model issuance or execution authority. One A/B pair has no equally
            informed C arm and establishes no incremental Meta advantage.
          </p>
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
