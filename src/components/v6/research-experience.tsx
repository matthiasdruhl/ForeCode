"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IntentWorkspace } from "../intent-workspace";
import { TournamentOverview } from "../tournament-overview";
import { ChangeTrace } from "./change-trace";
import { SourceHistory } from "./source-phase-inspector";
import { EvidenceDetail } from "./evidence-ledger";
import { MeasurementRail } from "./tournament-measurements";
import { DecisionMemo } from "./decision-memo";
import { TraceContext } from "./trace-context";
import { bookingGraph } from "@/lib/foresight/booking-context";
import {
  initialTraceFocus,
  readTraceSelection,
  reconcileTraceFocus,
  type TraceFocus,
} from "@/lib/presentation/trace-focus";
import type { EvidenceQuestion } from "@/lib/presentation/decision-memo";
import type { PublicForesightConfiguration } from "@/server/meta/configuration";
import type { TournamentCatalog } from "@/server/artifacts/tournament-recordings";
import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";
import type { PublicTournament } from "@/lib/experiment/tournament-publication";

const chapters = [
  ["case", "Case"],
  ["lab", "Architecture Lab"],
  ["tournament", "Tournament"],
  ["time", "Time Machine"],
  ["evidence", "Evidence Laboratory"],
  ["report", "Decision Report"],
] as const;
type Chapter = (typeof chapters)[number][0];
const questions: Record<EvidenceQuestion, [string, string]> = {
  fairness: [
    "Study fairness & comparability",
    "A defensible comparison needs the same future task, a shared original source, equivalent starting correctness, and matching downstream conditions. No matched study means comparability is not established.",
  ],
  checks: [
    "Independent checks & receipts",
    "Only authenticated protected receipts establish per-arm correctness. A missing receipt is insufficient evidence, never a rejection or a pass.",
  ],
  source: [
    "Source & preparation accounting",
    "Preparation, downstream work, and their measurable total must stay separate. Approved file identities can establish a bounded comparison; they do not reveal a complete source history or dependency topology.",
  ],
  hypothesis: [
    "Meta hypothesis limitations",
    "Meta proposes a falsifiable mechanism and a challenge. Model text is not evaluator evidence. An A/B architecture comparison cannot establish Meta’s added value over an equally informed non-Meta control.",
  ],
};
function traceIdentity(study: PublicTournament | undefined, revision: number) {
  return JSON.stringify([
    bookingGraph.repoCommit,
    revision,
    study?.studyId,
    study?.definitionSha256,
    study?.protocolOriginalSha256,
    study?.preparedOriginalSha256,
    study?.arms.map((arm) => [
      arm.initialTreeSha256,
      arm.finalTreeSha256,
      arm.runId,
      arm.receiptId,
    ]),
  ]);
}
function chapterAt(url: URL): Chapter {
  const hash = url.hash.slice(1);
  if (hash === "foresight" || hash === "workspace") return "lab";
  return chapters.find(([key]) => key === hash)?.[0] ?? "case";
}
function questionAt(url: URL): EvidenceQuestion {
  const q = url.searchParams.get("question");
  return q && Object.hasOwn(questions, q) ? (q as EvidenceQuestion) : "checks";
}
export function ResearchExperience({
  configuration,
  tournaments,
  reports,
}: {
  configuration: PublicForesightConfiguration;
  tournaments: TournamentCatalog;
  reports: DecisionReportCatalog;
}) {
  const [chapter, setChapter] = useState<Chapter>("case");
  const [revision, setRevision] = useState(0);
  const [studyId, setStudyId] = useState(tournaments.studies[0]?.studyId);
  const study = tournaments.studies.find((item) => item.studyId === studyId);
  const contextIdentity = traceIdentity(study, revision);
  const [selection, setSelection] = useState(() =>
    initialTraceFocus(contextIdentity),
  );
  const focus = reconcileTraceFocus(selection, contextIdentity);
  const [question, setQuestion] = useState<EvidenceQuestion>("checks");
  const [returnTo, setReturnTo] = useState<{
    chapter: Chapter;
    trigger: string;
  } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const evidence = useRef<HTMLDivElement>(null);
  const contextRef = useRef(contextIdentity);
  useEffect(() => {
    contextRef.current = contextIdentity;
  }, [contextIdentity]);

  useEffect(() => {
    function restore(event?: PopStateEvent | HashChangeEvent) {
      const url = new URL(window.location.href);
      setChapter(chapterAt(url));
      setQuestion(questionAt(url));
      const historyContext = window.history.state?.forecodeContext;
      setSelection(
        historyContext && historyContext !== contextRef.current
          ? initialTraceFocus(contextRef.current)
          : readTraceSelection(url, contextRef.current),
      );
      const requestedStudy = url.searchParams.get("study");
      if (
        requestedStudy &&
        tournaments.studies.some((item) => item.studyId === requestedStudy)
      )
        setStudyId(requestedStudy);
      const origin = window.history.state?.forecodeReturn;
      setReturnTo(origin ?? null);
      if (event)
        requestAnimationFrame(() => {
          const target = window.history.state?.forecodeFocus;
          if (typeof target === "string" && document.getElementById(target))
            document.getElementById(target)?.focus();
          else if (chapterAt(url) === "evidence") evidence.current?.focus();
          else title.current?.focus();
        });
    }
    restore();
    window.history.replaceState(
      { ...window.history.state, forecodeContext: contextRef.current },
      "",
      window.location.href,
    );
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [tournaments.studies]);

  function writeUrl(
    nextChapter: Chapter,
    next: TraceFocus,
    options?: {
      question?: EvidenceQuestion;
      origin?: { chapter: Chapter; trigger: string } | null;
      study?: string;
    },
  ) {
    const url = new URL(window.location.href);
    url.hash = nextChapter;
    url.searchParams.set("arm", next.arm);
    url.searchParams.set("responsibility", next.responsibility);
    url.searchParams.set("phase", next.phase);
    if (next.sourceId) url.searchParams.set("source", next.sourceId);
    else url.searchParams.delete("source");
    if (options?.study ?? studyId)
      url.searchParams.set("study", (options?.study ?? studyId)!);
    if (nextChapter === "evidence")
      url.searchParams.set("question", options?.question ?? question);
    else url.searchParams.delete("question");
    window.history.pushState(
      {
        ...window.history.state,
        forecodeContext: next.contextIdentity,
        forecodeReturn: options?.origin ?? null,
        forecodeFocus: undefined,
      },
      "",
      url,
    );
  }
  function navigate(next: Chapter, nextFocus = focus) {
    setChapter(next);
    writeUrl(next, nextFocus);
    requestAnimationFrame(() => {
      title.current?.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  function select(patch: Partial<Omit<TraceFocus, "contextIdentity">>) {
    const next = { ...focus, ...patch };
    if (patch.responsibility && !patch.sourceId) delete next.sourceId;
    setSelection(next);
    writeUrl(chapter, next);
  }
  function inspect(nextQuestion: EvidenceQuestion, trigger: string) {
    const origin = { chapter, trigger };
    window.history.replaceState(
      { ...window.history.state, forecodeFocus: trigger },
      "",
      window.location.href,
    );
    setReturnTo(origin);
    setQuestion(nextQuestion);
    setChapter("evidence");
    writeUrl("evidence", focus, { question: nextQuestion, origin });
    requestAnimationFrame(() => {
      evidence.current?.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  function returnFromEvidence() {
    if (!returnTo) return;
    const origin = returnTo;
    setChapter(origin.chapter);
    writeUrl(origin.chapter, focus);
    setReturnTo(null);
    requestAnimationFrame(() =>
      document.getElementById(origin.trigger)?.focus(),
    );
  }
  function invalidate(nextRevision: number) {
    setRevision(nextRevision);
    const identity = traceIdentity(study, nextRevision);
    const next = initialTraceFocus(identity);
    setSelection(next);
    writeUrl(chapter, next);
  }
  const trace = (
    <ChangeTrace
      focus={focus}
      onSelect={select}
      requirement={study ? "Published future task" : "Team permissions"}
    />
  );
  const activeName = chapters.find(([key]) => key === chapter)![1];
  return (
    <TraceContext.Provider value={{ focus, select }}>
      <div className={`research-experience chapter-${chapter}`}>
        <a className="skip-link" href="#chapter-heading">
          Skip to chapter
        </a>
        <header className="research-header">
          <Link className="v6-brand" href="/">
            forecode<span>.</span>
          </Link>
          <span className="header-caption">ARCHITECTURE, UNDER QUESTION.</span>
          <Link
            className="header-evidence"
            href="/experiments"
            prefetch={false}
          >
            Recorded verification ↗
          </Link>
        </header>
        <div className="chapter-bar">
          <nav className="chapter-rail" aria-label="Research chapters">
            {chapters.map(([key, label], index) => (
              <a
                key={key}
                href={`#${key}`}
                aria-current={chapter === key ? "step" : undefined}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  )
                    return;
                  event.preventDefault();
                  navigate(key);
                }}
              >
                <span>0{index + 1}</span>
                {label}
              </a>
            ))}
          </nav>
          <span className="chapter-scroll-hint">Scroll chapters →</span>
        </div>
        <div className="case-context">
          <span>BOOKING / 01</span>
          <span>
            {study?.studyId ?? "Team permissions · proposed future requirement"}
          </span>
          <span>
            {focus.arm} / {focus.sourceId ?? focus.responsibility} ·{" "}
            {focus.phase}
          </span>
        </div>
        <div
          className="research-body"
          role={chapter === "case" || chapter === "lab" ? undefined : "main"}
        >
          <h1
            ref={title}
            id="chapter-heading"
            tabIndex={-1}
            className={
              chapter === "case" || chapter === "report"
                ? "sr-only"
                : "chapter-heading"
            }
          >
            {activeName}
          </h1>
          <section
            hidden={chapter !== "case"}
            className="case-story"
            aria-label="The booking case"
          >
            <div className="landing-grid">
              <div className="landing-copy">
                <p className="v6-kicker">
                  A WORKING APP. A CHANGING REQUIREMENT.
                </p>
                <h2>
                  The code works today.
                  <br />
                  Will it survive <em>tomorrow?</em>
                </h2>
                <p className="landing-lead">
                  A booking app is about to gain team permissions. ForeCode
                  tests whether an architecture change is worth making first.
                </p>
                <div className="landing-actions">
                  <button
                    className="v6-primary"
                    onClick={() => navigate("lab")}
                  >
                    Explore the booking case <span aria-hidden="true">↗</span>
                  </button>
                  <a href="#comparison-explainer">How the comparison works ↓</a>
                </div>
              </div>
              <div className="landing-artifact">
                <div className="case-now">
                  <span className="v6-kicker">
                    TODAY / THE BOOKING APPLICATION
                  </span>
                  <h3>Find a room. Make a booking.</h3>
                  <p>
                    Create a booking, avoid overlaps, cancel your own. The
                    standalone fixture uses a fixed demo viewer and in-memory
                    storage.
                  </p>
                  <span className="case-next">NEXT / TEAM PERMISSIONS</span>
                  <p>
                    Let team owners delegate who can create, reschedule, and
                    cancel bookings.
                  </p>
                </div>
                {trace}
                <div
                  className="landing-choices"
                  role="group"
                  aria-label="Explore an architectural approach"
                >
                  {(["A", "B"] as const).map((arm) => (
                    <button
                      key={arm}
                      onClick={() => {
                        const next = {
                          ...focus,
                          arm,
                          responsibility: "Routes" as const,
                        };
                        setSelection(next);
                        navigate("lab", next);
                      }}
                    >
                      <strong>
                        {arm} / {arm === "A" ? "Keep" : "Prepare"}
                      </strong>
                      <span>
                        {arm === "A"
                          ? "Adapt the current design when the task arrives."
                          : "Review a permissions boundary first."}{" "}
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div id="comparison-explainer" className="story-beats">
              {[
                [
                  "01 / Define",
                  "One future requirement.",
                  "Confirm the behavior before asking Meta for a hypothesis.",
                ],
                [
                  "02 / Compare",
                  "Two credible approaches.",
                  "The same downstream task and conditions. Count preparation.",
                ],
                [
                  "03 / Decide",
                  "Evidence before conviction.",
                  "Inspect protected checks, source identities, and what remains unknown.",
                ],
              ].map(([step, heading, copy]) => (
                <div key={step}>
                  <span className="v6-kicker">{step}</span>
                  <h3>{heading}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </section>
          <section
            hidden={chapter !== "lab"}
            aria-label="Architecture Lab introduction"
            className="lab-introduction"
          >
            <p className="chapter-lead">
              Keep what works. Question what comes next.
            </p>
            <p>
              The future permissions boundary is a hypothesis. Confirm your
              requirement below, inspect the reviewed booking graph, then use
              the existing consented Meta proposal and challenge workflow.
            </p>
            {trace}
            <a className="v6-text-link" href="#workspace">
              Confirm the future requirement ↓
            </a>
          </section>
          <div
            hidden={chapter !== "case" && chapter !== "lab"}
            className="embedded-workspace"
          >
            <IntentWorkspace
              configuration={configuration}
              onResearchRevision={invalidate}
            />
          </div>
          <section
            hidden={chapter !== "tournament"}
            className="tournament-chapter"
            aria-label="Architecture comparison"
          >
            <div className="chapter-intro">
              <p className="v6-kicker">STUDY F / ARCHITECTURE EFFECT</p>
              <h2>Does preparation pay for itself?</h2>
              <p className="study-state">
                {study
                  ? `${study.comparability} · ${study.correctness}`
                  : tournaments.state === "unavailable"
                    ? "EVIDENCE UNAVAILABLE · NO AUTHENTIC PAIRED RESULTS"
                    : "NOT RUN · NO AUTHENTIC PAIRED RESULTS"}
              </p>
            </div>
            {trace}
            <div className="fairness-conditions">
              {[
                ["Same future task", study?.taskDefinitionSha256],
                [
                  "Same original starting point",
                  study
                    ? study.comparability === "COMPARABLE"
                      ? "Shared original under the approved comparison; B preparation counted separately."
                      : "Not established · inspect comparability blockers."
                    : null,
                ],
                ["Same downstream conditions", study?.definitionSha256],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <p>{value ?? "Unknown · no authenticated matched study"}</p>
                </div>
              ))}
            </div>
            <button
              id="tournament-fairness"
              className="v6-text-link"
              onClick={() => inspect("fairness", "tournament-fairness")}
            >
              Inspect comparability requirements ↗
            </button>
            <div className="approach-pair">
              <div>
                <span>A / KEEP</span>
                <h3>The current architecture.</h3>
                <p>
                  A credible status quo. Implement the future task from the
                  original design without speculative preparation.
                </p>
              </div>
              <div>
                <span>B / PREPARE</span>
                <h3>A reviewed preparation.</h3>
                <p>
                  A bounded change before the same future task. Its upfront
                  effort belongs in the total.
                </p>
              </div>
            </div>
            {tournaments.studies.length > 1 && (
              <label className="study-select">
                Published study
                <select
                  value={studyId}
                  onChange={(event) => {
                    const nextStudy = tournaments.studies.find(
                      (item) => item.studyId === event.target.value,
                    )!;
                    setStudyId(nextStudy.studyId);
                    const next = initialTraceFocus(
                      traceIdentity(nextStudy, revision),
                    );
                    setSelection(next);
                    writeUrl(chapter, next, { study: nextStudy.studyId });
                  }}
                >
                  {tournaments.studies.map((item) => (
                    <option key={item.studyId} value={item.studyId}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <MeasurementRail study={study} />
            <details className="publication-details">
              <summary>Inspect full publication, checks & limitations</summary>
              <TournamentOverview
                catalog={{ ...tournaments, studies: study ? [study] : [] }}
              />
            </details>
            <p className="chapter-caveat">
              Both arms passing is a correctness tie. Study F does not establish
              Meta’s incremental benefit; that requires a separate equally
              informed non-Meta control.
            </p>
            <button className="v6-primary" onClick={() => navigate("time")}>
              Inspect source history ↗
            </button>
          </section>
          <section hidden={chapter !== "time"} aria-label="Source history">
            <p className="chapter-lead">What actually changed?</p>
            <p className="chapter-description">
              Inspect approved identities and file comparisons. A conceptual
              preparation is never a historical source snapshot.
            </p>
            {trace}
            <div
              className="phase-controls"
              role="group"
              aria-label="Source phase"
            >
              {(["before", "prepared", "after"] as const).map((phase) => (
                <button
                  key={phase}
                  aria-pressed={focus.phase === phase}
                  onClick={() => select({ phase })}
                >
                  {phase === "before"
                    ? "01 / Before"
                    : phase === "prepared"
                      ? "02 / Prepared"
                      : "03 / After"}
                </button>
              ))}
            </div>
            <SourceHistory study={study} focus={focus} />
            <button
              id="time-source"
              className="v6-text-link"
              onClick={() => inspect("source", "time-source")}
            >
              Inspect source & preparation evidence ↗
            </button>
          </section>
          <section
            hidden={chapter !== "evidence"}
            aria-label="Evidence Laboratory"
          >
            <div ref={evidence} tabIndex={-1} className="evidence-question">
              <span className="v6-kicker">
                FOCUSED QUESTION / {study?.studyId ?? "NO APPROVED STUDY"}
              </span>
              <h2>{questions[question][0]}</h2>
              <p>{questions[question][1]}</p>
              {returnTo && (
                <button className="v6-text-link" onClick={returnFromEvidence}>
                  Return to{" "}
                  {chapters.find(([key]) => key === returnTo.chapter)?.[1]} ←
                </button>
              )}
            </div>
            <div
              className="evidence-topics"
              role="group"
              aria-label="Evidence question"
            >
              {(Object.keys(questions) as EvidenceQuestion[]).map((key) => (
                <button
                  key={key}
                  aria-pressed={question === key}
                  onClick={() => {
                    setQuestion(key);
                    writeUrl("evidence", focus, {
                      question: key,
                      origin: returnTo,
                    });
                  }}
                >
                  {questions[key][0]}
                </button>
              ))}
            </div>
            <EvidenceDetail study={study} question={question} />
            <div className="evidence-routes">
              <Link href="/experiments#evidence-laboratory" prefetch={false}>
                Recorded verification catalog ↗
              </Link>
              <Link href="/certificates" prefetch={false}>
                Scoped certificate availability ↗
              </Link>
              <button onClick={() => navigate("report")}>
                Read the Decision Report ↗
              </button>
            </div>
          </section>
          <section
            hidden={chapter !== "report"}
            className="report-chapter"
            aria-label="Decision Report"
          >
            <DecisionMemo
              catalog={reports}
              studyId={studyId}
              definitionSha256={study?.definitionSha256}
              inspect={inspect}
            />
          </section>
        </div>
        <footer className="research-footer">
          <span>Hypothesize. Challenge. Verify.</span>
          <Link href="/certificates" prefetch={false}>
            Recorded certificates ↗
          </Link>
          <span>
            Model reasoning is a proposal. Evidence carries the decision.
          </span>
        </footer>
      </div>
    </TraceContext.Provider>
  );
}
