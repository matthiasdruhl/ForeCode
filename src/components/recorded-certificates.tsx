import Link from "next/link.js";
import type { CertificateCatalog } from "@/server/artifacts/recorded-certificates";
import { CertificateExport } from "./certificate-export";
import { Recording } from "./recorded-verification";

export function RecordedCertificatesView({
  catalog,
}: {
  catalog: CertificateCatalog;
}) {
  return (
    <>
      <a className="skip-link" href="#certificates">
        Skip to recorded certificates
      </a>
      <header className="topbar recording-topbar">
        <Link href="/" className="brand">
          forecode<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Workspace navigation" className="certificate-nav">
          <Link href="/" className="button-secondary">
            Back to workspace
          </Link>
          <Link href="/experiments" className="button-secondary">
            Recorded verification
          </Link>
        </nav>
      </header>
      <main id="certificates" className="recorded-evidence">
        <div className="page-heading">
          <div>
            <span className="eyebrow accent">04 / Read-only history</span>
            <h1>Recorded certificates.</h1>
            <p className="heading-description">
              Frozen historical references with fresh protected evidence checks
              at each retrieval.
            </p>
          </div>
        </div>
        <section
          className="recording-context"
          aria-labelledby="certificate-context"
        >
          <h2 id="certificate-context">
            Current comparison: modeled, developer-reviewed
          </h2>
          <p>
            The current modeled comparison has no linked measured experiment.
            Historical certificates are separate from current browser intents
            and worksheet decisions. Returning to the workspace starts its
            browser-memory session.
          </p>
          <p>
            Recorded presentation does not establish measured architecture
            evidence. A completed run can have rejected or insufficient
            protected checks. Unknown metrics remain unknown; genuine zero stays
            zero.
          </p>
        </section>
        {!catalog.reports.length && (
          <section
            className="recording-empty"
            aria-labelledby="no-certificates"
          >
            <span className="eyebrow">Evidence unavailable</span>
            <h2 id="no-certificates">
              No approved recorded certificates available.
            </h2>
            <p>
              Approved genuine run records, public disclosure approvals and
              authenticated evidence are required. Missing, changed or
              unconfigured sources provide no certificate to export. Production
              registrations are not provisioned.
            </p>
          </section>
        )}
        {catalog.reports.map((report) => (
          <section
            key={report.certificate.id}
            className="certificate-report"
            aria-labelledby={`certificate-${report.certificate.id}`}
          >
            <article className="recording-card">
              <span className="eyebrow">Recorded / scoped certificate</span>
              <h2 id={`certificate-${report.certificate.id}`}>
                {report.title}
              </h2>
              <p>{report.scope}</p>
              <p>{report.certificate.conclusion}</p>
              <dl className="recording-facts">
                <div>
                  <dt>Certificate</dt>
                  <dd>{report.certificate.id}</dd>
                </div>
                <div>
                  <dt>Approved historical baseline</dt>
                  <dd>{report.certificate.baselineCommit}</dd>
                </div>
                <div>
                  <dt>Generated at</dt>
                  <dd>{report.certificate.generatedAt}</dd>
                </div>
                <div>
                  <dt>Evidence origin</dt>
                  <dd>{report.certificate.evidenceOrigin}</dd>
                </div>
              </dl>
              <p className="recording-hash">
                Certificate byte integrity SHA-256:{" "}
                {report.certificate.artifactSha256}
              </p>
              <p>
                This hash is an integrity identity, not a signature or proof of
                independent evaluator custody. The download is a historical
                snapshot, not a signed attestation or independently
                re-verifiable copy of private evidence.
              </p>
              <p>
                The hash covers canonical certificate content with only its own
                artifactSha256 field omitted.
              </p>
              <p>
                Historical intent and scenario references: none. Decision: none.
                No matched A/B pairing, task binding or isolation evidence is
                supplied by this certificate.
              </p>
              <details>
                <summary>Exact source references and limitations</summary>
                <dl className="recording-facts">
                  <div>
                    <dt>Runs</dt>
                    <dd>{report.certificate.experimentRunIds.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Verifications</dt>
                    <dd>{report.certificate.verificationIds.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Receipts</dt>
                    <dd>{report.certificate.receiptIds.join(", ")}</dd>
                  </div>
                </dl>
                <ul>
                  {report.certificate.limitations.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </details>
              <CertificateExport
                id={report.certificate.id}
                digest={report.certificate.artifactSha256}
              />
            </article>
            {report.recordings.map((recording) => (
              <Recording key={recording.id} recording={recording} />
            ))}
          </section>
        ))}
        <footer className="workspace-footer">
          <p>
            Scoped protected checks do not establish experiment fairness,
            measured architecture benefit, Meta incremental advantage or sandbox
            containment.
          </p>
          <span>READ ONLY</span>
        </footer>
      </main>
    </>
  );
}
