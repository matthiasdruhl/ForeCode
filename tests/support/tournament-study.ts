// Synthetic, inert custody/source fixtures. Signing exists ONLY in test code.
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsonDigest, sha256 } from "../../src/lib/report/digests";
import { canonicalJson } from "../../src/lib/report/canonical";
import { futureStudyData } from "./future-study-data";
import {
  futureProtocolDocument,
  futureProtocolCommitment,
} from "../../scripts/experiments/tournament/future-study";
import {
  createStudyCustodyStore,
  type CustodyConfig,
  type CustodianRecord,
} from "../../scripts/experiments/tournament/custody";
import {
  preparedSubject,
  preparationSubject,
  protocolSubject,
  validatePreparedStudy,
  type PreparationEvidence,
  type StudyDefinition,
} from "../../scripts/experiments/tournament/study";
import { hash } from "./research-data";

export async function studyFixture() {
  const parent = await realpath(
    await mkdtemp(path.join(tmpdir(), "forecode-tournament-unit-")),
  );
  const root = path.join(parent, "originals"),
    workspace = path.join(parent, "worker"),
    studyRoot = path.join(parent, "study");
  for (const directory of [root, workspace, studyRoot])
    await mkdir(directory, { mode: 0o700 });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const revocationBytes = canonicalJson({ revokedIds: [] });
  await writeFile(path.join(root, "revocations.json"), revocationBytes, {
    mode: 0o400,
  });
  const entries = new Map<string, { file: string; sha256: string }>();
  const config: CustodyConfig = {
    originalRoot: root,
    workspaceRoots: [workspace],
    publicKeyPem,
    publicKeySha256: sha256(publicKeyPem),
    revocationSha256: sha256(revocationBytes),
    entries,
  };
  async function hold(
    input: Omit<CustodianRecord, "schemaVersion" | "expiresAt"> & {
      expiresAt?: string;
    },
  ) {
    const record: CustodianRecord = {
      schemaVersion: "tournament-custodian-record.local.v1",
      expiresAt: "2026-10-29T12:00:00.000Z",
      ...input,
    };
    const bytes = canonicalJson({
      record,
      signature: sign(
        null,
        Buffer.from(canonicalJson(record)),
        privateKey,
      ).toString("base64"),
    });
    const file = `${record.id}.json`;
    await writeFile(path.join(root, file), bytes, { mode: 0o400, flag: "wx" });
    entries.set(record.id, { file, sha256: sha256(bytes) });
    return (await createStudyCustodyStore(config)).load(record.id);
  }
  const draft = futureStudyData();
  const originalManifest = [
    { path: "package-lock.json", sha256: hash("6") },
    { path: "src/service.ts", sha256: hash("1") },
  ];
  const preparedManifest = [
    { path: "package-lock.json", sha256: hash("6") },
    { path: "src/policy.ts", sha256: hash("2") },
    { path: "src/service.ts", sha256: hash("3") },
  ];
  const originalTree = jsonDigest(originalManifest),
    preparedTree = jsonDigest(preparedManifest);
  draft.plan.manifest.fixtureSha256 = originalTree;
  draft.plan.manifest.arms[0]!.initialTreeSha256 = originalTree;
  draft.plan.manifest.arms[0]!.upfrontMetrics = {
    elapsedMs: 0,
    tokens: 0,
    costUsd: 0,
    iterations: 0,
    filesTouched: 0,
  };
  draft.plan.manifest.arms[1]!.initialTreeSha256 = preparedTree;
  draft.plan.manifest.arms[0]!.runId = "11111111-1111-4111-8111-111111111111";
  draft.plan.manifest.arms[1]!.runId = "22222222-2222-4222-8222-222222222222";
  const runtime = {
    agentImage: `sha256:${hash("1")}`,
    graderImage: `sha256:${hash("2")}`,
    workerImage: `sha256:${hash("3")}`,
    agentBinarySha256: hash("4"),
    nodeSha256: hash("5"),
    supervisorSha256: hash("6"),
    brokerSha256: hash("7"),
    graderExecutableSha256: hash("8"),
  };
  for (const c of draft.plan.conditions) {
    c.originalTreeSha256 = originalTree;
    c.runtimeSha256 = jsonDigest(runtime);
    c.promptTemplateSha256 = sha256("Same bounded future task for both arms.");
    c.toolAllowlistSha256 = jsonDigest(["source-shell"]);
  }
  draft.plan.manifest.toolAllowlistSha256 = jsonDigest(["source-shell"]);
  for (const c of draft.executionConditions) c.modelId = "muse-spark-1.3";
  const definition = {
    schemaVersion: "tournament-definition.local.v1",
    protocol: futureProtocolDocument(draft),
    downstreamPrompt: "Same bounded future task for both arms.",
    adapterInstructions:
      "Implement the approved createTeamBenchmark interface at src/server/team-benchmark.ts.",
    toolAllowlist: ["source-shell"],
    runtime,
    restrictions: {
      writablePaths: ["src/"],
      network: "none",
      credentials: "trusted_broker_only",
      maxRequests: 3,
      maxOutputTokens: 1024,
    },
    comparisonMetrics: [
      "correctness",
      "preparation_inclusive_effort",
      "trusted_usage_only",
    ],
  } as StudyDefinition;
  const studyId = draft.plan.manifest.id;
  const protocol = (await hold({
    id: "protocol-original",
    studyId,
    kind: "protocol",
    heldAt: "2026-10-28T11:59:59.000Z",
    subjectSha256: protocolSubject(definition),
    predecessorSha256: null,
  }))!;
  const proposal = "Synthetic architecture proposal; no source was prepared.",
    instructions = "Synthetic instructions; never executed.";
  const auth = (await hold({
    id: "prepare-original",
    studyId,
    kind: "preparation",
    heldAt: "2026-10-28T12:01:30.000Z",
    subjectSha256: jsonDigest({
      preparationSha256: preparationSubject(definition, proposal, instructions),
      attemptId: "prep-1",
    }),
    predecessorSha256: protocol.sha256,
  }))!;
  const evidence: PreparationEvidence = {
    record: {
      schemaVersion: "booking-preparation.local.v1",
      studyId,
      variant: "B",
      taskDefinitionSha256: draft.taskDefinitionSha256,
      protocolSha256: futureProtocolCommitment(draft),
      original: {
        commit: draft.plan.conditions[0]!.originalCommit,
        treeSha256: originalTree,
        dependencyLockSha256: hash("6"),
      },
      prepared: {
        commit: draft.plan.manifest.arms[1]!.initialCommit,
        treeSha256: preparedTree,
        dependencyLockSha256: hash("6"),
      },
      preparationPromptSha256: sha256(instructions),
      reviewRecordSha256: auth.sha256,
      executionRecordSha256: hash("a"),
      startedAt: "2026-10-28T12:02:00.000Z",
      finishedAt: "2026-10-28T12:03:00.000Z",
      metrics: draft.plan.manifest.arms[1]!.upfrontMetrics,
    },
    selectionAt: draft.proposedChronology.architectureSelectionAt,
    proposal,
    instructions,
    selectedAttemptId: "prep-1",
    attempts: [
      {
        id: "prep-1",
        status: "completed",
        startedAt: "2026-10-28T12:02:00.000Z",
        finishedAt: "2026-10-28T12:03:00.000Z",
        authorizationId: auth.record.id,
      },
    ],
    originalManifest,
    preparedManifest,
  };
  draft.preparationRecordSha256 = sha256(canonicalJson(evidence.record));
  const prepared = (await hold({
    id: "prepared-original",
    studyId,
    kind: "prepared",
    heldAt: "2026-10-28T12:04:59.000Z",
    subjectSha256: preparedSubject(definition, draft, evidence),
    predecessorSha256: protocol.sha256,
  }))!;
  const input = {
    definition,
    draft,
    evidence,
    protocol,
    prepared,
    authorizations: new Map([[auth.record.id, auth]]),
  };
  // Return detached mutable fixtures; validators must never mutate caller data.
  return {
    parent,
    root,
    workspace,
    studyRoot,
    config,
    entries,
    hold,
    input,
    study: validatePreparedStudy(input),
    operatorConfig: {
      custody: config,
      protocolId: protocol.record.id,
      preparedId: prepared.record.id,
      preparationAuthorizationIds: [auth.record.id],
    },
  };
}
