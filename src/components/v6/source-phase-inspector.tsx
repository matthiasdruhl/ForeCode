import { useId, useState } from "react";
import type { PublicTournament } from "@/lib/experiment/tournament-publication";
import type { TraceFocus } from "@/lib/presentation/trace-focus";
import type {
  PublicSourceEvidence,
  SourceFileSide,
  SourceRole,
} from "@/lib/experiment/source-publication";

type Props = {
  study?: PublicTournament;
  focus: TraceFocus;
  evidence?: PublicSourceEvidence;
  disclosuresUnavailable?: boolean;
};

export function SourceHistory(props: Props) {
  // Remount selection with its exact current context. Text is always read from
  // current props, never copied into state or reused across roles/refreshes.
  const key = JSON.stringify([
    props.focus.contextIdentity,
    props.focus.arm,
    props.focus.phase,
    props.evidence?.studyId,
    props.evidence?.projectionSha256,
    props.evidence?.snapshots.map((snapshot) => [
      snapshot.role,
      snapshot.treeSha256,
      snapshot.files.map((file) => [file.path, file.sha256]),
    ]),
    props.evidence?.comparisons.map((comparison) => [
      comparison.id,
      comparison.state,
      comparison.files.map((file) => [
        file.path,
        file.state,
        file.before.state,
        file.after.state,
      ]),
    ]),
  ]);
  return <CurrentSourceHistory key={key} {...props} />;
}

function SourceSide({
  label,
  side,
  showText,
}: {
  label: string;
  side: SourceFileSide;
  showText: boolean;
}) {
  return (
    <section className="source-side" aria-label={`${label} source`}>
      <h4>{label}</h4>
      <p>
        {side.state === "absent"
          ? "File absent on this side."
          : side.state === "undisclosed"
            ? "File present; text not disclosed."
            : side.text === ""
              ? "Empty file · present on this side."
              : "Complete disclosed file text."}
      </p>
      {side.state !== "absent" && (
        <code className="source-hash">{side.sha256}</code>
      )}
      {showText && side.state === "available" && (
        <p className="source-text-endings">
          Line endings: {side.text.match(/\r\n/g)?.length ?? 0} CRLF,{" "}
          {side.text.replaceAll("\r\n", "").match(/\n/g)?.length ?? 0} LF,{" "}
          {side.text.replaceAll("\r\n", "").match(/\r/g)?.length ?? 0}{" "}
          standalone CR.{" "}
          {side.text === ""
            ? "Empty file has no final newline."
            : side.text.endsWith("\n")
              ? "Final newline present."
              : "No final newline."}
        </p>
      )}
      {showText && side.state === "available" && side.text !== "" && (
        <pre
          className="source-code"
          tabIndex={0}
          aria-label={`${label} exact source text`}
        >
          <code>{side.text}</code>
        </pre>
      )}
    </section>
  );
}

function CurrentSourceHistory({
  study,
  focus,
  evidence,
  disclosuresUnavailable,
}: Props) {
  const fileSelectId = useId();
  const [selectedPath, setSelectedPath] = useState("");
  const [mode, setMode] = useState<"diff" | "text">("diff");
  const arm = study?.arms.find((item) => item.variant === focus.arm);
  const original = study?.arms.find((item) => item.variant === "A");
  const role: SourceRole =
    focus.phase === "before" ||
    (focus.phase === "prepared" && focus.arm === "A")
      ? "shared-original"
      : focus.phase === "prepared"
        ? "B-prepared"
        : focus.arm === "A"
          ? "A-final"
          : "B-final";
  const snapshot = evidence?.snapshots.find((item) => item.role === role);
  const comparisonId =
    focus.phase === "after"
      ? `downstream-${focus.arm}`
      : focus.phase === "prepared" && focus.arm === "B"
        ? "preparation-B"
        : undefined;
  const comparison = evidence?.comparisons.find(
    (item) => item.id === comparisonId,
  );
  const tree =
    focus.phase === "before"
      ? original?.initialTreeSha256
      : focus.phase === "prepared"
        ? arm?.initialTreeSha256
        : arm?.finalTreeSha256;
  const comparisonAvailable = comparison?.state === "available";
  const files = comparisonAvailable
    ? comparison.files
    : (snapshot?.files ?? []);
  const path = files.some((file) => file.path === selectedPath)
    ? selectedPath
    : files[0]?.path;
  const diff = comparisonAvailable
    ? comparison.files.find((file) => file.path === path)
    : undefined;
  const file = snapshot?.files.find((file) => file.path === path);
  const hasContent = comparisonAvailable || !!snapshot;
  return (
    <div className="source-history">
      <span className="v6-kicker">
        {snapshot
          ? "APPROVED DISCLOSED SOURCE SUBSET"
          : tree
            ? "APPROVED TREE IDENTITY · SNAPSHOT BODY UNAVAILABLE"
            : "UNAVAILABLE · NO APPROVED SOURCE SNAPSHOT"}
      </span>
      <h2>
        {focus.arm} / {focus.phase}
      </h2>
      <p className="source-phase-meaning">
        {focus.phase === "before"
          ? "Shared original source, before either approach responds to the future task."
          : focus.phase === "prepared"
            ? focus.arm === "A"
              ? "A retains its original starting source; this does not represent an additional preparation run."
              : "B’s prepared starting source: shared original → B prepared."
            : `The selected arm’s starting source → ${focus.arm} final source after downstream work.`}
      </p>
      {tree ? (
        <dl>
          <dt>Source role</dt>
          <dd>{role}</dd>
          <dt>Source tree</dt>
          <dd>
            <code>{tree}</code>
          </dd>
          <dt>
            Downstream run for this source arm (not the baseline evaluator run)
          </dt>
          <dd>
            {role === "shared-original"
              ? "No shared downstream run; original source."
              : (arm?.runId ?? "Unavailable")}
          </dd>
          <dt>
            {focus.phase === "after"
              ? "Final receipt"
              : "Baseline evaluator receipt"}
          </dt>
          <dd>
            {focus.phase === "after"
              ? (arm?.receiptId ?? "Unavailable")
              : ((role === "shared-original"
                  ? original?.baselineReceiptId
                  : arm?.baselineReceiptId) ?? "Unavailable")}
          </dd>
        </dl>
      ) : (
        <p>
          No approved original, prepared, or final snapshot is available for
          this selection. Proposed architecture is not observed source.
        </p>
      )}
      {disclosuresUnavailable && (
        <p role="status">
          One or more source disclosures are unavailable. This catalog status
          does not identify a particular study’s cause.
        </p>
      )}
      {evidence && (
        <aside className="source-scope" aria-label="Source disclosure scope">
          <p>
            Disclosed subset only. These paths are not a complete inventory or a
            complete changed-file list; source text does not reconstruct the
            full tree or dependency topology.
          </p>
          <ul>
            {evidence.scopeLimitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </aside>
      )}
      {evidence && comparisonId && !comparisonAvailable && (
        <p>
          This source comparison is unavailable; a required snapshot is missing.
          Any available selected snapshot below remains independent.
        </p>
      )}
      {!evidence ? (
        <p>
          Source text is not provisioned for this study. A complete source
          snapshot and dependency topology are not published.
        </p>
      ) : !hasContent ? (
        <p>
          {comparisonId
            ? "This source comparison is unavailable; a required snapshot is missing."
            : "This source snapshot is unavailable."}
        </p>
      ) : files.length === 0 ? (
        <p>
          {comparisonAvailable
            ? "No disclosed files in this comparison. This does not establish no changes or a complete inventory."
            : "No disclosed file bodies for this snapshot. This does not establish an empty tree."}
        </p>
      ) : (
        <div className="source-viewer">
          {comparisonAvailable && (
            <p className="source-comparison-label">
              {comparison.id}: {comparison.beforeRole} → {comparison.afterRole}
            </p>
          )}
          <div className="source-file-control">
            <label htmlFor={fileSelectId}>Disclosed source file</label>
            <select
              id={fileSelectId}
              value={path}
              onChange={(event) => setSelectedPath(event.target.value)}
            >
              {files.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.path}
                </option>
              ))}
            </select>
          </div>
          {diff ? (
            <>
              <div
                className="source-mode"
                role="group"
                aria-label="Source display mode"
              >
                <button
                  type="button"
                  aria-pressed={mode === "diff"}
                  onClick={() => setMode("diff")}
                >
                  Diff
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                >
                  Text
                </button>
              </div>
              <h3>
                {
                  {
                    added: "Added",
                    removed: "Removed",
                    modified: "Modified",
                    unchanged: "Unchanged",
                  }[diff.change]
                }{" "}
                · <code>{diff.path}</code>
              </h3>
              <div className="source-sides">
                <SourceSide
                  label={`Before · ${comparison!.beforeRole}`}
                  side={diff.before}
                  showText={mode === "text"}
                />
                <SourceSide
                  label={`After · ${comparison!.afterRole}`}
                  side={diff.after}
                  showText={mode === "text"}
                />
              </div>
              {mode === "diff" && (
                <>
                  {diff.state === "too-large" ? (
                    <p>
                      Exact diff exceeds the bounded computation limit.
                      Disclosed text remains inspectable in Text mode.
                    </p>
                  ) : diff.state === "text-unavailable" ? (
                    <p>
                      Exact text diff unavailable: a present side’s text was not
                      disclosed.
                    </p>
                  ) : diff.state === "unchanged" ? (
                    <p>
                      Unchanged file hash. No diff rows; missing text is not
                      inferred.
                    </p>
                  ) : (
                    <>
                      <p>
                        Line endings: LF / CRLF / none (no final newline). +
                        added, − removed, · context.
                      </p>
                      {diff.rows.length === 0 ? (
                        <p>
                          No text rows. The Added/Removed status and absent
                          versus empty sides above still apply.
                        </p>
                      ) : (
                        <pre
                          className="source-code source-diff"
                          tabIndex={0}
                          aria-label="Exact disclosed source diff"
                        >
                          <code>
                            {diff.rows.map((row, index) => (
                              <span
                                className={`source-row source-row-${row.kind}`}
                                key={index}
                              >
                                <span aria-label={row.kind}>
                                  {row.kind === "added"
                                    ? "+"
                                    : row.kind === "removed"
                                      ? "−"
                                      : "·"}{" "}
                                </span>
                                {row.text}
                                <span className="source-ending">
                                  {" "}
                                  [
                                  {row.ending === "none"
                                    ? "none · no final newline"
                                    : row.ending}
                                  ]
                                </span>
                                {"\n"}
                              </span>
                            ))}
                          </code>
                        </pre>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            file && (
              <>
                <h3>
                  <code>{file.path}</code>
                </h3>
                <SourceSide
                  label={role}
                  side={{
                    state: "available",
                    sha256: file.sha256,
                    text: file.text,
                  }}
                  showText
                />
              </>
            )
          )}
        </div>
      )}
      {!evidence &&
        focus.phase === "prepared" &&
        focus.arm === "B" &&
        study?.sourceComparison && (
          <>
            <h3>Published file comparison · not a phase snapshot</h3>
            <p>
              The published file comparison is arm-unassigned. It does not
              establish phase snapshots or a dependency topology.
            </p>
            <ul className="source-file-list">
              {study.sourceComparison.map((item) => (
                <li key={item.path}>
                  <code>{item.path}</code>
                  <span>Before: {item.beforeSha256 ?? "File absent"}</span>
                  <span>After: {item.afterSha256 ?? "File removed"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      {!evidence && focus.phase === "after" && (
        <p>
          Final changed-file bodies and diffs are not available in this
          publication.
        </p>
      )}
    </div>
  );
}
