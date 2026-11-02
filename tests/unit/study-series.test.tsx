import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  projectStudySeries,
  type StudyCatalog,
} from "@/lib/presentation/study-series";
import { StudySeries } from "@/components/v6/study-series";
import { EvidenceFeedbackStatus } from "@/components/v6/evidence-feedback-status";
import { syntheticTournamentView } from "../support/tournament-view";

const catalog = (...studies: StudyCatalog["studies"]): StudyCatalog => ({
  state: studies.length ? "available" : "empty",
  studies,
  unavailableCount: 0,
});
const render = (input: StudyCatalog) =>
  renderToStaticMarkup(
    <StudySeries catalog={input} onSelectStudy={() => {}} />,
  );
describe("approved study history presentation, synthetic data only", () => {
  it("distinguishes empty, unavailable and partial publications without rates", () => {
    expect(render(catalog())).toContain("No approved studies are loaded");
    expect(
      render({ state: "unavailable", studies: [], unavailableCount: 2 }),
    ).toContain("2 unavailable publications");
    const partial = {
      ...catalog(syntheticTournamentView()),
      unavailableCount: 3,
    };
    expect(render(partial)).toContain("1 approved loaded study");
    expect(render(partial)).toContain("3 unavailable publications");
    expect(render(partial)).toContain("One study (N=1)");
    expect(render(partial)).not.toContain("0%");
  });
  it("retains catalog order, negative outcomes, incomplete runs, attempts and exact raw accounting", () => {
    const first = syntheticTournamentView(),
      second = syntheticTournamentView();
    first.studyId = "negative-study";
    first.correctness = "BOTH_REJECTED";
    first.comparability = "NOT_COMPARABLE";
    first.arms[0]!.status = "cancelled";
    first.arms[1]!.status = "not_run";
    first.arms[1]!.receiptId = null;
    first.arms[1]!.verdict = "INSUFFICIENT_EVIDENCE";
    second.studyId = "later-study";
    const input = catalog(first, second),
      before = structuredClone(input);
    const output = projectStudySeries(input);
    expect(output.entries.map((entry) => entry.study)).toEqual(input.studies);
    expect(output.entries.map((entry) => entry.compatibility)).toEqual([
      "UNCLASSIFIED",
      "UNCLASSIFIED",
    ]);
    expect(output.entries[0]!.study.arms[0]!.preparation.costUsd).toBe(0);
    expect(output.entries[0]!.study.arms[0]!.total.costUsd).toBeNull();
    expect(output.entries[0]!.study.arms[0]!.reservedMicroUsd).toBe(1_000_000);
    const html = render(input);
    for (const value of [
      "BOTH_REJECTED",
      "NOT_COMPARABLE",
      "cancelled",
      "not_run",
      "INSUFFICIENT_EVIDENCE",
      "synthetic-failed-preparation",
      "synthetic-selected-preparation",
      "Unknown",
      "1,000,000",
      "allocation is not an actual charge",
      "2 execution attempts",
      "2 preparation attempts",
    ])
      expect(html).toContain(value);
    expect(input).toEqual(before);
  });
  it.each([
    "taskId",
    "taskDefinitionSha256",
    "definitionSha256",
    "protocolOriginalSha256",
    "preparedOriginalSha256",
    "model",
    "baselineEvaluatorSha256",
    "baselineSuiteSha256",
    "baselinePolicySha256",
    "futureEvaluatorSha256",
    "futureSuiteSha256",
    "futurePolicySha256",
  ] as const)("never pools on matching or changed %s", (key) => {
    const a = syntheticTournamentView(),
      b = syntheticTournamentView();
    b.studyId = "other-study";
    expect(
      projectStudySeries(catalog(a, b)).entries.every(
        (entry) => entry.compatibility === "UNCLASSIFIED",
      ),
    ).toBe(true);
    b[key] =
      key === "model" || key === "taskId"
        ? "different-identity"
        : "2".repeat(64);
    expect(
      projectStudySeries(catalog(a, b)).entries.every(
        (entry) => entry.compatibility === "UNCLASSIFIED",
      ),
    ).toBe(true);
  });
  it("does not join different source trees or commits", () => {
    const a = syntheticTournamentView(),
      b = syntheticTournamentView();
    b.studyId = "different-source";
    b.arms[0]!.initialTreeSha256 = "3".repeat(64);
    b.arms[0]!.initialCommit = "4".repeat(40);
    expect(projectStudySeries(catalog(a, b)).entries).toHaveLength(2);
    expect(render(catalog(a, b))).toContain("3".repeat(64));
  });
  it("fails closed for duplicate IDs and malformed catalogs, retaining only safe aggregate counts", () => {
    const a = syntheticTournamentView();
    for (const malformed of [
      { ...catalog(a, a), unavailableCount: 2 },
      { ...catalog(a), state: "empty" },
      { ...catalog(a), extra: "private-sentinel" },
      { ...catalog(a), studies: [{ ...a, model: "" }] },
      { ...catalog(a), studies: [{ ...a, arms: [a.arms[0], a.arms[0]] }] },
      { ...catalog(a), unavailableCount: 20 },
      catalog(
        ...Array.from({ length: 21 }, (_, index) => ({
          ...a,
          studyId: `study-${index}`,
        })),
      ),
    ]) {
      const output = projectStudySeries(malformed as StudyCatalog);
      expect(output.state).toBe("unavailable");
      expect(output.entries).toEqual([]);
      expect(output.catalogInvalid).toBe(true);
      expect(render(malformed as StudyCatalog)).not.toContain(
        "private-sentinel",
      );
    }
    expect(
      projectStudySeries({ ...catalog(), unavailableCount: -1 })
        .unavailableCount,
    ).toBeNull();
  });
  it("retains every process state and correctness category without ranking or filtering", () => {
    const statuses = [
      "completed",
      "failed",
      "cancelled",
      "timed_out",
      "blocked",
      "not_run",
    ] as const;
    const correctness = [
      "INCONCLUSIVE",
      "BOTH_VERIFIED",
      "A_ONLY_VERIFIED",
      "B_ONLY_VERIFIED",
      "BOTH_REJECTED",
    ] as const;
    const studies = statuses.map((status, index) => {
      const study = syntheticTournamentView();
      study.studyId = `status-${status}`;
      study.arms[0]!.status = status;
      study.correctness = correctness[index % correctness.length]!;
      return study;
    });
    const output = projectStudySeries(catalog(...studies));
    expect(output.entries.map((entry) => entry.study.studyId)).toEqual(
      studies.map((study) => study.studyId),
    );
    const html = render(catalog(...studies));
    for (const value of [...statuses, ...correctness])
      expect(html).toContain(value);
  });
  it("never rounds a small reported cost into an observed zero", () => {
    const study = syntheticTournamentView();
    study.arms[0]!.total.costUsd = 0.0000001;
    expect(render(catalog(study))).toContain("1e-7");
  });
  it("keeps feedback unavailable and exact-study scoped without actions or invented replies", () => {
    const html = renderToStaticMarkup(
      <EvidenceFeedbackStatus studyId="selected-study" />,
    );
    expect(html).toContain("selected-study");
    expect(html).toContain("no available linked interpretation");
    expect(html).toContain("not yet installed");
    expect(html).toContain("separate permission");
    expect(html).not.toMatch(/<button|<input|<form|<script/);
    expect(renderToStaticMarkup(<EvidenceFeedbackStatus />)).toContain(
      "No approved study is selected",
    );
  });
});
