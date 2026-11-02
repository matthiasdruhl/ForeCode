export function EvidenceFeedbackStatus({ studyId }: { studyId?: string }) {
  return (
    <aside
      className="evidence-feedback-status"
      aria-label="Evidence feedback availability"
    >
      <section aria-labelledby="interpretation-status-heading">
        <h2 id="interpretation-status-heading">Meta result interpretation</h2>
        <p className="v6-kicker">Unavailable</p>
        <p>
          {studyId ? (
            <>
              Study <code>{studyId}</code> has no available linked
              interpretation.
            </>
          ) : (
            "No approved study is selected."
          )}
        </p>
        <p>
          This application has no approved current hypothesis-to-study lineage
          or provider-summary disclosure configured. Interpretation requires the
          original current hypothesis, prospectively bound study evidence, and
          separate permission to share the exact bounded summary with Meta.
        </p>
        <p>
          A historical trial cannot acquire a new original prediction after
          completion. If its hypothesis-to-study lineage has expired,
          interpretation must abstain.
        </p>
        <p>
          Any model interpretation would be an advisory assessment, separate
          from protected verification and the deterministic decision report.
        </p>
      </section>
      <section aria-labelledby="memory-status-heading">
        <h2 id="memory-status-heading">Evidence Memory / next proposal</h2>
        <p className="v6-kicker">Unavailable</p>
        <p>
          Approved admitted memory cases are not provisioned in this
          application. A supported consent-bound memory context for the next
          proposal is not yet installed.
        </p>
        <p>
          A published study is not an admitted memory case or permission to
          share results with Meta. No feedback has been sent. Learning, improved
          advice and Meta’s incremental benefit are not established.
        </p>
      </section>
    </aside>
  );
}
