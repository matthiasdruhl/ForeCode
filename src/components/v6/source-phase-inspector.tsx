import type { PublicTournament } from "@/lib/experiment/tournament-publication";
import type { TraceFocus } from "@/lib/presentation/trace-focus";
export function SourceHistory({
  study,
  focus,
}: {
  study?: PublicTournament;
  focus: TraceFocus;
}) {
  const arm = study?.arms.find((item) => item.variant === focus.arm);
  // B initial is prepared source. A initial is the original. No full snapshot
  // bodies are carried by this DTO, and sourceComparison covers preparation only.
  const original = study?.arms.find((item) => item.variant === "A");
  const sourceArm = focus.phase === "before" ? original : arm;
  const tree =
    focus.phase === "before"
      ? original?.initialTreeSha256
      : focus.phase === "prepared"
        ? arm?.initialTreeSha256
        : arm?.finalTreeSha256;
  return (
    <div className="source-history">
      <span className="v6-kicker">
        {tree
          ? "APPROVED TREE IDENTITY · SNAPSHOT BODY UNAVAILABLE"
          : "UNAVAILABLE · NO APPROVED SOURCE SNAPSHOT"}
      </span>
      <h2>
        {focus.arm} / {focus.phase}
      </h2>
      <p>
        {tree
          ? "The publication provides this source identity; a complete source snapshot and dependency topology are not published."
          : "No approved original, prepared, or final snapshot is available for this selection. Proposed architecture is not observed source."}
      </p>
      {tree && (
        <dl>
          <dt>Source tree</dt>
          <dd>
            <code>{tree}</code>
          </dd>
          <dt>Downstream run for this source arm</dt>
          <dd>{sourceArm?.runId ?? "Unavailable"}</dd>
          <dt>Receipt</dt>
          <dd>
            {focus.phase === "after"
              ? (arm?.receiptId ?? "Unavailable")
              : focus.phase === "before"
                ? (original?.baselineReceiptId ?? "Unavailable")
                : (arm?.baselineReceiptId ?? "Unavailable")}
          </dd>
        </dl>
      )}
      {focus.phase === "prepared" &&
        focus.arm === "B" &&
        study?.sourceComparison && (
          <>
            <h3>Approved preparation file comparison</h3>
            <ul className="source-file-list">
              {study.sourceComparison.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  <span>Before: {file.beforeSha256 ?? "File absent"}</span>
                  <span>After: {file.afterSha256 ?? "File removed"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      {focus.phase === "after" && (
        <p>
          Final changed-file bodies and diffs are not available in this
          publication.
        </p>
      )}
    </div>
  );
}
