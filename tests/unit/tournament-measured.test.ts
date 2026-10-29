import { afterEach, describe, expect, it } from "vitest";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsonDigest } from "@/lib/report/digests";
import { canonicalJson } from "@/lib/report/canonical";
import { disclosureSubject } from "@/lib/experiment/tournament-publication";
import {
  loadTournamentArm,
  buildMeasuredTournamentReport,
} from "../../scripts/experiments/tournament/measured";
import {
  prepareTournamentPublication,
  authorizeTournamentPublication,
} from "../../scripts/experiments/tournament/disclosure";
import { measuredFixture } from "../support/tournament-measured";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(options: Parameters<typeof measuredFixture>[0] = {}) {
  const f = await measuredFixture(options);
  roots.push(f.parent);
  return f;
}
function report(f: Awaited<ReturnType<typeof fixture>>, extra = {}) {
  return buildMeasuredTournamentReport({
    study: f.study,
    arms: f.loaded,
    history: f.history,
    assessmentAt: f.assessmentAt,
    ...extra,
  });
}
const metadata = {
  title: "Synthetic fixture study",
  futureProblem: "Team booking permissions",
  reviewedProposal: "Extract authorization decisions before the future task.",
  hypothesis: "Preparation may reduce later work, including its own cost.",
  publishSourcePaths: ["src/service.ts"],
};
describe("authenticated private tournament reports — synthetic signed originals only", () => {
  it.each([
    [false, false, "BOTH_VERIFIED"],
    [true, false, "B_ONLY_VERIFIED"],
    [false, true, "A_ONLY_VERIFIED"],
    [true, true, "BOTH_REJECTED"],
  ] as const)(
    "compares scoped correctness A fail=%s B fail=%s",
    async (failA, failB, outcome) => {
      const f = await fixture({ failA, failB }),
        r = report(f);
      expect(r.comparability).toBe("COMPARABLE");
      expect(r.correctness).toBe(outcome);
      expect(r.arms[0]!.downstream.costUsd).toBeNull();
      expect(r.arms[1]!.total.costUsd).toBeNull();
      expect(r.execution).toBe("AUTHENTICATED_ORIGINALS");
    },
  );
  it("counts preparation and separately authenticated usage, without counting reservations or repeated files twice", async () => {
    const f = await fixture({ telemetry: true }),
      r = report(f);
    expect(r.arms[1]!.preparation.costUsd).toBe(0.5);
    expect(r.arms[1]!.downstream.costUsd).toBe(0.1);
    expect(r.arms[1]!.total.costUsd).toBe(0.6);
    expect(r.arms[1]!.total.elapsedMs).toBe(120000);
    expect(r.arms[1]!.total.filesTouched).toBeNull();
    expect(r.arms[1]!.totalChangedFiles).toEqual([
      "src/policy.ts",
      "src/service.ts",
    ]);
    expect(r.arms[1]!.reservedMicroUsd).toBe(500000);
    expect(r.arms[0]!.downstream.costUsd).not.toBe(999);
  });
  it.each([
    "missing-history",
    "forged-arm",
    "failed-agent",
    "cleanup",
    "missing-check",
    "reverse",
    "deviation",
  ])("keeps %s inconclusive or incomparable", async (defect) => {
    const f = await fixture({
      failedAgent: defect === "failed-agent",
      cleanup: defect === "cleanup" ? false : undefined,
      missingB:
        defect === "missing-check" ? "team-permissions-domain" : undefined,
      reverse: defect === "reverse",
      deviation: defect === "deviation",
    });
    const r = report(f, {
      ...(defect === "missing-history" ? { history: null } : {}),
      ...(defect === "forged-arm"
        ? { arms: [structuredClone(f.loaded[0]), f.loaded[1]] }
        : {}),
    });
    expect(r.correctness).toBe("INCONCLUSIVE");
    expect(r.comparability).toBe(
      ["reverse", "deviation"].includes(defect)
        ? "NOT_COMPARABLE"
        : "INSUFFICIENT_EVIDENCE",
    );
  });
  it.each([
    "runtime-bytes",
    "task",
    "candidate",
    "receipt",
    "telemetry",
    "admission",
    "wrong-model",
  ])("refuses original substitution %s on fresh intake", async (defect) => {
    const f = await fixture({ telemetry: true }),
      input = f.armInputs[0]!,
      file = path.join(
        f.runtimeRoot,
        f.observations[0]!.run.id,
        "runtime-observation.json",
      );
    if (
      ["runtime-bytes", "task", "candidate", "wrong-model"].includes(defect)
    ) {
      const original = JSON.parse(await readFile(file, "utf8"));
      if (defect === "task") original.taskDefinitionSha256 = "0".repeat(64);
      if (defect === "candidate")
        original.run.evaluatedTreeSha256 = "0".repeat(64);
      if (defect === "wrong-model") original.sharedTaskSha256 = "0".repeat(64);
      await chmod(file, 0o600);
      await writeFile(
        file,
        defect === "runtime-bytes" ? "{}" : canonicalJson(original),
      );
    }
    if (defect === "receipt") {
      const receipt = path.join(
        f.evaluationRoot,
        f.observations[0]!.run.id,
        "evaluation.json",
      );
      await chmod(receipt, 0o600);
      await writeFile(receipt, "{}");
    }
    if (defect === "telemetry") {
      const file = path.join(
        f.runtimeRoot,
        f.observations[0]!.run.id,
        "telemetry.json",
      );
      await chmod(file, 0o600);
      const t = JSON.parse(await readFile(file, "utf8"));
      t.metrics.costUsd = 0;
      await writeFile(file, canonicalJson(t));
    }
    if (defect === "admission") input.admissionId = "nonexistent";
    const loaded = await loadTournamentArm(input);
    if (defect === "receipt") {
      expect(loaded?.future).toBeNull();
      expect(report(f, { arms: [loaded, f.loaded[1]] }).correctness).toBe(
        "INCONCLUSIVE",
      );
    } else expect(loaded).toBeNull();
  });
  it("rejects forged labels, missing preparation and expired assessments", async () => {
    const f = await fixture();
    expect(() =>
      buildMeasuredTournamentReport({
        study: structuredClone(f.study),
        arms: f.loaded,
        history: f.history,
        assessmentAt: f.assessmentAt,
      }),
    ).toThrow();
    expect(report(f, { arms: [], history: null }).correctness).toBe(
      "INCONCLUSIVE",
    );
    expect(
      await loadTournamentArm({
        ...f.armInputs[0]!,
        assessmentAt: "2026-11-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
  it("requires exact original disclosure and excludes protected text, paths, credentials and unapproved source", async () => {
    const f = await fixture(),
      r = report(f),
      artifact = prepareTournamentPublication(r, metadata);
    const serialized = JSON.stringify(artifact);
    for (const privateText of [
      f.parent,
      "PRIVATE_SENTINEL",
      f.study.evidence.instructions,
      f.study.definition.protocol.task.specification,
    ])
      expect(serialized).not.toContain(privateText);
    expect(artifact.projection.sourceComparison).toHaveLength(1);
    expect(() =>
      authorizeTournamentPublication(
        r,
        metadata,
        { verdict: "VERIFIED" },
        f.assessmentAt,
      ),
    ).toThrow();
    const approval = await f.hold({
      id: "disclosure-original",
      studyId: r.studyId,
      kind: "disclosure",
      heldAt: f.assessmentAt,
      subjectSha256: disclosureSubject(artifact),
      predecessorSha256: r.preparedOriginalSha256,
    });
    expect(
      authorizeTournamentPublication(r, metadata, approval, f.assessmentAt),
    ).toEqual(artifact);
    expect(() =>
      authorizeTournamentPublication(
        r,
        { ...metadata, title: "Altered title" },
        approval,
        f.assessmentAt,
      ),
    ).toThrow();
    expect(() =>
      prepareTournamentPublication(structuredClone(r), metadata),
    ).toThrow();
    expect(() =>
      prepareTournamentPublication(r, {
        ...metadata,
        publishSourcePaths: ["src/invented.ts"],
      }),
    ).toThrow();
    expect(jsonDigest(artifact)).toBe(disclosureSubject(artifact));
  });
});
