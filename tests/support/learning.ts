// SYNTHETIC ONLY. Test-owned keys/receipts; no oracle, model or agent executes.
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ContextSchema,
  ProposalSchema,
  type LearningContext,
} from "../../src/lib/learning/contracts";
import { canonicalJson } from "../../src/lib/report/canonical";
import {
  jsonDigest,
  receiptManifestDigest,
  checkArtifactDigest,
  sha256,
} from "../../src/lib/report/digests";
import {
  createProtectedEvaluationStore,
  type EvaluationAllowlistEntry,
} from "../../src/server/artifacts/evaluation-store";
import {
  createStudyCustodyStore,
  type CustodianRecord,
} from "../../scripts/experiments/tournament/custody";
import {
  ProjectionSchema,
  admitObservation,
  type Projection,
} from "../../scripts/learning/intake";
import { createSnapshot } from "../../scripts/learning/dataset";
import type {
  CheckResultV1,
  EvaluatorReceiptV1,
} from "../../src/lib/contracts/evidence";
import {
  FEATURE_VERSION,
  ACTION_VERSION,
  REWARD_VERSION,
} from "../../src/lib/learning/contracts";

export const h = (value: string) => sha256(value);
export const t = (minute: number) =>
  "2026-10-28T12:" + String(minute).padStart(2, "0") + ":00.000Z";
export function learningContext(): LearningContext {
  return ContextSchema.parse({
    schemaVersion: "learning-context.v1",
    id: "synthetic-context",
    sourceSha256: h("source"),
    intentSha256: h("intent"),
    repositoryFamily: h("repo-1"),
    taskFamily: h("task-1"),
    frozenAt: t(1),
    actions: {
      schemaVersion: ACTION_VERSION,
      reviewSha256: h("actions"),
      eligible: ["KEEP", "BOUNDARY"],
    },
    facts: {
      repositoryFiles: 50,
      moduleCount: 20,
      meanFanOut: 2,
      boundaryPresent: false,
      requirement: "authorization",
      estimatedChangedModules: 3,
      testCoverage: 0.7,
      uncertainty: 0.1,
      budgetMinutes: 90,
    },
  });
}
export function glimmerProposal(c: LearningContext, tuned = false) {
  return ProposalSchema.parse({
    schemaVersion: "learning-proposal.v1",
    contextSha256: jsonDigest(c),
    candidateSetSha256: jsonDigest(c.actions),
    proposed: c.actions.eligible,
    authority: "proposal_only",
    provenance: {
      schemaVersion: "learning-model-provenance.v1",
      provider: "open_weight_local",
      modelId: "meta-models/Muse-Glimmer-30B",
      revision: "a".repeat(40),
      tokenizerRevision: "a".repeat(40),
      adaptation: tuned ? "qlora_sft" : "none",
      adapterSha256: tuned ? h("adapter") : null,
      promptSha256: h("prompt"),
      inputSha256: jsonDigest(c),
      responseSha256: h("synthetic-response"),
      consentSha256: h("consent"),
      rightsReviewSha256: h("rights"),
      temperature: 0,
      seed: 7,
    },
  });
}
export async function learningFixture(
  cleanup: string[],
  options: {
    id?: string;
    context?: LearningContext;
    failures?: string[];
    missing?: string[];
    baselineFailure?: boolean;
    offset?: number;
    mutate?: (p: Projection) => void;
  } = {},
) {
  const id = options.id ?? "unit";
  const at = (minute: number) => t(minute + (options.offset ?? 0));
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-learning-unit-")),
  );
  cleanup.push(parent);
  const root = path.join(parent, "originals"),
    evalRoot = path.join(parent, "evaluations"),
    workspace = path.join(parent, "worker");
  for (const d of [root, evalRoot, workspace]) await mkdir(d, { mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey
    .export({ format: "pem", type: "spki" })
    .toString();
  const revoked = canonicalJson({ revokedIds: [] });
  await writeFile(path.join(root, "revocations.json"), revoked, {
    mode: 0o400,
  });
  const entries = new Map<string, { file: string; sha256: string }>();
  const custodyConfig = {
    originalRoot: root,
    publicKeyPem,
    publicKeySha256: sha256(publicKeyPem),
    revocationSha256: sha256(revoked),
    workspaceRoots: [workspace],
    entries,
  };
  const loadRecord = async (name: string) =>
    (await createStudyCustodyStore(custodyConfig)).load(name);
  async function hold(record: CustodianRecord) {
    const bytes = canonicalJson({
      record,
      signature: sign(
        null,
        Buffer.from(canonicalJson(record)),
        privateKey,
      ).toString("base64"),
    });
    const file = record.id + ".json";
    await writeFile(path.join(root, file), bytes, { flag: "wx", mode: 0o400 });
    entries.set(record.id, { file, sha256: sha256(bytes) });
    return loadRecord(record.id);
  }
  const protocol = (await hold({
    schemaVersion: "tournament-custodian-record.local.v1",
    id: id + "-protocol",
    kind: "protocol",
    studyId: id + "-study",
    subjectSha256: h("protocol-subject"),
    predecessorSha256: null,
    heldAt: at(0),
    expiresAt: "2026-10-29T12:00:00.000Z",
  }))!;
  const evalEntries = new Map<string, EvaluationAllowlistEntry>();
  async function evaluation(action: string, phase: "baseline" | "future") {
    const runId = id + "-" + action + "-" + phase,
      directory = runId;
    await mkdir(path.join(evalRoot, directory), { mode: 0o700 });
    const status =
      phase === "baseline"
        ? options.baselineFailure
          ? "fail"
          : "pass"
        : options.failures?.includes(action)
          ? "fail"
          : "pass";
    const bytes = canonicalJson({
      synthetic: true,
      PRIVATE_GRADER_SENTINEL: "never disclose",
      status,
    });
    await writeFile(path.join(evalRoot, directory, "check.json"), bytes, {
      mode: 0o400,
    });
    const checks: CheckResultV1[] =
      options.missing?.includes(action) && phase === "future"
        ? []
        : [
            {
              schemaVersion: "check-result.v1",
              id: "required",
              runId,
              kind: "acceptance",
              status,
              exitCode: status === "pass" ? 0 : 1,
              evidencePath: "check.json",
              scope: "PRIVATE_GRADER_SENTINEL",
              artifactSha256: sha256(bytes),
            },
          ];
    const identity = {
      runId,
      evaluatedTreeSha256: h(runId),
      fixtureSha256: h("fixture"),
      evaluatorSha256: h("evaluator"),
      testSuiteSha256: h(phase),
      requiredPolicySha256: h(phase + "-policy"),
      requiredCheckIds: ["required"],
    };
    const receipt: EvaluatorReceiptV1 = {
      schemaVersion: "evaluator-receipt.v1",
      id: "receipt-" + runId,
      ...identity,
      checkArtifactSha256: checkArtifactDigest(checks),
      startedAt: at(phase === "baseline" ? 2 : 5),
      finishedAt: at(phase === "baseline" ? 2 : 6),
      issuer: "trusted-local-evaluator",
      integrity: {
        kind: "trusted-local-artifact",
        manifestSha256: h("placeholder"),
      },
    };
    receipt.integrity.manifestSha256 = receiptManifestDigest(receipt);
    const bundle = canonicalJson({ receipt, checks });
    await writeFile(path.join(evalRoot, directory, "evaluation.json"), bundle, {
      mode: 0o400,
    });
    evalEntries.set(runId, {
      directory,
      identity,
      bundleSha256: sha256(bundle),
    });
    return {
      runId,
      receiptId: receipt.id,
      receiptSha256: receiptManifestDigest(receipt),
    };
  }
  const c = options.context ?? learningContext();
  if (!options.context) c.frozenAt = at(1);
  const arms = [];
  for (const action of c.actions.eligible)
    arms.push({
      action,
      baseline: await evaluation(action, "baseline"),
      future: await evaluation(action, "future"),
      preparationCostUsd: action === "KEEP" ? 0 : 2,
      downstreamCostUsd: 3,
      costBasis: "authenticated_actual_usd" as const,
    });
  const projection = ProjectionSchema.parse({
    schemaVersion: "approved-learning-projection.v1",
    origin: "SYNTHETIC",
    studyId: id + "-study",
    protocolSubjectSha256: protocol.record.subjectSha256,
    protocolOriginalSha256: protocol.sha256,
    context: c,
    decisionAt: at(2),
    observedAt: at(10),
    decision: {
      selected: "KEEP",
      selector: "roadmap-fixed.v1",
      proposal: glimmerProposal(c),
    },
    rightsReviewSha256: h("rights"),
    comparison: "COMPARABLE",
    comparisonReviewSha256: h("comparison"),
    matchedConditionsSha256: h("matched"),
    attemptHistorySha256: h("history"),
    inference: { latencyMs: null, costUsd: null },
    regressions: c.actions.eligible.map((action) => ({
      action,
      occurred: null,
    })),
    attempts: arms.map((a) => ({
      id: a.future.runId,
      action: a.action,
      status: "completed",
      startedAt: at(3),
      endedAt: at(4),
    })),
    arms,
  });
  options.mutate?.(projection);
  const approval = (await hold({
    schemaVersion: "tournament-custodian-record.local.v1",
    id: id + "-approval",
    kind: "disclosure",
    studyId: projection.studyId,
    subjectSha256: jsonDigest(projection),
    predecessorSha256: protocol.sha256,
    heldAt: at(11),
    expiresAt: "2026-10-29T12:00:00.000Z",
  }))!;
  const loadEvaluation = async (name: string) =>
    (
      await createProtectedEvaluationStore({
        root: evalRoot,
        agentWorkspaceRoot: workspace,
        entries: evalEntries,
      })
    ).load(name);
  const input = {
    projection,
    approvalId: approval.record.id,
    protocolId: protocol.record.id,
    assessmentAt: at(30),
    loadRecord,
    loadEvaluation,
  };
  return {
    parent,
    root,
    evalRoot,
    projection,
    input,
    hold,
    loadRecord,
    evalEntries,
    admit: () => admitObservation(input),
  };
}
export function snapshotOf(
  observations: Awaited<
    ReturnType<Awaited<ReturnType<typeof learningFixture>>["admit"]>
  >[],
  splits: ("train" | "validation" | "test")[] = [],
) {
  return createSnapshot(
    {
      schemaVersion: "learning-dataset.v1",
      featureVersion: FEATURE_VERSION,
      actionVersion: ACTION_VERSION,
      rewardVersion: REWARD_VERSION,
      origin: "SYNTHETIC",
      frozenAt: t(20),
      splitReviewSha256: h("split-review"),
      rows: observations.map((o, i) => ({
        observationSha256: o.sha256,
        contextSha256: jsonDigest(o.projection.context),
        repositoryFamily: o.projection.context.repositoryFamily,
        taskFamily: o.projection.context.taskFamily,
        split: splits[i] ?? "train",
        evidence: o.evidence,
      })),
    },
    observations,
  );
}
