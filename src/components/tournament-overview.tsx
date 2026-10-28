import Link from "next/link.js";
import { unprovisionedTournament } from "@/lib/experiment/report";

export function TournamentOverview() {
  const study = unprovisionedTournament();
  return (
    <section className="study-overview" aria-labelledby="study-heading">
      <span className="eyebrow accent">
        Architecture Tournament / {study.state}
      </span>
      <h2 id="study-heading">Does preparation pay for itself?</h2>
      <p>
        Proposed future requirement: team accounts with delegated booking
        permissions. Compare ordinary development from A with a narrowly
        prepared architecture B, counting the preparation. Exact permission
        semantics and protected future-task checks await independent
        preregistration.
      </p>
      <p>
        <strong>
          Comparability: {study.comparability} · Correctness:{" "}
          {study.correctness}
        </strong>
      </p>
      <div className="comparison-table-scroll">
        <table>
          <caption>
            Future-task comparison · NOT RUN / no authenticated arm receipts
          </caption>
          <thead>
            <tr>
              <th scope="col">Observation</th>
              <th scope="col">A / Status quo</th>
              <th scope="col">B / Prepared architecture</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Required correctness</th>
              {study.arms.map((arm) => (
                <td key={arm.variant}>{arm.verdict}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Initial / prepared / final source</th>
              <td>No study snapshots registered</td>
              <td>No study snapshots registered</td>
            </tr>
            <tr>
              <th scope="row">Upfront preparation</th>
              <td>
                No speculative preparation planned; observed effort unknown
              </td>
              <td>Unknown · no admitted preparation run</td>
            </tr>
            <tr>
              <th scope="row">Downstream time / attempts / files / lines</th>
              <td>Unknown</td>
              <td>Unknown</td>
            </tr>
            <tr>
              <th scope="row">Tokens / actual cost</th>
              <td>Unknown</td>
              <td>Unknown</td>
            </tr>
            <tr>
              <th scope="row">Preparation-inclusive total</th>
              <td>Unknown</td>
              <td>Unknown</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Scroll the comparison horizontally on narrow screens to inspect both
        arms.
      </p>
      <h3>What would make this comparable?</h3>
      <p>
        Identical initial source and visible roadmap; matching downstream task,
        agent, model, tools, runtime, budgets and protected policy; equivalent
        present-day correctness; isolated arms; all attempts retained; B
        preparation accounted separately.
      </p>
      <ul>
        {study.blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
      <h3>How results will be read</h3>
      <p>
        Both pass: correctness tie. One passes: a correctness advantage within
        this task. Both fail: neither is a verified winner. Missing authentic
        evidence or unequal conditions: inconclusive or not comparable.
        Secondary measurements remain separate, with no composite winning score.
      </p>
      <details>
        <summary>Limitations and evidence separation</summary>
        <ul>
          {study.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Historical fixed no-inference infrastructure checks cannot fill these
          arm results or certify a current modeled decision.
        </p>
      </details>
      <nav className="workflow-path" aria-label="Experiment workflow">
        <Link href="/#foresight">Review intent and Meta reasoning →</Link>
        <a href="#evidence-laboratory">Inspect Evidence Laboratory ↓</a>
        <Link href="/certificates" prefetch={false}>
          Scoped certificate availability →
        </Link>
      </nav>
    </section>
  );
}
