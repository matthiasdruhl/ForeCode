import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  initialTraceFocus,
  readTraceSelection,
  reconcileTraceFocus,
} from "@/lib/presentation/trace-focus";
import { decisionMemo } from "@/lib/presentation/decision-memo";
import { DecisionMemo } from "@/components/v6/decision-memo";
import { SourceHistory } from "@/components/v6/source-phase-inspector";
import { EvidenceDetail } from "@/components/v6/evidence-ledger";
import { MeasurementRail } from "@/components/v6/tournament-measurements";
import { syntheticTournamentView } from "../support/tournament-view";
import { ChangeTrace } from "@/components/v6/change-trace";
import { assessDecisionReport } from "@/lib/report/decision-report";
import { publicationFixture } from "../support/tournament-publication";
import { rm } from "node:fs/promises";
import type { DecisionReportCatalog } from "@/server/artifacts/decision-reports";

const empty: DecisionReportCatalog = {
  state: "empty",
  reports: [],
  unavailableCount: 0,
};
describe("v6 presentation boundaries", () => {
  it("invalidates arm, responsibility and phase when intent/source/study identity changes", () => {
    const selected = {
      ...initialTraceFocus("old"),
      arm: "B" as const,
      responsibility: "Storage" as const,
      phase: "after" as const,
    };
    expect(reconcileTraceFocus(selected, "new")).toEqual(
      initialTraceFocus("new"),
    );
    expect(reconcileTraceFocus(selected, "old")).toBe(selected);
    const parsed = readTraceSelection(
      new URL(
        "https://example.test/?arm=X&phase=invalid&responsibility=made-up",
      ),
      "new",
    );
    expect(parsed).toEqual(initialTraceFocus("new"));
  });
  it("renders one future diamond and eight native node buttons without source or execution claims", () => {
    const html = renderToStaticMarkup(
      <ChangeTrace focus={initialTraceFocus("test")} onSelect={() => {}} />,
    );
    expect(html.match(/class="requirement-diamond"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Inspect [AB] ·/g)).toHaveLength(8);
    expect(html).toContain("CONCEPTUAL · NOT AN EXECUTION");
    expect(html).not.toContain("src/");
    expect(html).not.toContain("animation");
  });
  it.each(["empty", "unavailable"] as const)(
    "renders an honest semantic memo for %s evidence",
    (state) => {
      const html = renderToStaticMarkup(
        <DecisionMemo catalog={{ ...empty, state }} inspect={() => {}} />,
      );
      expect(html).toContain("Insufficient evidence to choose.");
      for (const label of [
        "Decision scope",
        "What was tested",
        "What remains unknown",
      ])
        expect(html).toContain(`<dt>${label}</dt>`);
      expect(html).not.toContain("<select");
      expect(html).not.toContain("0 ms");
    },
  );
  it("renders six outcomes from server-derived analysis without changing decisions or receipts", async () => {
    const fixture = await publicationFixture({ telemetry: true });
    try {
      const outcomes = [
        ["VERIFIED", "REJECTED", "KEEP", "Keep the current architecture."],
        [
          "REJECTED",
          "VERIFIED",
          "REFACTOR",
          "Review the prepared architecture.",
        ],
        [
          "VERIFIED",
          "VERIFIED",
          "INCONCLUSIVE",
          "Insufficient evidence to choose.",
        ],
        [
          "REJECTED",
          "REJECTED",
          "INCONCLUSIVE",
          "Insufficient evidence to choose.",
        ],
      ] as const;
      for (const [a, b, expected, headline] of outcomes) {
        // Authorized synthetic fixtures are confined to tests. No outcome API exists.
        const p = structuredClone(fixture.artifact.projection);
        p.arms.forEach((arm) => {
          arm.verdict = arm.variant === "A" ? a : b;
          arm.checks.forEach((check, i) => {
            check.status =
              arm.verdict === "REJECTED" && i === 0 ? "fail" : "pass";
          });
        });
        p.correctness =
          a === b
            ? a === "VERIFIED"
              ? "BOTH_VERIFIED"
              : "BOTH_REJECTED"
            : a === "VERIFIED"
              ? "A_ONLY_VERIFIED"
              : "B_ONLY_VERIFIED";
        const analysis = assessDecisionReport(p);
        expect(analysis.decision).toBe(expected);
        const catalog: DecisionReportCatalog = {
          state: "available",
          unavailableCount: 0,
          reports: [
            {
              provenance: "FRESH_APPROVED_TOURNAMENT_LOADER",
              support:
                expected === "INCONCLUSIVE"
                  ? "INCONCLUSIVE"
                  : "EVIDENCE_SUPPORTED",
              analysis,
            },
          ],
        };
        const before = JSON.stringify(catalog);
        const memo = decisionMemo(catalog.reports[0], catalog.state);
        expect(memo.headline).toBe(headline);
        expect(memo.reasons).toEqual(analysis.reasons);
        const html = renderToStaticMarkup(
          <DecisionMemo
            catalog={catalog}
            studyId={p.studyId}
            projectionSha256={analysis.evidenceReferences?.projectionSha256}
            inspect={() => {}}
          />,
        );
        expect(html).toContain(headline);
        expect(html).toContain(p.studyId);
        expect(JSON.stringify(catalog)).toBe(before);
        if (a === b && a === "VERIFIED") {
          expect(html).toContain("correctness alone");
          expect(memo.targets.slice(0, 2)).toEqual(["checks", "source"]);
        }
        if (a !== b) expect(memo.targets[0]).toBe("checks");
      }
      const p = structuredClone(fixture.artifact.projection);
      p.comparability = "NOT_COMPARABLE";
      p.correctness = "INCONCLUSIVE";
      const analysis = assessDecisionReport(p);
      const report = {
        provenance: "FRESH_APPROVED_TOURNAMENT_LOADER" as const,
        support: "INCONCLUSIVE" as const,
        analysis,
      };
      expect(decisionMemo(report, "available").targets).toEqual([
        "fairness",
        "fairness",
        "fairness",
      ]);
      expect(decisionMemo(report, "available").headline).toBe(
        "Insufficient evidence to choose.",
      );
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });
});

it("source phases display only approved bindings and preserve absent bodies/topology", () => {
  const study = syntheticTournamentView();
  study.arms[0]!.initialTreeSha256 = "a".repeat(64);
  study.arms[1]!.initialTreeSha256 = "b".repeat(64);
  const base = { ...initialTraceFocus("synthetic"), arm: "B" as const };
  const before = renderToStaticMarkup(
    <SourceHistory study={study} focus={base} />,
  );
  expect(before).toContain("a".repeat(64));
  expect(before).toContain("synthetic-baseline-A");
  const prepared = renderToStaticMarkup(
    <SourceHistory study={study} focus={{ ...base, phase: "prepared" }} />,
  );
  expect(prepared).toContain("b".repeat(64));
  expect(prepared).toContain(
    "APPROVED TREE IDENTITY · SNAPSHOT BODY UNAVAILABLE",
  );
  expect(prepared).toContain(study.sourceComparison![0]!.path);
  const after = renderToStaticMarkup(
    <SourceHistory study={study} focus={{ ...base, phase: "after" }} />,
  );
  expect(after).not.toContain(study.sourceComparison![0]!.path);
  expect(after).toContain(
    "Final changed-file bodies and diffs are not available",
  );
  const missing = renderToStaticMarkup(<SourceHistory focus={base} />);
  expect(missing).not.toContain("src/");
  expect(missing).toContain("UNAVAILABLE");
  const evidence = renderToStaticMarkup(
    <EvidenceDetail study={study} question="checks" />,
  );
  expect(evidence).toContain(study.arms[1]!.receiptId!);
  expect(evidence).toContain(study.arms[1]!.runId!);
  expect(evidence).toContain(study.arms[1]!.checks[0]!.id);
  expect(renderToStaticMarkup(<MeasurementRail />)).toContain("Unknown");
});
