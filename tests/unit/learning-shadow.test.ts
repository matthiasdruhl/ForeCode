import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { shadowFixture } from "../support/shadow-learning";
import { glimmerProposal, learningContext, h, t } from "../support/learning";
import { canonicalJson } from "../../src/lib/report/canonical";
import { jsonDigest } from "../../src/lib/report/digests";
import { extractFeatures } from "../../src/lib/learning/features";
import {
  replayShadowPlan,
  isFreshShadowReplay,
} from "../../scripts/learning/shadow";
import { policyWeights, recommend } from "../../scripts/learning/policy";
import { learningTrainerIdentity } from "../../scripts/learning/trainer-identity";
import { shadowLearningCli } from "../../scripts/learning/shadow-cli";
import { unprovisionedEvidenceSource } from "../../scripts/learning/source";
import { draftShadowDecision } from "../../scripts/learning/shadow-decision";

const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

describe("anchored offline shadow replay — synthetic implementation tests only", () => {
  it("freshly admits a complete prefix, makes two real policy updates and replays/persists/rolls back exactly", async () => {
    const f = await shadowFixture(cleanup),
      result = await replayShadowPlan(f.input);
    expect(result.report.status).toBe("SHADOW");
    expect(result.policy.policy.version).toBe(2);
    expect(result.policy.policy.updates).toHaveLength(4);
    expect(result.report.audit.map((r) => r.status)).toEqual([
      "ADMITTED",
      "ADMITTED",
      "ADMITTED",
      "ADMITTED",
      "REPLAY",
      "BLOCKED",
    ]);
    expect(result.report.observations).toHaveLength(4);
    expect(
      result.report.observations[0]!.rewards.find(
        (r) => r.action === "BOUNDARY",
      )!.correctness,
    ).toBe(0);
    expect(
      result.report.observations[3]!.rewards.every(
        (r) => r.correctness === null && r.totalCostUsd === null,
      ),
    ).toBe(true);
    expect(result.report.trainingRepositoryFamilies).toBe(2);
    expect(result.report.trainingTaskFamilies).toBe(2);
    expect(result.report.observations[2]!.split).toBe("test");
    expect(
      result.policy.policy.updates.some(
        (u) => u.observationSha256 === f.observations[2]!.sha256,
      ),
    ).toBe(false);
    const x = extractFeatures(f.observations[0]!.projection.context).values,
      q = x.reduce((s, v) => s + v * v, 0);
    expect(policyWeights(result.policy, "KEEP")[0]).toBeCloseTo(
      2 / (1 + 2 * q),
      10,
    );
    expect(policyWeights(result.policy, "BOUNDARY")[0]).toBeCloseTo(
      1 / (1 + 2 * q),
      10,
    );
    expect(
      recommend(
        result.policy,
        { ...f.observations[0]!.projection.context, frozenAt: t(41) },
        "SYNTHETIC",
      ).reason,
    ).toBe("INSUFFICIENT_INDEPENDENT_SUPPORT");
    expect(isFreshShadowReplay(result)).toBe(true);
    expect(isFreshShadowReplay(structuredClone(result))).toBe(false);
    expect(await f.registry.loadShadowPlan(result.report.planSha256)).toEqual(
      f.plan,
    );
    expect(await f.registry.loadShadowReport(result.sha256)).toEqual(
      result.report,
    );
    expect(
      isFreshShadowReplay(await f.registry.loadShadowReport(result.sha256)),
    ).toBe(false);
    expect(await replayShadowPlan(f.input)).toEqual(result);
    expect(await f.registry.loadPolicy(result.policy.sha256)).toEqual(
      result.policy,
    );
    const rolledBack = await f.registry.rollback(
      result.policy.sha256,
      result.report.initialPolicySha256,
      t(41),
    );
    expect(rolledBack.artifact.policy.status).toBe("NOT_TRAINED");
    expect(
      (await f.registry.loadPolicy(result.policy.sha256)).policy.version,
    ).toBe(2);
    expect(result.report.trainerSha256).toBe(
      jsonDigest(result.report.trainerManifest),
    );
    expect(JSON.stringify(result.report)).not.toContain(
      "PRIVATE_GRADER_SENTINEL",
    );
    expect(JSON.stringify(result.report)).not.toContain(f.fixtures[0]!.parent);
    expect(result.report.conclusion).toBe("NO_INDEPENDENT_EVALUATION");
  });

  it.each([
    "dropped-failure",
    "dropped-ineligible",
    "duplicate-row",
    "wrong-origin",
    "trainer",
    "version",
    "anchor",
    "future-plan",
    "batch-before-admission",
    "batch-order",
    "row-binding",
  ])("rejects %s before any registry writes", async (defect) => {
    const f = await shadowFixture(cleanup),
      plan = structuredClone(f.plan);
    if (defect === "dropped-failure") plan.batches[0]!.rows = [];
    if (defect === "dropped-ineligible") plan.batches[1]!.rows.pop();
    if (defect === "duplicate-row")
      plan.batches[1]!.rows[0] = plan.batches[0]!.rows[0]!;
    if (defect === "wrong-origin") plan.origin = "AUTHENTIC";
    if (defect === "trainer") plan.trainerSha256 = h("forged trainer");
    if (defect === "version") Object.assign(plan, { schemaVersion: "v99" });
    if (defect === "anchor") plan.ledgerHead.sha256 = h("different anchor");
    if (defect === "future-plan") plan.frozenAt = t(41);
    if (defect === "batch-before-admission") plan.batches[0]!.frozenAt = t(29);
    if (defect === "batch-order") plan.batches.reverse();
    if (defect === "row-binding")
      plan.batches[1]!.rows[0]!.contextSha256 = h("wrong context");
    await expect(replayShadowPlan({ ...f.input, plan })).rejects.toThrow();
    expect(await readdir(f.registryRoot)).toEqual([]);
  });

  it("rejects repository OR task leakage across batches, including an ineligible earlier row", async () => {
    for (const field of ["repositoryFamily", "taskFamily"] as const) {
      for (const withIndex of [0, 3] as const) {
        const f = await shadowFixture(cleanup, { field, withIndex }),
          plan = structuredClone(f.plan);
        if (withIndex === 3) {
          const ineligible = plan.batches[1]!.rows.pop()!;
          plan.batches[1]!.rows.unshift(plan.batches[0]!.rows[0]!);
          plan.batches[0]!.rows = [ineligible];
        }
        await expect(replayShadowPlan({ ...f.input, plan })).rejects.toThrow(
          "leakage",
        );
        expect(await readdir(f.registryRoot)).toEqual([]);
      }
    }
  });

  it("records a future fixed/learned comparison with positive and negative train-only cases, without claiming outcomes", async () => {
    const f = await shadowFixture(cleanup),
      replay = await replayShadowPlan(f.input),
      context = learningContext();
    context.intentSha256 = h("genuinely-new-synthetic-intent");
    context.frozenAt = t(39);
    const proposal = glimmerProposal(context),
      draft = draftShadowDecision({
        replay,
        context,
        proposal,
        at: t(40),
        mode: "SYNTHETIC",
      });
    expect(draft.record.fixed.action).toBe("BOUNDARY");
    expect(draft.record.learned.action).toBe("ABSTAIN");
    expect(draft.record.learned.reason).toBe(
      "INSUFFICIENT_INDEPENDENT_SUPPORT",
    );
    expect(draft.record.memory.status).toBe("CASES_AVAILABLE");
    expect(
      draft.record.memory.cases.map((c) => c.observationSha256).sort(),
    ).toEqual(
      f.observations
        .slice(0, 2)
        .map((o) => o.sha256)
        .sort(),
    );
    expect(
      draft.record.memory.cases
        .flatMap((c) => c.rewards)
        .some((r) => r.correctness === 0),
    ).toBe(true);
    expect(draft.record.proposalSha256).toBe(jsonDigest(proposal));
    expect(draft.record.outcome).toBe("UNOBSERVED");
    expect(draft.record.independentCommitment).toBe("REQUIRED");
    expect(draft.record.authority).toBe("DRAFT_ONLY");
    expect(await f.registry.saveShadowDecision(draft.record)).toBe(
      draft.sha256,
    );
    expect(await f.registry.loadShadowDecision(draft.sha256)).toEqual(
      draft.record,
    );
    expect(
      draftShadowDecision({ replay, context, at: t(40), mode: "SYNTHETIC" })
        .record.proposalSha256,
    ).toBeNull();
    expect(JSON.stringify(draft)).not.toContain("PRIVATE_GRADER_SENTINEL");
  });

  it.each([
    "synthetic-default",
    "copied-replay",
    "stale-replay",
    "future-context",
    "old-context",
    "known-outcome",
    "unsafe-model",
    "partial-candidates",
  ])("rejects %s shadow decision drafts", async (defect) => {
    const f = await shadowFixture(cleanup),
      replay = await replayShadowPlan(f.input),
      context = learningContext();
    context.intentSha256 = h("new-future-intent");
    context.frozenAt = t(39);
    if (defect === "future-context") context.frozenAt = t(41);
    if (defect === "old-context") context.frozenAt = t(33);
    if (defect === "known-outcome")
      context.intentSha256 = f.observations[0]!.projection.context.intentSha256;
    const proposal = glimmerProposal(context);
    if (defect === "unsafe-model")
      Object.assign(proposal.provenance, {
        provider: "meta_model_api",
        adaptation: "qlora_sft",
      });
    if (defect === "partial-candidates") proposal.proposed = ["BOUNDARY"];
    expect(() =>
      draftShadowDecision({
        replay: defect === "copied-replay" ? structuredClone(replay) : replay,
        context,
        proposal,
        at: defect === "stale-replay" ? t(41) : t(40),
        mode: defect === "synthetic-default" ? undefined : "SYNTHETIC",
      }),
    ).toThrow();
  });

  it("defaults to authentic mode and cannot use serialized source receipts", async () => {
    const f = await shadowFixture(cleanup);
    await expect(
      replayShadowPlan({ ...f.input, mode: undefined }),
    ).rejects.toThrow("Synthetic");
    const result = await f.source.load("source-0", t(40));
    const forged = { ...f.source, load: async () => structuredClone(result) };
    await expect(
      replayShadowPlan({ ...f.input, source: forged }),
    ).rejects.toThrow("Fresh approved");
    await expect(
      replayShadowPlan({ ...f.input, source: unprovisionedEvidenceSource }),
    ).rejects.toThrow("not configured");
    expect(await readdir(f.registryRoot)).toEqual([]);
  });

  it.each(["revocation", "packet-change", "private-check-tamper"])(
    "fresh reload catches %s after the original admission",
    async (defect) => {
      const f = await shadowFixture(cleanup),
        original = f.fixtures[0]!;
      let file: string;
      if (defect === "revocation")
        file = path.join(original.root, "revocations.json");
      else if (defect === "packet-change") file = original.file;
      else
        file = path.join(
          original.evalRoot,
          "shadow-0-KEEP-future",
          "check.json",
        );
      await chmod(file, 0o600);
      await writeFile(
        file,
        defect === "revocation"
          ? canonicalJson({ revokedIds: ["learning-export"] })
          : "changed",
      );
      await expect(replayShadowPlan(f.input)).rejects.toThrow("Fresh approved");
      expect(await readdir(f.registryRoot)).toEqual([]);
    },
  );

  it("does not trust an earlier saved policy/report after the source is revoked", async () => {
    const f = await shadowFixture(cleanup),
      prior = await replayShadowPlan(f.input);
    const file = path.join(f.fixtures[1]!.root, "revocations.json");
    await chmod(file, 0o600);
    await writeFile(file, canonicalJson({ revokedIds: ["learning-export"] }));
    await expect(replayShadowPlan(f.input)).rejects.toThrow("Fresh approved");
    expect((await f.registry.loadPolicy(prior.policy.sha256)).sha256).toBe(
      prior.policy.sha256,
    );
    expect((await f.registry.loadShadowReport(prior.sha256)).policySha256).toBe(
      prior.policy.sha256,
    );
  });

  it("retains held-out/ineligible batches without inventing updates", async () => {
    const f = await shadowFixture(cleanup),
      plan = structuredClone(f.plan);
    plan.batches.forEach((b) =>
      b.rows.forEach((r) => {
        r.split = "test";
      }),
    );
    const result = await replayShadowPlan({ ...f.input, plan });
    expect(result.report.status).toBe("NOT_TRAINED");
    expect(result.policy.policy.version).toBe(0);
    expect(result.report.steps.every((s) => !s.updated)).toBe(true);
    expect(result.report.observations).toHaveLength(4);
    expect(result.report.trainingRepositoryFamilies).toBe(0);
    for (const snapshot of result.snapshots)
      expect(
        await f.registry.loadSnapshot(snapshot.sha256, snapshot.observations),
      ).toEqual(snapshot);
  });

  it("rejects an anchor that advances during fresh loading", async () => {
    const f = await shadowFixture(cleanup);
    let appended = false;
    const source = {
      ...f.source,
      async load(id: string, at: string) {
        if (!appended) {
          appended = true;
          await f.ledger.append({
            sourceId: "later",
            at: t(39),
            result: { status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" },
          });
        }
        return f.source.load(id, at);
      },
    };
    await expect(replayShadowPlan({ ...f.input, source })).rejects.toThrow(
      "during replay",
    );
    expect(await readdir(f.registryRoot)).toEqual([]);
  });

  it("detects report corruption and records a stable code/Node/lock identity", async () => {
    const f = await shadowFixture(cleanup),
      result = await replayShadowPlan(f.input);
    expect(await learningTrainerIdentity()).toEqual(
      await learningTrainerIdentity(),
    );
    const file = path.join(f.registryRoot, "shadow-" + result.sha256 + ".json");
    const report = JSON.parse(await readFile(file, "utf8"));
    report.policySha256 = h("corrupt");
    await chmod(file, 0o600);
    await writeFile(file, canonicalJson(report));
    await expect(f.registry.loadShadowReport(result.sha256)).rejects.toThrow(
      "identity mismatch",
    );
  });

  it("exposes only allowlisted offline jobs, keeps default composition blocked and redacts errors", async () => {
    const f = await shadowFixture(cleanup),
      out: string[] = [],
      error: string[] = [];
    const deps = {
      ...f.input,
      jobs: new Map([
        [f.plan.id, { plan: f.plan, sha256: jsonDigest(f.plan) }],
      ]),
      now: () => t(40),
      out: (s: string) => out.push(s),
      error: (s: string) => error.push(s),
    };
    expect(await shadowLearningCli(["--status"], deps)).toBe(0);
    expect(await shadowLearningCli(["--replay", f.plan.id], deps)).toBe(0);
    expect(JSON.parse(out.at(-1)!)).toMatchObject({
      origin: "SYNTHETIC",
      status: "SHADOW",
      updates: 4,
      promotion: "DISABLED",
    });
    expect(await shadowLearningCli(["--replay", "unknown"], deps)).toBe(2);
    for (const args of [
      ["--train"],
      ["--replay", "../path"],
      ["--promote", f.plan.id],
      ["--origin", "SYNTHETIC"],
    ])
      expect(await shadowLearningCli(args, deps)).toBe(1);
    expect(
      await shadowLearningCli(["--status"], {
        ...deps,
        source: unprovisionedEvidenceSource,
      }),
    ).toBe(2);
    const invalid = new Map([
      [f.plan.id, { plan: f.plan, sha256: h("wrong pin") }],
    ]);
    expect(
      await shadowLearningCli(["--replay", f.plan.id], {
        ...deps,
        jobs: invalid,
      }),
    ).toBe(1);
    expect(error.at(-1)).toBe(
      "Shadow replay is unavailable or invalid; no policy was promoted.\n",
    );
    expect(out.join("") + error.join("")).not.toContain(
      "PRIVATE_GRADER_SENTINEL",
    );
    expect(out.join("") + error.join("")).not.toContain(f.fixtures[0]!.parent);
  });
});
