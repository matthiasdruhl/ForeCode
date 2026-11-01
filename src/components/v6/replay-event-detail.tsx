import type { ReplayEvent } from "@/lib/replay";

export function replayEventKind(event: ReplayEvent) {
  if (event.basis === "unavailable_stage") return "Unknown / unavailable";
  if (event.data.kind === "source_comparison") return "Recorded comparison";
  if (event.basis === "approved_metadata_context") return "Published context";
  if (
    event.data.kind === "independent_verification" ||
    event.data.kind === "independent_check"
  )
    return "Independent observation";
  return "Recorded event";
}
export function ReplayEventProvenance({ event }: { event: ReplayEvent }) {
  const kind =
    event.basis === "unavailable_stage"
      ? "unknown"
      : event.basis === "approved_metadata_context"
        ? "context"
        : event.data.kind === "independent_check" ||
            event.data.kind === "independent_verification"
          ? "verified"
          : "recorded";
  return (
    <span className="replay-kind">
      <span className={`provenance-mark ${kind}`} aria-hidden="true" />
      {replayEventKind(event)}
    </span>
  );
}

/** Retains raw intervals and exact selectors without inventing receipt URLs. */
export function ReplayEventDetail({ event }: { event: ReplayEvent }) {
  const data = event.data;
  return (
    <div className="replay-event-detail">
      <p>{event.description}</p>
      {data.kind === "research_context" && (
        <>
          <p>Hypothesis: {data.hypothesis}</p>
          <p>Reviewed proposal: {data.reviewedProposal}</p>
        </>
      )}
      {(data.kind === "independent_verification" ||
        data.kind === "independent_check") && (
        <p>
          {data.kind === "independent_verification"
            ? `${data.phase} verdict: ${data.verdict}`
            : `${data.checkId}: ${data.status}`}
        </p>
      )}
      {(data.kind === "coding_attempt" ||
        data.kind === "preparation_attempt") && (
        <p>
          Attempt: <code>{data.attemptId}</code> · {data.status}
        </p>
      )}
      {data.kind === "arm_outcome" && (
        <p>
          Recorded arm state: {data.status}. This is not an additional attempt.
        </p>
      )}
      {data.kind === "engineering_decision" && (
        <p>
          {data.comparability} · {data.correctness}. The separate Decision
          Report supplies the recommendation.
        </p>
      )}
      {data.kind === "source_comparison" && (
        <>
          <p>
            Arm-unassigned published file identities. No source bodies, phase
            assignment or dependency topology is implied.
          </p>
          <ul className="source-file-list">
            {data.comparisons.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span>Before: {file.beforeSha256 ?? "File absent"}</span>
                <span>After: {file.afterSha256 ?? "File removed"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="replay-interval">
        Interval: {event.timing.state.replaceAll("_", " ")}
        {event.timing.state !== "unknown" && (
          <>
            {" "}
            · <code>{event.timing.startedAt ?? "start unknown"}</code> →{" "}
            <code>{event.timing.endedAt ?? "end unknown"}</code>
          </>
        )}
      </p>
      {event.timing.issues.length > 0 && (
        <ul aria-label="Interval limitations">
          {event.timing.issues.map((issue) => (
            <li key={issue}>{issue.replaceAll("_", " ")}</li>
          ))}
        </ul>
      )}
      {event.evidence.length > 0 && (
        <details className="replay-identities">
          <summary>Published evidence identities</summary>
          {event.evidence.map((reference, index) => (
            <dl key={index}>
              <div>
                <dt>Selector</dt>
                <dd>{reference.selector.kind.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Study</dt>
                <dd>
                  <code>{reference.studyId}</code>
                </dd>
              </div>
              {reference.variant && (
                <div>
                  <dt>Arm</dt>
                  <dd>{reference.variant}</dd>
                </div>
              )}
              {"attemptId" in reference.selector && (
                <div>
                  <dt>Attempt</dt>
                  <dd>
                    <code>{reference.selector.attemptId}</code>
                  </dd>
                </div>
              )}
              {[
                ["Run", reference.runId],
                ["Receipt", reference.receiptId],
                ["Source tree", reference.sourceTreeSha256],
                ["Check", reference.checkId],
              ].map(
                ([label, value]) =>
                  value && (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <code>{value}</code>
                      </dd>
                    </div>
                  ),
              )}
              {reference.comparison && (
                <div>
                  <dt>Compared path</dt>
                  <dd>
                    <code>{reference.comparison.path}</code>
                  </dd>
                </div>
              )}
            </dl>
          ))}
        </details>
      )}
    </div>
  );
}
