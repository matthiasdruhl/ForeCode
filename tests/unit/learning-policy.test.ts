import { afterEach, describe, expect, it } from "vitest";
import {
  chmod,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  createPolicy,
  parsePolicy,
  policyWeights,
  recommend,
  trainPolicy,
} from "../../scripts/learning/policy";
import {
  createSnapshot,
  validateDataset,
} from "../../scripts/learning/dataset";
import { openLearningRegistry } from "../../scripts/learning/registry";
import { extractFeatures } from "../../src/lib/learning/features";
import {
  learningContext,
  learningFixture,
  snapshotOf,
  h,
  t,
} from "../support/learning";
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((p) => rm(p, { force: true, recursive: true })),
  );
});
const syntheticPolicy = () =>
  createPolicy({ trainerSha256: h("trainer"), origin: "SYNTHETIC", seed: 7 });

describe("actual LinUCB updates and local persistence — SYNTHETIC implementation checks, no architecture uplift", () => {
  it("updates A by xxT and b by reward*x; exact ridge solution changes from zero", async () => {
    const f = await learningFixture(cleanup, { failures: ["BOUNDARY"] }),
      o = await f.admit();
    const snapshot = snapshotOf([o]),
      initial = syntheticPolicy(),
      trained = trainPolicy(initial, snapshot);
    const x = extractFeatures(o.projection.context).values,
      q = x.reduce((s, v) => s + v * v, 0);
    expect(policyWeights(initial, "KEEP").every((w) => w === 0)).toBe(true);
    expect(trained.policy.actions.KEEP.correctness.a[0]![0]).toBe(2);
    expect(trained.policy.actions.KEEP.correctness.b).toEqual(x);
    const theta = policyWeights(trained, "KEEP");
    x.forEach((v, i) => expect(theta[i]).toBeCloseTo(v / (1 + q), 10));
    expect(theta[0]).toBeGreaterThan(0);
    expect(policyWeights(trained, "BOUNDARY").every((w) => w === 0)).toBe(true);
    expect(trained.policy.actions.BOUNDARY.correctness.samples).toBe(1);
    expect(trained.policy.parentSha256).toBe(initial.sha256);
    expect(trained.policy.snapshots).toEqual([snapshot.sha256]);
    expect(trained.policy.status).toBe("SHADOW");
    expect(initial.policy.version).toBe(0);
    expect(Object.isFrozen(trained.policy.actions.KEEP.correctness.a[0])).toBe(
      true,
    );
    expect(recommend(trained, o.projection.context).reason).toBe(
      "SYNTHETIC_POLICY_ISOLATED",
    );
    expect(recommend(trained, o.projection.context, "SYNTHETIC").action).toBe(
      "ABSTAIN",
    );
  });
  it("replays deterministically and rejects duplicate, forged or held-out training snapshots", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit(),
      s = snapshotOf([o]);
    const a = trainPolicy(syntheticPolicy(), s),
      b = trainPolicy(syntheticPolicy(), s);
    expect(a).toEqual(b);
    expect(() => trainPolicy(a, s)).toThrow("already consumed");
    expect(() => trainPolicy(syntheticPolicy(), structuredClone(s))).toThrow(
      "Authenticated",
    );
    expect(() =>
      trainPolicy(createPolicy({ trainerSha256: h("trainer") }), s),
    ).toThrow("Synthetic");
    expect(() =>
      trainPolicy(syntheticPolicy(), snapshotOf([o], ["test"])),
    ).toThrow("No eligible");
    expect(() => createSnapshot(s.manifest, [structuredClone(o)])).toThrow(
      "authenticated",
    );
    const invalid = await learningFixture(cleanup, {
      id: "invalid",
      mutate: (p) => {
        p.comparison = "INVALID";
      },
    });
    expect(() =>
      trainPolicy(
        syntheticPolicy(),
        snapshotOf([o, { ...o, sha256: h("fake") }]),
      ),
    ).toThrow();
    expect(() =>
      trainPolicy(syntheticPolicy(), snapshotOf([o], ["validation"])),
    ).toThrow();
    expect(() => parsePolicy({ ...a, sha256: h("wrong") })).toThrow("digest");
    expect(() =>
      parsePolicy({ ...a, policy: { ...a.policy, featureVersion: "v2" } }),
    ).toThrow();
    expect(() => trainPolicy(syntheticPolicy(), snapshotOf([]))).toThrow(
      "No eligible",
    );
    const rejected = await invalid.admit();
    expect(() =>
      trainPolicy(syntheticPolicy(), snapshotOf([rejected])),
    ).toThrow("No eligible");
  });
  it("rejects repository OR task-family leakage, including across policy versions", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit();
    const c = learningContext();
    c.repositoryFamily = h("different-repo");
    const f2 = await learningFixture(cleanup, { id: "second", context: c }),
      o2 = await f2.admit();
    expect(() => snapshotOf([o, o2], ["train", "test"])).toThrow("leakage");
    const train = trainPolicy(syntheticPolicy(), snapshotOf([o]));
    const heldC = learningContext();
    heldC.taskFamily = h("different-task");
    const held = await learningFixture(cleanup, { id: "held", context: heldC }),
      heldO = await held.admit();
    expect(() => snapshotOf([o, heldO], ["train", "validation"])).toThrow(
      "leakage",
    );
    const heldS = snapshotOf([heldO], ["test"]);
    // Include a fresh legitimate train row so cross-version checks execute.
    const freshC = learningContext();
    freshC.repositoryFamily = h("fresh-repo");
    freshC.taskFamily = h("fresh-task");
    const fresh = await learningFixture(cleanup, {
        id: "fresh",
        context: freshC,
      }),
      freshO = await fresh.admit();
    expect(() =>
      trainPolicy(train, snapshotOf([freshO, heldO], ["train", "test"])),
    ).toThrow("held-out leakage");
    expect(heldS.manifest.rows[0]!.split).toBe("test");
    expect(() =>
      validateDataset({
        ...heldS.manifest,
        rows: [...heldS.manifest.rows, ...heldS.manifest.rows],
      }),
    ).toThrow("Repeated");
  });
  it("rejects replayed evidence under a new study and post-freeze outcomes", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit(),
      s = snapshotOf([o]);
    expect(() =>
      createSnapshot({ ...s.manifest, frozenAt: t(0) }, [o]),
    ).toThrow("freeze");
    const row = s.manifest.rows[0]!;
    expect(() =>
      createSnapshot(
        { ...s.manifest, rows: [{ ...row, repositoryFamily: h("fake") }] },
        [o],
      ),
    ).toThrow("binding");
    const a = trainPolicy(syntheticPolicy(), s);
    expect(a.policy.evidenceIds).toEqual([...o.evidence.receiptIds].sort());
  });
  it("saves/reloads immutable policies and evidence snapshots; rollback preserves history and detects corruption", async () => {
    const f = await learningFixture(cleanup),
      o = await f.admit(),
      s = snapshotOf([o]);
    const directory = path.join(f.parent, "registry");
    await mkdir(directory, { mode: 0o700 });
    const registry = await openLearningRegistry(directory),
      initial = syntheticPolicy(),
      trained = trainPolicy(initial, s);
    await registry.savePolicy(initial);
    await registry.savePolicy(trained);
    await registry.savePolicy(trained);
    await registry.saveSnapshot(s);
    const loaded = await registry.loadPolicy(trained.sha256);
    expect(loaded).toEqual(trained);
    expect(recommend(loaded, learningContext(), "SYNTHETIC")).toEqual(
      recommend(trained, learningContext(), "SYNTHETIC"),
    );
    expect(
      (await registry.loadSnapshot(s.sha256, [await f.admit()])).sha256,
    ).toBe(s.sha256);
    await expect(
      registry.loadSnapshot(s.sha256, [structuredClone(o)]),
    ).rejects.toThrow();
    const rollback = await registry.rollback(
      trained.sha256,
      initial.sha256,
      t(30),
    );
    expect(rollback.artifact.sha256).toBe(initial.sha256);
    expect((await registry.loadPolicy(trained.sha256)).sha256).toBe(
      trained.sha256,
    );
    await expect(
      registry.rollback(initial.sha256, trained.sha256, t(30)),
    ).rejects.toThrow("ancestor");
    const file = path.join(directory, "policy-" + trained.sha256 + ".json");
    const bytes = await readFile(file, "utf8");
    await chmod(file, 0o600);
    await writeFile(file, bytes.replace('"SHADOW"', '"NOT_TRAINED"'));
    await expect(registry.loadPolicy(trained.sha256)).rejects.toThrow();
    await expect(registry.savePolicy(trained)).rejects.toThrow("conflict");
    await expect(registry.loadPolicy("../escape")).rejects.toThrow();
    const alias = path.join(f.parent, "alias");
    await symlink(directory, alias);
    await expect(openLearningRegistry(alias)).rejects.toThrow("aliases");
  });
  it("abstains on absent/sparse/OOD data and ranks only offered actions once supported", async () => {
    const initial = createPolicy({ trainerSha256: h("trainer") });
    expect(initial.policy.status).toBe("NOT_TRAINED");
    expect(recommend(initial, learningContext()).reason).toBe("NOT_TRAINED");
    const observations = [];
    for (let i = 0; i < 3; i++) {
      const c = learningContext();
      c.repositoryFamily = h("repo-" + i);
      c.taskFamily = h("task-" + i);
      const f = await learningFixture(cleanup, {
        id: "support-" + i,
        context: c,
      });
      observations.push(await f.admit());
    }
    const p = trainPolicy(
      createPolicy({
        trainerSha256: h("trainer"),
        origin: "SYNTHETIC",
        config: { lambda: 0.001, alpha: 0.01 },
      }),
      snapshotOf(observations),
    );
    const advice = recommend(p, learningContext(), "SYNTHETIC");
    expect(advice.action).toBe("KEEP");
    expect(advice.ranking.map((r) => r.action).sort()).toEqual([
      "BOUNDARY",
      "KEEP",
    ]);
    const unsupported = learningContext();
    unsupported.actions.eligible.push("ADAPTER");
    expect(recommend(p, unsupported, "SYNTHETIC").reason).toBe(
      "INSUFFICIENT_INDEPENDENT_SUPPORT",
    );
    const ood = learningContext();
    ood.facts.repositoryFiles = 10000;
    ood.facts.moduleCount = 2000;
    ood.facts.meanFanOut = 20;
    ood.facts.estimatedChangedModules = 64;
    expect(recommend(p, ood, "SYNTHETIC").reason).toBe("OUT_OF_DISTRIBUTION");
    const missing = learningContext();
    missing.facts.repositoryFiles = null;
    missing.facts.moduleCount = null;
    missing.facts.meanFanOut = null;
    missing.facts.testCoverage = null;
    expect(recommend(p, missing, "SYNTHETIC").reason).toBe(
      "CONTEXT_UNSUPPORTED",
    );
  });
});
