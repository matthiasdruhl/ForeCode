// SYNTHETIC ONLY: real custody/evaluation/source adapters, test-owned originals.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { learningSourceFixture } from "./learning-source";
import { learningContext, snapshotOf, h, t } from "./learning";
import {
  createApprovedEvidenceSource,
  type EvidenceSource,
} from "../../scripts/learning/source";
import { openEvidenceLedger } from "../../scripts/learning/ledger";
import { openLearningRegistry } from "../../scripts/learning/registry";
import { createPolicy } from "../../scripts/learning/policy";
import { learningTrainerIdentity } from "../../scripts/learning/trainer-identity";
import type { AdmittedObservation } from "../../scripts/learning/intake";
import type { ShadowPlan } from "../../scripts/learning/shadow-contracts";

export async function shadowFixture(
  cleanup: string[],
  shared?: { field: "repositoryFamily" | "taskFamily"; withIndex: 0 | 3 },
) {
  const fixtures = [],
    sources = new Map<string, EvidenceSource>();
  const observations: AdmittedObservation[] = [];
  for (let i = 0; i < 4; i++) {
    const context = learningContext();
    context.repositoryFamily = h("shadow-repo-" + i);
    context.taskFamily = h("shadow-task-" + i);
    if (i === 2 && shared)
      context[shared.field] = h(
        "shadow-" +
          (shared.field === "repositoryFamily" ? "repo" : "task") +
          "-" +
          shared.withIndex,
      );
    const f = await learningSourceFixture(cleanup, {
      id: "shadow-" + i,
      context,
      failures: i === 0 ? ["BOUNDARY"] : [],
      mutate: (p) => {
        if (i === 3) {
          p.comparison = "BLOCKED";
          p.arms.forEach((a) => {
            a.preparationCostUsd = null;
          });
        }
      },
    });
    fixtures.push(f);
    const id = "source-" + i;
    const source = await createApprovedEvidenceSource({
      ...f.config,
      entries: new Map([[id, f.entry]]),
    });
    sources.set(id, source);
  }
  // Multiplex actual branded adapters rather than bypassing authentication.
  const source: EvidenceSource = {
    configured: true,
    entryCount: sources.size,
    load: (id, at) =>
      sources.get(id)?.load(id, at) ??
      Promise.resolve({ status: "BLOCKED", reason: "SOURCE_ID_UNKNOWN" }),
  };
  const root = fixtures[0]!.parent,
    ledgerRoot = path.join(root, "ledger"),
    registryRoot = path.join(root, "registry");
  await mkdir(ledgerRoot, { mode: 0o700 });
  await mkdir(registryRoot, { mode: 0o700 });
  const ledgerConfig = {
    root: ledgerRoot,
    excludedRoots: fixtures.flatMap((f) => [
      f.sourceRoot,
      path.join(f.parent, "worker"),
    ]),
    expectedHead: { sequence: 0, sha256: null },
    mode: "SYNTHETIC" as const,
  };
  const ledger = await openEvidenceLedger(ledgerConfig),
    registry = await openLearningRegistry(registryRoot);
  for (const id of sources.keys()) {
    const result = await source.load(id, t(30));
    if (result.status !== "ADMITTED")
      throw new Error("Synthetic fixture admission failed.");
    observations.push(result.observation);
    await ledger.append({ sourceId: id, at: t(30), result });
  }
  await ledger.append({
    sourceId: "source-0",
    at: t(31),
    result: await source.load("source-0", t(31)),
  });
  await ledger.append({
    sourceId: "missing",
    at: t(32),
    result: await source.load("missing", t(32)),
  });
  const trainer = await learningTrainerIdentity();
  const plan: ShadowPlan = {
    schemaVersion: "learning-shadow-plan.local.v1",
    id: "synthetic-shadow-job",
    origin: "SYNTHETIC",
    frozenAt: t(35),
    ledgerHead: (await ledger.inspect()).head,
    trainerSha256: trainer.sha256,
    seed: 7,
    config: createPolicy({ trainerSha256: trainer.sha256 }).policy.config,
    batches: [
      { ...snapshotOf([observations[0]!]).manifest, frozenAt: t(33) },
      {
        ...snapshotOf([observations[1]!]).manifest,
        // Assemble from individually admitted rows so deliberately leaky
        // negative fixtures reach the replay's GLOBAL validation boundary.
        rows: observations
          .slice(1)
          .map(
            (o, i) =>
              snapshotOf([o], [i === 1 ? "test" : "train"]).manifest.rows[0]!,
          ),
        frozenAt: t(34),
      },
    ],
  };
  const input = {
    plan,
    source,
    ledger,
    registry,
    assessedAt: t(40),
    mode: "SYNTHETIC" as const,
  };
  return {
    fixtures,
    observations,
    source,
    sources,
    ledger,
    ledgerConfig,
    ledgerRoot,
    registry,
    registryRoot,
    plan,
    input,
  };
}
