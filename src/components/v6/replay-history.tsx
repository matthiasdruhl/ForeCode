import type { TournamentReplay, TournamentReplayCatalog } from "@/lib/replay";

const labels = {
  hypothesis: "Hypothesis",
  preparation: "Preparation",
  coding: "Coding",
  verification: "Independent verification",
  decision: "Engineering decision",
};

export function ReplayHistory({
  catalog,
  replay,
}: {
  catalog: TournamentReplayCatalog;
  replay?: TournamentReplay;
}) {
  return (
    <details className="publication-details replay-history">
      <summary>Inspect five-stage evidence replay</summary>
      <p>
        Conceptual stages only. No shared clock or global execution order is
        established. Arm outcomes summarize attempts; they are not extra runs.
      </p>
      {!replay && (
        <p>
          {catalog.state === "unavailable"
            ? "Approved publication unavailable. Replay evidence cannot be loaded."
            : "No approved study is available. These stages contain no observed events."}
        </p>
      )}
      <ol>
        {(replay?.stages ?? catalog.stages).map((stage) => (
          <li key={stage.stage}>
            <strong>{labels[stage.stage]}</strong>
            {replay ? (
              <ul>
                {replay.events
                  .filter((event) => event.stage === stage.stage)
                  .map((event) => (
                    <li key={event.id}>
                      <strong>
                        {event.variant ? `${event.variant} / ` : ""}
                        {event.label}
                      </strong>
                      {" · "}
                      {event.availability.replaceAll("_", " ")}
                      <p>{event.description}</p>
                      {event.timing.state !== "unknown" && (
                        <p>
                          Interval: {event.timing.state.replaceAll("_", " ")}
                          {" · "}
                          {event.timing.startedAt ?? "start unknown"}
                          {" → "}
                          {event.timing.endedAt ?? "end unknown"}
                        </p>
                      )}
                      {event.evidence.length > 0 && (
                        <details>
                          <summary>Published evidence identities</summary>
                          <ul>
                            {event.evidence.map((reference, index) => (
                              <li key={index}>
                                {reference.selector.kind.replaceAll("_", " ")}
                                {reference.runId && ` · run ${reference.runId}`}
                                {reference.receiptId &&
                                  ` · receipt ${reference.receiptId}`}
                                {reference.sourceTreeSha256 &&
                                  ` · tree ${reference.sourceTreeSha256}`}
                                {reference.checkId &&
                                  ` · check ${reference.checkId}`}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              <p>
                {catalog.state === "unavailable"
                  ? "Publication unavailable"
                  : "Unknown"}
              </p>
            )}
          </li>
        ))}
      </ol>
      {replay && (
        <>
          <p>
            Read-only projection of the approved catalog. Projection digest:{" "}
            <code>{replay.projectionSha256}</code>. The projection does not
            independently authenticate evidence or supply a Decision Report.
          </p>
          <ul aria-label="Replay missing evidence">
            {replay.missing.map((missing, index) => (
              <li key={index}>
                {missing.variant ? `${missing.variant} / ` : ""}
                {missing.code.replaceAll("_", " ").toLowerCase()}
              </li>
            ))}
          </ul>
          <ul aria-label="Replay limitations">
            {replay.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
