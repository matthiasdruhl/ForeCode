/** A visual vocabulary, never an evidence classification or verifier. */
export function ProvenanceKey() {
  return (
    <details className="provenance-key">
      <summary>How to read the evidence</summary>
      <dl>
        {[
          [
            "conceptual",
            "Conceptual path",
            "Dashed relationships describe an approach; they are not observed edits.",
          ],
          [
            "reviewed",
            "Reviewed source",
            "Bounded paths in the Architecture Lab are tied to the reviewed source revision.",
          ],
          [
            "recorded",
            "Recorded comparison",
            "Published file and tree identities describe a bounded comparison, not dependency edges.",
          ],
          [
            "verified",
            "Independent observation",
            "Protected receipt and check outcomes have their own identities and scope.",
          ],
          [
            "context",
            "Published context",
            "Hypothesis and architecture metadata do not establish a recorded execution event.",
          ],
          [
            "unknown",
            "Unknown / unavailable",
            "Missing evidence stays missing. An empty mark is never a pass or zero effort.",
          ],
        ].map(([kind, label, explanation]) => (
          <div key={kind}>
            <dt>
              <span className={`provenance-mark ${kind}`} aria-hidden="true" />
              {label}
            </dt>
            <dd>{explanation}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
