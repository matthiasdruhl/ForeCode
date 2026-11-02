import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { composeReplayPresentation } from "@/server/artifacts/replay-presentation";
import { assessDecisionReport } from "@/lib/report/decision-report";
import { preparationInclusiveMetrics } from "@/lib/experiment/metrics";
import { ReplayHistory } from "@/components/v6/replay-history";
import { DecisionMemo } from "@/components/v6/decision-memo";
import { syntheticTournamentView } from "../support/tournament-view";
import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";

function fixture() {
  const study = syntheticTournamentView();
  study.arms.forEach((arm) => {
    arm.total = preparationInclusiveMetrics(arm.preparation, arm.downstream);
  });
  const analysis = assessDecisionReport(study);
  const tournaments = {
    state: "available" as const,
    studies: [study],
    unavailableCount: 0,
  };
  const reports: DecisionReportCatalog = {
    state: "available",
    unavailableCount: 0,
    reports: [
      {
        provenance: "FRESH_APPROVED_TOURNAMENT_LOADER",
        support: "EVIDENCE_SUPPORTED",
        analysis,
      },
    ],
  };
  return { study, tournaments, reports };
}

describe("fresh replay presentation composition (synthetic catalogs only)", () => {
  it("joins the same projection and retains the unchanged official analysis", () => {
    const { study, tournaments, reports } = fixture();
    const result = composeReplayPresentation(tournaments, reports);
    expect(result.replays.replays[0]?.studyId).toBe(study.studyId);
    expect(result.reports.reports).toEqual(reports.reports);
    expect(result.reports.reports[0]?.analysis).toBe(
      reports.reports[0]?.analysis,
    );
    expect(result.replays.provenance).toBe("UNAUTHENTICATED_PROJECTION");
  });
  it.each(["changed", "absent", "unavailable", "malformed"])(
    "withholds the report when the study is %s",
    (mode) => {
      const { tournaments, reports } = fixture();
      if (mode === "changed")
        tournaments.studies[0]!.title += " changed between fresh reads";
      if (mode === "malformed")
        tournaments.studies[0]!.arms[0]!.receiptId = null;
      const input =
        mode === "absent" || mode === "unavailable"
          ? {
              state:
                mode === "absent"
                  ? ("empty" as const)
                  : ("unavailable" as const),
              studies: [],
              unavailableCount: mode === "absent" ? 0 : 1,
            }
          : tournaments;
      const result = composeReplayPresentation(input, reports);
      expect(result.reports.state).toBe("unavailable");
      expect(result.reports.reports).toEqual([]);
      expect(result.reports.unavailableCount).toBe(1);
      if (mode === "malformed") expect(result.tournaments.studies).toEqual([]);
    },
  );
  it("does not show a report from study/definition identity alone", () => {
    const { study, reports } = fixture();
    for (const projectionSha256 of [undefined, "0".repeat(64)]) {
      const html = renderToStaticMarkup(
        <DecisionMemo
          catalog={reports}
          studyId={study.studyId}
          definitionSha256={study.definitionSha256}
          projectionSha256={projectionSha256}
          inspect={() => {}}
        />,
      );
      expect(html).toContain("Insufficient evidence to choose.");
      expect(html).not.toContain("Review the prepared architecture.");
    }
  });
  it("shows all five missing stages without invented events for empty and unavailable catalogs", () => {
    for (const state of ["empty", "unavailable"] as const) {
      const result = composeReplayPresentation(
        { state, studies: [], unavailableCount: state === "empty" ? 0 : 1 },
        { state, reports: [], unavailableCount: 0 },
      );
      const html = renderToStaticMarkup(
        <ReplayHistory catalog={result.replays} />,
      );
      for (const stage of [
        "Hypothesis",
        "Preparation",
        "Coding",
        "Independent verification",
        "Engineering decision",
      ])
        expect(html).toContain(stage);
      expect(html).not.toContain("Published evidence identities");
      expect(html).toContain(
        state === "empty"
          ? "no observed events"
          : "Replay evidence cannot be loaded",
      );
    }
  });
  it("retains every projected event and limits chronology claims", () => {
    const { tournaments, reports } = fixture();
    const { replays } = composeReplayPresentation(tournaments, reports);
    const replay = replays.replays[0]!;
    const html = renderToStaticMarkup(
      <ReplayHistory catalog={replays} replay={replay} />,
    );
    for (const event of replay.events) expect(html).toContain(event.label);
    expect(html).toContain("No shared clock or global execution order");
    expect(html).toContain(replay.projectionSha256);
    expect(html).toContain("Replay missing evidence");
  });
});

import { syntheticSourceHistory } from "../support/source-history";

describe("fresh source presentation join (synthetic only)", () => {
  function sourceFixture() {
    const { study, evidence } = syntheticSourceHistory();
    return {
      tournaments: {
        state: "available" as const,
        studies: [study],
        unavailableCount: 0,
      },
      reports: { state: "empty" as const, reports: [], unavailableCount: 0 },
      sources: {
        state: "available" as const,
        evidence: [evidence],
        unavailableCount: 0,
      },
    };
  }
  it("retains exact fresh selected identities with existing reports/replays unchanged", () => {
    const f = sourceFixture();
    const baseline = composeReplayPresentation(f.tournaments, f.reports);
    const joined = composeReplayPresentation(
      f.tournaments,
      f.reports,
      undefined,
      f.sources,
    );
    expect(joined.sourceEvidence.evidence).toEqual(f.sources.evidence);
    expect(joined.replays).toEqual(baseline.replays);
    expect(joined.reports).toEqual(baseline.reports);
    expect(joined.prospectiveEvidence).toEqual(baseline.prospectiveEvidence);
    expect(baseline.sourceEvidence).toEqual({
      state: "empty",
      evidence: [],
      unavailableCount: 0,
    });
  });
  it.each([
    "changed",
    "removed",
    "unavailable",
    "malformed",
    "study",
    "projection",
    "prepared",
    "duplicate",
    "withdrawn",
  ])("withholds stale/ambiguous source on %s", (mode) => {
    const f = sourceFixture();
    if (mode === "changed") f.tournaments.studies[0]!.title += " changed";
    if (mode === "removed") f.tournaments.studies = [];
    if (mode === "unavailable")
      Object.assign(f.tournaments, { state: "unavailable", studies: [] });
    if (mode === "malformed")
      f.tournaments.studies[0]!.arms[0]!.receiptId = null;
    if (mode === "study") f.sources.evidence[0]!.studyId += "-other";
    if (mode === "projection")
      f.sources.evidence[0]!.projectionSha256 = "0".repeat(64);
    if (mode === "prepared")
      f.sources.evidence[0]!.preparedOriginalSha256 = "0".repeat(64);
    if (mode === "duplicate")
      f.sources.evidence.push(structuredClone(f.sources.evidence[0]!));
    if (mode === "withdrawn")
      Object.assign(f.sources, { state: "unavailable", unavailableCount: 1 });
    const joined = composeReplayPresentation(
      f.tournaments,
      f.reports,
      undefined,
      f.sources,
    );
    expect(joined.sourceEvidence.state).toBe("unavailable");
    expect(joined.sourceEvidence.evidence).toEqual([]);
    expect(joined.sourceEvidence.unavailableCount).toBeGreaterThanOrEqual(1);
  });
  it("cannot revive earlier source after withdrawal or removal", () => {
    const f = sourceFixture();
    expect(
      composeReplayPresentation(f.tournaments, f.reports, undefined, f.sources)
        .sourceEvidence.evidence,
    ).toHaveLength(1);
    expect(
      composeReplayPresentation(f.tournaments, f.reports, undefined, {
        state: "unavailable",
        evidence: [],
        unavailableCount: 1,
      }).sourceEvidence.evidence,
    ).toEqual([]);
    expect(
      composeReplayPresentation(
        { ...f.tournaments, studies: [] },
        f.reports,
        undefined,
        f.sources,
      ).sourceEvidence.evidence,
    ).toEqual([]);
  });
});
