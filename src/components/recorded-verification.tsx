import Link from "next/link.js";
import { TournamentOverview } from "./tournament-overview";
import type {
  RecordedCatalogView,
  RecordedVerification,
} from "@/server/artifacts/recorded-verification";

const identityLabels = {
  evaluatedTreeSha256: "Evaluated source tree",
  fixtureSha256: "Fixture",
  evaluatorSha256: "Evaluator",
  testSuiteSha256: "Check suite",
  requiredPolicySha256: "Required policy",
  checkArtifactSha256: "Original check collection",
  manifestSha256: "Original receipt manifest",
};
const metricLabels = {
  elapsedMs: "Elapsed (ms)",
  tokens: "Tokens",
  costUsd: "Cost (USD)",
  iterations: "Iterations",
  filesTouched: "Files touched",
};

export function Recording({ recording }: { recording: RecordedVerification }) {
  return (
    <article
      className="recording-card"
      aria-labelledby={`recording-${recording.id}`}
    >
      <header className="recording-heading">
        <div>
          <span className="eyebrow">
            Recorded /{" "}
            {recording.category === "infrastructure_acceptance"
              ? "Infrastructure acceptance"
              : "Protected checks"}
          </span>
          <h2 id={`recording-${recording.id}`}>{recording.title}</h2>
        </div>
        <span className="text-badge">
          {recording.verdict === "VERIFIED"
            ? "VERIFIED · scoped"
            : recording.verdict}
        </span>
      </header>
      <p>{recording.scope}</p>
      <p>
        Acceptance covers only the pinned required checks on the evaluated
        source tree.
      </p>
      {recording.category === "infrastructure_acceptance" && (
        <p>Infrastructure acceptance, not an architecture experiment.</p>
      )}
      <dl className="recording-facts">
        <div>
          <dt>Recording</dt>
          <dd>{recording.id}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>{recording.runId}</dd>
        </div>
        <div>
          <dt>Run completion</dt>
          <dd>{recording.runStatus ?? "Unknown — no run record supplied"}</dd>
        </div>
        <div>
          <dt>Check acceptance</dt>
          <dd>{recording.verdict}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>{recording.receiptId}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{recording.verificationId}</dd>
        </div>
      </dl>
      <p>
        Completed means execution ended; it does not mean VERIFIED. A trusted
        required failure is REJECTED, even if another required check is missing.
        Every required check must pass for scoped VERIFIED; otherwise evidence
        is INSUFFICIENT_EVIDENCE.
      </p>
      <h3>Protected check outcomes</h3>
      <ul
        className="recording-checks"
        aria-label={`Checks for ${recording.id}`}
      >
        {recording.checks.map((check) => (
          <li key={check.id}>
            <div className="recording-heading">
              <strong>{check.label}</strong>
              <span className="mono">
                {check.required ? "Required" : "Optional"} · {check.status}
              </span>
            </div>
            <p>{check.description}</p>
            <p className="mono">
              Check {check.id} · Run {recording.runId}
            </p>
            {check.artifactSha256 !== null && (
              <p className="recording-hash">
                Original evidence SHA-256: {check.artifactSha256}
              </p>
            )}
          </li>
        ))}
      </ul>
      <h3>Observed run metrics</h3>
      <p>
        Separately approved run metadata; protected check authentication does
        not independently establish these metrics. Unknown includes absent or
        unpublished values.
      </p>
      <dl className="recording-facts">
        {recording.metrics.map((metric) => (
          <div key={metric.name}>
            <dt>{metricLabels[metric.name]}</dt>
            <dd>{metric.value === null ? "Unknown" : String(metric.value)}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Approved integrity identities</summary>
        {recording.identities.length ? (
          <dl className="recording-identities">
            {recording.identities.map((identity) => (
              <div key={identity.name}>
                <dt>{identityLabels[identity.name]} / SHA-256</dt>
                <dd>{identity.sha256}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>No integrity identities approved for display.</p>
        )}
        <p>
          These identities refer to the original artifacts. This sanitized view
          is not the original hashed artifact and cannot independently re-verify
          its bytes.
        </p>
      </details>
      <h3>Limits of this recording</h3>
      <p>
        No matched A/B pairing, current intent linkage, task binding or
        isolation evidence is supplied by this view. Protected checks do not
        establish experiment fairness, measured architecture benefit, Meta
        incremental advantage or sandbox containment.
      </p>
      {recording.limitations.length > 0 && (
        <ul>
          {recording.limitations.map((limitation, index) => (
            <li key={index}>{limitation}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function RecordedVerificationView({
  catalog,
}: {
  catalog: RecordedCatalogView;
}) {
  const available = catalog.recordings.some(
    (recording) => recording.state === "available",
  );
  return (
    <>
      <a className="skip-link" href="#recorded-evidence">
        Skip to recorded evidence
      </a>
      <header className="topbar recording-topbar">
        <Link href="/" className="brand">
          forecode<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Workspace navigation" className="certificate-nav">
          <Link href="/" className="button-secondary">
            Back to workspace
          </Link>
          <Link href="/certificates" className="button-secondary">
            Recorded certificates
          </Link>
        </nav>
      </header>
      <main id="recorded-evidence" className="recorded-evidence">
        <div className="page-heading">
          <div>
            <span className="eyebrow accent">03 / Read-only history</span>
            <h1>Recorded verification.</h1>
            <p className="heading-description">
              Historical protected check results, authenticated when this view
              is served.
            </p>
          </div>
        </div>
        <TournamentOverview />
        <section
          className="recording-context"
          aria-labelledby="modeled-context"
        >
          <h2 id="modeled-context">
            Current comparison: modeled, developer-reviewed
          </h2>
          <p>
            The current modeled comparison has no linked measured experiment.
            Historical recordings are separate from your current intent and
            worksheet. Editing an intent does not rewrite history or associate a
            recording with a new proposal.
          </p>
          <p>
            Opening the workspace starts its browser-memory session. This
            history requires no confirmed intent, provider configuration or
            inference.
          </p>
        </section>
        <h2 id="evidence-laboratory">
          Evidence Laboratory / recorded protected checks
        </h2>
        {!available && (
          <section className="recording-empty" aria-labelledby="no-recordings">
            <span className="eyebrow">Evidence unavailable</span>
            <h2 id="no-recordings">No approved recorded evidence available</h2>
            <p>
              {catalog.state === "empty"
                ? "Recordings are not provisioned. No approved catalog is configured."
                : "Approved evidence could not be authenticated for display."}
            </p>
            <p>
              There is no trusted success to display. Missing, changed, stale or
              unauthenticated sources remain unavailable. Registration and
              publication require separate operator approval.
            </p>
          </section>
        )}
        {catalog.recordings.map((recording) =>
          recording.state === "available" ? (
            <Recording key={recording.id} recording={recording} />
          ) : (
            <article
              key={recording.id}
              className="recording-card"
              aria-label={`Unavailable recording ${recording.id}`}
            >
              <span className="eyebrow">Recorded / unavailable</span>
              <h2>{recording.title}</h2>
              <p>
                Recording {recording.id} could not be authenticated for display.
                No trusted verdict is available.
              </p>
            </article>
          ),
        )}
        <footer className="workspace-footer">
          <p>
            Recorded checks are scoped evidence. Architecture fairness, measured
            benefit, Meta advantage and sandbox containment require separate
            evidence.
          </p>
          <span>READ ONLY</span>
        </footer>
      </main>
    </>
  );
}
