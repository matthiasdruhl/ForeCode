"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ForesightWorkspace } from "./foresight-workspace";
import type { PublicForesightConfiguration } from "@/server/meta/configuration";
import type { IntentV1 } from "@/lib/contracts/intents";
import {
  confirmIntent,
  IntentInputSchema,
  reviseIntent,
  revokeIntent,
  type IntentInput,
} from "@/lib/intents/lifecycle";

const emptyInput: IntentInput = {
  title: "",
  statement: "",
  priority: "high",
  horizon: "near",
};
const examples: IntentInput[] = [
  {
    title: "Team permissions",
    statement:
      "Let team owners manage who can create, reschedule, and cancel bookings without changing the rules for individual users.",
    priority: "high",
    horizon: "near",
  },
  {
    title: "Multiple locations",
    statement:
      "Support bookings across multiple locations, each with its own availability and time zone.",
    priority: "medium",
    horizon: "later",
  },
  {
    title: "Cancellation policies",
    statement:
      "Allow each team to define a cancellation window and apply the correct policy when a booking is cancelled.",
    priority: "medium",
    horizon: "near",
  },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function IntentWorkspace({
  configuration,
  onResearchRevision,
}: {
  configuration: PublicForesightConfiguration;
  onResearchRevision?: (revision: number) => void;
}) {
  const metaStatus = configuration.status;
  const [researchRevision, setResearchRevision] = useState(0);
  const [input, setInput] = useState<IntentInput>(emptyInput);
  const [intents, setIntents] = useState<IntentV1[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const confirmed = intents.filter((intent) => intent.status === "confirmed");
  const statusText = {
    missing: "Not configured",
    invalid: "Configuration needs attention",
    disabled: "Calls disabled",
    configured: "Configured · access unverified",
  }[metaStatus];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = IntentInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the requirement.");
      return;
    }
    if (!editingId && intents.length >= 32) {
      setError(
        "This session supports up to 32 requirements. Export your requirements before starting a new session.",
      );
      return;
    }
    const previous = intents.find((intent) => intent.id === editingId);
    const intent = previous
      ? reviseIntent(previous, parsed.data, new Date())
      : confirmIntent(parsed.data, `intent-${crypto.randomUUID()}`, new Date());
    setResearchRevision((revision) => revision + 1);
    onResearchRevision?.(researchRevision + 1);
    setIntents((current) =>
      previous
        ? current.map((item) => (item.id === intent.id ? intent : item))
        : [...current, intent],
    );
    setNotice(
      previous
        ? `“${intent.title}” updated to revision ${intent.revision}. Earlier references are now stale.`
        : `“${intent.title}” confirmed by you.`,
    );
    setInput(emptyInput);
    setEditingId(null);
    setError("");
  }

  function edit(intent: IntentV1) {
    setResearchRevision((revision) => revision + 1);
    onResearchRevision?.(researchRevision + 1);
    setEditingId(intent.id);
    setInput({
      title: intent.title,
      statement: intent.statement,
      priority: intent.priority,
      horizon: intent.horizon,
    });
    setError("");
    setNotice(
      "Editing a requirement. Confirm the revision to apply your changes.",
    );
    titleInput.current?.focus();
  }

  function revoke(intent: IntentV1) {
    setResearchRevision((revision) => revision + 1);
    onResearchRevision?.(researchRevision + 1);
    setIntents((current) =>
      current.map((item) =>
        item.id === intent.id ? revokeIntent(item, new Date()) : item,
      ),
    );
    if (editingId === intent.id) {
      setEditingId(null);
      setInput(emptyInput);
    }
    setNotice(`“${intent.title}” revoked. Earlier references are now stale.`);
  }

  function exportIntents() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(intents, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "forecode-intents.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Requirements exported. This file contains your text; share it only where intended.",
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Forecode home">
          <span className="brand-mark" aria-hidden="true">
            f/
          </span>{" "}
          forecode<span className="brand-dot">.</span>
        </Link>
        <div className="sidebar-project">
          <span className="eyebrow">Research workspace</span>
          <strong>Architecture, under question.</strong>
          <span>Foresight + Verify</span>
        </div>
        <nav aria-label="Research steps" className="steps">
          <a href="#workspace" aria-current="step">
            <span className="step-number">01</span>
            <span>
              Intent<small>Define what comes next</small>
            </span>
            <span className="step-dot" />
          </a>
          <a href="#foresight">
            <span className="step-number">02</span>
            <span>
              Foresight<small>Hypothesize & challenge</small>
            </span>
          </a>
          <Link href="/experiments" prefetch={false}>
            <span className="step-number">03</span>
            <span>
              Recorded verification
              <small>Inspect protected check history</small>
            </span>
          </Link>
          <Link href="/certificates" prefetch={false}>
            <span className="step-number">04</span>
            <span>
              Recorded certificates
              <small>Inspect and export scoped evidence</small>
            </span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <span className="build-indicator" /> Foundation build{" "}
          <span className="mono">0.1</span>
          <p>
            Questions first.
            <br />
            Claims follow evidence.
          </p>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <span>
            <span className="muted">Workspace</span>
            <span className="breadcrumb-separator">/</span> Future requirements
          </span>
          <span className="session-label">
            <span /> Local session
          </span>
        </header>
        <main id="workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow accent">01 / Set the direction</p>
              <h1>Give the future a brief.</h1>
              <p className="heading-description">
                What will your software need to do next?
                <br className="desktop-break" /> Confirm the requirement before
                questioning the architecture.
              </p>
            </div>
            <span className="page-index" aria-hidden="true">
              [ 01—04 ]
            </span>
          </div>

          <div className="workspace-grid">
            <section className="editor-panel" aria-labelledby="editor-heading">
              <div className="panel-heading">
                <h2 id="editor-heading">
                  {editingId ? "Revise requirement" : "Future requirement"}
                </h2>
                <span className="text-badge">Your input</span>
              </div>
              <form onSubmit={submit} noValidate>
                <label htmlFor="intent-title">Short title</label>
                <input
                  ref={titleInput}
                  id="intent-title"
                  name="title"
                  value={input.title}
                  maxLength={120}
                  placeholder="e.g. Team permissions"
                  onChange={(event) =>
                    setInput({ ...input, title: event.target.value })
                  }
                  aria-describedby={error ? "input-error" : undefined}
                />
                <div className="field-heading">
                  <label htmlFor="intent-statement">
                    What needs to change?
                  </label>
                  <span className="mono">{input.statement.length}/2000</span>
                </div>
                <textarea
                  id="intent-statement"
                  name="statement"
                  value={input.statement}
                  maxLength={2000}
                  placeholder="Describe the future behavior, who needs it, and the constraints that matter…"
                  onChange={(event) =>
                    setInput({ ...input, statement: event.target.value })
                  }
                  aria-describedby="privacy-note"
                />
                <div className="select-row">
                  <div>
                    <label htmlFor="priority">Priority</label>
                    <select
                      id="priority"
                      value={input.priority}
                      onChange={(event) =>
                        setInput({
                          ...input,
                          priority: event.target
                            .value as IntentInput["priority"],
                        })
                      }
                    >
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="horizon">Time horizon</label>
                    <select
                      id="horizon"
                      value={input.horizon}
                      onChange={(event) =>
                        setInput({
                          ...input,
                          horizon: event.target.value as IntentInput["horizon"],
                        })
                      }
                    >
                      <option value="near">Near term</option>
                      <option value="later">Later</option>
                      <option value="unspecified">Not decided</option>
                    </select>
                  </div>
                </div>
                <p id="privacy-note" className="privacy-note">
                  <span aria-hidden="true">◈</span> Your text stays in this
                  browser session. Nothing is sent to a model.
                </p>
                {error && (
                  <p id="input-error" className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  {editingId && (
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setInput(emptyInput);
                        setError("");
                      }}
                    >
                      Cancel edit
                    </button>
                  )}
                  <button className="button-primary" type="submit">
                    {editingId ? "Confirm revision" : "Confirm requirement"}
                    <Arrow />
                  </button>
                </div>
              </form>
              {!editingId && (
                <div className="examples">
                  <span className="eyebrow">Need a starting point?</span>
                  <div>
                    {examples.map((example) => (
                      <button
                        type="button"
                        key={example.title}
                        onClick={() => {
                          setInput(example);
                          setError("");
                          titleInput.current?.focus();
                        }}
                      >
                        {example.title}
                        <span aria-hidden="true">+</span>
                      </button>
                    ))}
                  </div>
                  <p>Examples fill the editor. You decide what to confirm.</p>
                </div>
              )}
            </section>

            <aside className="protocol" aria-labelledby="protocol-heading">
              <div className="protocol-heading">
                <span className="eyebrow">The research protocol</span>
                <span aria-hidden="true">↳</span>
              </div>
              <h2 id="protocol-heading">
                A better question.
                <br />
                Then a fair test.
              </h2>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>You define the intent</strong>
                    <p>
                      Only requirements you confirm can guide a recommendation.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Meta questions the design</strong>
                    <p>
                      A falsifiable hypothesis and a counterexample. Both open
                      to review.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Evidence gets the last word</strong>
                    <p>
                      A controlled experiment and independent checks. Either
                      design can lose.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="readiness">
                <span className="eyebrow">Available in this build</span>
                <dl>
                  <div>
                    <dt>Intent editor</dt>
                    <dd className="ready">
                      <span />
                      Ready
                    </dd>
                  </div>
                  <div>
                    <dt>Meta integration</dt>
                    <dd>Review & consent</dd>
                  </div>
                  <div>
                    <dt>Experiment evidence</dt>
                    <dd>Not collected</dd>
                  </div>
                </dl>
                <p>
                  Meta configuration: {statusText.toLowerCase()}. Live model
                  access has not been verified.
                </p>
              </div>
            </aside>
          </div>

          <section
            className="intent-register"
            aria-labelledby="register-heading"
          >
            <div className="register-heading">
              <div>
                <h2 id="register-heading">
                  Confirmed direction{" "}
                  <span className="count">
                    {confirmed.length.toString().padStart(2, "0")}
                  </span>
                </h2>
                <p>The requirements you choose to stand behind.</p>
              </div>
              <button
                className="button-secondary export-button"
                type="button"
                disabled={intents.length === 0}
                onClick={exportIntents}
              >
                Export JSON<span aria-hidden="true">↓</span>
              </button>
            </div>
            <p className="live-notice" role="status">
              {notice}
            </p>
            {intents.length === 0 ? (
              <div className="empty-state">
                <span className="empty-symbol" aria-hidden="true">
                  ↳
                </span>
                <div>
                  <h3>No confirmed requirements yet.</h3>
                  <p>
                    Start with one concrete change. You can revise it as your
                    thinking evolves.
                  </p>
                </div>
                <span className="empty-label">Awaiting your intent</span>
              </div>
            ) : (
              <div className="intent-list">
                {intents.map((intent) => (
                  <article
                    className={`intent-item ${intent.status === "rejected" ? "revoked" : ""}`}
                    key={intent.id}
                  >
                    <div className="intent-meta">
                      <span className={`intent-status ${intent.status}`}>
                        {intent.status === "confirmed"
                          ? "Confirmed by you"
                          : "Revoked"}
                      </span>
                      <span className="mono">r{intent.revision}</span>
                    </div>
                    <h3>{intent.title}</h3>
                    <p>{intent.statement}</p>
                    <div className="intent-bottom">
                      <span>
                        {intent.priority} priority{" "}
                        <span aria-hidden="true">·</span>{" "}
                        {intent.horizon === "near"
                          ? "Near term"
                          : intent.horizon === "later"
                            ? "Later"
                            : "Horizon undecided"}
                      </span>
                      {intent.status === "confirmed" && (
                        <div>
                          <button
                            type="button"
                            onClick={() => edit(intent)}
                            aria-label={`Edit ${intent.title}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => revoke(intent)}
                            aria-label={`Revoke ${intent.title}`}
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <ForesightWorkspace
            key={researchRevision}
            intents={intents}
            configuration={configuration}
            editing={editingId !== null}
          />
          <footer className="workspace-footer">
            <span>FORESIGHT + VERIFY</span>
            <p>
              No architecture experiment yet. Model proposals require human
              review.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
