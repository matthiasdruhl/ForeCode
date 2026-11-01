import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";
export type EvidenceQuestion = "checks" | "source" | "hypothesis" | "fairness";
export type ApprovedReport = DecisionReportCatalog["reports"][number];
/** Copy adapter only. The decision and every reason come from the server composer. */
export function decisionMemo(
  report: ApprovedReport | undefined,
  state: DecisionReportCatalog["state"],
) {
  const analysis = report?.analysis;
  const identity = analysis?.identity;
  const invalid =
    state === "unavailable" ||
    (identity && identity.comparability !== "COMPARABLE");
  const headline =
    !analysis || analysis.decision === "INCONCLUSIVE"
      ? "Insufficient evidence to choose."
      : analysis.decision === "KEEP"
        ? "Keep the current architecture."
        : "Review the prepared architecture.";
  const targets: EvidenceQuestion[] = invalid
    ? ["fairness", "fairness", "fairness"]
    : identity?.correctness === "BOTH_REJECTED"
      ? ["checks", "checks", "checks"]
      : identity?.correctness === "BOTH_VERIFIED"
        ? ["checks", "source", "source"]
        : identity?.correctness === "A_ONLY_VERIFIED" ||
            identity?.correctness === "B_ONLY_VERIFIED"
          ? ["checks", "checks", "fairness"]
          : ["checks", "source", "hypothesis"];
  const reasons = analysis?.reasons ?? [
    "No authentic matched A/B future-task study is available. Protected required-check receipts are missing.",
    "Prepared and final source identities, together with preparation-inclusive effort, have not been published for this comparison.",
    "A model hypothesis can guide an experiment. It cannot verify an outcome or establish Meta’s incremental benefit.",
  ];
  return {
    headline,
    targets,
    reasons,
    state: identity
      ? `${identity.studyId} · ${identity.correctness}`
      : state === "unavailable"
        ? "EVIDENCE UNAVAILABLE · INCONCLUSIVE"
        : "NO AUTHENTIC MATCHED STUDY · NOT RUN",
    basis:
      analysis?.explanation ??
      "A plausible preparation is a reason to investigate, not yet a reason to refactor.",
    scope:
      analysis?.scope ??
      "The booking case and its upcoming team-permissions requirement.",
    tested: identity
      ? `One published study: ${identity.taskId}. A and B required-check outcomes: ${analysis!.observations!.arms.map((arm) => `${arm.variant} ${arm.verdict}`).join("; ")}.`
      : "No matched A/B future-task study has been authenticated for this report.",
    unknown: identity
      ? "Generalization beyond this task, Meta’s incremental benefit, and any unrecorded effort remain unknown. No authenticated effort criterion is published."
      : "Source and run identities, protected outcomes, preparation-inclusive measurements, and study comparability.",
    next:
      analysis?.nextAction ??
      "Confirm the future requirement, review the hypothesis, and obtain a separately authorized matched study with protected receipts and preparation accounting.",
    limitations: analysis?.limitations ?? [
      "No recommendation to keep or refactor is supported by absent evidence.",
      "A/B measures an architecture comparison. Meta’s added value requires an equally informed non-Meta control.",
    ],
  };
}
