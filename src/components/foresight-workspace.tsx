"use client";

import { useEffect, useRef, useState } from "react";
import type { IntentV1 } from "@/lib/contracts/intents";
import { VisibleScenarioV1Schema } from "@/lib/contracts/architecture";
import { ApiErrorSchema } from "@/lib/contracts/errors";
import { bookingGraph, bookingSummary } from "@/lib/foresight/booking-context";
import { canonicalJson } from "@/lib/report/canonical";
import {
  validateFlowOutput,
  type Step,
  type FlowRequest,
  type ProposeResponse,
  type HypothesizeResponse,
  type ChallengeResponse,
} from "@/lib/foresight/flow";
import { buildMetaPayload, META_LIMITS } from "@/lib/foresight/prompts";
import type { PublicForesightConfiguration } from "@/server/meta/configuration";

import { ReviewedComparison } from "./reviewed-comparison";
import { comparisonContext } from "@/lib/foresight/comparison";

type Configuration = PublicForesightConfiguration;
const labels: Record<Step, string> = {
  propose: "Propose A / B",
  hypothesize: "Form hypothesis",
  challenge: "Propose counterexample",
};
function Notes({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="research-notes">
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None stated.</p>
      )}
    </div>
  );
}
function Provenance({ provider }: { provider: ProposeResponse["provider"] }) {
  return (
    <p className="research-provenance">
      {provider.provider} · {provider.mode} · {provider.model ?? "No model"}
      <br />
      Prompt {provider.promptVersion ?? "Unknown"} · Response{" "}
      {provider.sourceEvidenceId ?? "None"}
      <br />
      Advisory proposal only. No architecture experiment yet. Usage/cost are not
      inferred from model text.
    </p>
  );
}
export function ForesightWorkspace({
  intents,
  configuration,
  editing,
}: {
  intents: IntentV1[];
  configuration: Configuration;
  editing: boolean;
}) {
  const [selected, setSelected] = useState(() =>
    intents
      .filter((x) => x.status === "confirmed")
      .slice(0, 24)
      .map((x) => x.id),
  );
  const [goal, setGoal] = useState(
    "Assess a bounded booking architecture change for these future requirements.",
  );
  const [run, setRun] = useState(0);
  const approved = intents.filter(
    (x) => x.status === "confirmed" && selected.includes(x.id),
  );
  const contextKey = canonicalJson({
    approved,
    goal,
    graph: bookingGraph,
    run,
    editing,
  });
  return (
    <section
      id="foresight"
      className="foresight-workspace"
      aria-labelledby="foresight-heading"
    >
      <div className="register-heading">
        <div>
          <span className="eyebrow accent">02 / Foresight</span>
          <h2 id="foresight-heading">Put the architecture under question.</h2>
          <p>
            Review the context. Compare A and B. Try to disprove one hypothesis.
          </p>
        </div>
        <span className="text-badge">Proposal only</span>
      </div>
      <div className="research-context">
        <h3>Reviewed booking context</h3>
        <p>{bookingSummary}</p>
        <p className="research-provenance">
          Standalone fixture · reviewed commit{" "}
          <code>{bookingGraph.repoCommit}</code> · partial manual coverage
        </p>
        <details>
          <summary>Inspect graph, paths and unknowns</summary>
          <ul className="module-list">
            {bookingGraph.modules.map((module) => (
              <li key={module.id}>
                <code>{module.path}</code>
                <span>{module.kind}</span>
              </li>
            ))}
          </ul>
          <p className="mono">
            {bookingGraph.edges
              .map((edge) => `${edge.from} → ${edge.to}`)
              .join(" · ")}
          </p>
          <Notes title="Coverage and unknowns" items={bookingGraph.unknowns} />
        </details>
        <fieldset className="intent-selection">
          <legend>Select confirmed requirements to share (up to 24)</legend>
          {intents
            .filter((x) => x.status === "confirmed")
            .map((intent) => (
              <label className="check-label" key={intent.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(intent.id)}
                  disabled={
                    editing ||
                    (!selected.includes(intent.id) && selected.length >= 24)
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, intent.id]
                        : selected.filter((id) => id !== intent.id),
                    )
                  }
                />
                <span>
                  {intent.title}{" "}
                  <span className="mono">revision {intent.revision}</span>
                  <small>{intent.statement}</small>
                </span>
              </label>
            ))}
          {!approved.length && (
            <p className="muted">
              Confirm and select a requirement before sharing.
            </p>
          )}
        </fieldset>
        <label htmlFor="research-goal">Research goal</label>
        <textarea
          id="research-goal"
          value={goal}
          maxLength={500}
          disabled={editing}
          onChange={(event) => setGoal(event.target.value)}
        />
        <p className="privacy-note">
          The first call sends only selected confirmed intents, this graph and
          your goal. It proposes visible scenarios for your next review. No
          heldout cases or offline grader reports are shared.
        </p>
      </div>
      <ForesightRun
        key={contextKey}
        intents={approved}
        goal={goal}
        configuration={configuration}
        blocked={editing}
      />
      <button
        className="button-secondary"
        type="button"
        onClick={() => setRun((n) => n + 1)}
      >
        Clear research / start again
      </button>
      <p className="privacy-note">
        Changes discard current results and sharing approval. Nothing is
        retained as current history. Reload clears this browser session. Offline
        infrastructure observations remain separate historical evidence.
      </p>
    </section>
  );
}
function ForesightRun({
  intents,
  goal,
  configuration,
  blocked,
}: {
  intents: IntentV1[];
  goal: string;
  configuration: Configuration;
  blocked: boolean;
}) {
  const [proposal, setProposal] = useState<ProposeResponse | null>(null);
  const [hypothesis, setHypothesis] = useState<HypothesizeResponse | null>(
    null,
  );
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const flight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flight.current?.abort();
      flight.current = null;
    };
  }, []);
  const step: Step = !proposal
    ? "propose"
    : !hypothesis
      ? "hypothesize"
      : "challenge";
  const common = { intents, graph: bookingGraph, consent: true as const };
  const payload: FlowRequest = !proposal
    ? { ...common, goal }
    : !hypothesis
      ? {
          ...common,
          goal,
          candidates: proposal.candidates,
          visibleScenarios: proposal.scenarios.map((scenario) =>
            VisibleScenarioV1Schema.parse(scenario),
          ),
        }
      : {
          ...common,
          candidates: proposal.candidates,
          visibleScenarios: proposal.scenarios.map((scenario) =>
            VisibleScenarioV1Schema.parse(scenario),
          ),
          hypotheses: hypothesis.hypotheses,
        };
  const ready = !blocked && intents.length > 0 && goal.trim().length > 0;
  async function send() {
    if (
      flight.current ||
      !approved ||
      !ready ||
      configuration.status !== "configured"
    )
      return;
    const controller = new AbortController();
    flight.current = controller;
    setLoading(true);
    setApproved(false);
    setMessage("");
    try {
      const response = await fetch(`/api/foresight/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      const raw: unknown = await response.json();
      if (
        controller.signal.aborted ||
        !mounted.current ||
        flight.current !== controller
      )
        return;
      if (!response.ok) {
        const error = ApiErrorSchema.safeParse(raw);
        setMessage(
          error.success
            ? `${error.data.error.code}: ${error.data.error.message} Retry requires reviewing and approving this payload again.`
            : "The request failed. Review and approve again to retry.",
        );
        return;
      }
      const output = validateFlowOutput(step, payload, raw);
      if (output.schemaVersion === "foresight-proposals.v1")
        setProposal(output);
      else if (output.schemaVersion === "scientist-hypotheses.v1")
        setHypothesis(output);
      else setChallenge(output);
      setMessage(
        "Response received for this exact reviewed snapshot. No experiment has run.",
      );
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setMessage(
          "No valid response received. Review and approve again to retry.",
        );
    } finally {
      if (mounted.current && flight.current === controller) {
        flight.current = null;
        setLoading(false);
      }
    }
  }
  function cancel() {
    flight.current?.abort();
    flight.current = null;
    setLoading(false);
    setApproved(false);
    setMessage(
      "Cancelled locally. An in-flight provider request may still incur charges. Review and approve again to retry.",
    );
  }
  return (
    <div className="research-run">
      {blocked && (
        <p className="form-error">
          Requirement editing is in progress. Confirm the revision before
          reviewing new research.
        </p>
      )}
      {proposal && (
        <section
          aria-labelledby="candidates-heading"
          className="research-result"
        >
          <h3 id="candidates-heading">A / B · architecture proposals</h3>
          <Provenance provider={proposal.provider} />
          <div className="candidate-grid">
            {proposal.candidates.map((candidate, i) => (
              <article key={candidate.id}>
                <span className="eyebrow accent">
                  {i === 0 ? "A / Status quo" : "B / Proposed alternative"}
                </span>
                <h4>{candidate.label}</h4>
                <p>{candidate.description}</p>
                <p className="modeled-cost">
                  {candidate.estimatedUpfrontCost} modeled effort points ·
                  upfront estimate
                </p>
                {candidate.changePlan.length ? (
                  <ul>
                    {candidate.changePlan.map((item, j) => (
                      <li key={j}>
                        <code>{item.module}</code> · {item.action}
                        <p>{item.rationale}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Empty change plan. Keep the current design.</p>
                )}
                {candidate.constraints.length > 0 && (
                  <Notes
                    title="Boundary constraints"
                    items={candidate.constraints.map(
                      (item) => `${item.kind}: ${item.from} → ${item.to}`,
                    )}
                  />
                )}
                <Notes title="Limitations" items={candidate.limitations} />
              </article>
            ))}
          </div>
          <h4>Visible proposed scenarios · never heldout</h4>
          {proposal.scenarios.map((scenario) => (
            <div className="visible-scenario" key={scenario.id}>
              <p>{scenario.request}</p>
              <Notes title="Assumptions" items={scenario.assumptions} />
              <small>
                {scenario.id} · {scenario.origin} · not frozen
              </small>
            </div>
          ))}
        </section>
      )}
      {proposal && (
        <ReviewedComparison
          key={canonicalJson({ intents, goal, graph: bookingGraph, proposal })}
          context={comparisonContext(intents, proposal)}
        />
      )}
      {hypothesis && (
        <section
          aria-labelledby="hypothesis-heading"
          className="research-result"
        >
          <h3 id="hypothesis-heading">One falsifiable hypothesis</h3>
          <Provenance provider={hypothesis.provider} />
          {hypothesis.hypotheses.map((item) => (
            <article key={item.id}>
              <h4>{item.statement}</h4>
              <p>{item.mechanism}</p>
              <dl className="hypothesis-prediction">
                <dt>Observable prediction</dt>
                <dd>
                  {item.prediction.metric} · {item.prediction.direction} ·{" "}
                  {item.prediction.expectedEffect}
                </dd>
                <dt>Falsified when</dt>
                <dd>{item.prediction.falsifiedWhen}</dd>
              </dl>
              <Notes title="Assumptions" items={item.assumptions} />
              <Notes title="Counterarguments" items={item.counterArguments} />
              <Notes title="Limitations" items={item.limitations} />
              <p className="research-provenance">
                Hypothesis {item.id} · candidate {item.candidateId} · baseline{" "}
                {item.baselineCommit}
                <br />
                Intents {item.intentIds.join(", ")} · visible scenarios{" "}
                {item.visibleScenarioIds.join(", ")}
              </p>
            </article>
          ))}
        </section>
      )}
      {challenge && (
        <section
          aria-labelledby="challenge-heading"
          className="research-result"
        >
          <h3 id="challenge-heading">One proposed counterexample</h3>
          <Provenance provider={challenge.provider} />
          {challenge.challenges.map((item) => (
            <article key={item.id}>
              <span className="text-badge">
                {item.reviewStatus} · {item.visibility}
              </span>
              <h4>{item.change.request}</h4>
              <p>{item.change.rationale}</p>
              <Notes
                title="Acceptance outline"
                items={item.change.acceptanceOutline}
              />
              <h4>How B could fail</h4>
              <p>{item.failureMechanism}</p>
              <h4>Potential disconfirmation</h4>
              <p>{item.potentialDisconfirmation}</p>
              <Notes title="Limitations" items={item.limitations} />
              <p className="research-provenance">
                Targets {item.hypothesisId} / {item.targetCandidateId} ·
                baseline {item.baselineCommit}
              </p>
            </article>
          ))}
          <p className="research-empty">
            Ready for human review. This proposal grants no experiment or
            coding-agent authority. No architecture effectiveness or product
            certificate has been established.
          </p>
        </section>
      )}
      {!challenge && (
        <section className="sharing-review" aria-labelledby="sharing-heading">
          <span className="eyebrow accent">
            Next deliberate action / {step}
          </span>
          <h3 id="sharing-heading">Review before sharing with Meta</h3>
          <p>
            Provider: Meta · model: {configuration.model ?? "Unconfigured"} ·
            live request if enabled.
          </p>
          {configuration.model?.endsWith("-contributor") && (
            <p className="contributor-warning">
              Contributor mode: Meta may use the content you send and its
              responses to train future models. This sharing approval includes
              that provider mode.
            </p>
          )}
          <details>
            <summary>Review exact outgoing payload</summary>
            <pre aria-label="Exact application payload">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
          <details>
            <summary>
              Inspect provider instructions and full request body
            </summary>
            <p>
              {configuration.endpoint} · Authorization supplied server-side and
              never displayed
            </p>
            <pre>
              {configuration.model
                ? JSON.stringify(
                    buildMetaPayload(step, payload, configuration.model),
                    null,
                    2,
                  )
                : "Select an approved server configuration first."}
            </pre>
          </details>
          <p className="privacy-note">
            One call · at most {META_LIMITS.outputTokens} output tokens
            including reasoning · {META_LIMITS.timeoutMs / 1000}s timeout · no
            automatic retries. Local limits do not enforce provider billing.
            Cancellation may not stop charges.
          </p>
          {configuration.status !== "configured" && (
            <p className="provider-state" role="status">
              Calls unavailable: {configuration.status}. Server configuration,
              account/model access, credits and explicit spending approval are
              required. Configuration alone does not verify access.
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={approved}
              disabled={!ready || loading}
              onChange={(event) => setApproved(event.target.checked)}
            />
            <span>
              {step === "propose"
                ? "I reviewed the graph, selected intents, goal and exact payload; share this with Meta."
                : step === "hypothesize"
                  ? "I approve these A/B candidates, visible scenarios and this exact hypothesis payload for Meta."
                  : "I approve this matching hypothesis and exact counterexample payload for Meta."}
            </span>
          </label>
          <div className="research-actions">
            <button
              className="button-primary"
              type="button"
              disabled={
                !ready ||
                !approved ||
                loading ||
                configuration.status !== "configured"
              }
              onClick={send}
            >
              {loading ? "Waiting for Meta…" : labels[step]}
            </button>
            {loading && (
              <button
                className="button-secondary"
                type="button"
                onClick={cancel}
              >
                Cancel request
              </button>
            )}
          </div>
        </section>
      )}
      <p className="live-notice" role="status">
        {message}
      </p>
    </div>
  );
}
