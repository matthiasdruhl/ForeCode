import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { studyFixture } from "../support/tournament-study";
import { learningContext } from "../support/learning";
import { experimentRun } from "../support/research-data";
import {
  draftLearningExport,
  LearningExportDraftSchema,
} from "../../scripts/learning/export";
import { ApprovedPacketSchema } from "../../scripts/learning/source";
import { mainDraftSource } from "../support/learning-source";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const f = await studyFixture();
  cleanup.push(f.parent);
  const c = learningContext();
  c.sourceSha256 = f.study.draft.plan.conditions[0]!.originalTreeSha256;
  c.intentSha256 = f.study.draft.plan.visibleRoadmapSha256;
  c.frozenAt = "2026-10-28T12:00:30.000Z";
  return {
    study: f.study,
    context: c,
    mapping: { A: "KEEP", B: "BOUNDARY" },
    attempts: [],
    core: mainDraftSource,
  };
}
describe("sanitized draft exporter against actual main tournament/preparation interfaces", () => {
  it("preserves main's blocked verdict, unknown costs and exact source lineage", async () => {
    const input = await fixture(),
      draft = draftLearningExport(input);
    expect(draft.sourceComparability).toBe("BLOCKED");
    expect(draft.comparison).toBe("BLOCKED");
    expect(draft.trainingEligible).toBe(false);
    expect(
      draft.arms.every(
        (a) => a.preparationCostUsd === null && a.downstreamCostUsd === null,
      ),
    ).toBe(true);
    expect(draft.protocolOriginalSha256).toBe(input.study.protocol.sha256);
    expect(draft.preparationAttempts).toHaveLength(1);
    expect(draft.arms.map((a) => a.strategy)).toEqual(["KEEP", "BOUNDARY"]);
    expect(Object.isFrozen(draft.arms[0])).toBe(true);
    expect(ApprovedPacketSchema.safeParse(draft).success).toBe(false);
    expect(
      LearningExportDraftSchema.safeParse({
        ...draft,
        comparison: "COMPARABLE",
        trainingEligible: true,
      }).success,
    ).toBe(false);
    expect(JSON.stringify(draft)).not.toContain("src/service.ts");
    expect(JSON.stringify(draft)).not.toContain(
      "Synthetic architecture proposal",
    );
  });
  it("retains all failed/cancelled/unplanned attempts and ignores reported zero costs", async () => {
    const input = await fixture(),
      run = experimentRun();
    run.id = input.study.draft.plan.manifest.arms[0]!.runId!;
    run.status = "failed";
    run.seed = 1;
    run.startedAt = "2026-10-28T12:06:00.000Z";
    run.endedAt = "2026-10-28T12:07:00.000Z";
    run.metrics = {
      elapsedMs: 0,
      tokens: 0,
      costUsd: 0,
      iterations: 0,
      filesTouched: 0,
    };
    run.limitations = ["PRIVATE_GRADER_SENTINEL private diagnostics"];
    const draft = draftLearningExport({
      ...input,
      attempts: [
        run,
        { ...run, id: "unplanned-attempt", status: "cancelled" },
        { ...run, id: "unmapped-C-attempt", variant: "C", status: "blocked" },
      ],
    });
    expect(draft.comparison).toBe("INVALID");
    expect(draft.attempts.map((a) => a.status)).toEqual([
      "failed",
      "cancelled",
      "blocked",
    ]);
    expect(draft.attempts[2]!.strategy).toBeNull();
    expect(draft.attempts[2]!.variant).toBe("C");
    expect(draft.arms[0]!.downstreamCostUsd).toBeNull();
    expect(JSON.stringify(draft)).not.toContain("PRIVATE_GRADER_SENTINEL");
  });
  it.each([
    "source",
    "intent",
    "late-context",
    "unsupported-mapping",
    "forged-study",
  ])("rejects %s mismatch", async (defect) => {
    const input = await fixture();
    if (defect === "source") input.context.sourceSha256 = "f".repeat(64);
    if (defect === "intent") input.context.intentSha256 = "f".repeat(64);
    if (defect === "late-context")
      input.context.frozenAt = input.study.evidence.selectionAt;
    if (defect === "unsupported-mapping") input.mapping.B = "ADAPTER";
    if (defect === "forged-study") input.study = structuredClone(input.study);
    expect(() => draftLearningExport(input)).toThrow();
  });
});
