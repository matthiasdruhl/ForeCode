"use client";

import { useState } from "react";
import Link from "next/link.js";
import { createExperimentalHandoff } from "@/lib/foresight/handoff";
import { canonicalJson } from "@/lib/report/canonical";

export function ResearchHandoff({ research }: { research: unknown }) {
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  function download() {
    if (!reviewed) return;
    try {
      const handoff = createExperimentalHandoff(research, { reviewed: true });
      const url = URL.createObjectURL(
        new Blob([canonicalJson(handoff)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "forecode-research-handoff.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Research exported for independent review. No experiment was authorized or launched.",
      );
    } catch {
      setNotice(
        "The research relationships could not be validated. Start a fresh research flow.",
      );
    }
  }
  return (
    <section className="research-handoff" aria-labelledby="handoff-heading">
      <span className="eyebrow accent">
        Next / independent experimental review
      </span>
      <h3 id="handoff-heading">Review the research handoff.</h3>
      <p>
        Inspect the exact intent revisions, graph, alternatives, hypothesis and
        proposed challenge. Each stage keeps its provider provenance. This
        export contains your shared text.
      </p>
      <details>
        <summary>Inspect research snapshots to export</summary>
        <pre aria-label="Research snapshots">
          {JSON.stringify(research, null, 2)}
        </pre>
      </details>
      <label className="check-label">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => {
            setReviewed(event.target.checked);
            setNotice("");
          }}
        />
        <span>
          I reviewed this research proposal for an independent experimental
          review.
        </span>
      </label>
      <button
        className="button-secondary"
        type="button"
        disabled={!reviewed}
        onClick={download}
      >
        Export research handoff
      </button>
      <p>
        No execution authority. A separately approved frozen task, fairness
        preregistration, sandbox admission and spending envelope are still
        required. The proposed challenge remains a non-heldout proposal and
        supplies no protected evaluation authority.
      </p>
      <nav className="workflow-path" aria-label="Research evidence follow-up">
        <Link href="/experiments" prefetch={false}>
          Inspect experiment readiness →
        </Link>
        <Link href="/certificates" prefetch={false}>
          Inspect scoped certificates →
        </Link>
      </nav>
      <p role="status">{notice}</p>
    </section>
  );
}
