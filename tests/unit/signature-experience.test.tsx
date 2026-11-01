import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildTournamentReplay,
  projectTournamentReplayCatalog,
  replayStages,
} from "@/lib/replay";
import { ReplayStageExplorer } from "@/components/v6/replay-stage-explorer";
import { ReplayEventDetail } from "@/components/v6/replay-event-detail";
import { DecisionMemo } from "@/components/v6/decision-memo";
import { initialTraceFocus } from "@/lib/presentation/trace-focus";
import { syntheticTournamentView } from "../support/tournament-view";

describe("signature replay presentation (synthetic metadata only)", () => {
  const study = syntheticTournamentView();
  const replay = buildTournamentReplay(study);
  const catalog = projectTournamentReplayCatalog({
    state: "available",
    studies: [study],
    unavailableCount: 0,
  });
  const props = {
    catalog,
    replay,
    focus: initialTraceFocus("synthetic"),
    requirement: study.futureProblem,
    requirementConfirmed: false,
    onStage: () => {},
    onArm: () => {},
    inspect: () => {},
  };

  it.each(replayStages)(
    "retains all %s events, exact inspection targets and conceptual boundaries",
    (stage) => {
      const html = renderToStaticMarkup(
        <ReplayStageExplorer {...props} stage={stage} />,
      );
      for (const event of replay.events.filter(
        (item) => item.stage === stage,
      )) {
        expect(html).toContain(event.label);
        expect(html).toContain(`id="inspect-${event.id}"`);
        expect(html).toContain(event.availability.replaceAll("_", " "));
      }
      expect(html).toContain(study.futureProblem);
      expect(html).toContain("CONCEPTUAL PATH");
      expect(html).toContain("No shared clock or global execution order");
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(2); // stage + selected arm
      expect(html).not.toContain("animation");
    },
  );
  it("keeps failed and selected preparation attempts outside both arm lanes", () => {
    const html = renderToStaticMarkup(
      <ReplayStageExplorer {...props} stage="preparation" />,
    );
    const arms = html.slice(
      html.indexOf('class="replay-arm-pair"'),
      html.indexOf('class="replay-shared"'),
    );
    expect(html).toContain("Shared / arm-unassigned");
    for (const attempt of study.preparationAttempts) {
      expect(html).toContain(attempt.id);
      expect(arms).not.toContain(attempt.id);
    }
    expect(html).toContain("failed");
    expect(html).toContain("does not imply an extra preparation run");
  });
  it.each(["empty", "unavailable"] as const)(
    "keeps %s catalogs unknown without manufacturing events or zeroes",
    (state) => {
      const empty = projectTournamentReplayCatalog({
        state,
        studies: [],
        unavailableCount: state === "empty" ? 0 : 1,
      });
      const html = renderToStaticMarkup(
        <ReplayStageExplorer
          {...props}
          catalog={empty}
          replay={undefined}
          stage="coding"
        />,
      );
      expect(html.match(/<small>Unknown<\/small>/g)).toHaveLength(5);
      expect(html).toContain("Evidence unavailable");
      expect(html).not.toContain("synthetic-run");
      expect(html).not.toContain("0 ms");
      expect(html).not.toContain('class="replay-event-row"');
    },
  );
  it("retains raw inconsistent intervals, absent baseline run identities and comparison hashes", () => {
    for (const event of replay.events) {
      const html = renderToStaticMarkup(<ReplayEventDetail event={event} />);
      for (const reference of event.evidence) {
        if (reference.runId) expect(html).toContain(reference.runId);
        if (reference.receiptId) expect(html).toContain(reference.receiptId);
        if (reference.sourceTreeSha256)
          expect(html).toContain(reference.sourceTreeSha256);
        if (reference.selector.kind === "baseline")
          expect(html).not.toContain("synthetic-run");
      }
      if (event.data.kind === "source_comparison") {
        expect(html).toContain(study.sourceComparison![0]!.path);
        expect(html).toContain(study.sourceComparison![0]!.afterSha256!);
        expect(html).toContain("Arm-unassigned published file identities");
        expect(html).toContain("phase assignment or dependency topology");
      }
    }
    const recorded = replay.events.find(
      (event) => event.data.kind === "coding_attempt",
    )!;
    const html = renderToStaticMarkup(
      <ReplayEventDetail
        event={{
          ...recorded,
          timing: {
            startedAt: "2026-11-01T02:00:00Z",
            endedAt: "2026-11-01T01:00:00Z",
            state: "inconsistent",
            issues: ["END_BEFORE_START"],
          },
        }}
      />,
    );
    expect(html).toContain("2026-11-01T02:00:00Z");
    expect(html).toContain("2026-11-01T01:00:00Z");
    expect(html).toContain("END BEFORE START");
  });
  it("carries the confirmed requirement to an unavailable memo and keeps all six elapsed-time cells unknown", () => {
    const html = renderToStaticMarkup(
      <DecisionMemo
        catalog={{ state: "empty", reports: [], unavailableCount: 0 }}
        requirement="A confirmed future requirement"
        inspect={() => {}}
      />,
    );
    expect(html).toContain("A confirmed future requirement");
    expect(html.match(/<td>Unknown<\/td>/g)).toHaveLength(6);
    expect(html).toContain("No matching protected receipt available.");
    expect(html).not.toContain("0 ms");
  });
});
